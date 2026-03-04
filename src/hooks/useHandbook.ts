import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { HandbookSchema, HandbookTypeSchema, type Handbook } from '@/lib/schemas';

const HANDBOOKS_KEY = ['handbooks'] as const;

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

// Backward-compatible aliases
export const useManuals = useHandbooks;
export const useManual = useHandbook;
export const useCreateManual = useCreateHandbook;
