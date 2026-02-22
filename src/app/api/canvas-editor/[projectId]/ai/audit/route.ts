/**
 * GET /api/canvas-editor/[projectId]/ai/audit
 *
 * Return the audit log for a project.
 */

import { NextRequest, NextResponse } from "next/server";
import { getProject, getChangeLog } from "@/lib/project-workspace/workspace";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { projectId } = await params;

  const project = getProject(projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const changeLog = getChangeLog(projectId);
  const entries = changeLog?.entries ?? [];

  // Return newest first
  return NextResponse.json({
    entries: [...entries].reverse(),
    totalCount: entries.length,
  });
}
