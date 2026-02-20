import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Client, CreateClientInput, UpdateClientInput } from "@/types";

const QUERY_KEY = ["clients"] as const;

async function fetchClients(): Promise<Client[]> {
  const res = await fetch("/api/clients");
  if (!res.ok) throw new Error("Failed to fetch clients");
  return res.json();
}

async function fetchClient(id: string): Promise<Client> {
  const res = await fetch(`/api/clients/${id}`);
  if (!res.ok) throw new Error("Failed to fetch client");
  return res.json();
}

async function createClient(data: CreateClientInput): Promise<Client> {
  const res = await fetch("/api/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create client");
  return res.json();
}

async function updateClient(id: string, data: UpdateClientInput): Promise<Client> {
  const res = await fetch(`/api/clients/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update client");
  return res.json();
}

async function deleteClient(id: string): Promise<void> {
  const res = await fetch(`/api/clients/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete client");
}

export function useClients() {
  return useQuery({ queryKey: QUERY_KEY, queryFn: fetchClients });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: [...QUERY_KEY, id],
    queryFn: () => fetchClient(id),
    enabled: !!id,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createClient,
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdateClient(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateClientInput) => updateClient(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      qc.invalidateQueries({ queryKey: [...QUERY_KEY, id] });
    },
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteClient,
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
