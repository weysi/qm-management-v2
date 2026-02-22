"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDownloadTemplateFiles, useGenerateTemplateFiles, useTemplateFiles, useUploadTemplateFiles } from "@/hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { TemplateFileMetadata } from "@/types";

interface TemplateFileSectionProps {
  manualId: string;
}

interface UploadRejectedFile {
  path: string;
  reason: string;
}

interface UploadError extends Error {
  rejected?: UploadRejectedFile[];
}

interface MutableTreeNode {
  name: string;
  path: string;
  folders: Map<string, MutableTreeNode>;
  files: TemplateFileMetadata[];
}

interface TreeNode {
  name: string;
  path: string;
  folders: TreeNode[];
  files: TemplateFileMetadata[];
}

function createNode(name: string, path: string): MutableTreeNode {
  return {
    name,
    path,
    folders: new Map<string, MutableTreeNode>(),
    files: [],
  };
}

function buildTree(files: TemplateFileMetadata[]): TreeNode {
  const root = createNode("", "");

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    const folderParts = parts.slice(0, -1);

    let cursor = root;
    let cursorPath = "";

    for (const part of folderParts) {
      cursorPath = cursorPath ? `${cursorPath}/${part}` : part;
      let next = cursor.folders.get(part);

      if (!next) {
        next = createNode(part, cursorPath);
        cursor.folders.set(part, next);
      }

      cursor = next;
    }

    cursor.files.push(file);
  }

  function finalize(node: MutableTreeNode): TreeNode {
    return {
      name: node.name,
      path: node.path,
      files: [...node.files].sort((a, b) => a.path.localeCompare(b.path)),
      folders: [...node.folders.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(finalize),
    };
  }

  return finalize(root);
}

function statusVariant(status: TemplateFileMetadata["status"]) {
  if (status === "generated") return "green" as const;
  if (status === "error") return "red" as const;
  return "gray" as const;
}

function statusLabel(status: TemplateFileMetadata["status"]) {
  if (status === "generated") return "Generiert";
  if (status === "error") return "Fehler";
  return "Hochgeladen";
}

