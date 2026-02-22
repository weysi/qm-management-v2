import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ExecuteManualGenerationRequest,
  GenerationRunReport,
  ManualPlan,
  PlaceholderRegistry,
  PlanManualGenerationRequest,
  TemplateLibraryManifest,
} from "@/types";

const SCAN_KEY = "manual-generation-scan";
const PLAN_KEY = "manual-generation-plan";
const RUN_KEY = "manual-generation-run";

interface ScanResult {
  manifest: TemplateLibraryManifest;
  placeholderRegistry: PlaceholderRegistry;
}

interface PlanResult {
  manifest: TemplateLibraryManifest;
  placeholderRegistry: PlaceholderRegistry;
  manualPlan: ManualPlan;
  placeholderMap: Record<string, string>;
  warnings: string[];
}

interface ExecuteResult {
  runReport: GenerationRunReport;
  files: Array<{
    file: {
      id: string;
      path: string;
      status: string;
    };
    unresolvedPlaceholders: string[];
    warnings: string[];
    error?: string;
  }>;
  aiWarning?: string;
}

function scanKey(manualId: string) {
  return [SCAN_KEY, manualId] as const;
}

function planKey(manualId: string) {
  return [PLAN_KEY, manualId] as const;
}

function runKey(manualId: string, runId: string) {
  return [RUN_KEY, manualId, runId] as const;
}

async function postJson<TBody, TResult>(
  url: string,
  body: TBody
): Promise<TResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload;
}

async function fetchRun(manualId: string, runId: string): Promise<GenerationRunReport> {
  const response = await fetch(`/api/manual-generation/${manualId}/runs/${runId}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Could not load run report");
  }
  return payload;
}

export function useScanManualGeneration(manualId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: { fileIds?: string[] } = {}) =>
      postJson<typeof payload, ScanResult>(
        `/api/manual-generation/${manualId}/scan`,
        payload
      ),
    onSuccess: (data) => {
      qc.setQueryData(scanKey(manualId), data);
    },
  });
}

export function usePlanManualGeneration(manualId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: PlanManualGenerationRequest) =>
      postJson<PlanManualGenerationRequest, PlanResult>(
        `/api/manual-generation/${manualId}/plan`,
        payload
      ),
    onSuccess: (data) => {
      qc.setQueryData(planKey(manualId), data);
    },
  });
}

export function useExecuteManualGeneration(manualId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: ExecuteManualGenerationRequest) =>
      postJson<ExecuteManualGenerationRequest, ExecuteResult>(
        `/api/manual-generation/${manualId}/execute`,
        payload
      ),
    onSuccess: (data) => {
      qc.setQueryData(runKey(manualId, data.runReport.id), data.runReport);
      qc.invalidateQueries({ queryKey: ["template-files", manualId] });
      qc.invalidateQueries({ queryKey: ["template-preview", manualId] });
    },
  });
}

export function useManualGenerationRun(manualId: string, runId: string) {
  return useQuery({
    queryKey: runKey(manualId, runId),
    queryFn: () => fetchRun(manualId, runId),
    enabled: !!manualId && !!runId,
  });
}
