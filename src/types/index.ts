// Re-export all schema types for convenience
export type {
  Client,
  CreateClientInput,
  UpdateClientInput,
} from "@/lib/schemas/client.schema";

export type {
  Manual,
  ManualSection,
  CreateManualInput,
} from "@/lib/schemas/manual.schema";

export type {
  Placeholder,
  PlaceholderMap,
} from "@/lib/schemas/placeholder.schema";

export type {
  ReferenceFile,
  CreateReferenceFileInput,
} from "@/lib/schemas/reference-file.schema";

export type {
  TemplateFile,
  TemplateFileMetadata,
  GenerateTemplateFilesRequest,
  DownloadTemplateFilesRequest,
  TemplatePreviewBlockKind,
  TemplatePreviewBlock,
  TemplatePreviewRun,
  TemplateCanvasLayout,
  TemplatePreviewGroup,
  TemplatePreviewSource,
  TemplatePreviewResolvedSource,
  TemplateFilePreview,
  GetTemplatePreviewQuery,
  SaveTemplatePreviewRequest,
  RewriteTemplateFilesRequest,
} from "@/lib/schemas/template-file.schema";

// API response shape
export interface ApiResponse<T> {
  data: T;
  error?: string;
}

// AI generation payload
export interface GenerateRequest {
  sectionId: string;
  clientData: import("@/lib/schemas").Client;
  sectionContent: string;
  chapterNumber: string;
  chapterTitle: string;
}

export interface GenerateResponse {
  sectionId: string;
  content: string;
  tokensUsed?: number;
}

// Sidebar state
export type PlaceholderStatus = "resolved" | "unresolved";

export interface SidebarPlaceholder {
  key: string;
  value: string;
  status: PlaceholderStatus;
  chapterNumber?: string;
}
