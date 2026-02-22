/**
 * POST /api/canvas-editor/[projectId]/ai/rewrite
 *
 * AI rewrite of canvas model blocks with scope selection and guardrails.
 */

import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/project-workspace/workspace";
import { appendAuditEntry } from "@/lib/project-workspace/workspace";
import { rewriteCanvasBlocks } from "@/lib/ai/canvas-rewrite";
import { CanvasRewriteRequestSchema } from "@/lib/schemas/canvas-model.schema";
import { store } from "@/lib/store";
import type { Client } from "@/lib/schemas";

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

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

  const parsed = CanvasRewriteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const {
    scope,
    selectedBlockIds,
    blockLocalVersions,
    prompt,
    guardrails,
    clientId,
  } = parsed.data;

  // Look up client for context (optional)
  const client: Client | null = clientId
    ? (store.clients.find((c: Client) => c.id === clientId) ?? null)
    : null;

  try {
    const result = await rewriteCanvasBlocks({
      scope,
      selectedBlockIds,
      blockLocalVersions,
      canvasModel: project.canvasModel,
      client,
      prompt,
      guardrails,
      projectId,
    });

    // Append audit entry
    appendAuditEntry(projectId, result.auditEntry);

    return NextResponse.json({
      rewrites: result.rewrites,
      auditEntry: result.auditEntry,
      acceptedCount: Object.keys(result.rewrites).length,
      rejectedCount: result.auditEntry.changes.filter((c) => !c.accepted).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    // Handle OpenAI quota errors (same as existing system)
    if (message.includes("429") || message.includes("quota")) {
      return NextResponse.json(
        { error: "OpenAI API quota exceeded. Please check your API key." },
        { status: 402 }
      );
    }

    console.error("[canvas-editor/ai/rewrite] Error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
