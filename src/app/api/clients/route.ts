import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { store } from "@/lib/store";
import { CreateClientSchema } from "@/lib/schemas";
import { fetchBackend, safeJson } from '@/lib/backend-api';

// ── helpers ────────────────────────────────────────────────────────────────────

/** Try a Django fetch; on network error return null so callers can fall back. */
async function tryBackend(
	path: string,
	init?: RequestInit,
): Promise<Response | null> {
	try {
		return await fetchBackend(path, init);
	} catch {
		return null;
	}
}

// ── GET /api/clients ────────────────────────────────────────────────────────
export async function GET() {
	const res = await tryBackend('/api/v1/clients/');
	if (res?.ok) {
		const data = await safeJson(res);
		return NextResponse.json(data);
	}
	// Django unreachable — serve from in-memory store
	return NextResponse.json(store.clients);
}

// ── POST /api/clients ───────────────────────────────────────────────────────
export async function POST(req: Request) {
	const body = await req.json();
	const parsed = CreateClientSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	// Try to persist to Django
	const res = await tryBackend('/api/v1/clients/', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(parsed.data),
	});

	if (res) {
		const data = await safeJson(res);
		if (res.ok) {
			// Mirror into in-memory store so manual lookups still work locally
			const client = data as typeof parsed.data & {
				id: string;
				createdAt: string;
				updatedAt: string;
			};
			if (!store.clients.find(c => c.id === (client as { id: string }).id)) {
				store.clients.push(client as Parameters<typeof store.clients.push>[0]);
			}
			return NextResponse.json(data, { status: 201 });
		}
		return NextResponse.json(data, { status: res.status });
	}

	// Django unreachable — fall back to in-memory only
	const now = new Date().toISOString();
	const client = {
		id: randomUUID(),
		...parsed.data,
		createdAt: now,
		updatedAt: now,
	};
	store.clients.push(client);
	return NextResponse.json(client, { status: 201 });
}
