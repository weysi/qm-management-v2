import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { store } from "@/lib/store";
import { CreateClientSchema } from "@/lib/schemas";

export async function GET() {
  return NextResponse.json(store.clients);
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

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
