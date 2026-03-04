import { NextResponse } from 'next/server';
import { fetchBackend, safeJson } from '@/lib/backend-api';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string; assetType: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id, assetType } = await params;
  const res = await fetchBackend(
    `/api/v1/handbooks/${encodeURIComponent(id)}/assets/${encodeURIComponent(assetType)}/download`,
    { method: 'GET' },
  );

  if (!res.ok) {
    const data = await safeJson(res);
    return NextResponse.json(data, { status: res.status });
  }

  const headers = new Headers();
  const contentType = res.headers.get('content-type');
  const contentDisposition = res.headers.get('content-disposition');
  const contentLength = res.headers.get('content-length');
  const cacheControl = res.headers.get('cache-control');
  const pragma = res.headers.get('pragma');
  const expires = res.headers.get('expires');
  if (contentType) headers.set('content-type', contentType);
  if (contentDisposition) headers.set('content-disposition', contentDisposition);
  if (contentLength) headers.set('content-length', contentLength);
  if (cacheControl) headers.set('cache-control', cacheControl);
  if (pragma) headers.set('pragma', pragma);
  if (expires) headers.set('expires', expires);

  return new NextResponse(res.body, {
    status: res.status,
    headers,
  });
}