export function TemplateFileSection({ manualId }: TemplateFileSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rejectedFiles, setRejectedFiles] = useState<UploadRejectedFile[]>([]);

  const { data: files = [], isLoading } = useTemplateFiles(manualId);
  const { mutate: uploadFiles, isPending: isUploading } = useUploadTemplateFiles(manualId);
  const { mutate: generateFiles, isPending: isGenerating } = useGenerateTemplateFiles(manualId);
  const { mutate: downloadFiles, isPending: isDownloading } = useDownloadTemplateFiles(manualId);

  const tree = useMemo(() => buildTree(files), [files]);

  useEffect(() => {
    if (!inputRef.current) return;

    inputRef.current.setAttribute("webkitdirectory", "");
    inputRef.current.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    const availableIds = new Set(files.map((file) => file.id));

    setSelectedIds((current) => {
      const next = new Set<string>();
      current.forEach((id) => {
        if (availableIds.has(id)) next.add(id);
      });
      return next;
    });
  }, [files]);

  const selectedCount = selectedIds.size;

  function toggleFileSelection(fileId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }

  function selectAllFiles() {
    setSelectedIds(new Set(files.map((file) => file.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function extractRelativePath(file: File): string {
    const maybeRelative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    if (typeof maybeRelative === "string" && maybeRelative.trim() !== "") {
      return maybeRelative;
    }

    return file.name;
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const list = event.target.files;
    if (!list || list.length === 0) {
      return;
    }

    const selected = Array.from(list);
    const paths = selected.map(extractRelativePath);

    uploadFiles(
      { files: selected, paths },
      {
        onSuccess: (result) => {
          const acceptedCount = result.files.length;
          const rejectedCount = result.rejected.length;

          if (acceptedCount > 0) {
            toast.success(`${acceptedCount} Datei(en) hochgeladen.`);
          }

          if (rejectedCount > 0) {
            setRejectedFiles(result.rejected);
            toast.warning(`${rejectedCount} Datei(en) wurden abgelehnt.`);
          } else {
            setRejectedFiles([]);
          }
        },
        onError: (error) => {
          const uploadError = error as UploadError;
          if (uploadError.rejected) {
            setRejectedFiles(uploadError.rejected);
          }
          toast.error(uploadError.message);
        },
      }
    );

    event.target.value = "";
  }

  function handleGenerateSelected() {
    if (selectedIds.size === 0) return;

    generateFiles(
      { fileIds: Array.from(selectedIds) },
      {
        onSuccess: (result) => {
          toast.success(`${result.files.length} Datei(en) verarbeitet.`);
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

  function handleDownloadSelected() {
    if (selectedIds.size === 0) return;

    downloadFiles(
      { fileIds: Array.from(selectedIds) },
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

  return (
    <div className="px-6 py-5 space-y-4 h-full overflow-hidden">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Datei-Templates</h2>
              <p className="text-sm text-gray-500">
                Lade ein Ordner-Template mit .docx/.pptx/.xlsx hoch, fülle Platzhalter und lade die Auswahl als ZIP herunter.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".docx,.pptx,.xlsx"
                className="hidden"
                onChange={handleInputChange}
              />
              <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} loading={isUploading}>
                Ordner hochladen
              </Button>
              <Button
                size="sm"
                onClick={handleGenerateSelected}
                loading={isGenerating}
                disabled={selectedCount === 0}
              >
                Auswahl generieren
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadSelected}
                loading={isDownloading}
                disabled={selectedCount === 0}
              >
                Auswahl als ZIP
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Badge variant="gray">{files.length} Datei(en)</Badge>
            <Badge variant="blue">{selectedCount} ausgewählt</Badge>
            <button className="underline" onClick={selectAllFiles} disabled={files.length === 0}>
              Alle auswählen
            </button>
            <button className="underline" onClick={clearSelection} disabled={selectedCount === 0}>
              Auswahl aufheben
            </button>
          </div>
        </CardHeader>
      </Card>

      {rejectedFiles.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <h3 className="text-sm font-semibold text-red-700">Abgelehnte Dateien</h3>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-red-600">
            {rejectedFiles.map((item) => (
              <div key={`${item.path}-${item.reason}`} className="break-all">
                {item.path}: {item.reason}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="h-[calc(100%-176px)]">
        <CardContent className="h-full overflow-auto p-4">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <Spinner />
            </div>
          ) : files.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-gray-500">
              Noch keine Template-Dateien hochgeladen.
            </div>
          ) : (
            <div className="space-y-1">
              {tree.files.map((file) => (
                <FileRow
                  key={file.id}
                  file={file}
                  depth={0}
                  selected={selectedIds.has(file.id)}
                  onToggle={toggleFileSelection}
                />
              ))}

              {tree.folders.map((folder) => (
                <FolderBranch
                  key={folder.path}
                  node={folder}
                  depth={0}
                  selectedIds={selectedIds}
                  onToggle={toggleFileSelection}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface FolderBranchProps {
  node: TreeNode;
  depth: number;
  selectedIds: Set<string>;
  onToggle: (fileId: string) => void;
}

function FolderBranch({ node, depth, selectedIds, onToggle }: FolderBranchProps) {
  return (
    <div className="space-y-1">
      <div
        className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-1"
        style={{ paddingLeft: depth * 16 + 8 }}
      >
        {node.name}
      </div>

      {node.files.map((file) => (
        <FileRow
          key={file.id}
          file={file}
          depth={depth + 1}
          selected={selectedIds.has(file.id)}
          onToggle={onToggle}
        />
      ))}

      {node.folders.map((child) => (
        <FolderBranch
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedIds={selectedIds}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

interface FileRowProps {
  file: TemplateFileMetadata;
  depth: number;
  selected: boolean;
  onToggle: (fileId: string) => void;
}

function FileRow({ file, depth, selected, onToggle }: FileRowProps) {
  const unresolvedCount = file.unresolvedPlaceholders.length;

  return (
    <label
      className="flex items-center justify-between gap-3 rounded border border-gray-200 px-3 py-2 hover:bg-gray-50"
      style={{ marginLeft: depth * 16 }}
    >
      <div className="min-w-0 flex items-center gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(file.id)}
          className="h-4 w-4 rounded border-gray-300"
        />
        <div className="min-w-0">
          <p className="text-sm text-gray-900 truncate">{file.name}</p>
          <p className="text-xs text-gray-500 truncate">{file.path}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Badge variant={statusVariant(file.status)}>{statusLabel(file.status)}</Badge>
        <Badge variant={unresolvedCount === 0 ? "green" : "orange"}>
          {file.placeholders.length - unresolvedCount}/{file.placeholders.length} Platzhalter
        </Badge>
      </div>
    </label>
  );
}
