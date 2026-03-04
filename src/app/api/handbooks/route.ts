import { NextRequest, NextResponse } from 'next/server';
import { fetchBackend, safeJson } from '@/lib/backend-api';

export const runtime = 'nodejs';

const TYPE_ALIASES: Record<string, string> = {
  ISO9001: 'ISO9001',
  ISO14001: 'ISO14001',
  ISO45001: 'ISO45001',
  'SCC*': 'SCC_STAR',
  SCC_STAR: 'SCC_STAR',
  'SCC**': 'SCC_DOUBLESTAR',
  SCC_DOUBLESTAR: 'SCC_DOUBLESTAR',
  SCCP: 'SCCP',
  SCP: 'SCP',
};

function normalizeType(input: unknown): string {
  const raw = String(input ?? '').trim();
  return TYPE_ALIASES[raw] ?? raw;
}

export async function GET(req: NextRequest) {
  const customerId =
    req.nextUrl.searchParams.get('customer_id') ??
    req.nextUrl.searchParams.get('clientId') ??
    '';

  const query = customerId ? `?customer_id=${encodeURIComponent(customerId)}` : '';
  const res = await fetchBackend(`/api/v1/handbooks${query}`);
  const data = await safeJson(res);
  return NextResponse.json(data, { status: res.status });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const customerId = String(
    (body as { customer_id?: string; clientId?: string }).customer_id ??
      (body as { customer_id?: string; clientId?: string }).clientId ??
      '',
  ).trim();

  const type = normalizeType(
    (body as { type?: string; packageCode?: string }).type ??
      (body as { type?: string; packageCode?: string }).packageCode,
  );

  const res = await fetchBackend('/api/v1/handbooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customer_id: customerId,
      type,
    }),
  });
  const data = await safeJson(res);
  return NextResponse.json(data, { status: res.status });
}
