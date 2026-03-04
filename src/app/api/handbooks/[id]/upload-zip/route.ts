import { NextResponse } from 'next/server';
import { fetchBackend, safeJson } from '@/lib/backend-api';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const formData = await req.formData();
  const res = await fetchBackend(`/api/v1/handbooks/${encodeURIComponent(id)}/upload-zip`, {
    method: 'POST',
    body: formData,
  });
  const data = await safeJson(res);
  return NextResponse.json(data, { status: res.status });
}
