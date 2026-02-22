/**
 * Prompt builders for canvas-scope AI operations.
 * Extends the existing prompts.ts pattern.
 */

import type { CanvasRewriteGuardrails } from "@/lib/schemas/canvas-model.schema";
import type { Client } from "@/lib/schemas";

/**
 * Build the system prompt for canvas rewrite operations.
 * Instructs the AI to return a JSON map of blockId → newText.
 */
export function buildCanvasRewriteSystemPrompt(
  guardrails: CanvasRewriteGuardrails
): string {
  const activeGuardrails: string[] = [];

  if (guardrails.preserveStyles) {
    activeGuardrails.push(
      "- Füge KEINE Markdown-Formatierung ein (keine **Fettschrift**, keine *Kursivschrift*, kein HTML)."
    );
  }
  if (guardrails.preservePlaceholders) {
    activeGuardrails.push(
      "- Erhalte alle Platzhalter exakt im Format {{SCHLÜSSEL}} – ändere, verschiebe oder entferne sie NICHT."
    );
  }
  if (guardrails.preserveHeadersFooters) {
    activeGuardrails.push(
      "- Texte aus Kopf- und Fußzeilen wurden bereits herausgefiltert und dürfen nicht bearbeitet werden."
    );
  }
  if (guardrails.preserveTables) {
    activeGuardrails.push(
      "- Tabelleninhalte wurden bereits herausgefiltert und dürfen nicht bearbeitet werden."
    );
  }
  if (guardrails.preserveSignatures) {
    activeGuardrails.push(
      "- Texte in der Nähe von Unterschriften wurden bereits herausgefiltert und dürfen nicht bearbeitet werden."
    );
  }

  const guardrailSection =
    activeGuardrails.length > 0
      ? `\nAktive Einschränkungen:\n${activeGuardrails.join("\n")}`
      : "";

  return `Du bearbeitest Textblöcke in einem QM-Dokument (ISO 9001:2015).

Ausgabeformat: Antworte NUR als JSON-Objekt. Die Schlüssel sind die Block-IDs, die Werte die vollständig neuen Blocktexte.
Keine Erklärungen. Kein Markdown-Wrapper. Kein Code-Fence.
Beispiel: {"block-abc12":"Neuer vollständiger Blocktext hier."}
${guardrailSection}`;
}

/**
 * Build the user prompt for a canvas rewrite operation.
 */
export function buildCanvasRewriteUserPrompt(params: {
  blocks: Array<{ id: string; text: string }>;
  client: Client | null;
  prompt: string;
  scope: string;
  guardrails: CanvasRewriteGuardrails;
}): string {
  const { blocks, client, prompt, scope } = params;

  const clientContext = client
    ? `Unternehmenskontext:
- Firma: ${client.name}
- Branche: ${client.industry}
- Produkte: ${client.products}
- Dienstleistungen: ${client.services}
- Geschäftsführer: ${client.ceo}
- QM-Manager: ${client.qmManager}
`
    : "";

  const blockList = blocks
    .map((b) => `BLOCK_ID: ${b.id}\nTEXT: ${b.text}`)
    .join("\n\n---\n\n");

  return `${clientContext}
Bearbeitungsumfang: ${scope}
Benutzeranweisung: ${prompt}

Textblöcke zum Bearbeiten:
${blockList}

Wichtig:
- Gib NUR ein JSON-Objekt zurück: { "block-id": "neuer Text", ... }
- Jeder Value muss der vollständige neue Blocktext sein (kein Kürzen auf Ankerpunkte).
- Maximale Längenzunahme: ${Math.round((params.guardrails.maxTextLengthRatioChange - 1) * 100)}% pro Block.
- Ändere NUR die Blöcke in der Liste oben.`;
}
