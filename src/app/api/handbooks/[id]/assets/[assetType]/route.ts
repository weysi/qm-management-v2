import { NextResponse } from 'next/server';
import { fetchBackend, safeJson } from '@/lib/backend-api';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string; assetType: string }>;
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id, assetType } = await params;
  const res = await fetchBackend(
    `/api/v1/handbooks/${encodeURIComponent(id)}/assets/${encodeURIComponent(assetType)}`,
    {
      method: 'DELETE',
    },
  );
  const data = await safeJson(res);
  return NextResponse.json(data, { status: res.status });
}
