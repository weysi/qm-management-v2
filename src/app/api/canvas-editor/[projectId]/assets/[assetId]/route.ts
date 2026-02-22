/**
 * GET /api/canvas-editor/[projectId]/assets/[assetId]
 *
 * Return the binary (base64) for a specific asset.
 */

import { NextRequest, NextResponse } from "next/server";
import { getProject, getAsset } from "@/lib/project-workspace/workspace";

interface RouteParams {
  params: Promise<{ projectId: string; assetId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { projectId, assetId } = await params;

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const asset = getAsset(assetId);
  if (!asset || asset.projectId !== projectId) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  // Return as binary
  const buffer = Buffer.from(asset.base64, "base64");
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(buffer.length),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
