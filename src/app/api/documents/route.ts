import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend, safeJson } from '@/lib/backend-api';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const handbookId = req.nextUrl.searchParams.get('handbook_id');
  if (!handbookId) {
    return NextResponse.json({ error: 'handbook_id is required' }, { status: 400 });
  }

  const includeDeleted = req.nextUrl.searchParams.get('include_deleted') ?? 'false';

  const res = await fetchBackend(
    `/api/v1/documents?handbook_id=${encodeURIComponent(handbookId)}&include_deleted=${encodeURIComponent(includeDeleted)}`,
  );
  const data = await safeJson(res);
  return NextResponse.json(data, { status: res.status });
}
