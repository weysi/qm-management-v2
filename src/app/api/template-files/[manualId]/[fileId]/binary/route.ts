import { NextResponse } from "next/server";
import { GetTemplatePreviewQuerySchema } from "@/lib/schemas";
import { store } from "@/lib/store";
import { resolvePreviewSource } from "@/lib/template-files";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ manualId: string; fileId: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { manualId, fileId } = await params;

  const manual = store.manuals.find((item) => item.id === manualId);
  if (!manual) {
    return NextResponse.json({ error: "Manual not found" }, { status: 404 });
  }

  const file = store.templates.find(
    (item) => item.manualId === manualId && item.id === fileId
  );
  if (!file) {
    return NextResponse.json({ error: "Template file not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const parsed = GetTemplatePreviewQuerySchema.safeParse({
    source: url.searchParams.get("source") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid source query" }, { status: 400 });
  }

  const source = resolvePreviewSource(parsed.data.source, Boolean(file.generatedBase64));
  const payloadBase64 =
    source === "generated" ? file.generatedBase64 : file.originalBase64;

  if (!payloadBase64) {
    return NextResponse.json(
      { error: "Requested file version not available" },
      { status: 404 }
    );
  }

  const body = new Uint8Array(Buffer.from(payloadBase64, "base64"));
  const fileName = source === "generated" ? `${file.name}` : file.name;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename=\"${fileName}\"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
