import { NextResponse } from "next/server";
import { store } from "@/lib/store";

interface RouteParams {
  params: Promise<{ handbookId: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { handbookId } = await params;
  const files = store.refs.filter((r) => r.handbookId === handbookId);
  return NextResponse.json(files);
}
