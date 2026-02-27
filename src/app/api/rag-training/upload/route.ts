import { NextRequest, NextResponse } from 'next/server';
import { fetchRag } from '@/lib/rag-backend';

/**
 * POST /api/rag-training/upload
 * Proxies multipart upload to Django: POST /api/v1/assets/local-upload
 */
export async function POST(req: NextRequest) {
	const formData = await req.formData();

	const res = await fetchRag('/api/v1/assets/local-upload', {
		method: 'POST',
		body: formData,
	});

	const data = await res.json().catch(() => ({}));
	return NextResponse.json(data, { status: res.status });
}
