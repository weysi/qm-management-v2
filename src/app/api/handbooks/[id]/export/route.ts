import { NextResponse } from 'next/server';
import { fetchBackend, safeJson } from '@/lib/backend-api';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const res = await fetchBackend(`/api/v1/handbooks/${encodeURIComponent(id)}/export`, {
    method: 'POST',
  });

  if (!res.ok) {
    const data = await safeJson(res);
    return NextResponse.json(data, { status: res.status });
  }

  const headers = new Headers();
  const contentType = res.headers.get('content-type');
  const contentDisposition = res.headers.get('content-disposition');
  const contentLength = res.headers.get('content-length');
  const snapshotVersion = res.headers.get('x-snapshot-version');

  if (contentType) headers.set('content-type', contentType);
  if (contentDisposition) headers.set('content-disposition', contentDisposition);
  if (contentLength) headers.set('content-length', contentLength);
  if (snapshotVersion) headers.set('x-snapshot-version', snapshotVersion);

  return new NextResponse(res.body, {
    status: res.status,
    headers,
  });
}
