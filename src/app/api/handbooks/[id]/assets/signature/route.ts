import { NextResponse } from 'next/server';
import { fetchBackend, safeJson } from '@/lib/backend-api';

export const runtime = 'nodejs';

interface RouteParams {
	params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
	const { id } = await params;
	const contentType = req.headers.get('content-type') ?? '';

	if (contentType.includes('multipart/form-data')) {
		const formData = await req.formData();
		const res = await fetchBackend(
			`/api/v1/handbooks/${encodeURIComponent(id)}/assets/signature`,
			{
				method: 'POST',
				body: formData,
			},
		);
		const data = await safeJson(res);
		return NextResponse.json(data, { status: res.status });
	}

	const body = await req.json().catch(() => ({}));
	const res = await fetchBackend(
		`/api/v1/handbooks/${encodeURIComponent(id)}/assets/signature`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		},
	);
	const data = await safeJson(res);
	return NextResponse.json(data, { status: res.status });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
	const { id } = await params;
	const res = await fetchBackend(
		`/api/v1/handbooks/${encodeURIComponent(id)}/assets/signature`,
		{
			method: 'DELETE',
		},
	);
	const data = await safeJson(res);
	return NextResponse.json(data, { status: res.status });
}
