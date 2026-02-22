"use client";

import { useState, useRef } from "react";
import type { ParagraphBlock, TextRun } from "@/lib/schemas/canvas-model.schema";
import { TiptapBlockEditor } from "./TiptapBlockEditor";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface BlockOverlayProps {
  block: ParagraphBlock;
  layout: { x: number; y: number; w: number; h: number };
  isSelected: boolean;
  onClick: (blockId: string) => void;
  onChangeText: (blockId: string, runId: string, text: string) => void;
  effectiveMap?: Record<string, string>;
}

/**
 * Positioned interactive overlay for a single paragraph block.
 * When selected, activates the Tiptap inline editor.
 * Shows placeholder token badges when not selected.
 */
export function BlockOverlay({
  block,
  layout,
  isSelected,
  onClick,
  onChangeText,
  effectiveMap = {},
}: BlockOverlayProps) {
  const [isEditing, setIsEditing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentText = block.runs
    .filter((r): r is TextRun => r.type === "text")
    .map((r) => r.text)
    .join("");

  const hasUnresolvedPlaceholders = block.placeholders.some(
    (p) => !effectiveMap[p]
  );

  const handleClick = () => {
    onClick(block.id);
    setIsEditing(true);
  };

  const handleBlur = () => {
    setIsEditing(false);
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        left: layout.x,
        top: layout.y,
        width: layout.w,
        minHeight: layout.h,
      }}
      onClick={handleClick}
      className={cn(
        "cursor-text rounded-sm transition-all duration-100",
        isSelected
          ? "ring-2 ring-blue-500 bg-blue-50/30 z-20"
          : "hover:ring-1 hover:ring-blue-300 hover:bg-blue-50/10 z-10",
        hasUnresolvedPlaceholders && !isSelected && "ring-1 ring-orange-300"
      )}
    >
      {isSelected && isEditing ? (
        <TiptapBlockEditor
          block={block}
          onChangeText={onChangeText}
          onBlur={handleBlur}
          className="p-0.5 text-sm"
        />
      ) : (
        <div className="px-0.5 py-px text-sm text-transparent select-none pointer-events-none">
          {/* Invisible placeholder to maintain height */}
          {currentText || "\u00A0"}
        </div>
      )}

      {/* Placeholder badges (visible when not editing) */}
      {!isEditing && block.placeholders.length > 0 && (
        <div className="absolute -top-2 right-0 flex gap-0.5 flex-wrap">
          {block.placeholders.slice(0, 3).map((p) => (
            <Badge
              key={p}
              variant="outline"
              className={cn(
                "text-[9px] px-1 py-0 h-4 font-mono",
                effectiveMap[p]
                  ? "bg-green-50 text-green-700 border-green-300"
                  : "bg-orange-50 text-orange-700 border-orange-300"
              )}
            >
              {p}
            </Badge>
          ))}
          {block.placeholders.length > 3 && (
            <Badge
              variant="outline"
              className="text-[9px] px-1 py-0 h-4"
            >
              +{block.placeholders.length - 3}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
