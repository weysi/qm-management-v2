import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
	HandbookComposeConfigSchema,
	HandbookComposeResponseSchema,
	HandbookCompletionSchema,
	HandbookFileSchema,
	HandbookPlaceholderSchema,
	HandbookSnapshotSchema,
	HandbookTreeNodeSchema,
	ReferenceDocumentLinkSchema,
	ReferenceDocumentSchema,
	ReferencePreviewSchema,
} from '@/lib/schemas';

const TREE_KEY = 'handbook-tree';
const PLACEHOLDERS_KEY = 'handbook-file-placeholders';
const VERSIONS_KEY = 'handbook-versions';
const COMPLETION_KEY = 'handbook-completion';
const REFERENCE_FILES_KEY = 'handbook-reference-files';
const COMPOSE_CONFIG_KEY = 'handbook-compose-config';
const GENERATION_AUDIT_KEY = 'handbook-generation-audit';

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

const AiFillResponseSchema = HandbookComposeResponseSchema;

const VersionsResponseSchema = z.object({
  versions: z.array(HandbookSnapshotSchema),
});

const CompletionResponseSchema = HandbookCompletionSchema;

const CreateVersionResponseSchema = z.object({
  created: z.boolean(),
  snapshot: HandbookSnapshotSchema,
});

const ReferenceDocumentsResponseSchema = z.object({
	reference_documents: z.array(ReferenceDocumentSchema),
});

const ReferenceDocumentResponseSchema = z.object({
	reference_document: ReferenceDocumentSchema,
});

const ReferencePreviewResponseSchema = ReferencePreviewSchema;

const ReferenceLinkResponseSchema = z.object({
	link: ReferenceDocumentLinkSchema,
});

const GenerationAuditResponseSchema = z.object({
	audit: z.record(z.string(), z.unknown()),
});

async function parseJsonOrThrow<T extends z.ZodTypeAny>(
	res: Response,
	schema: T,
): Promise<z.output<T>> {
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error((data as { error?: string }).error ?? 'Request failed');
	}
	return schema.parse(data) as z.output<T>;
}

export async function fetchHandbookFilePlaceholders(
	handbookId: string,
	fileId: string,
) {
	const res = await fetch(
		`/api/handbooks/${encodeURIComponent(handbookId)}/files/${encodeURIComponent(fileId)}/placeholders`,
	);
	return parseJsonOrThrow(res, FilePlaceholdersResponseSchema);
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
		queryFn: () => fetchHandbookFilePlaceholders(handbookId, fileId || ''),
		enabled: Boolean(handbookId && fileId),
	});
}

export function useSaveFilePlaceholders(handbookId: string) {
  const qc = useQueryClient();
  return useMutation({
		mutationFn: async (payload: {
			fileId: string;
			values: Array<{
				key: string;
				value_text?: string | null;
				asset_id?: string | null;
				source?: 'MANUAL' | 'AI' | 'IMPORTED' | 'COMPOSED';
				audit_id?: string | null;
			}>;
			source?: 'MANUAL' | 'AI' | 'IMPORTED' | 'COMPOSED';
		}) => {
			const res = await fetch(
				`/api/handbooks/${encodeURIComponent(handbookId)}/placeholders/save`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						file_id: payload.fileId,
						values: payload.values,
						source: payload.source ?? 'MANUAL',
					}),
				},
			);
			return parseJsonOrThrow(res, SavePlaceholdersResponseSchema);
		},
		onSuccess: (_result, variables) => {
			qc.invalidateQueries({
				queryKey: [PLACEHOLDERS_KEY, handbookId, variables.fileId],
			});
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

export function useComposeConfig(handbookId: string) {
	return useQuery({
		queryKey: [COMPOSE_CONFIG_KEY, handbookId],
		queryFn: async () => {
			const res = await fetch(
				`/api/handbooks/${encodeURIComponent(handbookId)}/compose-config`,
			);
			return parseJsonOrThrow(res, HandbookComposeConfigSchema);
		},
		enabled: Boolean(handbookId),
		staleTime: 5 * 60_000,
	});
}

export function useReferenceFiles(handbookId: string) {
	return useQuery({
		queryKey: [REFERENCE_FILES_KEY, handbookId],
		queryFn: async () => {
			const res = await fetch(
				`/api/handbooks/${encodeURIComponent(handbookId)}/reference-files`,
			);
			return (await parseJsonOrThrow(res, ReferenceDocumentsResponseSchema))
				.reference_documents;
		},
		enabled: Boolean(handbookId),
	});
}

export function useUploadReferenceFile(handbookId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (file: File) => {
			const form = new FormData();
			form.append('file', file);
			const res = await fetch(
				`/api/handbooks/${encodeURIComponent(handbookId)}/reference-files/upload`,
				{
					method: 'POST',
					body: form,
				},
			);
			return (await parseJsonOrThrow(res, ReferenceDocumentResponseSchema))
				.reference_document;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: [REFERENCE_FILES_KEY, handbookId] });
			qc.invalidateQueries({ queryKey: [COMPOSE_CONFIG_KEY, handbookId] });
		},
	});
}

