import { NextResponse } from 'next/server';
import { fetchBackend, safeJson } from '@/lib/backend-api';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string; versionNumber: string }>;
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id, versionNumber } = await params;
  const res = await fetchBackend(
    `/api/v1/handbooks/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionNumber)}`,
    { method: 'DELETE' },
  );
  const data = await safeJson(res);
  return NextResponse.json(data, { status: res.status });
}
