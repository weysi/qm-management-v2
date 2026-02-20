/**
 * In-memory data store — replaces a real database during development.
 * Seeded with mock data on first import.
 */
import { mockClients } from "./mock-data/clients";
import { mockManuals } from "./mock-data/manuals";
import { mockReferenceFiles } from "./mock-data/reference-files";
import type { Client, Manual, ReferenceFile, TemplateFile } from "@/lib/schemas";

// Use global to survive hot-reload in Next.js dev mode
const g = global as typeof globalThis & {
  __qm_clients?: Client[];
  __qm_manuals?: Manual[];
  __qm_refs?: ReferenceFile[];
  __qm_template_files?: TemplateFile[];
};

if (!g.__qm_clients) g.__qm_clients = [...mockClients];
if (!g.__qm_manuals) g.__qm_manuals = [...mockManuals];
if (!g.__qm_refs) g.__qm_refs = [...mockReferenceFiles];
if (!g.__qm_template_files) g.__qm_template_files = [];

export const store = {
  clients: g.__qm_clients,
  manuals: g.__qm_manuals,
  refs: g.__qm_refs,
  templates: g.__qm_template_files,
};
