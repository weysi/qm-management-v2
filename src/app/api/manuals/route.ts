import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { store } from "@/lib/store";
import { isoManualSections } from "@/lib/mock-data/manual-template";
import { fetchRag } from '@/lib/rag-backend';

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

	const client = store.clients.find(c => c.id === clientId);
	if (!client) {
		return NextResponse.json({ error: 'Client not found' }, { status: 404 });
	}

	const manualId = randomUUID();
	const now = new Date().toISOString();

	const manual = {
		id: manualId,
		clientId,
		title: `Qualitätsmanagementhandbuch – ${client.name}`,
		version: '1.0',
		status: 'draft' as const,
		sections: isoManualSections.map((s, i) => ({
			...s,
			id: `${manualId}-section-${i}`,
		})),
		createdAt: now,
		updatedAt: now,
	};

	store.manuals.push(manual);

	// If package is specified, trigger start-package on Django backend
	if (packageCode && packageVersion) {
		try {
			await fetchRag(`/api/v1/manuals/${manualId}/start-package`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					package_code: packageCode,
					package_version: packageVersion,
					tenant_id: clientId,
					sync: false,
					force: false,
				}),
			});
		} catch {
			// Non-fatal: manual is created even if package init fails
			console.warn(
				`[manuals/POST] start-package failed for ${manualId}, continuing`,
			);
		}
	}

  return NextResponse.json(manual, { status: 201 });
}
