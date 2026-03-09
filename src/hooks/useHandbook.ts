import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { HandbookSchema, HandbookTypeSchema, type Handbook } from '@/lib/schemas';

const HANDBOOKS_KEY = ['handbooks'] as const;
const CLIENT_HANDBOOK_FILES_KEY = 'client-handbook-files';

const HandbookListResponseSchema = z.object({
  handbooks: z.array(HandbookSchema),
});

function assertType(type: string) {
  return HandbookTypeSchema.parse(type);
}

async function fetchHandbooks(customerId?: string): Promise<Handbook[]> {
  const query = customerId ? `?customer_id=${encodeURIComponent(customerId)}` : '';
  const res = await fetch(`/api/handbooks${query}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? 'Failed to fetch handbooks');
  }
  return HandbookListResponseSchema.parse(data).handbooks;
}

async function fetchHandbook(id: string): Promise<Handbook> {
  const res = await fetch(`/api/handbooks/${encodeURIComponent(id)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? 'Failed to fetch handbook');
  }
  return HandbookSchema.parse(data);
}

interface CreateHandbookPayload {
  customerId: string;
  type: string;
}

async function createHandbook(payload: CreateHandbookPayload): Promise<Handbook> {
  const handbookType = assertType(payload.type);
  const res = await fetch('/api/handbooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_id: payload.customerId,
      type: handbookType,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? 'Failed to create handbook');
  }
  return HandbookSchema.parse(data);
}

const DeleteHandbookResponseSchema = z.object({
	status: z.literal('deleted'),
	handbook: z.object({
		id: z.string().uuid(),
		customer_id: z.string().uuid(),
	}),
});

async function deleteHandbook(handbookId: string) {
	const res = await fetch(`/api/handbooks/${encodeURIComponent(handbookId)}`, {
		method: 'DELETE',
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		throw new Error(
			(data as { error?: string }).error ?? 'Failed to delete handbook',
		);
	}
	return DeleteHandbookResponseSchema.parse(data);
}

export function useHandbooks(customerId?: string) {
  return useQuery<Handbook[]>({
    queryKey: [...HANDBOOKS_KEY, customerId ?? 'all'],
    queryFn: () => fetchHandbooks(customerId),
  });
}

export function useHandbook(id: string) {
  return useQuery<Handbook>({
    queryKey: [...HANDBOOKS_KEY, id],
    queryFn: () => fetchHandbook(id),
    enabled: Boolean(id),
  });
}

export function useCreateHandbook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createHandbook,
    onSuccess: created => {
      qc.invalidateQueries({ queryKey: HANDBOOKS_KEY });
      qc.invalidateQueries({ queryKey: [...HANDBOOKS_KEY, created.id] });
      qc.invalidateQueries({ queryKey: [...HANDBOOKS_KEY, created.customer_id] });
    },
  });
}

export function useDeleteHandbook(customerId?: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: deleteHandbook,
		onMutate: async handbookId => {
			await qc.cancelQueries({ queryKey: HANDBOOKS_KEY });
			if (customerId) {
				await qc.cancelQueries({
					queryKey: [CLIENT_HANDBOOK_FILES_KEY, customerId],
				});
			}

			const handbookQueries = qc.getQueriesData<Handbook[]>({
				queryKey: HANDBOOKS_KEY,
			});
			const previousClientFiles = customerId
				? qc.getQueryData<{ groups: Array<{ handbook_id: string }> }>([
						CLIENT_HANDBOOK_FILES_KEY,
						customerId,
					])
				: undefined;

			for (const [queryKey, value] of handbookQueries) {
				if (!Array.isArray(value)) continue;
				qc.setQueryData(
					queryKey,
					value.filter(handbook => handbook.id !== handbookId),
				);
			}

			qc.removeQueries({ queryKey: [...HANDBOOKS_KEY, handbookId] });

			if (customerId && previousClientFiles) {
				qc.setQueryData([CLIENT_HANDBOOK_FILES_KEY, customerId], {
					...previousClientFiles,
					groups: previousClientFiles.groups.filter(
						group => group.handbook_id !== handbookId,
					),
				});
			}

			return { handbookQueries, previousClientFiles };
		},
		onError: (_error, _handbookId, context) => {
			for (const [queryKey, value] of context?.handbookQueries ?? []) {
				qc.setQueryData(queryKey, value);
			}

			if (customerId && context?.previousClientFiles) {
				qc.setQueryData(
					[CLIENT_HANDBOOK_FILES_KEY, customerId],
					context.previousClientFiles,
				);
			}
		},
		onSuccess: result => {
			qc.removeQueries({ queryKey: [...HANDBOOKS_KEY, result.handbook.id] });
			qc.invalidateQueries({ queryKey: HANDBOOKS_KEY });
			qc.invalidateQueries({
				queryKey: [...HANDBOOKS_KEY, result.handbook.customer_id],
			});
			qc.invalidateQueries({ queryKey: ['handbook-tree', result.handbook.id] });
			qc.invalidateQueries({
				queryKey: ['handbook-completion', result.handbook.id],
			});
			qc.invalidateQueries({
				queryKey: ['handbook-file-placeholders', result.handbook.id],
			});
			qc.invalidateQueries({
				queryKey: ['handbook-versions', result.handbook.id],
			});
			qc.invalidateQueries({
				queryKey: ['workspace-assets', result.handbook.id],
			});
			qc.invalidateQueries({
				queryKey: ['reference-files', result.handbook.id],
			});
			qc.invalidateQueries({
				queryKey: [CLIENT_HANDBOOK_FILES_KEY, result.handbook.customer_id],
			});
			if (customerId) {
				qc.invalidateQueries({
					queryKey: [CLIENT_HANDBOOK_FILES_KEY, customerId],
				});
			}
		},
	});
}

// Backward-compatible aliases
export const useManuals = useHandbooks;
export const useManual = useHandbook;
export const useCreateManual = useCreateHandbook;
