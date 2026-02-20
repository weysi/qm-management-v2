import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { generateSectionContent } from "@/lib/ai/generate";
import type { GenerateRequest } from "@/types";

export async function POST(req: Request) {
  const body = (await req.json()) as GenerateRequest;
  const { sectionId, clientData, sectionContent, chapterNumber, chapterTitle } = body;

  if (!sectionId || !clientData) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const section = {
    id: sectionId,
    chapterNumber,
    title: chapterTitle,
    content: sectionContent,
    placeholders: [],
    aiGenerated: false,
    order: 0,
  };

  let content: string;
  let tokensUsed: number;
  try {
    ({ content, tokensUsed } = await generateSectionContent(section, clientData));
  } catch (err: unknown) {
    const apiErr = err as { status?: number; code?: string; message?: string };
    if (apiErr?.status === 429 || apiErr?.code === "insufficient_quota") {
      return NextResponse.json(
        { error: "OpenAI-Kontingent erschöpft. Bitte Guthaben unter platform.openai.com/billing aufladen." },
        { status: 402 }
      );
    }
    const message = apiErr?.message ?? "KI-Generierung fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Persist to in-memory store
  const manualIdx = store.manuals.findIndex((m) =>
    m.sections.some((s) => s.id === sectionId)
  );
  if (manualIdx !== -1) {
    const sectionIdx = store.manuals[manualIdx].sections.findIndex(
      (s) => s.id === sectionId
    );
    if (sectionIdx !== -1) {
      store.manuals[manualIdx].sections[sectionIdx].content = content;
      store.manuals[manualIdx].sections[sectionIdx].aiGenerated = true;
      store.manuals[manualIdx].updatedAt = new Date().toISOString();
    }
  }

  return NextResponse.json({ sectionId, content, tokensUsed });
}
