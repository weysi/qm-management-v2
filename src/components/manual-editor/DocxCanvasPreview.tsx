"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BaseTextarea } from "@/components/ui/textarea";
import type { TemplateCanvasLayout } from "@/lib/schemas";

const DOCX_PAGE_HEIGHT = 1120;
const FALLBACK_PAGE_WIDTH = 816;

interface EditableCanvasBlock {
  id: string;
  nodeIndex: number;
  groupLabel: string;
  currentText: string;
  currentPlaceholders: string[];
}

interface PositionedBlock {
  block: EditableCanvasBlock;
  layout: TemplateCanvasLayout;
}

interface DocxCanvasPreviewProps {
  manualId: string;
  fileId: string;
  source: "original" | "generated";
  previewVersion: string;
  blocks: EditableCanvasBlock[];
  layout: TemplateCanvasLayout[];
  effectiveMap: Record<string, string>;
  selectedBlockIds: Set<string>;
  onToggleBlockSelection: (blockId: string) => void;
  onChangeBlockText: (blockId: string, value: string) => void;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderHighlightedPlaceholders(
  text: string,
  map: Record<string, string>
): string {
  return escapeHtml(text).replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key: string) => {
    const value = map[key];
    if (value && value.trim() !== "") {
      return `<mark class=\"placeholder-token-resolved\" title=\"${escapeHtml(
        value
      )}\">{{${key}}}</mark>`;
    }

    return `<mark class=\"placeholder-token\" title=\"Offener Platzhalter\">{{${key}}}</mark>`;
  });
}

function fallbackLayout(order: number): TemplateCanvasLayout {
  const blockHeight = 96;
  const top = 64 + order * 112;
  const pageOrSlide = Math.floor(top / DOCX_PAGE_HEIGHT) + 1;

  return {
    blockId: `fallback-${order}`,
    pageOrSlide,
    x: 48,
    y: top,
    w: 720,
    h: blockHeight,
    z: 2,
    confidence: 0.2,
  };
}

export function DocxCanvasPreview({
  manualId,
  fileId,
  source,
  previewVersion,
  blocks,
  layout,
  effectiveMap,
  selectedBlockIds,
  onToggleBlockSelection,
  onChangeBlockText,
}: DocxCanvasPreviewProps) {
  const renderRef = useRef<HTMLDivElement>(null);
  const [visualStatus, setVisualStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );

  useEffect(() => {
    let cancelled = false;
    const mountNode = renderRef.current;

    async function renderVisualPreview() {
      if (!mountNode) return;
      mountNode.innerHTML = "";
      setVisualStatus("loading");

      try {
        const response = await fetch(
          `/api/template-files/${manualId}/${fileId}/binary?source=${source}`
        );

        if (!response.ok) {
          throw new Error("DOCX preview binary could not be loaded");
        }

        const data = await response.arrayBuffer();
        const docxPreview = await import("docx-preview");
        if (cancelled || !mountNode) return;

        await docxPreview.renderAsync(data, mountNode, undefined, {
          inWrapper: true,
          ignoreHeight: false,
          ignoreWidth: false,
          breakPages: true,
          renderHeaders: true,
          renderFooters: true,
          renderEndnotes: false,
        });

        if (!cancelled) {
          setVisualStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setVisualStatus("error");
        }
      }
    }

    renderVisualPreview();

    return () => {
      cancelled = true;
      if (mountNode) {
        mountNode.innerHTML = "";
      }
    };
  }, [manualId, fileId, source, previewVersion]);

  const positionedBlocks = useMemo<PositionedBlock[]>(() => {
    const byId = new Map(layout.map((item) => [item.blockId, item]));
    return blocks.map((block, index) => {
      const blockLayout = byId.get(block.id) ?? fallbackLayout(index);
      return { block, layout: blockLayout };
    });
  }, [blocks, layout]);

  const pages = useMemo(() => {
    const pageMap = new Map<number, PositionedBlock[]>();

    positionedBlocks.forEach((entry) => {
      const page = entry.layout.pageOrSlide;
      const list = pageMap.get(page) ?? [];
      list.push(entry);
      pageMap.set(page, list);
    });

    return Array.from(pageMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([page, items]) => ({
        page,
        items: items.sort((a, b) => a.layout.y - b.layout.y),
      }));
  }, [positionedBlocks]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2">
      <div className="border-b xl:border-b-0 xl:border-r border-gray-200 bg-gray-100 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 bg-white">
          <p className="text-sm font-semibold text-gray-900">Dokumentvorschau</p>
          <p className="text-xs text-gray-500">
            Vollständige DOCX-Ansicht der aktuellen Version ({source}).
          </p>
        </div>

        <div className="p-4 overflow-x-auto">
          <div ref={renderRef} className="docx-rendered-preview min-w-[780px]" />
          {visualStatus === "loading" && (
            <p className="text-xs text-gray-500 mt-2">Lade DOCX-Vorschau...</p>
          )}
          {visualStatus === "error" && (
            <p className="text-xs text-red-600 mt-2">
              Die visuelle DOCX-Vorschau konnte nicht geladen werden.
            </p>
          )}
        </div>
      </div>

      <div className="bg-gray-200 p-4 space-y-6">
        {pages.map((page) => (
          <div
            key={`page-${page.page}`}
            className="mx-auto relative bg-white border border-gray-300 shadow-sm"
            style={{
              width: `${FALLBACK_PAGE_WIDTH}px`,
              minHeight: `${DOCX_PAGE_HEIGHT}px`,
            }}
          >
            <div className="absolute top-3 right-4 text-[11px] text-gray-500">
              Seite {page.page}
            </div>

            {page.items.map(({ block, layout: blockLayout }) => {
              const localY = blockLayout.y - (page.page - 1) * DOCX_PAGE_HEIGHT;
              return (
                <div
                  key={block.id}
                  className="absolute rounded-md border bg-white/95 backdrop-blur-sm p-2"
                  style={{
                    left: `${blockLayout.x}px`,
                    top: `${localY}px`,
                    width: `${Math.max(180, blockLayout.w)}px`,
                    minHeight: `${Math.max(62, blockLayout.h)}px`,
                    zIndex: blockLayout.z,
                    borderColor:
                      blockLayout.confidence < 0.5 ? "rgb(245 158 11)" : "rgb(209 213 219)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="flex items-center gap-1 text-[11px] text-gray-600">
                      <input
                        type="checkbox"
                        checked={selectedBlockIds.has(block.id)}
                        onChange={() => onToggleBlockSelection(block.id)}
                      />
                      Block {block.nodeIndex}
                    </label>
                    <div className="flex gap-1">
                      {block.currentPlaceholders.map((token) => (
                        <Badge
                          key={`${block.id}-${token}`}
                          variant={effectiveMap[token] ? "green" : "orange"}
                        >
                          {token}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <BaseTextarea
                    value={block.currentText}
                    onChange={(event) => onChangeBlockText(block.id, event.target.value)}
                    className="min-h-[62px] text-xs leading-5"
                  />

                  <div
                    className="mt-1 text-[11px] text-gray-700 whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{
                      __html: renderHighlightedPlaceholders(
                        block.currentText,
                        effectiveMap
                      ).replace(/\n/g, "<br/>"),
                    }}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
