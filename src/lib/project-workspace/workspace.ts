/**
 * Project workspace CRUD operations.
 * Uses the same in-memory store pattern as store.ts (hot-reload safe via global).
 */

import { randomUUID } from "crypto";
import type {
  ProjectWorkspace,
  ProjectAsset,
  ChangeLog,
  ProjectVersion,
} from "@/lib/schemas/project-workspace.schema";
import type { CanvasModel } from "@/lib/schemas/canvas-model.schema";

// ─── Global store (hot-reload safe) ──────────────────────────────────────────
// These are initialized in store.ts; we access them via the same global object.

const g = global as typeof globalThis & {
  __qm_projects?: ProjectWorkspace[];
  __qm_project_assets?: ProjectAsset[];
  __qm_project_changes?: ChangeLog[];
  __qm_project_versions?: ProjectVersion[];
};

function getProjects(): ProjectWorkspace[] {
  if (!g.__qm_projects) g.__qm_projects = [];
  return g.__qm_projects;
}

function getAssets(): ProjectAsset[] {
  if (!g.__qm_project_assets) g.__qm_project_assets = [];
  return g.__qm_project_assets;
}

function getChangeLogs(): ChangeLog[] {
  if (!g.__qm_project_changes) g.__qm_project_changes = [];
  return g.__qm_project_changes;
}

function getVersions(): ProjectVersion[] {
  if (!g.__qm_project_versions) g.__qm_project_versions = [];
  return g.__qm_project_versions;
}

// ─── Project workspace operations ────────────────────────────────────────────

export function listProjects(): ProjectWorkspace[] {
  return getProjects().filter((p) => p.status === "active");
}

export function getProject(projectId: string): ProjectWorkspace | undefined {
  return getProjects().find((p) => p.id === projectId);
}

export function getProjectBySourceFileId(sourceFileId: string): ProjectWorkspace | undefined {
  return getProjects().find(
    (p) => p.sourceFileId === sourceFileId && p.status === "active"
  );
}

export function createProject(params: {
  manualId: string;
  sourceFileId: string;
  name: string;
  canvasModel: CanvasModel;
  docxBase64: string;
}): ProjectWorkspace {
  const now = new Date().toISOString();
  const projectId = randomUUID();

  const project: ProjectWorkspace = {
    id: projectId,
    manualId: params.manualId,
    sourceFileId: params.sourceFileId,
    name: params.name,
    canvasModel: { ...params.canvasModel, projectId },
    manifest: {
      projectId,
      schemaVersion: "1.0.0",
      sourceFile: {
        name: params.name,
        ext: "docx",
        originalSha256: params.canvasModel.metadata.previewVersion,
        importedAt: now,
      },
      assets: [],
      workingVersionId: undefined,
      exportHistory: [],
    },
    elements: {
      projectId,
      elements: [],
      version: "1",
      updatedAt: now,
    },
    status: "active",
    createdAt: now,
    updatedAt: now,
  };

  getProjects().push(project);

  // Initialize change log
  getChangeLogs().push({ projectId, entries: [] });

  // Create initial version snapshot
  createVersion(projectId, {
    label: "Initial import",
    canvasModelSnapshot: project.canvasModel,
    docxBase64: params.docxBase64,
    createdBy: "system",
  });

  return project;
}

export function updateProjectCanvasModel(
  projectId: string,
  canvasModel: CanvasModel
): ProjectWorkspace | null {
  const project = getProject(projectId);
  if (!project) return null;

  const idx = getProjects().indexOf(project);
  const updated: ProjectWorkspace = {
    ...project,
    canvasModel,
    updatedAt: new Date().toISOString(),
  };
  getProjects()[idx] = updated;
  return updated;
}

export function archiveProject(projectId: string): boolean {
  const project = getProject(projectId);
  if (!project) return false;

  const idx = getProjects().indexOf(project);
  getProjects()[idx] = { ...project, status: "archived", updatedAt: new Date().toISOString() };
  return true;
}

// ─── Asset operations ─────────────────────────────────────────────────────────

export function getProjectAssets(projectId: string): ProjectAsset[] {
  return getAssets().filter((a) => a.projectId === projectId);
}

