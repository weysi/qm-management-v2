import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GenerateRequest, GenerateResponse } from "@/types";

async function generateSection(payload: GenerateRequest): Promise<GenerateResponse> {
  const res = await fetch("/api/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "AI generation failed");
  }
  return res.json();
}

export function useAiGenerate(manualId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: generateSection,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["manuals", manualId] }),
  });
}
