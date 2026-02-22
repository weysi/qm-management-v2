import { NextResponse } from "next/server";
import { PlanManualGenerationRequestSchema } from "@/lib/schemas";
import { getManualContext, planManualGeneration } from "@/lib/manual-generation";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ manualId: string }>;
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
  const parsed = PlanManualGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request payload", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await planManualGeneration({
      manualId,
      request: parsed.data,
    });

    if (result.manifest.files.length === 0) {
      return NextResponse.json(
        { error: "No template files available for planning" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      manifest: result.manifest,
      placeholderRegistry: result.registry,
      manualPlan: result.manualPlan,
      placeholderMap: result.placeholderMap,
      warnings: result.warnings,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create generation plan",
      },
      { status: 500 }
    );
  }
}
