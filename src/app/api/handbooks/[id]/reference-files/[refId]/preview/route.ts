import { NextResponse } from 'next/server';
import { fetchBackend, safeJson } from '@/lib/backend-api';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string; refId: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id, refId } = await params;
  const res = await fetchBackend(
    `/api/v1/handbooks/${encodeURIComponent(id)}/reference-files/${encodeURIComponent(refId)}/preview`,
  );
  const data = await safeJson(res);
  return NextResponse.json(data, { status: res.status });
}
