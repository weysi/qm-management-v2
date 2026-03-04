import { NextResponse } from 'next/server';
import { fetchBackend, safeJson } from '@/lib/backend-api';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string; versionNumber: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id, versionNumber } = await params;
  const res = await fetchBackend(
    `/api/v1/handbooks/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionNumber)}/download`,
  );

  if (!res.ok) {
    const data = await safeJson(res);
    return NextResponse.json(data, { status: res.status });
  }

  const headers = new Headers();
  const contentType = res.headers.get('content-type');
  const contentDisposition = res.headers.get('content-disposition');
  const contentLength = res.headers.get('content-length');

  if (contentType) headers.set('content-type', contentType);
  if (contentDisposition) headers.set('content-disposition', contentDisposition);
  if (contentLength) headers.set('content-length', contentLength);

  return new NextResponse(res.body, {
    status: res.status,
    headers,
  });
}
