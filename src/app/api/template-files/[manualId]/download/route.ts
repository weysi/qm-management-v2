import { NextResponse } from "next/server";
import { DownloadTemplateFilesRequestSchema } from "@/lib/schemas";
import { fetchRag, safeJson } from "@/lib/rag-backend";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ manualId: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const { manualId } = await params;
  const parsedBody = DownloadTemplateFilesRequestSchema.safeParse(await req.json());
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error: "Invalid request payload",
        issues: parsedBody.error.flatten(),
      },
      { status: 400 }
    );
  }

  const response = await fetchRag(
    `/api/v1/manuals/${encodeURIComponent(manualId)}/outputs/download`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_ids: parsedBody.data.fileIds,
        generated_only: parsedBody.data.generatedOnly ?? false,
      }),
    }
  );

  if (!response.ok) {
    const body = await safeJson(response);
    return NextResponse.json(
      { error: (body as { error?: string }).error ?? "Download failed" },
      { status: response.status }
    );
  }

  const blob = await response.arrayBuffer();
  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/zip",
      "Content-Disposition":
        response.headers.get("Content-Disposition") ??
        `attachment; filename="manual-${manualId}-templates.zip"`,
      "Content-Length":
        response.headers.get("Content-Length") ?? String(blob.byteLength),
    },
  });
}
