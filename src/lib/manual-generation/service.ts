import { buildPlaceholderMap } from "@/lib/placeholders";
import type {
  Client,
  Manual,
  ManualPlan,
  PlaceholderRegistry,
  PlanManualGenerationRequest,
  TemplateLibraryManifest,
} from "@/lib/schemas";
import { store } from "@/lib/store";
import {
  buildCompanyProfile,
  buildDeterministicManualPlan,
  buildPlaceholderRegistry,
  buildTemplateLibraryManifest,
} from "./planner";
import { generateManualPlanArtifactsWithAi } from "@/lib/ai/manual-generation";

export interface ManualContext {
  manual: Manual;
  client: Client;
}

function replaceByManualId<T extends { manualId: string }>(
  items: T[],
  manualId: string,
  next: T
) {
  const index = items.findIndex((item) => item.manualId === manualId);
  if (index === -1) {
    items.push(next);
    return;
  }

  items[index] = next;
}

export function getManualContext(manualId: string): ManualContext | null {
  const manual = store.manuals.find((item) => item.id === manualId);
  if (!manual) {
    return null;
  }

  const client = store.clients.find((item) => item.id === manual.clientId);
  if (!client) {
    return null;
  }

  return { manual, client };
}

export function scanTemplateLibraryForManual(
  manualId: string,
  selectedFileIds?: string[]
): { manifest: TemplateLibraryManifest; registry: PlaceholderRegistry } {
  const selected = new Set(selectedFileIds ?? []);
  const files = store.templates
    .filter((file) => file.manualId === manualId)
    .filter((file) => (selected.size === 0 ? true : selected.has(file.id)));

  const manifest = buildTemplateLibraryManifest(manualId, files);
  const registry = buildPlaceholderRegistry(manualId, manifest);

  replaceByManualId(store.templateManifests, manualId, manifest);
  replaceByManualId(store.placeholderRegistries, manualId, registry);

  return { manifest, registry };
}

export function getLatestManifest(manualId: string): TemplateLibraryManifest | null {
  return store.templateManifests.find((item) => item.manualId === manualId) ?? null;
}

export function getLatestRegistry(manualId: string): PlaceholderRegistry | null {
  return store.placeholderRegistries.find((item) => item.manualId === manualId) ?? null;
}

export function getLatestPlan(manualId: string): ManualPlan | null {
  return store.manualPlans.find((item) => item.manualId === manualId) ?? null;
}

export async function planManualGeneration(args: {
  manualId: string;
  request: PlanManualGenerationRequest;
}): Promise<{
  manualPlan: ManualPlan;
  placeholderMap: Record<string, string>;
  registry: PlaceholderRegistry;
  manifest: TemplateLibraryManifest;
  warnings: string[];
}> {
  const context = getManualContext(args.manualId);
  if (!context) {
    throw new Error("Manual or client not found");
  }

  const scanResult = scanTemplateLibraryForManual(
    args.manualId,
    args.request.selectedFileIds
  );

  const deterministicPlan = buildDeterministicManualPlan({
    manualId: args.manualId,
    manifest: scanResult.manifest,
    selectedFileIds: args.request.selectedFileIds,
    templateVariantId: args.request.templateVariantId,
  });

  const basePlaceholderMap = {
    ...buildPlaceholderMap(context.client),
    ...(args.request.globalOverrides ?? {}),
  };

  const unresolved = Array.from(
    new Set(
      scanResult.manifest.files.flatMap((file) =>
        file.placeholders.filter((key) => {
          const value = basePlaceholderMap[key];
          return value === undefined || value.trim() === "";
        })
      )
    )
  ).sort((a, b) => a.localeCompare(b));

  let manualPlan = deterministicPlan;
  let placeholderMap: Record<string, string> = { ...basePlaceholderMap };
  const warnings: string[] = [];

  if (args.request.useAi) {
    try {
      const companyProfile = buildCompanyProfile(context.client);
      const aiArtifacts = await generateManualPlanArtifactsWithAi({
        companyProfile,
        manifest: scanResult.manifest,
        registry: scanResult.registry,
        deterministicPlan,
        unresolvedTokens: unresolved,
      });

      if (aiArtifacts.manualPlan) {
        manualPlan = aiArtifacts.manualPlan;
      }
      placeholderMap = {
        ...placeholderMap,
        ...aiArtifacts.placeholderMap,
      };
    } catch (error: unknown) {
      warnings.push(
        error instanceof Error
          ? `AI plan fallback failed: ${error.message}`
          : "AI plan fallback failed"
      );
    }
  }

  replaceByManualId(store.manualPlans, args.manualId, manualPlan);

  return {
    manualPlan,
    placeholderMap,
    registry: scanResult.registry,
    manifest: scanResult.manifest,
    warnings,
  };
}
