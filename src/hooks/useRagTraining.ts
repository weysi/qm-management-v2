import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface RagAssetItem {
	id: string;
	manual_id: string;
	tenant_id: string;
	path: string;
	name: string;
	ext: string;
	mime_type: string;
	size: number;
	role: string;
	source: string;
	created_at: string;
	placeholders: string[];
	unresolved_placeholders: string[];
	has_generated_version: boolean;
	last_generated_at: string | null;
	generated_asset_id: string | null;
}

export interface RagRunItem {
	id: string;
	manual_id: string;
	kind: string;
	status: string;
	prompt_version: string | null;
	model: string | null;
	metrics: Record<string, unknown>;
	started_at: string | null;
	finished_at: string | null;
}

export interface RagRunEvent {
	id: string;
	ts: string;
	level: string;
	message: string;
	payload: Record<string, unknown>;
}

export interface RagRunDetail {
	run: RagRunItem;
	events: RagRunEvent[];
}

export interface UploadAssetParams {
	file: File;
	manualId: string;
	tenantId?: string;
	packageCode?: string;
	packageVersion?: string;
	role?: string;
	path?: string;
}

export interface StartPackageParams {
	manualId: string;
	tenantId: string;
	packageCode: string;
	packageVersion: string;
	sync?: boolean;
	force?: boolean;
}

export interface IngestParams {
	manualId: string;
	force?: boolean;
	sync?: boolean;
}

export interface ChatParams {
	manual_id: string;
	tenant_id: string;
	question: string;
}

export interface ChatResult {
	answer: string;
	citations: Array<{
		chunk_id: string;
		asset_path: string;
		excerpt: string;
		score: number;
	}>;
	route: string;
	run_id: string;
}

/* ------------------------------------------------------------------ */
/*  Query keys                                                         */
/* ------------------------------------------------------------------ */

const ASSETS_KEY = 'rag-assets';
const RUN_KEY = 'rag-run';

/* ------------------------------------------------------------------ */
/*  Fetchers                                                           */
/* ------------------------------------------------------------------ */

async function fetchAssets(
	manualId: string,
	role?: string,
): Promise<RagAssetItem[]> {
	const params = new URLSearchParams({ manual_id: manualId });
	if (role) params.set('role', role);

	const res = await fetch(`/api/rag-training/assets?${params}`);
	if (!res.ok) throw new Error('Dateien konnten nicht geladen werden');
	const data = await res.json();
	return data.assets ?? [];
}

async function uploadAsset(params: UploadAssetParams): Promise<{
	asset: RagAssetItem;
	run_id: string;
}> {
	const form = new FormData();
	form.append('file', params.file);
	form.append('manual_id', params.manualId);
	form.append('tenant_id', params.tenantId ?? 'default-tenant');
	form.append('package_code', params.packageCode ?? 'ISO9001');
	form.append('package_version', params.packageVersion ?? 'v1');
	form.append('role', params.role ?? 'TEMPLATE');
	if (params.path) form.append('path', params.path);

	const res = await fetch('/api/rag-training/upload', {
		method: 'POST',
		body: form,
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(
			(err as { error?: string }).error ?? 'Upload fehlgeschlagen',
		);
	}
	return res.json();
}

async function startPackage(
	params: StartPackageParams,
): Promise<{ run: RagRunItem; manual_id: string; tenant_id: string }> {
	const res = await fetch('/api/rag-training/start-package', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			manualId: params.manualId,
			package_code: params.packageCode,
			package_version: params.packageVersion,
			tenant_id: params.tenantId,
			sync: params.sync ?? false,
			force: params.force ?? false,
		}),
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(
			(err as { error?: string }).error ?? 'Paket-Start fehlgeschlagen',
		);
	}
	return res.json();
}

async function ingestManual(
	params: IngestParams,
): Promise<{ run: RagRunItem }> {
	const res = await fetch('/api/rag-training/ingest', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			manualId: params.manualId,
			force: params.force ?? false,
			sync: params.sync ?? false,
		}),
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(
			(err as { error?: string }).error ?? 'Indizierung fehlgeschlagen',
		);
	}
	return res.json();
}

async function fetchRunDetail(
	manualId: string,
	runId: string,
): Promise<RagRunDetail> {
	const params = new URLSearchParams({ manual_id: manualId, run_id: runId });
	const res = await fetch(`/api/rag-training/runs?${params}`);
	if (!res.ok) throw new Error('Run konnte nicht geladen werden');
	return res.json();
}

async function chatRag(params: ChatParams): Promise<ChatResult> {
	const res = await fetch('/api/rag-training/chat', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(params),
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error((err as { error?: string }).error ?? 'Chat fehlgeschlagen');
	}
	return res.json();
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

export function useRagAssets(manualId: string, role?: string) {
	return useQuery({
		queryKey: [ASSETS_KEY, manualId, role],
		queryFn: () => fetchAssets(manualId, role),
		enabled: !!manualId,
		refetchInterval: 10_000,
	});
}

export function useRagUpload(manualId: string) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: uploadAsset,
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: [ASSETS_KEY, manualId] });
		},
	});
}

export function useRagStartPackage() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: startPackage,
		onSuccess: (_data, vars) => {
			qc.invalidateQueries({ queryKey: [ASSETS_KEY, vars.manualId] });
		},
	});
}

export function useRagIngest() {
	return useMutation({ mutationFn: ingestManual });
}

export function useRagRunDetail(manualId: string, runId: string) {
	return useQuery({
		queryKey: [RUN_KEY, manualId, runId],
		queryFn: () => fetchRunDetail(manualId, runId),
		enabled: !!manualId && !!runId,
		refetchInterval: query => {
			const status = query.state.data?.run?.status;
			if (status === 'SUCCEEDED' || status === 'FAILED') return false;
			return 3_000;
		},
	});
}

export function useRagChat() {
	return useMutation({ mutationFn: chatRag });
}
