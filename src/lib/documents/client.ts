import {
  DocumentSchema,
  type Document,
  type DocumentVersion,
  type WorkspaceAsset,
  type FileTreeNode,
} from '@/lib/schemas';
import {
  DeletePathResponseSchema,
  ListAssetsResponseSchema,
  ListDocumentsResponseSchema,
  RenderDocumentResponseSchema,
  RewriteDocumentResponseSchema,
  TreeResponseSchema,
  UploadAssetResponseSchema,
  UploadDocumentResponseSchema,
  type UploadDocumentResponse,
  type RenderDocumentResponse,
  type RewriteDocumentResponse,
} from './schemas';

export class ApiRequestError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function parseJsonOrError<T>(res: Response): Promise<T> {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiRequestError(
      (payload as { error?: string }).error ?? 'Request failed',
      res.status,
      payload,
    );
  }
  return payload as T;
}

function normalizeTreeNode(node: unknown): unknown {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return node;
  }

  const record = node as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...record };
  let mutated = false;

  if (normalized.children === null) {
    delete normalized.children;
    mutated = true;
  } else if (Array.isArray(normalized.children)) {
    normalized.children = normalized.children.map(child => normalizeTreeNode(child));
  }

  if (mutated && process.env.NODE_ENV !== 'production') {
    console.warn('[documents] normalized legacy tree node with children=null', {
      path: normalized.path,
      kind: normalized.kind,
    });
  }

  return normalized;
}

function normalizeTreeResponse(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.tree)) {
    return payload;
  }
  return {
    ...record,
    tree: record.tree.map(node => normalizeTreeNode(node)),
  };
}

function toAssetProxyUrl(handbookId: string, assetType: 'logo' | 'signature') {
  return `/api/handbooks/${encodeURIComponent(handbookId)}/assets/${assetType}/download`;
}

function normalizeWorkspaceAsset(asset: WorkspaceAsset): WorkspaceAsset {
  const proxyUrl = toAssetProxyUrl(asset.handbook_id, asset.asset_type);
  return {
    ...asset,
    preview_url: asset.preview_url ? proxyUrl : asset.preview_url,
    download_url: proxyUrl,
  };
}

export async function uploadDocument(params: {
  handbookId: string;
  file: File;
  path?: string;
}): Promise<UploadDocumentResponse> {
  const form = new FormData();
  form.append('file', params.file);
  form.append('handbook_id', params.handbookId);
  if (params.path) form.append('path', params.path);

  const res = await fetch('/api/documents/upload', {
    method: 'POST',
    body: form,
  });

  const data = await parseJsonOrError<unknown>(res);
  return UploadDocumentResponseSchema.parse(data);
}

export async function listDocuments(handbookId: string): Promise<Document[]> {
  const res = await fetch(`/api/documents?handbook_id=${encodeURIComponent(handbookId)}`);
  const data = await parseJsonOrError<unknown>(res);
  const parsed = ListDocumentsResponseSchema.parse(data);
  return parsed.documents;
}

export async function getDocument(documentId: string): Promise<Document> {
  const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}`);
  const data = await parseJsonOrError<unknown>(res);
  return DocumentSchema.parse(data);
}

export async function renderDocument(params: {
  documentId: string;
  variables: Record<string, string>;
  assetOverrides?: Record<string, string>;
  generationPolicy?: { onMissingAsset?: 'FAIL' | 'KEEP_PLACEHOLDER' };
}): Promise<RenderDocumentResponse> {
  const res = await fetch(`/api/documents/${encodeURIComponent(params.documentId)}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      variables: params.variables,
      asset_overrides: params.assetOverrides ?? {},
      generation_policy: params.generationPolicy
        ? {
            on_missing_asset: params.generationPolicy.onMissingAsset ?? 'FAIL',
          }
        : undefined,
    }),
  });
  const data = await parseJsonOrError<unknown>(res);
  return RenderDocumentResponseSchema.parse(data);
}

export async function rewriteDocument(params: {
  documentId: string;
  instruction: string;
  targetVersion?: number;
}): Promise<RewriteDocumentResponse> {
  const res = await fetch(
    `/api/documents/${encodeURIComponent(params.documentId)}/ai-rewrite`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instruction: params.instruction,
        targetVersion: params.targetVersion,
      }),
    },
  );
  const data = await parseJsonOrError<unknown>(res);
  return RewriteDocumentResponseSchema.parse(data);
}

export async function deleteDocument(documentId: string): Promise<void> {
  const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, {
    method: 'DELETE',
  });
  await parseJsonOrError<unknown>(res);
}

export async function fetchTree(handbookId: string): Promise<FileTreeNode[]> {
  const res = await fetch(`/api/files/tree?handbook_id=${encodeURIComponent(handbookId)}`);
  const data = await parseJsonOrError<unknown>(res);
  const normalized = normalizeTreeResponse(data);
  const parsed = TreeResponseSchema.parse(normalized);
  return parsed.tree;
}

export async function deletePath(params: {
  handbookId: string;
  path: string;
  recursive?: boolean;
}): Promise<void> {
  const res = await fetch('/api/files/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      handbook_id: params.handbookId,
      path: params.path,
      recursive: Boolean(params.recursive),
    }),
  });
  const data = await parseJsonOrError<unknown>(res);
  DeletePathResponseSchema.parse(data);
}

export async function listWorkspaceAssets(handbookId: string): Promise<WorkspaceAsset[]> {
  const res = await fetch(`/api/handbooks/${encodeURIComponent(handbookId)}/assets`);
  const data = await parseJsonOrError<unknown>(res);
  const parsed = ListAssetsResponseSchema.parse(data);
  return parsed.assets.map(item => normalizeWorkspaceAsset(item));
}

export async function uploadWorkspaceAsset(params: {
  handbookId: string;
  file: File;
  assetType: 'logo' | 'signature';
}): Promise<WorkspaceAsset> {
  const form = new FormData();
  form.append('file', params.file);
  form.append('asset_type', params.assetType);
  const res = await fetch(`/api/handbooks/${encodeURIComponent(params.handbookId)}/assets`, {
    method: 'POST',
    body: form,
  });
  const data = await parseJsonOrError<unknown>(res);
  return normalizeWorkspaceAsset(UploadAssetResponseSchema.parse(data).asset);
}

export async function deleteWorkspaceAsset(params: {
  handbookId: string;
  assetType: 'logo' | 'signature';
}): Promise<void> {
  const res = await fetch(
    `/api/handbooks/${encodeURIComponent(params.handbookId)}/assets/${params.assetType}`,
    {
      method: 'DELETE',
    },
  );
  await parseJsonOrError<unknown>(res);
}

export function documentVersionFilename(version: DocumentVersion): string {
  const segments = version.file_path.split('/');
  return segments[segments.length - 1] || `document-v${version.version_number}`;
}
