import { NextResponse } from "next/server";
import { fetchRag, safeJson } from "@/lib/rag-backend";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ manualId: string; runId: string }>;
}

function mapStatus(raw: string): "success" | "partial" | "failed" {
  const value = raw.toUpperCase();
  if (value === "FAILED") return "failed";
  if (value === "PARTIAL") return "partial";
  return "success";
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { manualId, runId } = await params;
  const response = await fetchRag(
    `/api/v1/manuals/${encodeURIComponent(manualId)}/runs/${encodeURIComponent(runId)}`
  );
  const payload = await safeJson(response);
  if (!response.ok) {
    return NextResponse.json(
      { error: (payload as { error?: string }).error ?? "Run not found" },
      { status: response.status }
    );
  }

  const run = (payload as { run?: Record<string, unknown> }).run ?? {};
  const metrics = (run.metrics as Record<string, unknown> | undefined) ?? {};
  const summary = (metrics.summary as Record<string, unknown> | undefined) ?? {};
  const files = Array.isArray(metrics.files) ? (metrics.files as Record<string, unknown>[]) : [];

  const runReport = {
    id: String(run.id ?? runId),
    manualId,
    createdAt:
      String(run.finished_at ?? run.started_at ?? "") || new Date().toISOString(),
    status: mapStatus(String(metrics.status ?? run.status ?? "SUCCEEDED")),
    summary: {
      totalFiles: Number(summary.total ?? files.length),
      generatedFiles: Number(summary.generated ?? 0),
      failedFiles: Number(summary.failed ?? 0),
      skippedFiles: Number(summary.skipped ?? 0),
    },
    files: files.map((entry) => ({
      fileId: String(entry.template_asset_id ?? ""),
      path: String(entry.template_path ?? ""),
      status:
        String(entry.status ?? "error") === "generated"
          ? "generated"
          : String(entry.status ?? "error") === "skipped"
          ? "skipped"
          : "error",
      unresolvedPlaceholders: Array.isArray(entry.unresolved_tokens)
        ? (entry.unresolved_tokens as string[])
        : [],
      warnings: [],
      error: typeof entry.error === "string" ? entry.error : undefined,
    })),
    warnings: Array.isArray(metrics.unknown_tokens)
      ? (metrics.unknown_tokens as string[]).map((token) => ({
          code: "UNKNOWN_TOKEN",
          message: `Unknown token: ${token}`,
        }))
      : [],
  };

  return NextResponse.json(runReport);
}
