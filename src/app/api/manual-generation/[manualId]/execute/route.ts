import { NextResponse } from "next/server";
import {
  ExecuteManualGenerationRequestSchema,
  type ManualPlan,
} from "@/lib/schemas";
import {
  executeDeterministicTemplateGeneration,
  getLatestPlan,
  getManualContext,
  ManualGenerationHttpError,
  planManualGeneration,
} from "@/lib/manual-generation";
import { store } from "@/lib/store";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ manualId: string }>;
}

function getFileIdsFromPlan(plan: ManualPlan): string[] {
  return plan.outputTree
    .filter((entry) => entry.kind === "file" && Boolean(entry.sourceTemplateId))
    .map((entry) => entry.sourceTemplateId as string);
}

export async function POST(req: Request, { params }: RouteParams) {
  const { manualId } = await params;

  const context = getManualContext(manualId);
  if (!context) {
    return NextResponse.json(
      { error: "Manual or client not found" },
      { status: 404 }
    );
  }

  const body = await req
    .json()
    .catch(() => ({} satisfies Record<string, unknown>));
  const parsed = ExecuteManualGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request payload", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  let plan = parsed.data.plan ?? getLatestPlan(manualId);
  let placeholderMap = parsed.data.placeholderMap;
  const warnings: string[] = [];

  if (!plan) {
    const planned = await planManualGeneration({
      manualId,
      request: {
        selectedFileIds: parsed.data.selectedFileIds,
        globalOverrides: parsed.data.globalOverrides,
        useAi: true,
      },
    });
    plan = planned.manualPlan;
    placeholderMap = {
      ...(placeholderMap ?? {}),
      ...planned.placeholderMap,
    };
    warnings.push(...planned.warnings);
  }

  const fileIds =
    parsed.data.selectedFileIds && parsed.data.selectedFileIds.length > 0
      ? parsed.data.selectedFileIds
      : getFileIdsFromPlan(plan);

  if (fileIds.length === 0) {
    return NextResponse.json(
      { error: "Plan does not contain executable files" },
      { status: 400 }
    );
  }

  try {
    const execution = await executeDeterministicTemplateGeneration({
      manualId,
      fileIds,
      globalOverrides: parsed.data.globalOverrides,
      fileOverridesByFile: parsed.data.fileOverridesByFile,
      placeholderMap,
      useAiFallback: parsed.data.useAiFallback,
      persistRun: true,
      planId: plan.id,
    });

    const runReport = {
      ...execution.runReport,
      warnings: [
        ...execution.runReport.warnings,
        ...warnings.map((message) => ({
          code: "PLANNING_WARNING",
          message,
        })),
      ],
    };

    const runIndex = store.generationRuns.findIndex(
      (item) => item.id === execution.runReport.id
    );
    if (runIndex !== -1) {
      store.generationRuns[runIndex] = runReport;
    }

    return NextResponse.json({
      runReport,
      files: execution.files,
      aiWarning: execution.aiWarning?.message,
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
          error instanceof Error ? error.message : "Execution failed unexpectedly",
      },
      { status: 500 }
    );
  }
}
