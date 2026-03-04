import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  HandbookCompletionSchema,
  HandbookFileSchema,
  HandbookPlaceholderSchema,
  HandbookSnapshotSchema,
  HandbookTreeNodeSchema,
} from '@/lib/schemas';

const TREE_KEY = 'handbook-tree';
const PLACEHOLDERS_KEY = 'handbook-file-placeholders';
const VERSIONS_KEY = 'handbook-versions';
const COMPLETION_KEY = 'handbook-completion';

const CompletionSchema = z.object({
  total: z.number().int().nonnegative(),
  resolved: z.number().int().nonnegative(),
  is_complete: z.boolean(),
});

const UploadZipResponseSchema = z.object({
  tree: z.array(HandbookTreeNodeSchema),
  files: z.array(HandbookFileSchema),
  warnings: z.array(
    z.object({
      path: z.string(),
      code: z.string(),
      message: z.string(),
    }),
  ),
  summary: z.object({
    files_total: z.number().int().nonnegative(),
    parse_failed: z.number().int().nonnegative(),
    placeholders_total: z.number().int().nonnegative(),
  }),
});

const TreeResponseSchema = z.object({
  tree: z.array(HandbookTreeNodeSchema),
});

const FilePlaceholdersResponseSchema = z.object({
  file: HandbookFileSchema,
  placeholders: z.array(HandbookPlaceholderSchema),
  completion: CompletionSchema,
});

const SavePlaceholdersResponseSchema = z.object({
  file: HandbookFileSchema,
  placeholders: z.array(HandbookPlaceholderSchema),
  completion: CompletionSchema,
  snapshot: HandbookSnapshotSchema.nullable().optional(),
  handbook_completion: HandbookCompletionSchema.optional(),
  handbook: z.record(z.string(), z.unknown()),
});

const AiFillResponseSchema = z.object({
  value: z.string(),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }),
});

const VersionsResponseSchema = z.object({
  versions: z.array(HandbookSnapshotSchema),
});

const CompletionResponseSchema = HandbookCompletionSchema;

const CreateVersionResponseSchema = z.object({
  created: z.boolean(),
  snapshot: HandbookSnapshotSchema,
});

async function parseJsonOrThrow<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? 'Request failed');
  }
  return schema.parse(data);
}

export function useHandbookTree(handbookId: string) {
  return useQuery({
    queryKey: [TREE_KEY, handbookId],
    queryFn: async () => {
      const res = await fetch(`/api/handbooks/${encodeURIComponent(handbookId)}/tree`);
      return TreeResponseSchema.parse(await parseJsonOrThrow(res, TreeResponseSchema)).tree;
    },
    enabled: Boolean(handbookId),
  });
}

export function useUploadHandbookZip(handbookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/handbooks/${encodeURIComponent(handbookId)}/upload-zip`, {
        method: 'POST',
        body: form,
      });
      return parseJsonOrThrow(res, UploadZipResponseSchema);
    },
    onSuccess: result => {
      qc.setQueryData([TREE_KEY, handbookId], result.tree);
      qc.invalidateQueries({ queryKey: [TREE_KEY, handbookId] });
      qc.invalidateQueries({ queryKey: ['handbooks'] });
      qc.invalidateQueries({ queryKey: [VERSIONS_KEY, handbookId] });
      qc.invalidateQueries({ queryKey: [COMPLETION_KEY, handbookId] });
      qc.invalidateQueries({ queryKey: ['workspace-assets', handbookId] });
      qc.invalidateQueries({ queryKey: [PLACEHOLDERS_KEY, handbookId] });
    },
  });
}

export function useFilePlaceholders(handbookId: string, fileId: string | null) {
  return useQuery({
    queryKey: [PLACEHOLDERS_KEY, handbookId, fileId ?? 'none'],
    queryFn: async () => {
      const res = await fetch(
        `/api/handbooks/${encodeURIComponent(handbookId)}/files/${encodeURIComponent(fileId || '')}/placeholders`,
      );
      return parseJsonOrThrow(res, FilePlaceholdersResponseSchema);
    },
    enabled: Boolean(handbookId && fileId),
  });
}

export function useSaveFilePlaceholders(handbookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      fileId: string;
      values: Array<{ key: string; value_text?: string | null; asset_id?: string | null }>;
      source?: 'MANUAL' | 'AI' | 'IMPORTED';
    }) => {
      const res = await fetch(`/api/handbooks/${encodeURIComponent(handbookId)}/placeholders/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: payload.fileId,
          values: payload.values,
          source: payload.source ?? 'MANUAL',
        }),
      });
      return parseJsonOrThrow(res, SavePlaceholdersResponseSchema);
    },
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: [PLACEHOLDERS_KEY, handbookId, variables.fileId] });
      qc.invalidateQueries({ queryKey: [TREE_KEY, handbookId] });
      qc.invalidateQueries({ queryKey: [VERSIONS_KEY, handbookId] });
      qc.invalidateQueries({ queryKey: [COMPLETION_KEY, handbookId] });
      qc.invalidateQueries({ queryKey: ['handbooks', handbookId] });
      qc.invalidateQueries({ queryKey: ['handbooks'] });
    },
  });
}

