import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend } from '@/lib/backend-api';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const formData = await req.formData();

  let res: Response;
  try {
    res = await fetchBackend('/api/v1/documents/upload', {
      method: 'POST',
      body: formData,
    });
  } catch {
    return NextResponse.json({ error: 'Backend is not reachable' }, { status: 502 });
  }

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
