import JSZip from "jszip";
import { NextResponse } from "next/server";
import { DownloadTemplateFilesRequestSchema } from "@/lib/schemas";
import { store } from "@/lib/store";
import { sanitizeTemplatePath } from "@/lib/template-files";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ manualId: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const { manualId } = await params;

  const manual = store.manuals.find((item) => item.id === manualId);
  if (!manual) {
    return NextResponse.json({ error: "Manual not found" }, { status: 404 });
  }

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

  const requestedIds = new Set(parsedBody.data.fileIds);
  const files = store.templates.filter(
    (file) => file.manualId === manualId && requestedIds.has(file.id)
  );

  if (files.length === 0) {
    return NextResponse.json(
      { error: "No matching template files found" },
      { status: 400 }
    );
  }

  const zip = new JSZip();
  let addedCount = 0;

  for (const file of files) {
    const sourceBase64 =
      file.generatedBase64 ??
      (parsedBody.data.generatedOnly ? undefined : file.originalBase64);

    if (!sourceBase64) {
      continue;
    }

    zip.file(
      sanitizeTemplatePath(file.path, file.name),
      Buffer.from(sourceBase64, "base64")
    );
    addedCount += 1;
  }

  if (addedCount === 0) {
    return NextResponse.json(
      { error: "No files available for download with selected options" },
      { status: 400 }
    );
  }

  const archive = await zip.generateAsync({ type: "nodebuffer" });
  const body = new Uint8Array(archive);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename=\"manual-${manualId}-templates.zip\"`,
      "Content-Length": String(archive.byteLength),
    },
  });
}
