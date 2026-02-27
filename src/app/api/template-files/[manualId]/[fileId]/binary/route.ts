import { NextResponse } from "next/server";
import { fetchRag, safeJson } from "@/lib/rag-backend";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ manualId: string; fileId: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { fileId } = await params;
  const url = new URL(req.url);
  const version = (url.searchParams.get("source") ?? "original").toLowerCase();

  const response = await fetchRag(
    `/api/v1/assets/${encodeURIComponent(fileId)}/binary?version=${encodeURIComponent(
      version === "generated" ? "generated" : "original"
    )}`
  );

  if (!response.ok) {
    const body = await safeJson(response);
    return NextResponse.json(
      { error: (body as { error?: string }).error ?? "Binary fetch failed" },
      { status: response.status }
    );
  }

  const bytes = await response.arrayBuffer();
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type":
        response.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition":
        response.headers.get("Content-Disposition") ?? "inline",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
