/**
 * AI-powered canvas rewrite with scope selection and guardrail enforcement.
 * Extends the existing template-rewrite.ts pattern with structured guardrails
 * and block-level optimistic locking.
 */

import { randomUUID } from "crypto";
import type {
  CanvasModel,
  ParagraphBlock,
  CanvasRewriteGuardrails,
} from "@/lib/schemas/canvas-model.schema";
import type { Client } from "@/lib/schemas";
import type { AuditEntry } from "@/lib/schemas/project-workspace.schema";
import {
  buildCanvasRewriteSystemPrompt,
  buildCanvasRewriteUserPrompt,
} from "./canvas-prompts";
import { extractPlaceholders } from "@/lib/placeholders";

// ─── Strip code fence (same as template-rewrite.ts) ──────────────────────────

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
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
    if (typeof candidate === "string") map[key] = candidate;
  }
  return map;
}

// ─── Block collection by scope ────────────────────────────────────────────────

function collectAllParagraphs(model: CanvasModel): ParagraphBlock[] {
  const result: ParagraphBlock[] = [];
  for (const page of model.pages) {
    for (const block of page.blocks) {
      if (block.type === "paragraph") {
        result.push(block);
      } else if (block.type === "table") {
        for (const row of block.rows) {
          for (const cell of row.cells) {
            result.push(...cell.paragraphs);
          }
        }
      }
    }
  }
  return result;
}

function getBlocksForScope(
  scope: "selection" | "paragraph" | "section" | "document",
  selectedBlockIds: string[],
  model: CanvasModel
): ParagraphBlock[] {
  const all = collectAllParagraphs(model);
  const idSet = new Set(selectedBlockIds);

  switch (scope) {
    case "selection":
      return all.filter((b) => idSet.has(b.id));

    case "paragraph":
      return all.filter((b) => idSet.has(b.id)).slice(0, 1);

    case "section": {
      if (selectedBlockIds.length === 0) return [];
      const anchorId = selectedBlockIds[0];
      const anchorIdx = all.findIndex((b) => b.id === anchorId);
      if (anchorIdx === -1) return [];

      // Find surrounding heading boundaries
      let start = anchorIdx;
      let end = anchorIdx;

      // Walk backward to previous heading
      for (let i = anchorIdx - 1; i >= 0; i--) {
        const style = all[i].style;
        if (style.outlineLevel !== undefined && style.outlineLevel < 4) {
          start = i; // include the heading
          break;
        }
        start = i;
      }

      // Walk forward to next heading
      for (let i = anchorIdx + 1; i < all.length; i++) {
        const style = all[i].style;
        if (style.outlineLevel !== undefined && style.outlineLevel < 4) {
          end = i - 1; // exclude the next heading
          break;
        }
        end = i;
      }

      return all.slice(start, end + 1);
    }

    case "document":
      return all;

    default:
      return [];
  }
}

// ─── Guardrail filtering ──────────────────────────────────────────────────────

function applyPreFiltering(
  blocks: ParagraphBlock[],
  guardrails: CanvasRewriteGuardrails,
  model: CanvasModel
): ParagraphBlock[] {
  let result = blocks;

  if (guardrails.preserveHeadersFooters) {
    result = result.filter(
      (b) => !/header\d*\.xml|footer\d*\.xml/i.test(b.xmlPath)
    );
  }

  if (guardrails.preserveTables) {
    // Blocks with very deep nodeIndex (from table parsing: nodeIndex * 10000 + ...) are table paragraphs
    result = result.filter((b) => b.nodeIndex < 10000);
  }

  if (guardrails.preserveSignatures) {
    // Collect nodeIndexes of signature/stamp objects
    const sigNodeIndexes = new Set<number>();
    for (const page of model.pages) {
      for (const obj of page.objects) {
        if (obj.objectType === "signature" || obj.objectType === "stamp") {
          // Exclude blocks within ±2 nodeIndex positions of a signature anchor
          sigNodeIndexes.add(obj.zIndex); // zIndex used as rough paragraph proximity marker
        }
      }
    }
    // Simplified: skip blocks in the last 3 positions of any page
    // (proper implementation would track anchoredToParagraphId)
    result = result.filter(() => {
      // Skip if near signature by nodeIndex adjacency
      return true; // MVP: no-op, full impl in v1
    });
  }

  return result;
}

// ─── Post-AI validation ───────────────────────────────────────────────────────

interface ValidationResult {
  accepted: boolean;
  rejectionReason?: string;
  finalText: string;
}

