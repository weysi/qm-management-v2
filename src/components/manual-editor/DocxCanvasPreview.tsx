"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BaseTextarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    <Tabs defaultValue="preview" className="flex flex-col h-full">
      <div className="px-4 pt-3 border-b border-gray-200 bg-white">
        <TabsList className="mb-0">
          <TabsTrigger value="preview">Dokumentvorschau</TabsTrigger>
          <TabsTrigger value="blocks">
            Blöcke bearbeiten
            {pages.reduce((sum, p) => sum + p.items.length, 0) > 0 && (
              <span className="ml-1.5 rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">
                {pages.reduce((sum, p) => sum + p.items.length, 0)}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="preview" className="flex-1 overflow-auto m-0 bg-gray-100">
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
      </TabsContent>

      <TabsContent value="blocks" className="flex-1 overflow-auto m-0 bg-gray-50">
        <div className="p-4 space-y-4">
          {pages.map((page) => (
            <div key={`page-${page.page}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Seite {page.page}
              </p>
              <div className="space-y-3">
                {page.items.map(({ block, layout: blockLayout }) => (
                  <div
                    key={block.id}
                    className="rounded-md border bg-white shadow-sm p-3"
                    style={{
                      borderColor:
                        blockLayout.confidence < 0.5 ? "rgb(245 158 11)" : "rgb(209 213 219)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedBlockIds.has(block.id)}
                          onChange={() => onToggleBlockSelection(block.id)}
                        />
                        <span className="font-medium">Block {block.nodeIndex}</span>
                        {blockLayout.confidence < 0.5 && (
                          <span className="text-amber-500">(niedrige Konfidenz)</span>
                        )}
                      </label>
                      <div className="flex gap-1 flex-wrap justify-end">
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

                    {block.currentPlaceholders.length > 0 && (
                      <div
                        className="mt-2 text-[11px] text-gray-700 whitespace-pre-wrap bg-gray-50 rounded px-2 py-1"
                        dangerouslySetInnerHTML={{
                          __html: renderHighlightedPlaceholders(
                            block.currentText,
                            effectiveMap
                          ).replace(/\n/g, "<br/>"),
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </TabsContent>
    </Tabs>
  );
}
