/**
 * In-memory data store — replaces a real database during development.
 * Seeded with mock data on first import.
 */

import type { Client, Manual, TemplateFile } from '@/lib/schemas';

// Use global to survive hot-reload in Next.js dev mode
const g = global as typeof globalThis & {
	__qm_clients?: Client[];
	__qm_manuals?: Manual[];
	__qm_template_files?: TemplateFile[];
};

if (!g.__qm_clients) g.__qm_clients = [];
if (!g.__qm_manuals) g.__qm_manuals = [];
if (!g.__qm_template_files) g.__qm_template_files = [];

export const store = {
	clients: g.__qm_clients,
	manuals: g.__qm_manuals,
	templates: g.__qm_template_files,
};
