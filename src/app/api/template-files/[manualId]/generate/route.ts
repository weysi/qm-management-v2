import { NextResponse } from "next/server";
import {
  GenerateTemplateFilesRequestSchema,
  type TemplateFileExt,
  type TemplateFileMetadata,
} from "@/lib/schemas";
import { store } from "@/lib/store";
import { fetchRag, safeJson } from "@/lib/rag-backend";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ manualId: string }>;
}

interface RagAssetPayload {
  id: string;
  manual_id: string;
  path: string;
  name: string;
  ext: string;
  mime_type: string;
  size: number;
  placeholders?: string[];
  unresolved_placeholders?: string[];
  has_generated_version?: boolean;
  last_generated_at?: string | null;
  created_at?: string;
}

function toTemplateMetadata(asset: RagAssetPayload): TemplateFileMetadata {
  const now = new Date().toISOString();
  const hasGeneratedVersion = Boolean(asset.has_generated_version);
  return {
    id: asset.id,
    manualId: asset.manual_id,
    path: asset.path,
    name: asset.name,
    ext: (asset.ext || "docx") as TemplateFileExt,
    mimeType: asset.mime_type || "application/octet-stream",
    size: Number(asset.size || 0),
    placeholders: Array.isArray(asset.placeholders) ? asset.placeholders : [],
    unresolvedPlaceholders: Array.isArray(asset.unresolved_placeholders)
      ? asset.unresolved_placeholders
      : [],
    status: hasGeneratedVersion ? "generated" : "uploaded",
    hasGeneratedVersion,
    lastGeneratedAt: asset.last_generated_at ?? undefined,
    createdAt: asset.created_at ?? now,
    updatedAt: asset.last_generated_at ?? asset.created_at ?? now,
  };
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

  const response = await fetchRag(
    `/api/v1/manuals/${encodeURIComponent(manualId)}/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sync: true,
        selected_asset_ids: parsedBody.data.fileIds,
        global_overrides: parsedBody.data.globalOverrides,
        file_overrides_by_file: parsedBody.data.fileOverridesByFile,
        customer_profile: getCustomerProfile(manualId),
      }),
    }
  );
  const payload = await safeJson(response);
  if (!response.ok) {
    return NextResponse.json(
      { error: (payload as { error?: string }).error ?? "Generation failed" },
      { status: response.status }
    );
  }

  const assetsResponse = await fetchRag(
    `/api/v1/manuals/${encodeURIComponent(manualId)}/assets?role=TEMPLATE`
  );
  const assetsPayload = await safeJson(assetsResponse);
  const assets = (assetsPayload as { assets?: RagAssetPayload[] }).assets ?? [];
  const metadataById = new Map<string, TemplateFileMetadata>(
    assets.map((asset) => [asset.id, toTemplateMetadata(asset)])
  );

  const report = (payload as { report?: { files?: Array<Record<string, unknown>> } }).report;
  const filesRaw = report?.files ?? [];
  const files = filesRaw.map((item) => {
    const fileId = String(item.template_asset_id ?? "");
    const metadata = metadataById.get(fileId) ?? {
      id: fileId,
      manualId,
      path: String(item.template_path ?? ""),
      name: String(item.template_path ?? "").split("/").pop() ?? fileId,
      ext: "docx" as const,
      mimeType: "application/octet-stream",
      size: 0,
      placeholders: [],
      unresolvedPlaceholders: [],
      status: item.status === "generated" ? ("generated" as const) : ("error" as const),
      hasGeneratedVersion: item.status === "generated",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const warningsRaw = Array.isArray(item.warnings) ? item.warnings : [];
    const warnings = warningsRaw.map((warning) =>
      typeof warning === "string"
        ? warning
        : String((warning as { message?: string }).message ?? "Warning")
    );

    return {
      file: metadata,
      unresolvedPlaceholders: Array.isArray(item.unresolved_tokens)
        ? (item.unresolved_tokens as string[])
        : [],
      warnings,
      error:
        typeof item.error === "string" && item.error.length > 0
          ? item.error
          : undefined,
    };
  });

  return NextResponse.json({
    files,
    runReport: report ?? null,
  });
}
