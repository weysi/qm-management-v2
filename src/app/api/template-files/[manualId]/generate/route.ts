import { NextResponse } from "next/server";
import {
  GenerateTemplateFilesRequestSchema,
} from "@/lib/schemas";
import {
  executeDeterministicTemplateGeneration,
  ManualGenerationHttpError,
} from "@/lib/manual-generation";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ manualId: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const { manualId } = await params;

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

  try {
    const result = await executeDeterministicTemplateGeneration({
      manualId,
      fileIds: parsedBody.data.fileIds,
      globalOverrides: parsedBody.data.globalOverrides,
      fileOverridesByFile: parsedBody.data.fileOverridesByFile,
      useAiFallback: true,
      persistRun: true,
    });

    return NextResponse.json({
      files: result.files.map((entry) => ({
        file: entry.file,
        unresolvedPlaceholders: entry.unresolvedPlaceholders,
        warnings: entry.warnings.map((warning) => warning.message),
        error: entry.error,
      })),
      aiWarning: result.aiWarning?.message,
      runReport: result.runReport,
    });
  } catch (error: unknown) {
    if (error instanceof ManualGenerationHttpError) {
      return NextResponse.json(
        { error: error.message, details: error.details },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Template generation failed unexpectedly",
      },
      { status: 500 }
    );
  }
}
