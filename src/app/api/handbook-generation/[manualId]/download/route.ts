import { NextResponse } from 'next/server';
import { fetchRag, safeJson } from '@/lib/rag-backend';

export const runtime = 'nodejs';

interface RouteParams {
	params: Promise<{ manualId: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
	const { manualId } = await params;
	const body = await req.json().catch(() => ({}) as Record<string, unknown>);

	const fileIds =
		(Array.isArray((body as { file_ids?: unknown }).file_ids)
			? (body as { file_ids: string[] }).file_ids
			: undefined) ??
		(Array.isArray((body as { fileIds?: unknown }).fileIds)
			? (body as { fileIds: string[] }).fileIds
			: undefined);

	const response = await fetchRag(
		`/api/v1/handbooks/${encodeURIComponent(manualId)}/outputs/download`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				file_ids: fileIds,
				generated_only:
					(body as { generated_only?: boolean }).generated_only ??
					(body as { generatedOnly?: boolean }).generatedOnly ??
					false,
			}),
		},
	);

	if (!response.ok) {
		const err = await safeJson(response);
		return NextResponse.json(
			{ error: (err as { error?: string }).error ?? 'Download failed' },
			{ status: response.status },
		);
	}

	const bytes = await response.arrayBuffer();
	return new Response(bytes, {
		status: 200,
		headers: {
			'Content-Type': response.headers.get('Content-Type') ?? 'application/zip',
			'Content-Disposition':
				response.headers.get('Content-Disposition') ??
				`attachment; filename="handbuch-${manualId}.zip"`,
			'Content-Length': String(bytes.byteLength),
		},
	});
}
