import { fetchBackend, safeJson } from '@/lib/backend-api';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const url = new URL(req.url);
  const version = url.searchParams.get('version') ?? 'latest';

  const res = await fetchBackend(
    `/api/v1/documents/${encodeURIComponent(id)}/download?version=${encodeURIComponent(version)}`,
  );

  if (!res.ok) {
    const err = await safeJson(res);
    return NextResponse.json(
      { error: (err as { error?: string }).error ?? 'Download failed' },
      { status: res.status },
    );
  }

  const bytes = await res.arrayBuffer();
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream',
      'Content-Disposition':
        res.headers.get('Content-Disposition') ?? `attachment; filename="document-${id}"`,
      'Content-Length': String(bytes.byteLength),
    },
  });
}
