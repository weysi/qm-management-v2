import { NextResponse } from 'next/server';
import { fetchBackend, safeJson } from '@/lib/backend-api';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const res = await fetchBackend(
    `/api/v1/documents/${encodeURIComponent(id)}/ai-rewrite`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const data = await safeJson(res);
  return NextResponse.json(data, { status: res.status });
}
