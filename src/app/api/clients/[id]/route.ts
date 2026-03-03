import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { UpdateClientSchema } from "@/lib/schemas";
import { fetchBackend, safeJson } from '@/lib/backend-api';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function tryBackend(
  path: string,
  init?: RequestInit
): Promise<Response | null> {
  try {
    return await fetchBackend(path, init);
  } catch {
    return null;
  }
}

// ── GET /api/clients/[id] ───────────────────────────────────────────────────
export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;

  const res = await tryBackend(`/api/v1/clients/${encodeURIComponent(id)}/`);
	if (res?.ok) {
		return NextResponse.json(await safeJson(res));
	}
	if (res?.status === 404) {
		return NextResponse.json({ error: 'Not found' }, { status: 404 });
	}

	// Fallback
	const client = store.clients.find(c => c.id === id);
	if (!client)
		return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(client);
}

// ── PUT /api/clients/[id] ───────────────────────────────────────────────────
export async function PUT(req: Request, { params }: RouteParams) {
	const { id } = await params;
	const body = await req.json();
	const parsed = UpdateClientSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const res = await tryBackend(`/api/v1/clients/${encodeURIComponent(id)}/`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(parsed.data),
	});

	if (res) {
		const data = await safeJson(res);
		if (res.ok) {
			// Sync update into in-memory store
			const idx = store.clients.findIndex(c => c.id === id);
			if (idx !== -1)
				store.clients[idx] = { ...store.clients[idx], ...(data as object) };
			return NextResponse.json(data);
		}
		return NextResponse.json(data, { status: res.status });
	}

	// Fallback
	const idx = store.clients.findIndex(c => c.id === id);
	if (idx === -1)
		return NextResponse.json({ error: 'Not found' }, { status: 404 });
	store.clients[idx] = {
		...store.clients[idx],
		...parsed.data,
		updatedAt: new Date().toISOString(),
	};
	return NextResponse.json(store.clients[idx]);
}

// ── PATCH /api/clients/[id] ─────────────────────────────────────────────────
export async function PATCH(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const body = await req.json();
  const parsed = UpdateClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const res = await tryBackend(`/api/v1/clients/${encodeURIComponent(id)}/`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(parsed.data),
	});

	if (res) {
		const data = await safeJson(res);
		if (res.ok) {
			const idx = store.clients.findIndex(c => c.id === id);
			if (idx !== -1)
				store.clients[idx] = { ...store.clients[idx], ...(data as object) };
			return NextResponse.json(data);
		}
		return NextResponse.json(data, { status: res.status });
	}

	// Fallback
	const idx = store.clients.findIndex(c => c.id === id);
	if (idx === -1)
		return NextResponse.json({ error: 'Not found' }, { status: 404 });
  store.clients[idx] = {
    ...store.clients[idx],
    ...parsed.data,
    updatedAt: new Date().toISOString(),
  };
  return NextResponse.json(store.clients[idx]);
}

// ── DELETE /api/clients/[id] ────────────────────────────────────────────────
export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;

  const res = await tryBackend(`/api/v1/clients/${encodeURIComponent(id)}/`, {
		method: 'DELETE',
	});

	if (res) {
		if (res.ok || res.status === 204 || res.status === 404) {
			// Also remove from local store
			const idx = store.clients.findIndex(c => c.id === id);
			if (idx !== -1) store.clients.splice(idx, 1);
			return new NextResponse(null, { status: 204 });
		}
		return NextResponse.json(await safeJson(res), { status: res.status });
	}

	// Fallback
	const idx = store.clients.findIndex(c => c.id === id);
	if (idx === -1)
		return NextResponse.json({ error: 'Not found' }, { status: 404 });
  store.clients.splice(idx, 1);
  return new NextResponse(null, { status: 204 });
}