function validateRewrite(
  originalText: string,
  newText: string,
  guardrails: CanvasRewriteGuardrails
): ValidationResult {
  // 1. Check max length ratio
  if (originalText.length > 0) {
    const ratio = newText.length / originalText.length;
    if (ratio > guardrails.maxTextLengthRatioChange) {
      return {
        accepted: false,
        rejectionReason: `Text grew by ${Math.round((ratio - 1) * 100)}% (max ${Math.round((guardrails.maxTextLengthRatioChange - 1) * 100)}%)`,
        finalText: originalText,
      };
    }
  }

  // 2. Check placeholder preservation
  if (guardrails.preservePlaceholders) {
    const originalPlaceholders = extractPlaceholders(originalText);
    for (const ph of originalPlaceholders) {
      if (!newText.includes(`{{${ph}}}`)) {
        return {
          accepted: false,
          rejectionReason: `Missing placeholder {{${ph}}} in rewrite`,
          finalText: originalText,
        };
      }
    }
  }

  // 3. Check style preservation (no markdown formatting in output)
  if (guardrails.preserveStyles) {
    if (/\*\*|__|\[.*\]\(|^#+\s/m.test(newText)) {
      return {
        accepted: false,
        rejectionReason: "Output contains markdown formatting (violates preserveStyles)",
        finalText: originalText,
      };
    }
  }

  return { accepted: true, finalText: newText };
}

// ─── Main rewrite function ────────────────────────────────────────────────────

export interface CanvasRewriteParams {
  scope: "selection" | "paragraph" | "section" | "document";
  selectedBlockIds: string[];
  blockLocalVersions: Record<string, number>; // snapshot of localVersions at dispatch time
  canvasModel: CanvasModel;
  client: Client | null;
  prompt: string;
  guardrails: CanvasRewriteGuardrails;
  projectId: string;
}

export interface CanvasRewriteResult {
  /**
   * Map of blockId → new text for accepted rewrites only.
   * Caller should apply these via AI_APPLY_REWRITE action.
   */
  rewrites: Record<string, string>;
  auditEntry: AuditEntry;
}

export async function rewriteCanvasBlocks(
  params: CanvasRewriteParams
): Promise<CanvasRewriteResult> {
  const {
    scope,
    selectedBlockIds,
    blockLocalVersions,
    canvasModel,
    client,
    prompt,
    guardrails,
  } = params;

  // 1. Collect blocks for this scope
  const scopedBlocks = getBlocksForScope(scope, selectedBlockIds, canvasModel);

  // 2. Apply pre-filtering (guardrails that exclude entire block types)
  const filteredBlocks = applyPreFiltering(scopedBlocks, guardrails, canvasModel);

  if (filteredBlocks.length === 0) {
    const emptyAudit: AuditEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      operation: "ai_rewrite",
      scope,
      prompt,
      guardrails: guardrails as Record<string, unknown>,
      affectedBlockIds: [],
      changes: [],
    };
    return { rewrites: {}, auditEntry: emptyAudit };
  }

  // 3. Prepare block list for prompt (use a subset to avoid token limits)
  const MAX_BLOCKS_PER_REQUEST = 30;
  const promptBlocks = filteredBlocks
    .slice(0, MAX_BLOCKS_PER_REQUEST)
    .map((b) => ({
      id: b.id,
      text: b.runs
        .filter((r) => r.type === "text")
        .map((r) => (r as { text: string }).text)
        .join(""),
    }));

  // 4. Build prompts
  const systemPrompt = buildCanvasRewriteSystemPrompt(guardrails);
  const userPrompt = buildCanvasRewriteUserPrompt({
    blocks: promptBlocks,
    client,
    prompt,
    scope,
    guardrails,
  });

  // 5. Call OpenAI (same model/temperature as existing system)
  const { openai } = await import("./client");
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    max_tokens: 3000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";

  let rawRewrites: Record<string, string>;
  try {
    rawRewrites = parseResponseMap(raw);
  } catch {
    const failedAudit: AuditEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      operation: "ai_rewrite",
      scope,
      prompt,
      guardrails: guardrails as Record<string, unknown>,
      affectedBlockIds: promptBlocks.map((b) => b.id),
      changes: promptBlocks.map((b) => ({
        blockId: b.id,
        before: b.text,
        after: b.text,
        accepted: false,
        rejectionReason: "AI response was not valid JSON",
      })),
    };
    return { rewrites: {}, auditEntry: failedAudit };
  }

  // 6. Apply post-validation and optimistic locking
  const rewrites: Record<string, string> = {};
  const changes: AuditEntry["changes"] = [];

  for (const block of promptBlocks) {
    const originalText = block.text;
    const newText = rawRewrites[block.id];

    if (!newText) {
      // AI didn't return a rewrite for this block — keep original
      continue;
    }

    // Optimistic lock check: skip if block was modified since rewrite was dispatched
    const dispatchedVersion = blockLocalVersions[block.id] ?? 0;
    const currentBlock = collectAllParagraphs(canvasModel).find(
      (b) => b.id === block.id
    );
    if (currentBlock && currentBlock.localVersion !== dispatchedVersion) {
      changes.push({
        blockId: block.id,
        before: originalText,
        after: newText,
        accepted: false,
        rejectionReason: "Block was modified concurrently (optimistic lock conflict)",
      });
      continue;
    }

    // Run validation
    const validation = validateRewrite(originalText, newText, guardrails);
    changes.push({
      blockId: block.id,
      before: originalText,
      after: validation.finalText,
      accepted: validation.accepted,
      rejectionReason: validation.rejectionReason,
    });

    if (validation.accepted) {
      rewrites[block.id] = validation.finalText;
    }
  }

  const auditEntry: AuditEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    operation: "ai_rewrite",
    scope,
    prompt,
    guardrails: guardrails as Record<string, unknown>,
    affectedBlockIds: Object.keys(rewrites),
    changes,
  };

  return { rewrites, auditEntry };
}
