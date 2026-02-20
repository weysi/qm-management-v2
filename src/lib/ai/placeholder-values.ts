import { openai } from "./client";
import type { Client } from "@/lib/schemas";

interface GeneratePlaceholderValuesParams {
  tokens: string[];
  client: Client;
  filePaths: string[];
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

function parseJsonRecord(value: string): Record<string, string> {
  const parsed: unknown = JSON.parse(stripCodeFence(value));

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI response is not a JSON object");
  }

  const record: Record<string, string> = {};
  for (const [key, candidate] of Object.entries(parsed)) {
    if (typeof candidate === "string") {
      record[key] = candidate;
    }
  }

  return record;
}

export async function generatePlaceholderValues({
  tokens,
  client,
  filePaths,
}: GeneratePlaceholderValuesParams): Promise<Record<string, string>> {
  if (tokens.length === 0) {
    return {};
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 1000,
    messages: [
      {
        role: "system",
        content:
          "Du erzeugst ausschließlich JSON-Objekte für Platzhalterwerte. Gib nur gültiges JSON zurück, ohne Markdown, Kommentare oder Zusatztext.",
      },
      {
        role: "user",
        content: `Erzeuge Werte für diese Platzhalter: ${tokens.join(", ")}.

Nutze folgenden Unternehmenskontext:
- Firma: ${client.name}
- Branche: ${client.industry}
- Produkte: ${client.products}
- Dienstleistungen: ${client.services}
- Geschäftsführung: ${client.ceo}
- QM-Manager/-in: ${client.qmManager}
- Adresse: ${client.address}, ${client.zipCity}
- Mitarbeiterzahl: ${client.employeeCount}

Dateikontext:
${filePaths.map((path) => `- ${path}`).join("\n")}

Wichtig:
- Verwende exakt die angefragten Schlüssel.
- Jeder Wert muss ein String sein.
- Antworte als JSON-Objekt, z.B. {"KEY":"VALUE"}.`,
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  const parsed = parseJsonRecord(raw);

  const requested = new Set(tokens);
  const filtered: Record<string, string> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (!requested.has(key)) continue;
    if (value.trim() === "") continue;
    filtered[key] = value;
  }

  return filtered;
}
