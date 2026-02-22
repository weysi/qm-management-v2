import { NextResponse } from "next/server";
import { RewriteTemplateFilesRequestSchema } from "@/lib/schemas";
import { rewriteTemplateBlocksWithAi } from "@/lib/ai/template-rewrite";
import { buildPlaceholderMap } from "@/lib/placeholders";
import { store } from "@/lib/store";
import {
  applyBlockEditsToOoxml,
  extractEditableBlocksFromOoxml,
  OoxmlIntegrityError,
  resolveBlockPlaceholders,
  templateFileToMetadata,
} from "@/lib/template-files";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ manualId: string }>;
}

function uniqueTokensFromBlocks(blocks: Array<{ placeholders: string[] }>): string[] {
  return Array.from(new Set(blocks.flatMap((block) => block.placeholders))).sort();
}

export async function POST(req: Request, { params }: RouteParams) {
  const { manualId } = await params;

  const manual = store.manuals.find((item) => item.id === manualId);
  if (!manual) {
    return NextResponse.json({ error: "Manual not found" }, { status: 404 });
  }

  const client = store.clients.find((item) => item.id === manual.clientId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const parsedBody = RewriteTemplateFilesRequestSchema.safeParse(await req.json());
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: "Invalid request payload",
        issues: parsedBody.error.flatten(),
      },
      { status: 400 }
    );
  }

  const request = parsedBody.data;
  const selectedIds = new Set(request.fileIds);
  const files = store.templates.filter(
    (file) => file.manualId === manualId && selectedIds.has(file.id)
  );

  if (files.length === 0) {
    return NextResponse.json(
      { error: "No matching template files found" },
      { status: 400 }
    );
  }

  const globalMap = {
    ...buildPlaceholderMap(client),
    ...(request.globalOverrides ?? {}),
  };
  const fileOverridesByFile = request.fileOverridesByFile ?? {};
  const blockIdsByFile = request.blockIdsByFile ?? {};

  const results: Array<{
    file: ReturnType<typeof templateFileToMetadata>;
    unresolvedPlaceholders: string[];
    updatedBlockCount: number;
    warnings: string[];
    error?: string;
  }> = [];

  for (const file of files) {
    try {
      if (file.ext === "xlsx") {
        throw new Error("XLSX rewrite is not supported in this phase");
      }

      const sourceBase64 = file.generatedBase64 ?? file.originalBase64;
      const sourceBuffer = Buffer.from(sourceBase64, "base64");
      const preview = await extractEditableBlocksFromOoxml(sourceBuffer, file.ext, file.id);

      const targetBlocks =
        request.mode === "full_file"
          ? preview.blocks
          : preview.blocks.filter((block) =>
              (blockIdsByFile[file.id] ?? []).includes(block.id)
            );

      if (targetBlocks.length === 0) {
        throw new Error("No target blocks selected for rewrite");
      }

      const effectiveMap = {
        ...globalMap,
        ...(fileOverridesByFile[file.id] ?? {}),
      };

      const aiEdits = await rewriteTemplateBlocksWithAi({
        prompt: request.prompt,
        mode: request.mode,
        filePath: file.path,
        client,
        preservePlaceholders: request.preservePlaceholders,
        mergedMap: effectiveMap,
        blocks: targetBlocks.map((block) => ({ id: block.id, text: block.text })),
      });

      const targetIds = new Set(targetBlocks.map((block) => block.id));
      const editsByBlockId = Object.fromEntries(
        Object.entries(aiEdits).filter(([blockId, text]) => {
          return targetIds.has(blockId) && text.trim() !== "";
        })
      );

      if (Object.keys(editsByBlockId).length === 0) {
        throw new Error("AI did not return valid block updates");
      }

      const outputBuffer = await applyBlockEditsToOoxml(
        sourceBuffer,
        file.ext,
        editsByBlockId
      );
      const nextPreview = await extractEditableBlocksFromOoxml(
        outputBuffer,
        file.ext,
        file.id
      );

      const unresolved = resolveBlockPlaceholders(nextPreview.blocks, effectiveMap);
      const now = new Date().toISOString();

      file.generatedBase64 = outputBuffer.toString("base64");
      file.placeholders = uniqueTokensFromBlocks(nextPreview.blocks);
      file.unresolvedPlaceholders = unresolved;
      file.status = "generated";
      file.error = undefined;
      file.lastGeneratedAt = now;
      file.updatedAt = now;

      results.push({
        file: templateFileToMetadata(file),
        unresolvedPlaceholders: unresolved,
        updatedBlockCount: Object.keys(editsByBlockId).length,
        warnings: [],
      });
    } catch (error: unknown) {
      const now = new Date().toISOString();
      const message =
        error instanceof OoxmlIntegrityError
          ? `Style-safe rewrite rejected: ${error.message}`
          : error instanceof Error
          ? error.message
          : "File rewrite failed";

      file.status = "error";
      file.error = message;
      file.updatedAt = now;

      results.push({
        file: templateFileToMetadata(file),
        unresolvedPlaceholders: file.unresolvedPlaceholders,
        updatedBlockCount: 0,
        warnings: [],
        error: message,
      });
    }
  }

  return NextResponse.json({ files: results });
}
