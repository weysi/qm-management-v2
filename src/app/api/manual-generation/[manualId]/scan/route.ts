import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { ScanManualGenerationRequestSchema } from "@/lib/schemas";
import { fetchRag, safeJson } from "@/lib/rag-backend";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ manualId: string }>;
}

interface RagAssetPayload {
  id: string;
  path: string;
  name: string;
  ext: "docx" | "pptx" | "xlsx";
  placeholders?: string[];
}

function buildFolders(paths: string[]): string[] {
  const folders = new Set<string>();
  for (const path of paths) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i += 1) {
      folders.add(parts.slice(0, i).join("/"));
    }
  }
  return Array.from(folders).sort((a, b) => a.localeCompare(b));
}

export async function POST(req: Request, { params }: RouteParams) {
  const { manualId } = await params;
  const body = await req.json().catch(() => ({} satisfies Record<string, unknown>));
  const parsed = ScanManualGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request payload", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const assetsResponse = await fetchRag(
    `/api/v1/manuals/${encodeURIComponent(manualId)}/assets?role=TEMPLATE`
  );
  const assetsPayload = await safeJson(assetsResponse);
  if (!assetsResponse.ok) {
    return NextResponse.json(
      { error: (assetsPayload as { error?: string }).error ?? "Failed to load assets" },
      { status: assetsResponse.status }
    );
  }

  let assets = ((assetsPayload as { assets?: RagAssetPayload[] }).assets ?? []).filter(
    (asset) => ["docx", "pptx", "xlsx"].includes(asset.ext)
  );
  if (parsed.data.fileIds?.length) {
    const selected = new Set(parsed.data.fileIds);
    assets = assets.filter((asset) => selected.has(asset.id));
  }

  if (assets.length === 0) {
    return NextResponse.json(
      { error: "No template files available for scan" },
      { status: 400 }
    );
  }

  const manifest = {
    id: randomUUID(),
    manualId,
    generatedAt: new Date().toISOString(),
    folders: buildFolders(assets.map((asset) => asset.path)),
    files: assets.map((asset) => ({
      id: asset.id,
      sourceTemplateId: asset.id,
      path: asset.path,
      name: asset.name,
      ext: asset.ext,
      role: "unknown",
      variantTags: [],
      placeholders: asset.placeholders ?? [],
      references: [],
      constraints: {
        mustPreservePlaceholders: true,
      },
    })),
  };

  const keyMap = new Map<
    string,
    {
      key: string;
      contexts: Array<"docx" | "pptx" | "xlsx">;
    }
  >();
  for (const asset of assets) {
    for (const token of asset.placeholders ?? []) {
      const entry = keyMap.get(token) ?? { key: token, contexts: [] };
      if (!entry.contexts.includes(asset.ext)) entry.contexts.push(asset.ext);
      keyMap.set(token, entry);
    }
  }

  const placeholderRegistry = {
    id: randomUUID(),
    manualId,
    updatedAt: new Date().toISOString(),
    keys: Array.from(keyMap.values())
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((entry) => ({
        key: entry.key,
        type: "string",
        global: false,
        contexts: entry.contexts.sort((a, b) => a.localeCompare(b)),
      })),
  };

  return NextResponse.json({ manifest, placeholderRegistry });
}
