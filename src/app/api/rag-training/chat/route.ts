import { NextRequest, NextResponse } from 'next/server';
import { fetchRag } from '@/lib/rag-backend';

/**
 * POST /api/rag-training/chat
 * Proxies to Django: POST /api/v1/chat
 */
export async function POST(req: NextRequest) {
	const body = await req.json();

	const res = await fetchRag('/api/v1/chat', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

	const data = await res.json().catch(() => ({}));
	return NextResponse.json(data, { status: res.status });
}
