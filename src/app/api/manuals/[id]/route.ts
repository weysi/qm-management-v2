import { NextResponse } from "next/server";
import { store } from "@/lib/store";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;
  const manual = store.manuals.find((m) => m.id === id);
  if (!manual) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(manual);
}

export async function PUT(req: Request, { params }: RouteParams) {
  const { id } = await params;
  const idx = store.manuals.findIndex((m) => m.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { sectionId, content, aiGenerated } = body as {
    sectionId: string;
    content: string;
    aiGenerated?: boolean;
  };

  const sectionIdx = store.manuals[idx].sections.findIndex((s) => s.id === sectionId);
  if (sectionIdx === -1) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  store.manuals[idx].sections[sectionIdx] = {
    ...store.manuals[idx].sections[sectionIdx],
    content,
    aiGenerated: aiGenerated ?? store.manuals[idx].sections[sectionIdx].aiGenerated,
  };
  store.manuals[idx].updatedAt = new Date().toISOString();

  return NextResponse.json(store.manuals[idx]);
}
