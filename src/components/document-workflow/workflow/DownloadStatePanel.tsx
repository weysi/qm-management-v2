"use client";

import { Download, LockKeyhole } from "lucide-react";
import { CompletionStatusBadge } from "@/components/document-workflow/workflow/CompletionStatusBadge";
import { Progress } from "@/components/ui/progress";
import { UiContainer, UiScrollableArea, UiSection } from "@/components/ui-layout";
import type { ExportFileState } from "@/lib/document-workflow/view-models";

interface DownloadStatePanelProps {
  readyFiles: ExportFileState[];
  blockedFiles: ExportFileState[];
  loadingReasons?: boolean;
}

export function DownloadStatePanel({
  readyFiles,
  blockedFiles,
  loadingReasons,
}: DownloadStatePanelProps) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <FileStateColumn
        title="Ready to export"
        description="These files already have every required placeholder completed."
        icon={<Download className="h-4 w-4" />}
        emptyState="No files are fully complete yet."
        items={readyFiles}
        loadingReasons={loadingReasons}
      />
      <FileStateColumn
        title="Needs input"
        description="These files stay blocked until the missing required placeholders are completed."
        icon={<LockKeyhole className="h-4 w-4" />}
        emptyState="No blocked files."
        items={blockedFiles}
        loadingReasons={loadingReasons}
      />
    </div>
  );
}

interface FileStateColumnProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  emptyState: string;
  items: ExportFileState[];
  loadingReasons?: boolean;
}

function FileStateColumn({
  title,
  description,
  icon,
  emptyState,
  items,
  loadingReasons,
}: FileStateColumnProps) {
  return (
    <UiContainer className="max-h-[560px]">
      <UiSection className="space-y-2 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          {icon}
          <span>{title}</span>
        </div>
        <p className="text-sm text-slate-500">{description}</p>
      </UiSection>
      <UiScrollableArea viewportClassName="space-y-3 p-5">
        {items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-muted/20 px-5 py-10 text-center text-sm text-slate-500">
            {emptyState}
          </div>
        ) : (
          items.map(item => (
            <div
              key={item.fileId}
              className="rounded-3xl border border-border bg-background p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">{item.filePath}</p>
                  <p className="text-xs text-slate-500">
                    {item.requiredResolved}/{item.requiredTotal} required placeholders complete
                  </p>
                </div>
                <CompletionStatusBadge
                  status={item.downloadState === "ready" ? "ready" : "blocked"}
                  label={item.downloadState === "ready" ? "Downloadable" : "Blocked"}
                />
              </div>

              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Completion</span>
                  <span>{item.completionPercentage}%</span>
                </div>
                <Progress value={item.completionPercentage} />
              </div>

              {item.downloadState === "blocked" ? (
                <div className="mt-4 rounded-2xl bg-orange-50 px-4 py-3 text-sm text-orange-800">
                  {loadingReasons && item.missingPlaceholders.length === 0 ? (
                    "Loading missing placeholders..."
                  ) : item.missingPlaceholders.length > 0 ? (
                    `Missing: ${item.missingPlaceholders.join(", ")}`
                  ) : (
                    "Missing required placeholders."
                  )}
                </div>
              ) : null}
            </div>
          ))
        )}
      </UiScrollableArea>
    </UiContainer>
  );
}
