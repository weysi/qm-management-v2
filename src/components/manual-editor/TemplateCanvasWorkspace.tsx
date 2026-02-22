"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { BaseTextarea } from "@/components/ui/textarea";
import {
  useDownloadTemplateFiles,
  useGenerateTemplateFiles,
  useRewriteTemplateFiles,
  useSaveTemplateFilePreview,
  useTemplateFilePreview,
} from "@/hooks";
import { buildPlaceholderMap, extractPlaceholders } from "@/lib/placeholders";
import { DocxCanvasPreview } from "./DocxCanvasPreview";
import { PptxCanvasPreview } from "./PptxCanvasPreview";
import type { Client, TemplateFileMetadata, TemplatePreviewSource } from "@/lib/schemas";

interface TemplateCanvasWorkspaceProps {
  manualId: string;
  client: Client;
  file: TemplateFileMetadata;
  selectedFileIds: Set<string>;
  globalOverrides: Record<string, string>;
  fileOverridesByFile: Record<string, Record<string, string>>;
}

interface EditableBlock {
  id: string;
  nodeIndex: number;
  groupLabel: string;
  currentText: string;
  currentPlaceholders: string[];
}

export function TemplateCanvasWorkspace({
  manualId,
  client,
  file,
  selectedFileIds,
  globalOverrides,
  fileOverridesByFile,
}: TemplateCanvasWorkspaceProps) {
  const router = useRouter();
  const [previewSource, setPreviewSource] = useState<TemplatePreviewSource>("auto");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());
  const [rewritePrompt, setRewritePrompt] = useState("");

  const {
    data: preview,
    isLoading,
    isFetching,
  } = useTemplateFilePreview(manualId, file.id, previewSource);

  const { mutate: savePreview, isPending: isSaving } = useSaveTemplateFilePreview(
    manualId,
    file.id
  );
  const { mutate: generateFiles, isPending: isGenerating } = useGenerateTemplateFiles(
    manualId
  );
  const { mutate: rewriteFiles, isPending: isRewriting } = useRewriteTemplateFiles(
    manualId
  );
  const { mutate: downloadFiles, isPending: isDownloading } = useDownloadTemplateFiles(
    manualId
  );

  useEffect(() => {
    if (!preview) return;

    setDrafts(
      Object.fromEntries(preview.blocks.map((block) => [block.id, block.text]))
    );
    setSelectedBlockIds(new Set());
  }, [preview]);

  const effectiveMap = useMemo(() => {
    return {
      ...buildPlaceholderMap(client),
      ...globalOverrides,
      ...(fileOverridesByFile[file.id] ?? {}),
    };
  }, [client, file.id, globalOverrides, fileOverridesByFile]);

  const editableBlocks = useMemo<EditableBlock[]>(() => {
    if (!preview) return [];

    return preview.blocks
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((block) => {
        const currentText = drafts[block.id] ?? block.text;
        return {
          id: block.id,
          nodeIndex: block.nodeIndex,
          groupLabel: block.groupLabel,
          currentText,
          currentPlaceholders: extractPlaceholders(currentText),
        };
      });
  }, [preview, drafts]);

  const unresolvedPlaceholders = useMemo(() => {
    const unresolved = new Set<string>();

    editableBlocks.forEach((block) => {
      block.currentPlaceholders.forEach((token) => {
        const value = effectiveMap[token];
        if (!value || value.trim() === "") {
          unresolved.add(token);
        }
      });
    });

    return Array.from(unresolved).sort();
  }, [editableBlocks, effectiveMap]);

  const editedCount = useMemo(() => {
    if (!preview) return 0;

    return preview.blocks.filter((block) => {
      return (drafts[block.id] ?? block.text) !== block.text;
    }).length;
  }, [preview, drafts]);

  const selectedFiles = useMemo(() => {
    return selectedFileIds.size > 0 ? Array.from(selectedFileIds) : [file.id];
  }, [selectedFileIds, file.id]);

  function toggleBlockSelection(blockId: string) {
    setSelectedBlockIds((current) => {
      const next = new Set(current);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  }

  function handleDraftChange(blockId: string, value: string) {
    setDrafts((current) => ({ ...current, [blockId]: value }));
  }

  function handleSaveChanges() {
    if (!preview) return;

    const edits = preview.blocks
      .map((block) => ({
        blockId: block.id,
        text: drafts[block.id] ?? block.text,
        original: block.text,
      }))
      .filter((item) => item.text !== item.original)
      .map(({ blockId, text }) => ({ blockId, text }));

    if (edits.length === 0) {
      toast.info("Keine Änderungen zum Speichern.");
      return;
    }

    savePreview(
      {
        source: previewSource,
        previewVersion: preview.previewVersion,
        edits,
        globalOverrides,
        fileOverrides: fileOverridesByFile[file.id] ?? {},
      },
      {
        onSuccess: () => {
          toast.success("Änderungen gespeichert.");
        },
        onError: (error) => {
          toast.error(error.message);
        },
      }
    );
  }

  function handleAutomatePlaceholders() {
    generateFiles(
      {
        fileIds: selectedFiles,
        globalOverrides,
        fileOverridesByFile,
      },
      {
        onSuccess: (result) => {
          const failed = result.files.filter((entry) => entry.error);
          if (failed.length > 0) {
            toast.warning(`Automatisierung teilweise fehlgeschlagen (${failed.length}).`);
          } else {
            toast.success(`${result.files.length} Datei(en) mit Platzhaltern verarbeitet.`);
          }

          if (result.aiWarning) {
            toast.warning(result.aiWarning);
          }
        },
        onError: (error) => {
          toast.error(error.message);
        },
      }
    );
  }

  function handleRewriteBlocks() {
    if (!rewritePrompt.trim()) {
      toast.error("Bitte gib eine KI-Anweisung ein.");
      return;
    }

    if (selectedBlockIds.size === 0) {
      toast.error("Bitte wähle mindestens einen Block aus.");
      return;
    }

    rewriteFiles(
      {
        fileIds: [file.id],
        prompt: rewritePrompt,
        mode: "block",
        blockIdsByFile: {
          [file.id]: Array.from(selectedBlockIds),
        },
        globalOverrides,
        fileOverridesByFile,
        preservePlaceholders: true,
      },
      {
        onSuccess: (result) => {
          const failed = result.files.filter((item) => item.error);
          if (failed.length > 0) {
            toast.warning(`Rewrite teilweise fehlgeschlagen (${failed.length}).`);
          } else {
            toast.success("Ausgewählte Blöcke mit KI aktualisiert.");
          }
        },
        onError: (error) => {
          toast.error(error.message);
        },
      }
    );
  }

  function handleRewriteFullFiles() {
    if (!rewritePrompt.trim()) {
      toast.error("Bitte gib eine KI-Anweisung ein.");
      return;
    }

    rewriteFiles(
      {
        fileIds: selectedFiles,
        prompt: rewritePrompt,
        mode: "full_file",
        globalOverrides,
        fileOverridesByFile,
        preservePlaceholders: true,
      },
      {
        onSuccess: (result) => {
          const failed = result.files.filter((item) => item.error);
          if (failed.length > 0) {
            toast.warning(`Rewrite teilweise fehlgeschlagen (${failed.length}).`);
          } else {
            toast.success(`${result.files.length} Datei(en) vollständig mit KI umgeschrieben.`);
          }
        },
        onError: (error) => {
          toast.error(error.message);
        },
      }
    );
  }

  function handleDownloadSelected() {
    downloadFiles(
      {
        fileIds: selectedFiles,
      },
      {
        onSuccess: () => {
          toast.success("ZIP-Download gestartet.");
        },
        onError: (error) => {
          toast.error(error.message);
        },
      }
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
        Vorschau konnte nicht geladen werden.
      </div>
    );
  }

  const sourceLabel = preview.source === "generated" ? "Generated" : "Original";

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="border-b border-gray-200 bg-white px-6 py-3 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-gray-900">{file.name}</p>
            <p className="text-xs text-gray-500">{file.path}</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={preview.source === "generated" ? "green" : "gray"}>
              {sourceLabel}
            </Badge>
            <Badge variant={editedCount > 0 ? "orange" : "blue"}>{editedCount} geändert</Badge>
            <Badge variant={unresolvedPlaceholders.length === 0 ? "green" : "orange"}>
              {unresolvedPlaceholders.length} offen
            </Badge>

            <div className="flex items-center gap-1 ml-2">
              <Button
                size="sm"
                variant={previewSource === "auto" ? "secondary" : "ghost"}
                onClick={() => setPreviewSource("auto")}
              >
                Auto
              </Button>
              <Button
                size="sm"
                variant={previewSource === "original" ? "secondary" : "ghost"}
                onClick={() => setPreviewSource("original")}
              >
                Original
              </Button>
              <Button
                size="sm"
                variant={previewSource === "generated" ? "secondary" : "ghost"}
                onClick={() => setPreviewSource("generated")}
              >
                Generated
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleSaveChanges} loading={isSaving} disabled={editedCount === 0}>
            Änderungen speichern
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleAutomatePlaceholders}
            loading={isGenerating}
          >
            Platzhalter automatisieren ({selectedFiles.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRewriteBlocks}
            loading={isRewriting}
            disabled={selectedBlockIds.size === 0}
          >
            Blöcke mit KI umschreiben ({selectedBlockIds.size})
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRewriteFullFiles}
            loading={isRewriting}
          >
            Auswahl komplett mit KI ({selectedFiles.length})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDownloadSelected}
            loading={isDownloading}
          >
            Auswahl als ZIP
          </Button>
          {file.ext === "docx" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                router.push(`/manuals/${manualId}/canvas-editor/${file.id}`)
              }
            >
              Erweiterter Editor
            </Button>
          )}
        </div>

        <BaseTextarea
          value={rewritePrompt}
          onChange={(event) => setRewritePrompt(event.target.value)}
          className="min-h-[70px]"
          placeholder="KI-Anweisung, z. B. 'Formuliere formeller und ergänze ISO-9001-konforme Details'."
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {isFetching && (
          <p className="px-6 pt-2 text-xs text-gray-500">Aktualisiere Vorschau...</p>
        )}

        {file.ext === "docx" ? (
          <DocxCanvasPreview
            manualId={manualId}
            fileId={file.id}
            source={preview.source}
            previewVersion={preview.previewVersion}
            blocks={editableBlocks}
            layout={preview.layout}
            effectiveMap={effectiveMap}
            selectedBlockIds={selectedBlockIds}
            onToggleBlockSelection={toggleBlockSelection}
            onChangeBlockText={handleDraftChange}
          />
        ) : (
          <PptxCanvasPreview
            blocks={editableBlocks}
            layout={preview.layout}
            effectiveMap={effectiveMap}
            selectedBlockIds={selectedBlockIds}
            onToggleBlockSelection={toggleBlockSelection}
            onChangeBlockText={handleDraftChange}
          />
        )}
      </div>
    </div>
  );
}
