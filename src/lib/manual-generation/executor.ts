import { randomUUID } from "crypto";
import { generatePlaceholderValues } from "@/lib/ai/placeholder-values";
import { buildPlaceholderMap } from "@/lib/placeholders";
import type {
  ExecutionWarning,
  GenerationRunReport,
  TemplateFileMetadata,
} from "@/lib/schemas";
import { store } from "@/lib/store";
import {
  applyPlaceholderMapToOoxml,
  OoxmlIntegrityError,
  templateFileToMetadata,
} from "@/lib/template-files";

function hasValue(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "";
}

function warning(code: string, message: string, args?: {
  fileId?: string;
  path?: string;
  details?: Record<string, unknown>;
}): ExecutionWarning {
  return {
    code,
    message,
    fileId: args?.fileId,
    path: args?.path,
    details: args?.details,
  };
}

export class ManualGenerationHttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export interface ExecuteDeterministicGenerationParams {
  manualId: string;
  fileIds: string[];
  globalOverrides?: Record<string, string>;
  fileOverridesByFile?: Record<string, Record<string, string>>;
  placeholderMap?: Record<string, string>;
  useAiFallback?: boolean;
  persistRun?: boolean;
  planId?: string;
}

export interface DeterministicGenerationFileResult {
  file: TemplateFileMetadata;
  unresolvedPlaceholders: string[];
  warnings: ExecutionWarning[];
  error?: string;
}

export interface ExecuteDeterministicGenerationResult {
  files: DeterministicGenerationFileResult[];
  aiWarning?: ExecutionWarning;
  runReport: GenerationRunReport;
}

export async function executeDeterministicTemplateGeneration(
  params: ExecuteDeterministicGenerationParams
): Promise<ExecuteDeterministicGenerationResult> {
  const manual = store.manuals.find((item) => item.id === params.manualId);
  if (!manual) {
    throw new ManualGenerationHttpError(404, "Manual not found");
  }

  const client = store.clients.find((item) => item.id === manual.clientId);
  if (!client) {
    throw new ManualGenerationHttpError(404, "Client not found");
  }

  const requestedIds = new Set(params.fileIds);
  const selectedFiles = store.templates
    .filter((file) => file.manualId === params.manualId && requestedIds.has(file.id))
    .sort((a, b) => a.path.localeCompare(b.path));

  if (selectedFiles.length === 0) {
    throw new ManualGenerationHttpError(400, "No matching template files found");
  }

  const globalMap = {
    ...buildPlaceholderMap(client),
    ...(params.placeholderMap ?? {}),
    ...(params.globalOverrides ?? {}),
  };
  const fileOverridesByFile = params.fileOverridesByFile ?? {};
  const unresolvedUnion = Array.from(
    new Set(
      selectedFiles.flatMap((file) =>
        file.placeholders.filter((token) => {
          const fileMap = { ...globalMap, ...(fileOverridesByFile[file.id] ?? {}) };
          return !hasValue(fileMap[token]);
        })
      )
    )
  ).sort((a, b) => a.localeCompare(b));

  let aiValues: Record<string, string> = {};
  let aiWarning: ExecutionWarning | undefined;

  if ((params.useAiFallback ?? true) && unresolvedUnion.length > 0) {
    try {
      aiValues = await generatePlaceholderValues({
        tokens: unresolvedUnion,
        client,
        filePaths: selectedFiles.map((file) => file.path),
      });
    } catch (error: unknown) {
      aiWarning = warning(
        "AI_FALLBACK_FAILED",
        error instanceof Error
          ? `AI fallback failed, continued with map-only replacement: ${error.message}`
          : "AI fallback failed, continued with map-only replacement"
      );
    }
  }

  const results: DeterministicGenerationFileResult[] = [];
  let generatedFiles = 0;
  let failedFiles = 0;
  let skippedFiles = 0;

  for (const file of selectedFiles) {
    const fileWarnings: ExecutionWarning[] = [];
    if (aiWarning) {
      fileWarnings.push(aiWarning);
    }

    try {
      const finalMap = {
        ...globalMap,
        ...(fileOverridesByFile[file.id] ?? {}),
        ...aiValues,
      };

      const input = Buffer.from(file.originalBase64, "base64");
      const { output, unresolved } = await applyPlaceholderMapToOoxml(
        input,
        file.ext,
        finalMap
      );

      if (output.equals(input) && unresolved.length === 0) {
        skippedFiles += 1;
      } else {
        generatedFiles += 1;
      }

      if (unresolved.length > 0) {
        fileWarnings.push(
          warning(
            "UNRESOLVED_PLACEHOLDERS",
            `${unresolved.length} unresolved placeholder(s) remain`,
            {
              fileId: file.id,
              path: file.path,
              details: { tokens: unresolved },
            }
          )
        );
      }

      const now = new Date().toISOString();
      file.generatedBase64 = output.toString("base64");
      file.unresolvedPlaceholders = unresolved;
      file.status = "generated";
      file.error = undefined;
      file.updatedAt = now;
      file.lastGeneratedAt = now;

      results.push({
        file: templateFileToMetadata(file),
        unresolvedPlaceholders: unresolved,
        warnings: fileWarnings,
      });
    } catch (error: unknown) {
      failedFiles += 1;
      const message =
        error instanceof OoxmlIntegrityError
          ? `Style-safe generation rejected: ${error.message}`
          : error instanceof Error
          ? error.message
          : "File generation failed";

      file.status = "error";
      file.error = message;
      file.updatedAt = new Date().toISOString();
      file.generatedBase64 = undefined;

      fileWarnings.push(
        warning("FILE_GENERATION_FAILED", message, {
          fileId: file.id,
          path: file.path,
        })
      );

      results.push({
        file: templateFileToMetadata(file),
        unresolvedPlaceholders: file.unresolvedPlaceholders,
        warnings: fileWarnings,
        error: message,
      });
    }
  }

  const totalFiles = selectedFiles.length;
  const status: GenerationRunReport["status"] =
    failedFiles === totalFiles
      ? "failed"
      : failedFiles > 0 || skippedFiles > 0 || Boolean(aiWarning)
      ? "partial"
      : "success";

  const runReport: GenerationRunReport = {
    id: randomUUID(),
    manualId: manual.id,
    createdAt: new Date().toISOString(),
    status,
    planId: params.planId,
    summary: {
      totalFiles,
      generatedFiles,
      failedFiles,
      skippedFiles,
    },
    files: results.map((entry) => ({
      fileId: entry.file.id,
      path: entry.file.path,
      status: entry.error ? "error" : entry.unresolvedPlaceholders.length > 0 ? "generated" : "generated",
      unresolvedPlaceholders: entry.unresolvedPlaceholders,
      warnings: entry.warnings,
      error: entry.error,
    })),
    warnings: aiWarning ? [aiWarning] : [],
  };

  if (params.persistRun ?? true) {
    store.generationRuns.push(runReport);
  }

  return {
    files: results,
    aiWarning,
    runReport,
  };
}