export function getAsset(assetId: string): ProjectAsset | undefined {
  return getAssets().find((a) => a.id === assetId);
}

export function addAsset(asset: Omit<ProjectAsset, "id" | "createdAt">): ProjectAsset {
  const now = new Date().toISOString();
  const newAsset: ProjectAsset = {
    id: randomUUID(),
    ...asset,
    createdAt: now,
  };
  getAssets().push(newAsset);

  // Update project manifest
  const project = getProject(asset.projectId);
  if (project) {
    const idx = getProjects().indexOf(project);
    getProjects()[idx] = {
      ...project,
      manifest: {
        ...project.manifest,
        assets: [
          ...project.manifest.assets,
          {
            assetId: newAsset.id,
            filename: newAsset.filename,
            mimeType: newAsset.mimeType,
            sizeBytes: newAsset.sizeBytes,
            objectType: newAsset.objectType,
          },
        ],
      },
      updatedAt: new Date().toISOString(),
    };
  }

  return newAsset;
}

// ─── Version operations ───────────────────────────────────────────────────────

export function getProjectVersions(projectId: string): ProjectVersion[] {
  return getVersions()
    .filter((v) => v.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getVersion(versionId: string): ProjectVersion | undefined {
  return getVersions().find((v) => v.id === versionId);
}

export function createVersion(
  projectId: string,
  params: {
    label: string;
    canvasModelSnapshot: CanvasModel;
    docxBase64: string;
    createdBy: ProjectVersion["createdBy"];
  }
): ProjectVersion {
  const version: ProjectVersion = {
    id: randomUUID(),
    projectId,
    label: params.label,
    canvasModelSnapshot: params.canvasModelSnapshot,
    docxBase64: params.docxBase64,
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy,
  };

  getVersions().push(version);

  // Update manifest workingVersionId
  const project = getProject(projectId);
  if (project) {
    const idx = getProjects().indexOf(project);
    getProjects()[idx] = {
      ...project,
      manifest: {
        ...project.manifest,
        workingVersionId: version.id,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  // Prune old versions (keep max 50 per project)
  const projectVersions = getVersions().filter((v) => v.projectId === projectId);
  if (projectVersions.length > 50) {
    const oldest = projectVersions
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, projectVersions.length - 50);
    for (const old of oldest) {
      const idx = getVersions().indexOf(old);
      if (idx !== -1) getVersions().splice(idx, 1);
    }
  }

  return version;
}

export function restoreVersion(
  projectId: string,
  versionId: string
): ProjectWorkspace | null {
  const version = getVersion(versionId);
  if (!version || version.projectId !== projectId) return null;

  const project = getProject(projectId);
  if (!project) return null;

  const idx = getProjects().indexOf(project);
  const restored: ProjectWorkspace = {
    ...project,
    canvasModel: version.canvasModelSnapshot,
    updatedAt: new Date().toISOString(),
  };
  getProjects()[idx] = restored;
  return restored;
}

// ─── Change log operations ────────────────────────────────────────────────────

export function getChangeLog(projectId: string): ChangeLog | undefined {
  return getChangeLogs().find((c) => c.projectId === projectId);
}

export function appendAuditEntry(
  projectId: string,
  entry: ChangeLog["entries"][0]
): void {
  const changeLog = getChangeLogs().find((c) => c.projectId === projectId);
  if (changeLog) {
    changeLog.entries.push(entry);
  } else {
    getChangeLogs().push({ projectId, entries: [entry] });
  }
}

// ─── Export history ───────────────────────────────────────────────────────────

export function recordExport(
  projectId: string,
  format: "docx" | "pdf" | "odt",
  versionId: string
): void {
  const project = getProject(projectId);
  if (!project) return;

  const idx = getProjects().indexOf(project);
  getProjects()[idx] = {
    ...project,
    manifest: {
      ...project.manifest,
      exportHistory: [
        ...project.manifest.exportHistory,
        { exportedAt: new Date().toISOString(), format, versionId },
      ],
    },
    updatedAt: new Date().toISOString(),
  };
}
