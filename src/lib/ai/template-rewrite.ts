import { openai } from "./client";
import type { Client, TemplatePreviewBlock } from "@/lib/schemas";

interface RewriteTemplateBlocksParams {
  prompt: string;
  mode: "block" | "full_file";
  filePath: string;
  client: Client;
  preservePlaceholders?: boolean;
  blocks: Array<Pick<TemplatePreviewBlock, "id" | "text">>;
  mergedMap: Record<string, string>;
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/\n?```$/, "")
    .trim();
}

function parseResponseMap(value: string): Record<string, string> {
  const parsed: unknown = JSON.parse(stripCodeFence(value));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI response is not a JSON object");
  }

  const map: Record<string, string> = {};
  for (const [key, candidate] of Object.entries(parsed)) {
    if (typeof candidate === "string") {
      map[key] = candidate;
    }
  }

  return map;
}

export async function rewriteTemplateBlocksWithAi({
  prompt,
  mode,
  filePath,
  client,
  preservePlaceholders = true,
  blocks,
  mergedMap,
}: RewriteTemplateBlocksParams): Promise<Record<string, string>> {
  if (blocks.length === 0) {
    return {};
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    max_tokens: 2500,
    messages: [
      {
        role: "system",
        content:
          "Du bearbeitest QM-Dokumenttexte. Gib ausschließlich ein JSON-Objekt zurück, dessen Schlüssel genau den Block-IDs entsprechen. Keine Erklärungen, kein Markdown.",
      },
      {
        role: "user",
        content: `Arbeite für Datei: ${filePath}

Unternehmenskontext:
- Firma: ${client.name}
- Branche: ${client.industry}
- Produkte: ${client.products}
- Dienstleistungen: ${client.services}
- Geschäftsführung: ${client.ceo}
- QM-Manager/-in: ${client.qmManager}

Bearbeitungsmodus: ${mode === "full_file" ? "vollständige Datei" : "nur ausgewählte Blöcke"}

Benutzeranweisung:
${prompt}

Platzhalterwerte (zur Orientierung):
${Object.entries(mergedMap)
  .slice(0, 100)
  .map(([key, value]) => `- ${key}: ${value}`)
  .join("\n")}

Zu bearbeitende Blöcke:
${blocks.map((block) => `- ${block.id}: ${block.text}`).join("\n")}

Wichtig:
- ${preservePlaceholders
          ? "Erhalte bestehende Platzhalter im Format {{KEY}}."
          : "Du darfst Platzhalter anpassen, wenn es die Anweisung sinnvoll macht."}
- Antworte NUR als JSON-Objekt mit genau diesen Block-IDs als Keys.
- Jeder Value muss der vollständige neue Blocktext sein.
- Beispiel: {"block-id-1":"neuer Text"}`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  return parseResponseMap(raw);
}
