import { z } from "zod";
import { openai } from "./client";
import type {
  CompanyProfile,
  ManualPlan,
  PlaceholderRegistry,
  TemplateLibraryManifest,
} from "@/lib/schemas";
import { ManualPlanSchema } from "@/lib/schemas";

const AiPlanArtifactsSchema = z.object({
  manualPlan: ManualPlanSchema.optional(),
  placeholderMap: z.record(z.string(), z.string()).default({}),
});

type AiPlanArtifacts = z.infer<typeof AiPlanArtifactsSchema>;

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

function parseJson(value: string): unknown {
  return JSON.parse(stripCodeFence(value));
}

function summarizeManifest(manifest: TemplateLibraryManifest): string {
  return manifest.files
    .map((file) => {
      const placeholders = file.placeholders.slice(0, 20).join(", ");
      return `- ${file.path} (${file.ext}) placeholders: [${placeholders}]`;
    })
    .join("\n");
}

function summarizeRegistry(registry: PlaceholderRegistry): string {
  return registry.keys
    .slice(0, 200)
    .map((entry) => `- ${entry.key} [${entry.contexts.join(",")}]`)
    .join("\n");
}

function buildPrompt(args: {
  companyProfile: CompanyProfile;
  manifest: TemplateLibraryManifest;
  registry: PlaceholderRegistry;
  deterministicPlan: ManualPlan;
  unresolvedTokens: string[];
}): string {
  return `Erzeuge ein JSON-Objekt für eine kanonische Handbuch-Generierung.

Regeln:
- Antworte nur mit gültigem JSON (kein Markdown, keine Erklärungen).
- Struktur:
  {
    "manualPlan": ManualPlan (optional),
    "placeholderMap": { "KEY": "VALUE", ... }
  }
- placeholderMap darf nur String-Werte enthalten.
- Wenn du "manualPlan" zurückgibst, muss es schema-konform sein und stabile Pfade nutzen.
- Priorität: bestehende Platzhalter vollständig befüllen.

Unternehmensprofil:
${JSON.stringify(args.companyProfile)}

Aktuelles deterministisches Plan-Baseline:
${JSON.stringify(args.deterministicPlan)}

Datei-Manifest:
${summarizeManifest(args.manifest)}

Platzhalter-Registry:
${summarizeRegistry(args.registry)}

Offene Platzhalter:
${args.unresolvedTokens.join(", ") || "(keine)"}`;
}

async function requestArtifacts(
  prompt: string,
  correctionHint?: string
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 3000,
    messages: [
      {
        role: "system",
        content:
          "Du bist ein strikter JSON-Generator. Liefere nur JSON, das exakt zum angefragten Schema passt.",
      },
      {
        role: "user",
        content: correctionHint ? `${prompt}\n\nKorrekturhinweis: ${correctionHint}` : prompt,
      },
    ],
  });

  return response.choices[0]?.message?.content ?? "{}";
}

export async function generateManualPlanArtifactsWithAi(args: {
  companyProfile: CompanyProfile;
  manifest: TemplateLibraryManifest;
  registry: PlaceholderRegistry;
  deterministicPlan: ManualPlan;
  unresolvedTokens: string[];
}): Promise<AiPlanArtifacts> {
  const prompt = buildPrompt(args);
  let correctionHint = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await requestArtifacts(prompt, correctionHint || undefined);
    try {
      const parsed = parseJson(raw);
      const validated = AiPlanArtifactsSchema.parse(parsed);
      return validated;
    } catch (error: unknown) {
      correctionHint =
        error instanceof Error
          ? `Deine letzte Antwort war nicht schema-konform: ${error.message}. Gib nur gültiges JSON im erwarteten Format zurück.`
          : "Die letzte Antwort war ungültig. Gib nur gültiges JSON im erwarteten Format zurück.";
    }
  }

  throw new Error("AI returned invalid JSON artifacts after retry");
}
