import { NextRequest, NextResponse } from 'next/server';
import { fetchRag } from '@/lib/rag-backend';

/**
 * POST /api/rag-training/ingest
 * Proxies to Django: POST /api/v1/manuals/{manual_id}/ingest
 */
export async function POST(req: NextRequest) {
	const body = await req.json();
	const { manualId, ...rest } = body as {
		manualId: string;
		force?: boolean;
		sync?: boolean;
	};

	if (!manualId) {
		return NextResponse.json(
			{ error: 'manualId is required' },
			{ status: 400 },
		);
	}

	const res = await fetchRag(`/api/v1/manuals/${manualId}/ingest`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(rest),
	});

	const data = await res.json().catch(() => ({}));
	return NextResponse.json(data, { status: res.status });
}
