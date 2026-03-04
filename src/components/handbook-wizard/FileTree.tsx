'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileTreeNode {
  id?: string;
  name: string;
  path: string;
  kind: 'folder' | 'file';
  children?: FileTreeNode[];
  placeholder_total?: number;
  placeholder_resolved?: number;
}

interface FileTreeProps {
  nodes: FileTreeNode[];
  selectedPath?: string | null;
  onSelectFile?: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  onDeleteFolder?: (path: string) => void;
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={cn('w-4 h-4 shrink-0', open ? 'text-blue-500' : 'text-blue-400')}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      className="w-4 h-4 shrink-0 text-gray-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={cn('w-3 h-3 text-gray-400 transition-transform', open && 'rotate-90')}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

function TreeRow({
  node,
  depth,
  expanded,
  setExpanded,
  progressByPath,
  selectedPath,
  onSelectFile,
  onDeleteFile,
  onDeleteFolder,
}: {
  node: FileTreeNode;
  depth: number;
  expanded: Set<string>;
  setExpanded: (path: string, next: boolean) => void;
  progressByPath: Map<string, { total: number; resolved: number }>;
  selectedPath?: string | null;
  onSelectFile?: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  onDeleteFolder?: (path: string) => void;
}) {
  const isFolder = node.kind === 'folder';
  const open = expanded.has(node.path);
  const progress = progressByPath.get(node.path) ?? { total: 0, resolved: 0 };
  const showProgress = progress.total > 0;

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50',
          !isFolder && selectedPath === node.path && 'bg-primary/10',
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {isFolder ? (
          <button
            type="button"
            className="flex items-center gap-1"
            onClick={() => setExpanded(node.path, !open)}
          >
            <ChevronIcon open={open} />
            <FolderIcon open={open} />
          </button>
        ) : (
          <FileIcon />
        )}

        <button
          type="button"
          className={cn(
            'flex flex-1 min-w-0 items-center justify-between gap-2 text-left',
            isFolder ? 'font-medium text-gray-800' : 'text-gray-700',
          )}
          onClick={() => {
            if (isFolder) {
              setExpanded(node.path, !open);
              return;
            }
            onSelectFile?.(node.path);
          }}
        >
          <span className="truncate">{node.name}</span>
          {showProgress && (
            <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700">
              {progress.resolved}/{progress.total}
            </span>
          )}
        </button>

        {!isFolder && onDeleteFile && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-red-600 opacity-0 group-hover:opacity-100"
            onClick={() => onDeleteFile(node.path)}
          >
            Löschen
          </Button>
        )}

        {isFolder && onDeleteFolder && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-red-600 opacity-0 group-hover:opacity-100"
            onClick={() => onDeleteFolder(node.path)}
          >
            Ordner löschen
          </Button>
        )}
      </div>

      {isFolder && open && Array.isArray(node.children) && node.children.length > 0 && (
        <div>
          {node.children.map(child => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              setExpanded={setExpanded}
              progressByPath={progressByPath}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
              onDeleteFile={onDeleteFile}
              onDeleteFolder={onDeleteFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({
  nodes,
  selectedPath,
  onSelectFile,
  onDeleteFile,
  onDeleteFolder,
}: FileTreeProps) {
  const defaultExpanded = useMemo(() => {
    const set = new Set<string>();
    for (const node of nodes) {
      if (node.kind === 'folder') {
        set.add(node.path);
      }
    }
    return set;
  }, [nodes]);

  const progressByPath = useMemo(() => {
    const map = new Map<string, { total: number; resolved: number }>();

    const walk = (node: FileTreeNode): { total: number; resolved: number } => {
      if (node.kind === 'file') {
        const total = Math.max(0, Number(node.placeholder_total ?? 0));
        const resolved = Math.max(0, Number(node.placeholder_resolved ?? 0));
        const progress = { total, resolved };
        map.set(node.path, progress);
        return progress;
      }

      let total = 0;
      let resolved = 0;
      for (const child of node.children ?? []) {
        const childProgress = walk(child);
        total += childProgress.total;
        resolved += childProgress.resolved;
      }
      const progress = { total, resolved };
      map.set(node.path, progress);
      return progress;
    };

    for (const node of nodes) {
      walk(node);
    }

    return map;
  }, [nodes]);

  const [expanded, updateExpanded] = useState<Set<string>>(defaultExpanded);

  useEffect(() => {
    updateExpanded(defaultExpanded);
  }, [defaultExpanded]);

  function setExpanded(path: string, next: boolean) {
    updateExpanded(prev => {
      const out = new Set(prev);
      if (next) out.add(path);
      else out.delete(path);
      return out;
    });
  }

  if (nodes.length === 0) {
    return <p className="text-sm text-gray-500">Keine Dokumente vorhanden.</p>;
  }

  return (
    <div className="rounded-lg border border-gray-100 p-2">
      {nodes.map(node => (
        <TreeRow
          key={node.path}
          node={node}
          depth={0}
          expanded={expanded}
          setExpanded={setExpanded}
          progressByPath={progressByPath}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
          onDeleteFile={onDeleteFile}
          onDeleteFolder={onDeleteFolder}
        />
      ))}
    </div>
  );
}
