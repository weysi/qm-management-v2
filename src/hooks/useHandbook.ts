import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Manual } from '@/types';

const QUERY_KEY = ['handbooks'] as const;

async function fetchHandbooks(): Promise<Manual[]> {
	const res = await fetch('/api/handbooks');
	if (!res.ok) throw new Error('Failed to fetch handbooks');
	return res.json();
}

async function fetchHandbook(id: string): Promise<Manual> {
	const res = await fetch(`/api/handbooks/${id}`);
	if (!res.ok) throw new Error('Failed to fetch handbook');
	return res.json();
}

async function updateHandbookSection(
	handbookId: string,
	sectionId: string,
	content: string,
): Promise<Manual> {
	const res = await fetch(`/api/handbooks/${handbookId}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ sectionId, content }),
	});
	if (!res.ok) throw new Error('Failed to update section');
	return res.json();
}

interface CreateHandbookPayload {
	clientId: string;
	packageCode?: string;
	packageVersion?: string;
}

async function createHandbook(payload: CreateHandbookPayload): Promise<Manual> {
	const res = await fetch('/api/handbooks', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(
			(err as { error?: string }).error ?? 'Failed to create handbook',
		);
	}
	return res.json();
}

export function useHandbooks() {
	return useQuery({ queryKey: QUERY_KEY, queryFn: fetchHandbooks });
}

export function useHandbook(id: string) {
	return useQuery({
		queryKey: [...QUERY_KEY, id],
		queryFn: () => fetchHandbook(id),
		enabled: !!id,
	});
}

export function useCreateHandbook() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: createHandbook,
		onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
	});
}

export function useUpdateHandbookSection(handbookId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({
			sectionId,
			content,
		}: {
			sectionId: string;
			content: string;
		}) => updateHandbookSection(handbookId, sectionId, content),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: [...QUERY_KEY, handbookId] }),
	});
}

// ---- Backward-compat aliases (used by existing components) ----
export const useManuals = useHandbooks;
export const useManual = useHandbook;
export const useCreateManual = useCreateHandbook;
export const useUpdateManualSection = useUpdateHandbookSection;
