"use client";

import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ManualSection, TemplateFileMetadata } from "@/lib/schemas";

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

interface UnifiedNavigatorProps {
  sections: ManualSection[];
  templateFiles: TemplateFileMetadata[];
  activeKind: "section" | "template";
  activeId: string;
  selectedTemplateIds: Set<string>;
  onSelectSection: (id: string) => void;
  onSelectTemplate: (id: string) => void;
  onToggleTemplateSelection: (id: string) => void;
  onSelectAllTemplates: () => void;
  onClearTemplateSelection: () => void;
  onUploadFolder: (files: File[], paths: string[]) => void;
  uploadPending: boolean;
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

export function UnifiedNavigator({
  sections,
  templateFiles,
  activeKind,
  activeId,
  selectedTemplateIds,
  onSelectSection,
  onSelectTemplate,
  onToggleTemplateSelection,
  onSelectAllTemplates,
  onClearTemplateSelection,
  onUploadFolder,
  uploadPending,
}: UnifiedNavigatorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const tree = useMemo(() => buildTree(templateFiles), [templateFiles]);

  useEffect(() => {
    if (!inputRef.current) return;

    inputRef.current.setAttribute("webkitdirectory", "");
    inputRef.current.setAttribute("directory", "");
  }, []);

  function extractRelativePath(file: File): string {
    const maybeRelative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    if (typeof maybeRelative === "string" && maybeRelative.trim() !== "") {
      return maybeRelative;
    }

    return file.name;
  }

  function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
    const list = event.target.files;
    if (!list || list.length === 0) {
      return;
    }

    const files = Array.from(list);
    const paths = files.map(extractRelativePath);
    onUploadFolder(files, paths);

    event.target.value = "";
  }

  return (
    <aside className="w-72 shrink-0 bg-gray-50 border-r border-gray-200 overflow-y-auto py-4">
      <div className="px-4 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Kapitel
        </p>
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => onSelectSection(section.id)}
            className={cn(
              "w-full text-left px-3 py-2 text-sm transition-colors rounded-md",
              activeKind === "section" && activeId === section.id
                ? "bg-primary/10 text-primary font-medium"
                : "text-gray-600 hover:bg-white hover:text-gray-900"
            )}
          >
            <span className="text-xs text-gray-400 mr-1">{section.chapterNumber}</span>
            {section.title}
            {section.aiGenerated && <span className="ml-1 text-green-500 text-xs">✓</span>}
          </button>
        ))}
      </div>

      <div className="border-t border-gray-200 pt-4 px-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Dateien
          </p>
          <Badge variant="blue">{selectedTemplateIds.size} ausgewählt</Badge>
        </div>

        <div className="flex gap-2 mb-3">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".docx,.pptx,.xlsx"
            className="hidden"
            onChange={handleFileInput}
          />
          <Button
            size="sm"
            variant="outline"
            loading={uploadPending}
            onClick={() => inputRef.current?.click()}
            className="w-full"
          >
            Ordner hochladen
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
          <button
            onClick={onSelectAllTemplates}
            disabled={templateFiles.length === 0}
            className="underline"
          >
            Alle
          </button>
          <button
            onClick={onClearTemplateSelection}
            disabled={selectedTemplateIds.size === 0}
            className="underline"
          >
            Keine
          </button>
        </div>

        {templateFiles.length === 0 ? (
          <p className="text-xs text-gray-400">Noch keine Dateien hochgeladen.</p>
        ) : (
          <div className="space-y-1">
            {tree.files.map((file) => (
              <TemplateFileRow
                key={file.id}
                file={file}
                depth={0}
                active={activeKind === "template" && activeId === file.id}
                selected={selectedTemplateIds.has(file.id)}
                onSelect={onSelectTemplate}
                onToggleSelection={onToggleTemplateSelection}
              />
            ))}

            {tree.folders.map((folder) => (
              <TemplateFolder
                key={folder.path}
                node={folder}
                depth={0}
                activeKind={activeKind}
                activeId={activeId}
                selectedTemplateIds={selectedTemplateIds}
                onSelectTemplate={onSelectTemplate}
                onToggleTemplateSelection={onToggleTemplateSelection}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );

  function TemplateFolder({
    node,
    depth,
    activeKind,
    activeId,
    selectedTemplateIds,
    onSelectTemplate,
    onToggleTemplateSelection,
  }: {
    node: TreeNode;
    depth: number;
    activeKind: "section" | "template";
    activeId: string;
    selectedTemplateIds: Set<string>;
    onSelectTemplate: (id: string) => void;
    onToggleTemplateSelection: (id: string) => void;
  }) {
    return (
      <div className="space-y-1">
        <div
          className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide py-1"
          style={{ paddingLeft: depth * 14 + 6 }}
        >
          {node.name}
        </div>

        {node.files.map((file) => (
          <TemplateFileRow
            key={file.id}
            file={file}
            depth={depth + 1}
            active={activeKind === "template" && activeId === file.id}
            selected={selectedTemplateIds.has(file.id)}
            onSelect={onSelectTemplate}
            onToggleSelection={onToggleTemplateSelection}
          />
        ))}

        {node.folders.map((folder) => (
          <TemplateFolder
            key={folder.path}
            node={folder}
            depth={depth + 1}
            activeKind={activeKind}
            activeId={activeId}
            selectedTemplateIds={selectedTemplateIds}
            onSelectTemplate={onSelectTemplate}
            onToggleTemplateSelection={onToggleTemplateSelection}
          />
        ))}
      </div>
    );
  }

  function TemplateFileRow({
    file,
    depth,
    active,
    selected,
    onSelect,
    onToggleSelection,
  }: {
    file: TemplateFileMetadata;
    depth: number;
    active: boolean;
    selected: boolean;
    onSelect: (id: string) => void;
    onToggleSelection: (id: string) => void;
  }) {
    return (
      <div
        className={cn(
          "rounded border px-2 py-1.5",
          active ? "border-primary bg-primary/5" : "border-gray-200 bg-white"
        )}
        style={{ marginLeft: depth * 14 }}
      >
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelection(file.id)}
            className="h-3.5 w-3.5 mt-0.5"
          />
          <button
            onClick={() => onSelect(file.id)}
            className="min-w-0 text-left flex-1"
          >
            <p className="text-xs text-gray-900 truncate">{file.name}</p>
            <p className="text-[11px] text-gray-500 truncate">{file.path}</p>
          </button>
        </div>

        <div className="flex items-center justify-between mt-1.5">
          <Badge variant={statusVariant(file.status)}>{statusLabel(file.status)}</Badge>
          <span className="text-[11px] text-gray-500">
            {file.placeholders.length - file.unresolvedPlaceholders.length}/
            {file.placeholders.length}
          </span>
        </div>
      </div>
    );
  }
}
