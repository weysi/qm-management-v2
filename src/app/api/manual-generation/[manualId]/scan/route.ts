import { NextResponse } from "next/server";
import { ScanManualGenerationRequestSchema } from "@/lib/schemas";
import {
  getManualContext,
  scanTemplateLibraryForManual,
} from "@/lib/manual-generation";

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
  const parsed = ScanManualGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request payload", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const scanResult = scanTemplateLibraryForManual(manualId, parsed.data.fileIds);
  if (scanResult.manifest.files.length === 0) {
    return NextResponse.json(
      { error: "No template files available for scan" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    manifest: scanResult.manifest,
    placeholderRegistry: scanResult.registry,
  });
}
