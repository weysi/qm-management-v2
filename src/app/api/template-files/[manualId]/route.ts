import { NextResponse } from "next/server";
import type { TemplateFileMetadata, TemplateFileExt } from "@/lib/schemas";
import { store } from "@/lib/store";
import {
  getTemplateFileExtension,
  sanitizeTemplatePath,
} from "@/lib/template-files";
import { fetchRag, safeJson } from "@/lib/rag-backend";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ manualId: string }>;
}

interface RejectedUpload {
  path: string;
  reason: string;
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
  const ext = (asset.ext || "docx") as TemplateFileExt;
  const hasGeneratedVersion = Boolean(asset.has_generated_version);
  return {
    id: asset.id,
    manualId: asset.manual_id,
    path: asset.path,
    name: asset.name,
    ext,
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

function getManualContext(manualId: string): {
  tenantId: string;
  packageCode: string;
  packageVersion: string;
} {
  const manual = store.manuals.find((item) => item.id === manualId);
  if (!manual) {
    return {
      tenantId: "default-tenant",
      packageCode: "ISO9001",
      packageVersion: "v1",
    };
  }

  return {
    tenantId: manual.clientId || "default-tenant",
    packageCode: "ISO9001",
    packageVersion: "v1",
  };
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { manualId } = await params;
  const response = await fetchRag(
    `/api/v1/manuals/${encodeURIComponent(manualId)}/assets?role=TEMPLATE`
  );
  const payload = await safeJson(response);

  if (!response.ok) {
    return NextResponse.json(
      { error: (payload as { error?: string }).error ?? "Failed to fetch assets" },
      { status: response.status }
    );
  }

  const assets = (payload as { assets?: RagAssetPayload[] }).assets ?? [];
  const files = assets
    .filter((asset) => ["docx", "pptx", "xlsx"].includes(asset.ext))
    .map(toTemplateMetadata)
    .sort((a, b) => a.path.localeCompare(b.path));

  return NextResponse.json(files);
}

export async function POST(req: Request, { params }: RouteParams) {
  const { manualId } = await params;
  const formData = await req.formData();
  const uploadedFiles = formData.getAll("files");
  const uploadedPaths = formData.getAll("paths");

  if (uploadedFiles.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  const context = getManualContext(manualId);
  const created: TemplateFileMetadata[] = [];
  const rejected: RejectedUpload[] = [];

  for (let i = 0; i < uploadedFiles.length; i += 1) {
    const candidate = uploadedFiles[i];
    if (!(candidate instanceof File)) {
      rejected.push({ path: `file-${i + 1}`, reason: "Invalid file payload" });
      continue;
    }

    const rawPathCandidate = uploadedPaths[i];
    const rawPath =
      typeof rawPathCandidate === "string" && rawPathCandidate.trim() !== ""
        ? rawPathCandidate
        : candidate.name;
    const sanitizedPath = sanitizeTemplatePath(rawPath, candidate.name);
    const ext = getTemplateFileExtension(sanitizedPath);

    if (!ext) {
      rejected.push({
        path: sanitizedPath,
        reason: "Unsupported file type. Only .docx, .pptx and .xlsx are allowed.",
      });
      continue;
    }

    const uploadPayload = new FormData();
    uploadPayload.append("file", candidate);
    uploadPayload.append("manual_id", manualId);
    uploadPayload.append("tenant_id", context.tenantId);
    uploadPayload.append("package_code", context.packageCode);
    uploadPayload.append("package_version", context.packageVersion);
    uploadPayload.append("role", "TEMPLATE");
    uploadPayload.append("path", sanitizedPath);

    const uploadResponse = await fetchRag("/api/v1/assets/local-upload", {
      method: "POST",
      body: uploadPayload,
    });
    const uploadBody = await safeJson(uploadResponse);
    if (!uploadResponse.ok) {
      rejected.push({
        path: sanitizedPath,
        reason:
          (uploadBody as { error?: string }).error ?? "Failed to upload template file",
      });
      continue;
    }

    const asset = (uploadBody as { asset?: RagAssetPayload }).asset;
    if (!asset) {
      rejected.push({ path: sanitizedPath, reason: "Invalid upload response" });
      continue;
    }
    created.push(toTemplateMetadata(asset));
  }

  if (created.length === 0) {
    return NextResponse.json(
      {
        error: "No valid template files uploaded",
        rejected,
      },
      { status: 400 }
    );
  }

  return NextResponse.json(
    {
      files: created.sort((a, b) => a.path.localeCompare(b.path)),
      rejected,
    },
    { status: 201 }
  );
}
