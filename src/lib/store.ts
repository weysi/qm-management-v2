/**
 * In-memory data store — replaces a real database during development.
 * Seeded with mock data on first import.
 */
import { mockClients } from "./mock-data/clients";
import { mockManuals } from "./mock-data/manuals";
import { mockReferenceFiles } from "./mock-data/reference-files";
import type {
  Client,
  GenerationRunReport,
  Manual,
  ManualPlan,
  PlaceholderRegistry,
  ReferenceFile,
  TemplateFile,
  TemplateLibraryManifest,
} from "@/lib/schemas";
import type { ProjectWorkspace, ProjectAsset, ChangeLog, ProjectVersion } from "@/lib/schemas/project-workspace.schema";

// Use global to survive hot-reload in Next.js dev mode
const g = global as typeof globalThis & {
  __qm_clients?: Client[];
  __qm_manuals?: Manual[];
  __qm_refs?: ReferenceFile[];
  __qm_template_files?: TemplateFile[];
  __qm_template_manifests?: TemplateLibraryManifest[];
  __qm_manual_plans?: ManualPlan[];
  __qm_generation_runs?: GenerationRunReport[];
  __qm_placeholder_registries?: PlaceholderRegistry[];
  // Canvas editor project workspace
  __qm_projects?: ProjectWorkspace[];
  __qm_project_assets?: ProjectAsset[];
  __qm_project_changes?: ChangeLog[];
  __qm_project_versions?: ProjectVersion[];
};

if (!g.__qm_clients) g.__qm_clients = [...mockClients];
if (!g.__qm_manuals) g.__qm_manuals = [...mockManuals];
if (!g.__qm_refs) g.__qm_refs = [...mockReferenceFiles];
if (!g.__qm_template_files) g.__qm_template_files = [];
if (!g.__qm_template_manifests) g.__qm_template_manifests = [];
if (!g.__qm_manual_plans) g.__qm_manual_plans = [];
if (!g.__qm_generation_runs) g.__qm_generation_runs = [];
if (!g.__qm_placeholder_registries) g.__qm_placeholder_registries = [];
if (!g.__qm_projects) g.__qm_projects = [];
if (!g.__qm_project_assets) g.__qm_project_assets = [];
if (!g.__qm_project_changes) g.__qm_project_changes = [];
if (!g.__qm_project_versions) g.__qm_project_versions = [];

export const store = {
  clients: g.__qm_clients,
  manuals: g.__qm_manuals,
  refs: g.__qm_refs,
  templates: g.__qm_template_files,
  templateManifests: g.__qm_template_manifests,
  manualPlans: g.__qm_manual_plans,
  generationRuns: g.__qm_generation_runs,
  placeholderRegistries: g.__qm_placeholder_registries,
  projects: g.__qm_projects,
  projectAssets: g.__qm_project_assets,
  projectChanges: g.__qm_project_changes,
  projectVersions: g.__qm_project_versions,
};
