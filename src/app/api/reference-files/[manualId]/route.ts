import { NextResponse } from "next/server";
import { store } from "@/lib/store";

interface RouteParams {
  params: Promise<{ manualId: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { manualId } = await params;
  const files = store.refs.filter((r) => r.manualId === manualId);
  return NextResponse.json(files);
}
