import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Template rewrite is temporarily disabled while canvas editing is frozen.",
    },
    { status: 503 }
  );
}
