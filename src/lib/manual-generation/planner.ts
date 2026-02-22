import { createHash } from "crypto";
import type {
  Client,
  CompanyFunctionType,
  CompanyHeadcountRange,
  CompanyProfile,
  ManualPlan,
  PlaceholderContext,
  PlaceholderRegistry,
  TemplateFile,
  TemplateLibraryFile,
  TemplateLibraryFileRole,
  TemplateLibraryManifest,
} from "@/lib/schemas";

function stableId(prefix: string, payload: string): string {
  return `${prefix}-${createHash("sha1").update(payload).digest("hex").slice(0, 12)}`;
}

function normalizeCountry(value: string): string {
  if (!value.trim()) {
    return "DE";
  }

  return value.trim().toUpperCase();
}

function inferHeadcountRange(employeeCount: number): CompanyHeadcountRange {
  if (employeeCount <= 10) return "1-10";
  if (employeeCount <= 50) return "11-50";
  if (employeeCount <= 200) return "51-200";
  return "200+";
}

function inferFunctionType(client: Client): CompanyFunctionType {
  const products = client.products.trim();
  const services = client.services.trim();

  if (products && services) return "mixed";
  if (products) return "manufacturing";
  if (services) return "service";
  return "software";
}

function inferRole(path: string, ext: TemplateFile["ext"]): TemplateLibraryFileRole {
  const lcPath = path.toLowerCase();

  if (ext === "pptx") {
    return "presentation";
  }
  if (ext === "xlsx") {
    return "spreadsheet";
  }
  if (/(formular|form|fb[-_ ]|\bcheckliste\b)/.test(lcPath)) {
    return "form";
  }
  if (/(prozess|prozessbeschreibung|ablauf)/.test(lcPath)) {
    return "process";
  }
  if (/(arbeitsanweisung|instruction|anweisung)/.test(lcPath)) {
    return "instruction";
  }
  if (/(handbuch|manual|kapitel)/.test(lcPath)) {
    return "manual_chapter";
  }
  return "unknown";
}

function inferVariantTags(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  const first = parts[0];
  if (!first) return [];
  return [first.toLowerCase()];
}

function collectFolders(paths: string[]): string[] {
  const folders = new Set<string>();

  for (const path of paths) {
    const parts = path.split("/").filter(Boolean);
    let current = "";

    for (const part of parts.slice(0, -1)) {
      current = current ? `${current}/${part}` : part;
      folders.add(current);
    }
  }

  return Array.from(folders).sort((a, b) => a.localeCompare(b));
}

function extToContext(ext: TemplateFile["ext"]): PlaceholderContext {
  if (ext === "docx") return "docx";
  if (ext === "pptx") return "pptx";
  return "xlsx";
}

export function buildCompanyProfile(client: Client): CompanyProfile {
  const [zip = "", ...cityParts] = client.zipCity.trim().split(/\s+/);
  const city = cityParts.join(" ").trim() || client.zipCity.trim();

  return {
    id: client.id,
    legalName: client.name,
    industry: client.industry,
    products: client.products,
    services: client.services,
    address: {
      street: client.address,
      zip,
      city,
      country: normalizeCountry("DE"),
    },
    contacts: {
      ceo: client.ceo,
      qmManager: client.qmManager,
    },
    functionProfile: {
      type: inferFunctionType(client),
      regulated: false,
      headcountRange: inferHeadcountRange(client.employeeCount),
    },
  };
}

export function buildTemplateLibraryManifest(
  manualId: string,
  files: TemplateFile[]
): TemplateLibraryManifest {
  const sorted = files.slice().sort((a, b) => a.path.localeCompare(b.path));

  const manifestFiles: TemplateLibraryFile[] = sorted.map((file) => ({
    id: stableId("tpl", `${manualId}:${file.path}`),
    sourceTemplateId: file.id,
    path: file.path,
    name: file.name,
    ext: file.ext,
    role: inferRole(file.path, file.ext),
    variantTags: inferVariantTags(file.path),
    placeholders: file.placeholders.slice().sort((a, b) => a.localeCompare(b)),
    references: [],
    constraints: {
      mustPreservePlaceholders: true,
    },
  }));

  const signature = manifestFiles
    .map((item) => `${item.id}:${item.path}`)
    .join("|");

  return {
    id: stableId("manifest", `${manualId}:${signature}`),
    manualId,
    generatedAt: new Date().toISOString(),
    folders: collectFolders(manifestFiles.map((item) => item.path)),
    files: manifestFiles,
  };
}

export function buildPlaceholderRegistry(
  manualId: string,
  manifest: TemplateLibraryManifest
): PlaceholderRegistry {
  const keyToContexts = new Map<string, Set<PlaceholderContext>>();

  for (const file of manifest.files) {
    const context = extToContext(file.ext);
    for (const key of file.placeholders) {
      if (!keyToContexts.has(key)) {
        keyToContexts.set(key, new Set<PlaceholderContext>());
      }
      keyToContexts.get(key)?.add(context);
    }
  }

  return {
    id: stableId("registry", `${manualId}:${manifest.id}`),
    manualId,
    updatedAt: new Date().toISOString(),
    keys: Array.from(keyToContexts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, contexts]) => ({
        key,
        type: "string",
        global: false,
        contexts: Array.from(contexts).sort((a, b) => a.localeCompare(b)),
      })),
  };
}

export function buildDeterministicManualPlan(args: {
  manualId: string;
  manifest: TemplateLibraryManifest;
  selectedFileIds?: string[];
  templateVariantId?: string;
}): ManualPlan {
  const selected = new Set(args.selectedFileIds ?? []);
  const files = args.manifest.files.filter((item) => {
    if (selected.size === 0) return true;
    return selected.has(item.sourceTemplateId);
  });

  const folders = collectFolders(files.map((item) => item.path));
  const mapId = `placeholder-map-${args.manualId}`;
  const outputTree = [
    ...folders.map((folderPath) => ({
      id: stableId("folder", folderPath),
      path: folderPath,
      kind: "folder" as const,
    })),
    ...files.map((file) => ({
      id: stableId("out", `${file.sourceTemplateId}:${file.path}`),
      path: file.path,
      kind: "file" as const,
      sourceTemplateId: file.sourceTemplateId,
      operations: [
        {
          op: "applyPlaceholders" as const,
          mapId,
        },
      ],
    })),
  ];

  const variantId =
    args.templateVariantId ??
    files[0]?.variantTags[0] ??
    "default-variant";

  const planSignature = outputTree.map((item) => `${item.kind}:${item.path}`).join("|");

  return {
    id: stableId("plan", `${args.manualId}:${variantId}:${planSignature}`),
    manualId: args.manualId,
    templateVariantId: variantId,
    createdAt: new Date().toISOString(),
    outputTree,
  };
}