export function useDeleteReferenceFile(handbookId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (referenceDocumentId: string) => {
			const res = await fetch(
				`/api/handbooks/${encodeURIComponent(handbookId)}/reference-files/${encodeURIComponent(referenceDocumentId)}`,
				{ method: 'DELETE' },
			);
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(
					(data as { error?: string }).error ??
						'Failed to delete reference file',
				);
			}
			return data;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: [REFERENCE_FILES_KEY, handbookId] });
		},
	});
}

export function useReferencePreview(
	handbookId: string,
	referenceDocumentId: string | null,
) {
	return useQuery({
		queryKey: [
			REFERENCE_FILES_KEY,
			handbookId,
			'preview',
			referenceDocumentId ?? 'none',
		],
		queryFn: async () => {
			const res = await fetch(
				`/api/handbooks/${encodeURIComponent(handbookId)}/reference-files/${encodeURIComponent(referenceDocumentId || '')}/preview`,
			);
			return parseJsonOrThrow(res, ReferencePreviewResponseSchema);
		},
		enabled: Boolean(handbookId && referenceDocumentId),
	});
}

export function useLinkReferenceFile(handbookId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (payload: {
			referenceDocumentId: string;
			scope: 'handbook' | 'file' | 'placeholder';
			handbookFileId?: string | null;
			placeholderId?: string | null;
		}) => {
			const res = await fetch(
				`/api/handbooks/${encodeURIComponent(handbookId)}/reference-files/${encodeURIComponent(payload.referenceDocumentId)}/links`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						scope: payload.scope,
						handbook_file_id: payload.handbookFileId ?? undefined,
						placeholder_id: payload.placeholderId ?? undefined,
					}),
				},
			);
			return (await parseJsonOrThrow(res, ReferenceLinkResponseSchema)).link;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: [REFERENCE_FILES_KEY, handbookId] });
		},
	});
}

export function useUnlinkReferenceFile(handbookId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (payload: {
			referenceDocumentId: string;
			linkId: string;
		}) => {
			const res = await fetch(
				`/api/handbooks/${encodeURIComponent(handbookId)}/reference-files/${encodeURIComponent(payload.referenceDocumentId)}/links/${encodeURIComponent(payload.linkId)}`,
				{ method: 'DELETE' },
			);
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(
					(data as { error?: string }).error ??
						'Failed to unlink reference file',
				);
			}
			return data;
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: [REFERENCE_FILES_KEY, handbookId] });
		},
	});
}

export function useReprocessReferenceFile(handbookId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (referenceDocumentId: string) => {
			const res = await fetch(
				`/api/handbooks/${encodeURIComponent(handbookId)}/reference-files/${encodeURIComponent(referenceDocumentId)}/reprocess`,
				{ method: 'POST' },
			);
			return (await parseJsonOrThrow(res, ReferenceDocumentResponseSchema))
				.reference_document;
		},
		onSuccess: (_result, referenceDocumentId) => {
			qc.invalidateQueries({ queryKey: [REFERENCE_FILES_KEY, handbookId] });
			qc.invalidateQueries({
				queryKey: [
					REFERENCE_FILES_KEY,
					handbookId,
					'preview',
					referenceDocumentId,
				],
			});
		},
	});
}

export function useComposePlaceholder(handbookId: string) {
	return useMutation({
		mutationFn: async (payload: {
			fileId: string;
			placeholderKey: string;
			currentValue: string | null;
			instruction: string;
			language: 'de-DE' | 'en-US';
			outputStyle: string;
			referenceScope: 'handbook' | 'file' | 'placeholder';
			referenceDocumentIds: string[];
			useFileContext: boolean;
			constraints: { max_length: number | null; required: boolean };
			modeHint?: string | null;
		}) => {
			const res = await fetch(
				`/api/handbooks/${encodeURIComponent(handbookId)}/placeholders/compose`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						file_id: payload.fileId,
						placeholder_key: payload.placeholderKey,
						current_value: payload.currentValue,
						instruction: payload.instruction,
						language: payload.language,
						output_style: payload.outputStyle,
						reference_scope: payload.referenceScope,
						reference_document_ids: payload.referenceDocumentIds,
						use_file_context: payload.useFileContext,
						constraints: payload.constraints,
						mode_hint: payload.modeHint ?? undefined,
					}),
				},
			);
			return parseJsonOrThrow(res, HandbookComposeResponseSchema);
		},
	});
}

export function useGenerationAudit(handbookId: string, auditId: string | null) {
	return useQuery({
		queryKey: [GENERATION_AUDIT_KEY, handbookId, auditId ?? 'none'],
		queryFn: async () => {
			const res = await fetch(
				`/api/handbooks/${encodeURIComponent(handbookId)}/generation-audits/${encodeURIComponent(auditId || '')}`,
			);
			return (await parseJsonOrThrow(res, GenerationAuditResponseSchema)).audit;
		},
		enabled: Boolean(handbookId && auditId),
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
