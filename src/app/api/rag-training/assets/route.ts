import { NextRequest, NextResponse } from 'next/server';
import { fetchRag } from '@/lib/rag-backend';

/**
 * GET /api/rag-training/assets?manual_id=xxx&role=TEMPLATE
 * Proxies to Django: GET /api/v1/manuals/{manual_id}/assets?role=...
 */
export async function GET(req: NextRequest) {
	const manualId = req.nextUrl.searchParams.get('manual_id');
	if (!manualId) {
		return NextResponse.json(
			{ error: 'manual_id is required' },
			{ status: 400 },
		);
	}

	const role = req.nextUrl.searchParams.get('role');
	const qs = role ? `?role=${encodeURIComponent(role)}` : '';

	const res = await fetchRag(`/api/v1/manuals/${manualId}/assets${qs}`);
	const data = await res.json().catch(() => ({}));
	return NextResponse.json(data, { status: res.status });
}
