import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      error:
        "Canvas preview is temporarily disabled during Django RAG cutover.",
    },
    { status: 503 }
  );
}

export async function PUT() {
  return NextResponse.json(
    {
      error:
        "Canvas preview editing is temporarily disabled during Django RAG cutover.",
    },
    { status: 503 }
  );
}
