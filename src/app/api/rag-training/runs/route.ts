import { NextRequest, NextResponse } from 'next/server';
import { fetchRag } from '@/lib/rag-backend';

/**
 * GET /api/rag-training/runs?manual_id=xxx&run_id=yyy
 * Proxies to Django: GET /api/v1/manuals/{manual_id}/runs/{run_id}
 */
export async function GET(req: NextRequest) {
	const manualId = req.nextUrl.searchParams.get('manual_id');
	const runId = req.nextUrl.searchParams.get('run_id');

	if (!manualId || !runId) {
		return NextResponse.json(
			{ error: 'manual_id and run_id are required' },
			{ status: 400 },
		);
	}

	const res = await fetchRag(`/api/v1/manuals/${manualId}/runs/${runId}`);
	const data = await res.json().catch(() => ({}));
	return NextResponse.json(data, { status: res.status });
}
