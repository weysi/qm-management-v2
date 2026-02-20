import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { store } from "@/lib/store";
import { isoManualSections } from "@/lib/mock-data/manual-template";

export async function GET() {
  return NextResponse.json(store.manuals);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { clientId } = body as { clientId: string };

  const client = store.clients.find((c) => c.id === clientId);
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const manualId = randomUUID();
  const now = new Date().toISOString();

  const manual = {
    id: manualId,
    clientId,
    title: `Qualitätsmanagementhandbuch – ${client.name}`,
    version: "1.0",
    status: "draft" as const,
    sections: isoManualSections.map((s, i) => ({
      ...s,
      id: `${manualId}-section-${i}`,
    })),
    createdAt: now,
    updatedAt: now,
  };

  store.manuals.push(manual);
  return NextResponse.json(manual, { status: 201 });
}
