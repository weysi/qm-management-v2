"use client";

/**
 * Single-page canvas layer.
 * Renders the WYSIWYG page preview (via docx-preview) plus:
 * - BlockOverlay for each paragraph block
 * - FabricObjectLayer for floating objects (logos, signatures, stamps)
 */

import { useEffect, useRef, useState } from "react";
import type { Page, ParagraphBlock, DocumentObject } from "@/lib/schemas/canvas-model.schema";
import { BlockOverlay } from "./BlockOverlay";
import { FabricObjectLayer } from "./FabricObjectLayer";

interface BlockLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CanvasPageLayerProps {
  page: Page;
  pageIndex: number;
  manualId: string;
  fileId: string;
  previewVersion: string;
  /** Source: "original" or "generated" binary for WYSIWYG rendering */
  docxBase64: string;
  selectedBlockId: string | null;
  selectedObjectId: string | null;
  onSelectBlock: (id: string | null) => void;
  onSelectObject: (id: string | null) => void;
  onChangeBlockText: (blockId: string, runId: string, text: string) => void;
  onMoveObject: (id: string, x: number, y: number) => void;
  onResizeObject: (id: string, w: number, h: number) => void;
  effectiveMap?: Record<string, string>;
  projectId: string;
}

function collectParagraphBlocks(page: Page): ParagraphBlock[] {
  const result: ParagraphBlock[] = [];
  for (const block of page.blocks) {
    if (block.type === "paragraph") {
      result.push(block);
    }
  }
  return result;
}

/**
 * Compute a simple block layout from estimated positions.
 * In a full implementation, this would come from the canvas model's layout data.
 */
function estimateLayout(block: ParagraphBlock, pageWidth: number): BlockLayout {
  // Simple linear flow estimate
  const charCount = block.runs
    .filter((r) => r.type === "text")
    .map((r) => (r as { text: string }).text)
    .join("").length;
  const contentWidth = pageWidth - 96; // margin
  const charsPerLine = Math.floor(contentWidth / 7.5);
  const lines = Math.max(1, Math.ceil(charCount / charsPerLine));
  const lineHeight = block.style.outlineLevel !== undefined && block.style.outlineLevel < 3 ? 24 : 18;
  const h = lines * lineHeight + 4;

  return {
    x: 48,
    y: 0, // will be overridden by cumulative y
    w: contentWidth,
    h,
  };
}

export function CanvasPageLayer({
  page,
  pageIndex,
  manualId,
  fileId,
  previewVersion,
  docxBase64,
  selectedBlockId,
  selectedObjectId,
  onSelectBlock,
  onSelectObject,
  onChangeBlockText,
  onMoveObject,
  onResizeObject,
  effectiveMap = {},
  projectId,
}: CanvasPageLayerProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const [wysiwyg, setWysiwyg] = useState<"loading" | "ready" | "error">("loading");

  const paragraphBlocks = collectParagraphBlocks(page);

  // Compute cumulative layouts for overlay blocks
  const layouts = new Map<string, BlockLayout>();
  let cumulativeY = page.marginTopPx;
  for (const block of paragraphBlocks) {
    const layout = estimateLayout(block, page.widthPx);
    layouts.set(block.id, { ...layout, y: cumulativeY });
    cumulativeY += layout.h + 10;
  }

  // Render WYSIWYG page using docx-preview library
  useEffect(() => {
    if (!previewRef.current || !docxBase64) return;

    let cancelled = false;

    (async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        if (cancelled || !previewRef.current) return;

        const buffer = Buffer.from(docxBase64, "base64");
        const blob = new Blob([buffer], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });

        // Clear previous content
        previewRef.current.innerHTML = "";

        await renderAsync(blob, previewRef.current, undefined, {
          inWrapper: false,
          ignoreWidth: true,
          ignoreHeight: false,
          breakPages: true,
        });

        if (!cancelled) setWysiwyg("ready");
      } catch (err) {
        console.error("[CanvasPageLayer] docx-preview error:", err);
        if (!cancelled) setWysiwyg("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [docxBase64, pageIndex]);

  const getAssetUrl = (assetId: string) =>
    `/api/canvas-editor/${projectId}/assets/${assetId}`;

  return (
    <div
      className="relative bg-white shadow-md rounded-sm mx-auto mb-8"
      style={{
        width: page.widthPx,
        minHeight: page.heightPx,
      }}
    >
      {/* WYSIWYG layer (docx-preview) */}
      <div
        ref={previewRef}
        className="absolute inset-0 pointer-events-none overflow-hidden"
        style={{ zIndex: 1 }}
      />

      {wysiwyg === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80 z-5">
          <span className="text-sm text-muted-foreground">Lade Vorschau…</span>
        </div>
      )}

      {wysiwyg === "error" && (
        <div className="absolute top-4 left-4 right-4 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700 z-10">
          Vorschau konnte nicht geladen werden. Blöcke können weiterhin bearbeitet werden.
        </div>
      )}

      {/* Block overlay (interactive text editing) */}
      <div
        className="absolute inset-0"
        style={{ zIndex: 10 }}
        onClick={(e) => {
          // Click on page background → deselect block
          if (e.target === e.currentTarget) onSelectBlock(null);
        }}
      >
        {paragraphBlocks.map((block) => {
          const layout = layouts.get(block.id);
          if (!layout) return null;
          return (
            <BlockOverlay
              key={block.id}
              block={block}
              layout={layout}
              isSelected={selectedBlockId === block.id}
              onClick={onSelectBlock}
              onChangeText={onChangeBlockText}
              effectiveMap={effectiveMap}
            />
          );
        })}
      </div>

      {/* Fabric.js floating object layer */}
      {page.objects.length > 0 && (
        <FabricObjectLayer
          pageWidth={page.widthPx}
          pageHeight={page.heightPx}
          objects={page.objects}
          selectedObjectId={selectedObjectId}
          onSelectObject={onSelectObject}
          onMoveObject={onMoveObject}
          onResizeObject={onResizeObject}
          getAssetUrl={getAssetUrl}
        />
      )}

      {/* Page number */}
      <div className="absolute bottom-2 left-0 right-0 text-center text-[10px] text-gray-400 pointer-events-none z-5">
        Seite {page.pageNumber}
      </div>
    </div>
  );
}
