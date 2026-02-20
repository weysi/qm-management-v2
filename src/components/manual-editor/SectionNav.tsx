"use client";

import { cn } from "@/lib/utils";
import type { ManualSection } from "@/lib/schemas";

interface SectionNavProps {
  sections: ManualSection[];
  activeSectionId: string | null;
  onSelect: (id: string) => void;
}

export function SectionNav({ sections, activeSectionId, onSelect }: SectionNavProps) {
  return (
    <nav className="w-56 shrink-0 bg-gray-50 border-r border-gray-200 overflow-y-auto py-4">
      <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Kapitel
      </p>
      {sections.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={cn(
            "w-full text-left px-4 py-2 text-sm transition-colors",
            activeSectionId === s.id
              ? "bg-primary/10 text-primary font-medium border-r-2 border-primary"
              : "text-gray-600 hover:bg-white hover:text-gray-900"
          )}
        >
          <span className="text-xs text-gray-400 mr-1">{s.chapterNumber}</span>
          {s.title}
          {s.aiGenerated && (
            <span className="ml-1 text-green-500 text-xs">✓</span>
          )}
        </button>
      ))}
    </nav>
  );
}
