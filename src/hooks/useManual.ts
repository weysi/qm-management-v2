import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Manual } from "@/types";

const QUERY_KEY = ["manuals"] as const;

async function fetchManuals(): Promise<Manual[]> {
  const res = await fetch("/api/manuals");
  if (!res.ok) throw new Error("Failed to fetch manuals");
  return res.json();
}

async function fetchManual(id: string): Promise<Manual> {
  const res = await fetch(`/api/manuals/${id}`);
  if (!res.ok) throw new Error("Failed to fetch manual");
  return res.json();
}

async function updateManualSection(
  manualId: string,
  sectionId: string,
  content: string
): Promise<Manual> {
  const res = await fetch(`/api/manuals/${manualId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sectionId, content }),
  });
  if (!res.ok) throw new Error("Failed to update section");
  return res.json();
}

async function createManual(clientId: string): Promise<Manual> {
  const res = await fetch("/api/manuals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId }),
  });
  if (!res.ok) throw new Error("Failed to create manual");
  return res.json();
}

export function useManuals() {
  return useQuery({ queryKey: QUERY_KEY, queryFn: fetchManuals });
}

export function useManual(id: string) {
  return useQuery({
    queryKey: [...QUERY_KEY, id],
    queryFn: () => fetchManual(id),
    enabled: !!id,
  });
}

export function useCreateManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createManual,
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdateManualSection(manualId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, content }: { sectionId: string; content: string }) =>
      updateManualSection(manualId, sectionId, content),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [...QUERY_KEY, manualId] }),
  });
}
