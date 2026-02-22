/**
 * GET  /api/canvas-editor/[projectId]/assets — List project assets
 * POST /api/canvas-editor/[projectId]/assets — Upload new asset
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getProject,
  getProjectAssets,
  addAsset,
} from "@/lib/project-workspace/workspace";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { projectId } = await params;

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const assets = getProjectAssets(projectId);

  // Return without the base64 blob (metadata only)
  return NextResponse.json({
    assets: assets.map((a) => ({
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      objectType: a.objectType,
      classificationConfidence: a.classificationConfidence,
      createdAt: a.createdAt,
    })),
  });
}

const UploadAssetSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  base64: z.string().min(1),
  objectType: z
    .enum(["logo", "signature", "stamp", "image", "shape", "textbox"])
    .optional(),
});

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { projectId } = await params;

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = UploadAssetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { filename, mimeType, base64, objectType } = parsed.data;
  const sizeBytes = Math.round((base64.length * 3) / 4);

  const asset = addAsset({
    projectId,
    filename,
    mimeType,
    base64,
    sizeBytes,
    objectType,
    classificationConfidence: 1,
  });

  return NextResponse.json({
    asset: {
      id: asset.id,
      filename: asset.filename,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      objectType: asset.objectType,
      createdAt: asset.createdAt,
    },
  });
}
