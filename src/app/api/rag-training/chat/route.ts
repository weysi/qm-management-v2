import { NextRequest, NextResponse } from 'next/server';
import { fetchRag } from '@/lib/rag-backend';

/**
 * POST /api/rag-training/chat
 * Proxies to Django: POST /api/v1/chat
 */
export async function POST(req: NextRequest) {
	const body = (await req.json().catch(() => ({}))) as {
		manual_id?: string;
		tenant_id?: string;
		question?: string;
		session_id?: string;
	};

	const manualId = body.manual_id;
	const question = body.question;
	if (!manualId || !question) {
		return NextResponse.json(
			{ error: 'manual_id and question are required' },
			{ status: 400 },
		);
	}

	const res = await fetchRag('/api/v1/chat', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			manual_id: manualId,
			message: question,
			session_id: body.session_id ?? body.tenant_id ?? undefined,
		}),
	});

	const data = await res.json().catch(() => ({} as Record<string, unknown>));
	if (!res.ok) {
		return NextResponse.json(data, { status: res.status });
	}

	const mapped = {
		answer: String((data as { answer_markdown?: string }).answer_markdown ?? ''),
		citations: Array.isArray((data as { citations?: unknown[] }).citations)
			? ((data as { citations: Array<{ chunk_id: string; asset_path: string }> }).citations ?? []).map(
					citation => ({
						chunk_id: citation.chunk_id,
						asset_path: citation.asset_path,
						excerpt: '',
						score: 0,
					}),
			  )
			: [],
		route: 'HYBRID',
		run_id: String((data as { run_id?: string }).run_id ?? ''),
	};

	return NextResponse.json(mapped, { status: 200 });
}
