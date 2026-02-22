import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ manualId: string; runId: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { manualId, runId } = await params;

  const manual = store.manuals.find((item) => item.id === manualId);
  if (!manual) {
    return NextResponse.json({ error: "Manual not found" }, { status: 404 });
  }

  const run = store.generationRuns.find(
    (item) => item.id === runId && item.manualId === manualId
  );
  if (!run) {
    return NextResponse.json({ error: "Generation run not found" }, { status: 404 });
  }

  return NextResponse.json(run);
}
