import { NextResponse } from "next/server";
import {
  GetTemplatePreviewQuerySchema,
  SaveTemplatePreviewRequestSchema,
} from "@/lib/schemas";
import { buildPlaceholderMap } from "@/lib/placeholders";
import { store } from "@/lib/store";
import {
  applyBlockEditsToOoxml,
  extractEditableBlocksFromOoxml,
  OoxmlIntegrityError,
  resolveBlockPlaceholders,
  resolvePreviewSource,
  templateFileToMetadata,
} from "@/lib/template-files";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ manualId: string; fileId: string }>;
}

function uniqueTokensFromBlocks(blocks: Array<{ placeholders: string[] }>): string[] {
  return Array.from(new Set(blocks.flatMap((block) => block.placeholders))).sort();
}

export async function GET(req: Request, { params }: RouteParams) {
  const { manualId, fileId } = await params;

  const manual = store.manuals.find((item) => item.id === manualId);
  if (!manual) {
    return NextResponse.json({ error: "Manual not found" }, { status: 404 });
  }

  const file = store.templates.find(
    (item) => item.manualId === manualId && item.id === fileId
  );
  if (!file) {
    return NextResponse.json({ error: "Template file not found" }, { status: 404 });
  }

  const client = store.clients.find((item) => item.id === manual.clientId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const parsedQuery = GetTemplatePreviewQuerySchema.safeParse({
    source: url.searchParams.get("source") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: "Invalid preview query" },
      { status: 400 }
    );
  }

  const resolvedSource = resolvePreviewSource(
    parsedQuery.data.source,
    Boolean(file.generatedBase64)
  );

  const sourceBase64 =
    resolvedSource === "generated" ? file.generatedBase64 : file.originalBase64;

  if (!sourceBase64) {
    return NextResponse.json(
      { error: "No previewable file version available" },
      { status: 400 }
    );
  }

  if (file.ext === "xlsx") {
    return NextResponse.json(
      { error: "XLSX preview editing is not supported in this phase" },
      { status: 400 }
    );
  }

  const sourceBuffer = Buffer.from(sourceBase64, "base64");
  const preview = await extractEditableBlocksFromOoxml(sourceBuffer, file.ext, file.id);

  const effectiveMap = buildPlaceholderMap(client);
  const unresolved = resolveBlockPlaceholders(preview.blocks, effectiveMap);

  return NextResponse.json({
    file: templateFileToMetadata(file),
    source: resolvedSource,
    groups: preview.groups,
    blocks: preview.blocks,
    runs: preview.runs,
    layout: preview.layout,
    previewVersion: preview.previewVersion,
    unresolvedPlaceholders: unresolved,
  });
}

export async function PUT(req: Request, { params }: RouteParams) {
  const { manualId, fileId } = await params;

  const manual = store.manuals.find((item) => item.id === manualId);
  if (!manual) {
    return NextResponse.json({ error: "Manual not found" }, { status: 404 });
  }

  const file = store.templates.find(
    (item) => item.manualId === manualId && item.id === fileId
  );
  if (!file) {
    return NextResponse.json({ error: "Template file not found" }, { status: 404 });
  }

  const client = store.clients.find((item) => item.id === manual.clientId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const parsedBody = SaveTemplatePreviewRequestSchema.safeParse(await req.json());
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: "Invalid request payload",
        issues: parsedBody.error.flatten(),
      },
      { status: 400 }
    );
  }

  const source = resolvePreviewSource(
    parsedBody.data.source,
    Boolean(file.generatedBase64)
  );
  const sourceBase64 =
    source === "generated" ? file.generatedBase64 : file.originalBase64;

  if (!sourceBase64) {
    return NextResponse.json(
      { error: "No editable file version available" },
      { status: 400 }
    );
  }

  if (file.ext === "xlsx") {
    return NextResponse.json(
      { error: "XLSX preview editing is not supported in this phase" },
      { status: 400 }
    );
  }

  const inputBuffer = Buffer.from(sourceBase64, "base64");
  const currentPreview = await extractEditableBlocksFromOoxml(
    inputBuffer,
    file.ext,
    file.id
  );

  if (parsedBody.data.previewVersion !== currentPreview.previewVersion) {
    return NextResponse.json(
      {
        error: "Preview has changed. Reload the file and try again.",
        expectedPreviewVersion: currentPreview.previewVersion,
      },
      { status: 409 }
    );
  }

  const validBlockIds = new Set(currentPreview.blocks.map((block) => block.id));

  const missingEdit = parsedBody.data.edits.find(
    (edit) => !validBlockIds.has(edit.blockId)
  );
  if (missingEdit) {
    return NextResponse.json(
      {
        error: "Preview has changed. Reload the file and try again.",
        missingBlockId: missingEdit.blockId,
      },
      { status: 409 }
    );
  }

  const editsByBlockId = Object.fromEntries(
    parsedBody.data.edits.map((edit) => [edit.blockId, edit.text])
  );

  let outputBuffer: Buffer;
  try {
    outputBuffer = await applyBlockEditsToOoxml(
      inputBuffer,
      file.ext,
      editsByBlockId
    );
  } catch (error: unknown) {
    if (error instanceof OoxmlIntegrityError) {
      return NextResponse.json(
        {
          error: error.message,
          code: "OOXML_STYLE_INTEGRITY_FAILED",
        },
        { status: 422 }
      );
    }

    throw error;
  }

  const nextPreview = await extractEditableBlocksFromOoxml(
    outputBuffer,
    file.ext,
    file.id
  );

  const effectiveMap = {
    ...buildPlaceholderMap(client),
    ...(parsedBody.data.globalOverrides ?? {}),
    ...(parsedBody.data.fileOverrides ?? {}),
  };

  const unresolved = resolveBlockPlaceholders(nextPreview.blocks, effectiveMap);
  const now = new Date().toISOString();

  file.generatedBase64 = outputBuffer.toString("base64");
  file.placeholders = uniqueTokensFromBlocks(nextPreview.blocks);
  file.unresolvedPlaceholders = unresolved;
  file.status = "generated";
  file.error = undefined;
  file.lastGeneratedAt = now;
  file.updatedAt = now;

  return NextResponse.json({
    file: templateFileToMetadata(file),
    source: "generated",
    groups: nextPreview.groups,
    blocks: nextPreview.blocks,
    runs: nextPreview.runs,
    layout: nextPreview.layout,
    previewVersion: nextPreview.previewVersion,
    unresolvedPlaceholders: unresolved,
  });
}
