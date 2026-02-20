import { NextResponse } from "next/server";
import {
  GenerateTemplateFilesRequestSchema,
  type TemplateFileMetadata,
} from "@/lib/schemas";
import { generatePlaceholderValues } from "@/lib/ai/placeholder-values";
import { buildPlaceholderMap } from "@/lib/placeholders";
import { store } from "@/lib/store";
import {
  applyPlaceholderMapToOoxml,
  OoxmlIntegrityError,
  templateFileToMetadata,
} from "@/lib/template-files";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ manualId: string }>;
}

interface GenerateResult {
  file: TemplateFileMetadata;
  unresolvedPlaceholders: string[];
  warnings: string[];
  error?: string;
}

function hasValue(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "";
}

export async function POST(req: Request, { params }: RouteParams) {
  const { manualId } = await params;

  const manual = store.manuals.find((item) => item.id === manualId);
  if (!manual) {
    return NextResponse.json({ error: "Manual not found" }, { status: 404 });
  }

  const parsedBody = GenerateTemplateFilesRequestSchema.safeParse(await req.json());
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: "Invalid request payload",
        issues: parsedBody.error.flatten(),
      },
      { status: 400 }
    );
  }

  const requestedIds = new Set(parsedBody.data.fileIds);
  const selectedFiles = store.templates.filter(
    (file) => file.manualId === manualId && requestedIds.has(file.id)
  );

  if (selectedFiles.length === 0) {
    return NextResponse.json(
      { error: "No matching template files found" },
      { status: 400 }
    );
  }

  const client = store.clients.find((item) => item.id === manual.clientId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const baseMap = {
    ...buildPlaceholderMap(client),
    ...(parsedBody.data.globalOverrides ?? {}),
  };
  const fileOverridesByFile = parsedBody.data.fileOverridesByFile ?? {};

  const unresolvedUnion = Array.from(
    new Set(
      selectedFiles.flatMap((file) =>
        file.placeholders.filter((token) => {
          const fileMap = { ...baseMap, ...(fileOverridesByFile[file.id] ?? {}) };
          return !hasValue(fileMap[token]);
        })
      )
    )
  ).sort();

  let aiValues: Record<string, string> = {};
  let aiWarning: string | undefined;

  if (unresolvedUnion.length > 0) {
    try {
      aiValues = await generatePlaceholderValues({
        tokens: unresolvedUnion,
        client,
        filePaths: selectedFiles.map((file) => file.path),
      });
    } catch (error: unknown) {
      aiWarning =
        error instanceof Error
          ? `AI fallback failed, continued with map-only replacement: ${error.message}`
          : "AI fallback failed, continued with map-only replacement";
    }
  }

  const results: GenerateResult[] = [];

  for (const file of selectedFiles) {
    try {
      const finalMap = {
        ...baseMap,
        ...(fileOverridesByFile[file.id] ?? {}),
        ...aiValues,
      };

      const input = Buffer.from(file.originalBase64, "base64");
      const { output, unresolved } = await applyPlaceholderMapToOoxml(
        input,
        file.ext,
        finalMap
      );

      file.generatedBase64 = output.toString("base64");
      file.unresolvedPlaceholders = unresolved;
      file.status = "generated";
      file.error = undefined;
      file.updatedAt = new Date().toISOString();
      file.lastGeneratedAt = file.updatedAt;

      results.push({
        file: templateFileToMetadata(file),
        unresolvedPlaceholders: unresolved,
        warnings: [],
      });
    } catch (error: unknown) {
      file.status = "error";
      file.error =
        error instanceof OoxmlIntegrityError
          ? `Style-safe generation rejected: ${error.message}`
          : error instanceof Error
          ? error.message
          : "File generation failed";
      file.updatedAt = new Date().toISOString();
      file.generatedBase64 = undefined;

      results.push({
        file: templateFileToMetadata(file),
        unresolvedPlaceholders: file.unresolvedPlaceholders,
        warnings: [],
        error: file.error,
      });
    }
  }

  return NextResponse.json({
    files: results,
    aiWarning,
  });
}
