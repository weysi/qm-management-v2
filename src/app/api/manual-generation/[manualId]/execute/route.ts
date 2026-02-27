import { NextResponse } from "next/server";
import { ExecuteManualGenerationRequestSchema } from "@/lib/schemas";
import { store } from "@/lib/store";
import { fetchRag, safeJson } from "@/lib/rag-backend";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ manualId: string }>;
}

function getCustomerProfile(manualId: string): Record<string, string> {
  const manual = store.manuals.find((item) => item.id === manualId);
  if (!manual) return {};
  const client = store.clients.find((item) => item.id === manual.clientId);
  if (!client) return {};

  return {
    COMPANY_NAME: client.name,
    COMPANY_STREET: client.address,
    COMPANY_ZIP_CITY: client.zipCity,
    CEO_NAME: client.ceo,
    QM_MANAGER: client.qmManager,
    INDUSTRY: client.industry,
  };
}

function mapStatus(raw: string): "success" | "partial" | "failed" {
  const value = raw.toUpperCase();
  if (value === "FAILED") return "failed";
  if (value === "PARTIAL") return "partial";
  return "success";
}

export async function POST(req: Request, { params }: RouteParams) {
  const { manualId } = await params;
  const body = await req.json().catch(() => ({} satisfies Record<string, unknown>));
  const parsed = ExecuteManualGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request payload", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const response = await fetchRag(
    `/api/v1/manuals/${encodeURIComponent(manualId)}/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sync: true,
        selected_asset_ids: parsed.data.selectedFileIds,
        global_overrides: parsed.data.globalOverrides,
        file_overrides_by_file: parsed.data.fileOverridesByFile,
        customer_profile: {
          ...getCustomerProfile(manualId),
          ...(parsed.data.placeholderMap ?? {}),
        },
      }),
    }
  );

  const payload = await safeJson(response);
  if (!response.ok) {
    return NextResponse.json(
      { error: (payload as { error?: string }).error ?? "Execution failed" },
      { status: response.status }
    );
  }

  const run = (payload as { run?: Record<string, unknown> }).run ?? {};
  const report = (payload as { report?: Record<string, unknown> }).report ?? {};
  const rawFiles = Array.isArray(report.files) ? report.files : [];
  const summary = (report.summary as Record<string, unknown> | undefined) ?? {};

  const files = rawFiles.map((entry) => {
    const fileId = String((entry as { template_asset_id?: string }).template_asset_id ?? "");
    const path = String((entry as { template_path?: string }).template_path ?? "");
    const status = String((entry as { status?: string }).status ?? "error");
    return {
      file: { id: fileId, path, status },
      unresolvedPlaceholders: Array.isArray((entry as { unresolved_tokens?: unknown[] }).unresolved_tokens)
        ? ((entry as { unresolved_tokens: string[] }).unresolved_tokens ?? [])
        : [],
      warnings: Array.isArray((entry as { warnings?: unknown[] }).warnings)
        ? ((entry as { warnings?: unknown[] }).warnings ?? []).map((warning) =>
            typeof warning === "string"
              ? warning
              : String((warning as { message?: string }).message ?? "Warning")
          )
        : [],
      error:
        typeof (entry as { error?: unknown }).error === "string"
          ? ((entry as { error?: string }).error ?? undefined)
          : undefined,
    };
  });

  const runReport = {
    id: String(run.id ?? ""),
    manualId,
    createdAt:
      String(run.finished_at ?? run.started_at ?? "") || new Date().toISOString(),
    status: mapStatus(String(report.status ?? run.status ?? "SUCCEEDED")),
    summary: {
      totalFiles: Number(summary.total ?? rawFiles.length ?? 0),
      generatedFiles: Number(summary.generated ?? 0),
      failedFiles: Number(summary.failed ?? 0),
      skippedFiles: Number(summary.skipped ?? 0),
    },
    files: rawFiles.map((entry) => ({
      fileId: String((entry as { template_asset_id?: string }).template_asset_id ?? ""),
      path: String((entry as { template_path?: string }).template_path ?? ""),
      status:
        String((entry as { status?: string }).status ?? "error") === "generated"
          ? "generated"
          : String((entry as { status?: string }).status ?? "error") === "skipped"
          ? "skipped"
          : "error",
      unresolvedPlaceholders: Array.isArray((entry as { unresolved_tokens?: unknown[] }).unresolved_tokens)
        ? ((entry as { unresolved_tokens: string[] }).unresolved_tokens ?? [])
        : [],
      warnings: [],
      error:
        typeof (entry as { error?: unknown }).error === "string"
          ? ((entry as { error?: string }).error ?? undefined)
          : undefined,
    })),
    warnings: Array.isArray(report.unknown_tokens)
      ? (report.unknown_tokens as string[]).map((token) => ({
          code: "UNKNOWN_TOKEN",
          message: `Unknown token: ${token}`,
        }))
      : [],
  };

  return NextResponse.json({
    runReport,
    files,
  });
}
