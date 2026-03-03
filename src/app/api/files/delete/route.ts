import { NextResponse } from 'next/server';
import { fetchBackend, safeJson } from '@/lib/backend-api';

export const runtime = 'nodejs';

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({}));
  const res = await fetchBackend('/api/v1/files', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await safeJson(res);
  return NextResponse.json(data, { status: res.status });
}
