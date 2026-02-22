"use client";

/**
 * TanStack Query hooks for the canvas editor.
 * Follows the same pattern as the existing useTemplateFiles.ts hooks.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { CanvasModel, CanvasRewriteGuardrails } from "@/lib/schemas/canvas-model.schema";

// ─── Canvas model fetch/save ──────────────────────────────────────────────────

async function fetchCanvasDocument(projectId: string) {
  const res = await fetch(`/api/canvas-editor/${projectId}/document`);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    canvasModel: CanvasModel;
    manifest: unknown;
    elements: unknown;
    status: string;
  }>;
}

export function useCanvasDocument(projectId: string) {
  return useQuery({
    queryKey: ["canvas-editor", projectId, "document"],
    queryFn: () => fetchCanvasDocument(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

export function useCanvasEditor(projectId: string) {
  const qc = useQueryClient();

  const saveModel = async (canvasModel: CanvasModel, options?: { createVersion?: boolean; versionLabel?: string }) => {
    const res = await fetch(`/api/canvas-editor/${projectId}/document`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        canvasModel,
        createVersion: options?.createVersion,
        versionLabel: options?.versionLabel,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
    qc.invalidateQueries({ queryKey: ["canvas-editor", projectId, "document"] });
    return res.json();
  };

  return { saveModel };
}

// ─── Canvas init ──────────────────────────────────────────────────────────────

export function useInitCanvasProject() {
  const [isIniting, setIsIniting] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);

  const initProject = async (params: {
    sourceFileId: string;
    manualId: string;
  }) => {
    setIsIniting(true);
    try {
      const res = await fetch(`/api/canvas-editor/_/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { projectId: string; created: boolean };
      setProjectId(data.projectId);
      return data;
    } finally {
      setIsIniting(false);
    }
  };

  return { initProject, isIniting, projectId };
}

// ─── AI rewrite ───────────────────────────────────────────────────────────────

interface RewriteParams {
  projectId: string;
  scope: "selection" | "paragraph" | "section" | "document";
  selectedBlockIds: string[];
  blockLocalVersions: Record<string, number>;
  prompt: string;
  guardrails: CanvasRewriteGuardrails;
  clientId?: string;
}

interface RewriteResult {
  rewrites: Record<string, string>;
  auditEntry: unknown;
  acceptedCount: number;
  rejectedCount: number;
}

export function useCanvasAi(projectId: string) {
  const [isRewriting, setIsRewriting] = useState(false);

  const rewrite = async (params: RewriteParams): Promise<RewriteResult> => {
    setIsRewriting(true);
    try {
      const res = await fetch(`/api/canvas-editor/${projectId}/ai/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: params.projectId,
          scope: params.scope,
          selectedBlockIds: params.selectedBlockIds,
          blockLocalVersions: params.blockLocalVersions,
          prompt: params.prompt,
          guardrails: params.guardrails,
          clientId: params.clientId,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<RewriteResult>;
    } finally {
      setIsRewriting(false);
    }
  };

  return { rewrite, isRewriting };
}

// ─── Audit log ────────────────────────────────────────────────────────────────

export function useAuditLog(projectId: string) {
  return useQuery({
    queryKey: ["canvas-editor", projectId, "audit"],
    queryFn: async () => {
      const res = await fetch(`/api/canvas-editor/${projectId}/ai/audit`);
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ entries: unknown[]; totalCount: number }>;
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });
}

// ─── Versioning ───────────────────────────────────────────────────────────────

interface VersionMeta {
  id: string;
  label: string;
  createdAt: string;
  createdBy: "user" | "ai_operation" | "system";
  pageCount: number;
  hasDocx: boolean;
}

export function useVersioning(projectId: string) {
  const qc = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["canvas-editor", projectId, "versions"],
    queryFn: async () => {
      const res = await fetch(`/api/canvas-editor/${projectId}/versions`);
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ versions: VersionMeta[] }>;
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  const createSnapshot = async (label: string) => {
    setIsCreating(true);
    try {
      const res = await fetch(`/api/canvas-editor/${projectId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, createdBy: "user" }),
      });
      if (!res.ok) throw new Error(await res.text());
      qc.invalidateQueries({
        queryKey: ["canvas-editor", projectId, "versions"],
      });
      return res.json();
    } finally {
      setIsCreating(false);
    }
  };

  const restoreVersion = async (versionId: string) => {
    setIsRestoring(true);
    try {
      const res = await fetch(
        `/api/canvas-editor/${projectId}/versions/${versionId}/restore`,
        { method: "POST" }
      );
      if (!res.ok) return null;
      const data = await res.json() as { canvasModel: CanvasModel };
      qc.invalidateQueries({
        queryKey: ["canvas-editor", projectId, "document"],
      });
      return data.canvasModel;
    } finally {
      setIsRestoring(false);
    }
  };

  return {
    versions: data?.versions ?? [],
    isLoading,
    createSnapshot,
    restoreVersion,
    isCreating,
    isRestoring,
  };
}
