import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  DownloadTemplateFilesRequest,
  GenerateTemplateFilesRequest,
  RewriteTemplateFilesRequest,
  SaveTemplatePreviewRequest,
  TemplateFileMetadata,
  TemplateFilePreview,
  TemplatePreviewSource,
} from "@/types";

const QUERY_KEY = "template-files";
const PREVIEW_QUERY_KEY = "template-preview";

interface UploadTemplateFilesResult {
  files: TemplateFileMetadata[];
  rejected: Array<{ path: string; reason: string }>;
}

interface GenerateTemplateFilesResult {
  files: Array<{
    file: TemplateFileMetadata;
    unresolvedPlaceholders: string[];
    warnings: string[];
    error?: string;
  }>;
  aiWarning?: string;
}

interface RewriteTemplateFilesResult {
  files: Array<{
    file: TemplateFileMetadata;
    unresolvedPlaceholders: string[];
    updatedBlockCount: number;
    warnings: string[];
    error?: string;
  }>;
}

function queryKey(manualId: string) {
  return [QUERY_KEY, manualId] as const;
}

function previewQueryKey(
  manualId: string,
  fileId: string,
  source: TemplatePreviewSource
) {
  return [PREVIEW_QUERY_KEY, manualId, fileId, source] as const;
}

async function fetchTemplateFiles(manualId: string): Promise<TemplateFileMetadata[]> {
  const res = await fetch(`/api/template-files/${manualId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Failed to fetch template files");
  }

  return res.json();
}

async function fetchTemplateFilePreview(
  manualId: string,
  fileId: string,
  source: TemplatePreviewSource
): Promise<TemplateFilePreview> {
  const query = new URLSearchParams({ source });
  const res = await fetch(
    `/api/template-files/${manualId}/${fileId}/preview?${query.toString()}`
  );

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to fetch template preview");
  }

  return body;
}

async function uploadTemplateFiles(
  manualId: string,
  files: File[],
  paths: string[]
): Promise<UploadTemplateFilesResult> {
  const formData = new FormData();

  files.forEach((file, index) => {
    formData.append("files", file);
    formData.append("paths", paths[index] ?? file.name);
  });

  const res = await fetch(`/api/template-files/${manualId}`, {
    method: "POST",
    body: formData,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body.error ?? "Failed to upload template files";
    const error = new Error(message) as Error & {
      rejected?: Array<{ path: string; reason: string }>;
    };
    if (Array.isArray(body.rejected)) {
      error.rejected = body.rejected;
    }
    throw error;
  }

  return body;
}

async function generateTemplateFiles(
  manualId: string,
  payload: GenerateTemplateFilesRequest
): Promise<GenerateTemplateFilesResult> {
  const res = await fetch(`/api/template-files/${manualId}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to generate template files");
  }

  return body;
}

async function saveTemplateFilePreview(
  manualId: string,
  fileId: string,
  payload: SaveTemplatePreviewRequest
): Promise<TemplateFilePreview> {
  const res = await fetch(`/api/template-files/${manualId}/${fileId}/preview`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to save template preview");
  }

  return body;
}

async function rewriteTemplateFiles(
  manualId: string,
  payload: RewriteTemplateFilesRequest
): Promise<RewriteTemplateFilesResult> {
  const res = await fetch(`/api/template-files/${manualId}/rewrite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to rewrite template files");
  }

  return body;
}

function parseDownloadFilename(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) return fallback;

  const match = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
  if (!match?.[1]) return fallback;

  return match[1];
}

async function downloadTemplateFiles(
  manualId: string,
  payload: DownloadTemplateFilesRequest
): Promise<void> {
  const res = await fetch(`/api/template-files/${manualId}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to download template files");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = parseDownloadFilename(
    res.headers.get("Content-Disposition"),
    `manual-${manualId}-templates.zip`
  );

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function useTemplateFiles(manualId: string) {
  return useQuery({
    queryKey: queryKey(manualId),
    queryFn: () => fetchTemplateFiles(manualId),
    enabled: !!manualId,
  });
}

export function useTemplateFilePreview(
  manualId: string,
  fileId: string,
  source: TemplatePreviewSource
) {
  return useQuery({
    queryKey: previewQueryKey(manualId, fileId, source),
    queryFn: () => fetchTemplateFilePreview(manualId, fileId, source),
    enabled: !!manualId && !!fileId,
  });
}

export function useUploadTemplateFiles(manualId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ files, paths }: { files: File[]; paths: string[] }) =>
      uploadTemplateFiles(manualId, files, paths),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKey(manualId) }),
  });
}

export function useGenerateTemplateFiles(manualId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: GenerateTemplateFilesRequest) =>
      generateTemplateFiles(manualId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(manualId) });
      qc.invalidateQueries({ queryKey: [PREVIEW_QUERY_KEY, manualId] });
    },
  });
}

export function useSaveTemplateFilePreview(manualId: string, fileId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: SaveTemplatePreviewRequest) =>
      saveTemplateFilePreview(manualId, fileId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(manualId) });
      qc.invalidateQueries({ queryKey: [PREVIEW_QUERY_KEY, manualId, fileId] });
    },
  });
}

export function useRewriteTemplateFiles(manualId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: RewriteTemplateFilesRequest) =>
      rewriteTemplateFiles(manualId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKey(manualId) });
      qc.invalidateQueries({ queryKey: [PREVIEW_QUERY_KEY, manualId] });
    },
  });
}

export function useDownloadTemplateFiles(manualId: string) {
  return useMutation({
    mutationFn: (payload: DownloadTemplateFilesRequest) =>
      downloadTemplateFiles(manualId, payload),
  });
}
