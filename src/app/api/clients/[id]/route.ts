import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { UpdateClientSchema } from "@/lib/schemas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const client = store.clients.find((c) => c.id === id);
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(client);
}

export async function PUT(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const idx = store.clients.findIndex((c) => c.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const parsed = UpdateClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  store.clients[idx] = {
    ...store.clients[idx],
    ...parsed.data,
    updatedAt: new Date().toISOString(),
  };
  return NextResponse.json(store.clients[idx]);
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const idx = store.clients.findIndex((c) => c.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  store.clients.splice(idx, 1);
  return new NextResponse(null, { status: 204 });
}
