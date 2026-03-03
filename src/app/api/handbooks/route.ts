import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { store } from '@/lib/store';
import { isoManualSections } from '@/lib/mock-data/manual-template';
import { fetchBackend, safeJson } from '@/lib/backend-api';
import type { Client } from '@/lib/schemas';

export async function GET() {
	return NextResponse.json(store.manuals);
}

export async function POST(req: Request) {
	const body = await req.json();
	const { clientId, packageCode, packageVersion } = body as {
		clientId: string;
		packageCode?: string;
		packageVersion?: string;
	};

	// Look up client in local store first; if missing (e.g. after a server
	// restart the in-memory store is empty) fetch from Django and cache it.
	let client = store.clients.find(c => c.id === clientId);
	if (!client) {
		try {
			const res = await fetchBackend(
				`/api/v1/clients/${encodeURIComponent(clientId)}/`,
			);
			if (res.ok) {
				client = (await safeJson(res)) as Client;
				store.clients.push(client);
			}
		} catch {
			// Django unreachable — client genuinely not found
		}
	}
	if (!client) {
		return NextResponse.json({ error: 'Client not found' }, { status: 404 });
	}

	const handbookId = randomUUID();
	const now = new Date().toISOString();

	const handbook = {
		id: handbookId,
		clientId,
		title: `Qualitätsmanagementhandbuch – ${client.name}`,
		version: '1.0',
		status: 'draft' as const,
		sections: isoManualSections.map((s, i) => ({
			...s,
			id: `${handbookId}-section-${i}`,
		})),
		createdAt: now,
		updatedAt: now,
	};

	store.manuals.push(handbook);

	// packageCode/packageVersion are accepted for compatibility, but the
	// document pipeline does not initialize backend package workflows here.
	void packageCode;
	void packageVersion;

	return NextResponse.json(handbook, { status: 201 });
}