export function useHandbookCompletion(handbookId: string) {
  return useQuery({
    queryKey: [COMPLETION_KEY, handbookId],
    queryFn: async () => {
      const res = await fetch(`/api/handbooks/${encodeURIComponent(handbookId)}/completion`);
      return parseJsonOrThrow(res, CompletionResponseSchema);
    },
    enabled: Boolean(handbookId),
  });
}

export function useAiFillHandbookPlaceholder(handbookId: string) {
  return useMutation({
    mutationFn: async (payload: {
      fileId: string;
      placeholderKey: string;
      currentValue: string | null;
      instruction: string;
      language: 'de-DE' | 'en-US';
      context: Record<string, unknown>;
      constraints: { max_length: number | null; required: boolean };
    }) => {
      const res = await fetch(`/api/handbooks/${encodeURIComponent(handbookId)}/placeholders/ai-fill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: payload.fileId,
          placeholder_key: payload.placeholderKey,
          current_value: payload.currentValue,
          instruction: payload.instruction,
          language: payload.language,
          context: payload.context,
          constraints: payload.constraints,
        }),
      });
      return parseJsonOrThrow(res, AiFillResponseSchema);
    },
  });
}

export function useHandbookVersions(handbookId: string) {
  return useQuery({
    queryKey: [VERSIONS_KEY, handbookId],
    queryFn: async () => {
      const res = await fetch(`/api/handbooks/${encodeURIComponent(handbookId)}/versions`);
      return (await parseJsonOrThrow(res, VersionsResponseSchema)).versions;
    },
    enabled: Boolean(handbookId),
  });
}

export function useDeleteHandbookVersion(handbookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (versionNumber: number) => {
      const res = await fetch(
        `/api/handbooks/${encodeURIComponent(handbookId)}/versions/${encodeURIComponent(String(versionNumber))}`,
        { method: 'DELETE' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? 'Failed to delete version');
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [VERSIONS_KEY, handbookId] });
    },
  });
}

export function useCreateHandbookVersion(handbookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload?: { createdBy?: string; reason?: string }) => {
      const res = await fetch(`/api/handbooks/${encodeURIComponent(handbookId)}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          created_by: payload?.createdBy ?? 'user',
          reason: payload?.reason ?? 'manual_completion',
        }),
      });
      return parseJsonOrThrow(res, CreateVersionResponseSchema);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [VERSIONS_KEY, handbookId] });
      qc.invalidateQueries({ queryKey: ['handbooks'] });
      qc.invalidateQueries({ queryKey: ['handbooks', handbookId] });
    },
  });
}

function parseFilename(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) return fallback;
  const match = /filename="?([^\";]+)"?/i.exec(contentDisposition);
  return match?.[1] ?? fallback;
}

export function useDownloadHandbookVersion(handbookId: string) {
  return useMutation({
    mutationFn: async (versionNumber: number) => {
      const res = await fetch(
        `/api/handbooks/${encodeURIComponent(handbookId)}/versions/${encodeURIComponent(String(versionNumber))}/download`,
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to download version');
      }

      const blob = await res.blob();
      const fallbackName = `handbook-${handbookId}-v${versionNumber}.zip`;
      const filename = parseFilename(res.headers.get('content-disposition'), fallbackName);
      return { blob, filename };
    },
  });
}

export function useExportHandbook(handbookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/handbooks/${encodeURIComponent(handbookId)}/export`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = (data as { error?: string }).error ?? 'Failed to export handbook';
        const error = new Error(message) as Error & { details?: unknown };
        error.details = data;
        throw error;
      }

      const blob = await res.blob();
      const filename = parseFilename(res.headers.get('content-disposition'), 'handbook-export.zip');
      return { blob, filename };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['handbooks'] });
      qc.invalidateQueries({ queryKey: ['handbooks', handbookId] });
      qc.invalidateQueries({ queryKey: [VERSIONS_KEY, handbookId] });
    },
  });
}
