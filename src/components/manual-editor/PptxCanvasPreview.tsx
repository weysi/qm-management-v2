"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { BaseTextarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TemplateCanvasLayout } from "@/lib/schemas";

const FALLBACK_SLIDE_WIDTH = 960;
const FALLBACK_SLIDE_HEIGHT = 540;

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

interface PptxCanvasPreviewProps {
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
  return {
    blockId: `fallback-${order}`,
    pageOrSlide: 1,
    x: 56,
    y: 56 + order * 96,
    w: 760,
    h: 86,
    z: 2,
    confidence: 0.25,
  };
}

export function PptxCanvasPreview({
  blocks,
  layout,
  effectiveMap,
  selectedBlockIds,
  onToggleBlockSelection,
  onChangeBlockText,
}: PptxCanvasPreviewProps) {
  const positionedBlocks = useMemo<PositionedBlock[]>(() => {
    const byId = new Map(layout.map((item) => [item.blockId, item]));
    return blocks.map((block, index) => {
      const blockLayout = byId.get(block.id) ?? fallbackLayout(index);
      return { block, layout: blockLayout };
    });
  }, [blocks, layout]);

  const slides = useMemo(() => {
    const map = new Map<number, PositionedBlock[]>();

    positionedBlocks.forEach((entry) => {
      const slide = entry.layout.pageOrSlide;
      const list = map.get(slide) ?? [];
      list.push(entry);
      map.set(slide, list);
    });

    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([slideNumber, items]) => {
        const maxWidth = Math.max(
          FALLBACK_SLIDE_WIDTH,
          ...items.map((item) => item.layout.x + item.layout.w + 40)
        );
        const maxHeight = Math.max(
          FALLBACK_SLIDE_HEIGHT,
          ...items.map((item) => item.layout.y + item.layout.h + 40)
        );

        return {
          slideNumber,
          width: maxWidth,
          height: maxHeight,
          items: items.sort((a, b) => {
            if (a.layout.z !== b.layout.z) {
              return a.layout.z - b.layout.z;
            }
            return a.layout.y - b.layout.y;
          }),
        };
      });
  }, [positionedBlocks]);

  const totalBlocks = slides.reduce((sum, s) => sum + s.items.length, 0);

  if (slides.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
        Keine PPTX-Textblöcke gefunden.
      </div>
    );
  }

  return (
    <Tabs defaultValue="canvas" className="w-full">
      <div className="px-4 pt-3 border-b border-gray-200 bg-white">
        <TabsList className="mb-0">
          <TabsTrigger value="canvas">Folien-Canvas</TabsTrigger>
          <TabsTrigger value="blocks">
            Blöcke bearbeiten
            {totalBlocks > 0 && (
              <span className="ml-1.5 rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">
                {totalBlocks}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="canvas" className="m-0">
        <div className="bg-slate-100 p-4 space-y-6">
          {slides.map((slide) => (
            <div
              key={`slide-${slide.slideNumber}`}
              className="mx-auto bg-white border border-gray-300 rounded-md shadow-sm overflow-hidden"
              style={{ width: `${slide.width}px` }}
            >
              <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
                <p className="text-xs font-semibold text-gray-700">Folie {slide.slideNumber}</p>
              </div>
              <div
                className="relative"
                style={{
                  width: `${slide.width}px`,
                  height: `${slide.height}px`,
                  background:
                    "linear-gradient(145deg, rgba(248,250,252,1) 0%, rgba(241,245,249,1) 100%)",
                }}
              >
                {slide.items.map(({ block, layout: blockLayout }) => (
                  <div
                    key={block.id}
                    className="absolute rounded px-2 py-1 text-xs text-gray-800 whitespace-pre-wrap pointer-events-none"
                    style={{
                      left: `${blockLayout.x}px`,
                      top: `${blockLayout.y}px`,
                      width: `${Math.max(120, blockLayout.w)}px`,
                      minHeight: `${Math.max(24, blockLayout.h)}px`,
                      zIndex: blockLayout.z,
                      background: blockLayout.confidence < 0.5
                        ? "rgba(254,243,199,0.85)"
                        : "rgba(255,255,255,0.82)",
                      border: `1px solid ${
                        blockLayout.confidence < 0.5 ? "rgb(245 158 11)" : "rgb(203 213 225)"
                      }`,
                    }}
                  >
                    {block.currentPlaceholders.length > 0 ? (
                      <span
                        dangerouslySetInnerHTML={{
                          __html: renderHighlightedPlaceholders(block.currentText, effectiveMap).replace(/\n/g, "<br/>"),
                        }}
                      />
                    ) : (
                      block.currentText
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="blocks" className="m-0 bg-gray-50">
        <div className="p-4 space-y-4">
          {slides.map((slide) => (
            <div key={`slide-blocks-${slide.slideNumber}`}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Folie {slide.slideNumber}
              </p>
              <div className="space-y-3">
                {slide.items.map(({ block, layout: blockLayout }) => (
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
                      className="min-h-[58px] text-xs leading-5"
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
