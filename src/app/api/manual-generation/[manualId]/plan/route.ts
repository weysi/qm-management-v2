import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { PlanManualGenerationRequestSchema } from "@/lib/schemas";
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
  const parsed = PlanManualGenerationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request payload", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const planResponse = await fetchRag(
    `/api/v1/manuals/${encodeURIComponent(manualId)}/plan`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sync: true,
        selected_asset_ids: parsed.data.selectedFileIds,
      }),
    }
  );
  const planPayload = await safeJson(planResponse);
  if (!planResponse.ok) {
    return NextResponse.json(
      { error: (planPayload as { error?: string }).error ?? "Plan failed" },
      { status: planResponse.status }
    );
  }

  const assetsResponse = await fetchRag(
    `/api/v1/manuals/${encodeURIComponent(manualId)}/assets?role=TEMPLATE`
  );
  const assetsPayload = await safeJson(assetsResponse);
  const assets = ((assetsPayload as { assets?: RagAssetPayload[] }).assets ?? []).filter(
    (asset) => ["docx", "pptx", "xlsx"].includes(asset.ext)
  );

  const selectedIds = parsed.data.selectedFileIds?.length
    ? new Set(parsed.data.selectedFileIds)
    : null;
  const selectedAssets = selectedIds
    ? assets.filter((asset) => selectedIds.has(asset.id))
    : assets;

  if (selectedAssets.length === 0) {
    return NextResponse.json(
      { error: "No template files available for planning" },
      { status: 400 }
    );
  }

  const manifest = {
    id: randomUUID(),
    manualId,
    generatedAt: new Date().toISOString(),
    folders: buildFolders(selectedAssets.map((asset) => asset.path)),
    files: selectedAssets.map((asset) => ({
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

  const plan = (planPayload as { plan?: Record<string, unknown> }).plan ?? {};
  const outputs = Array.isArray(plan.outputs) ? plan.outputs : [];
  const outputTree = outputs.flatMap((entry, index) => {
    const relPath = String(
      (entry as { output_rel_path?: string }).output_rel_path ?? `outputs/file-${index + 1}`
    );
    const folder = relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : "";
    const nodes: Array<Record<string, unknown>> = [];
    if (folder) {
      nodes.push({
        id: `folder-${folder}`,
        path: folder,
        kind: "folder",
      });
    }
    nodes.push({
      id: `file-${index + 1}`,
      path: relPath,
      kind: "file",
      sourceTemplateId: String((entry as { template_asset_id?: string }).template_asset_id ?? ""),
      operations: [{ op: "applyPlaceholders", mapId: "default-map" }],
    });
    return nodes;
  });

  const manualPlan = {
    id: String((planPayload as { run?: { id?: string } }).run?.id ?? randomUUID()),
    manualId,
    templateVariantId: parsed.data.templateVariantId ?? "default",
    createdAt: new Date().toISOString(),
    outputTree,
  };

  const keyMap = new Map<string, Array<"docx" | "pptx" | "xlsx">>();
  for (const asset of selectedAssets) {
    for (const token of asset.placeholders ?? []) {
      const contexts = keyMap.get(token) ?? [];
      if (!contexts.includes(asset.ext)) contexts.push(asset.ext);
      keyMap.set(token, contexts);
    }
  }

  const placeholderRegistry = {
    id: randomUUID(),
    manualId,
    updatedAt: new Date().toISOString(),
    keys: Array.from(keyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, contexts]) => ({
        key,
        type: "string",
        global: false,
        contexts: contexts.sort((a, b) => a.localeCompare(b)),
      })),
  };

  const placeholderMap = parsed.data.globalOverrides ?? {};
  const unknownTokens = Array.isArray(plan.unknown_tokens)
    ? (plan.unknown_tokens as string[])
    : [];

  return NextResponse.json({
    manifest,
    placeholderRegistry,
    manualPlan,
    placeholderMap,
    warnings: unknownTokens.map((token) => `Unknown placeholder key: ${token}`),
  });
}
