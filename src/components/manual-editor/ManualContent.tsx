"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { AiGenerateButton } from "./AiGenerateButton";
import { buildPlaceholderMap, extractPlaceholders } from "@/lib/placeholders";
import type { ManualSection, Client } from "@/lib/schemas";

interface ManualContentProps {
  section: ManualSection;
  client: Client;
  manualId: string;
  overrides: Record<string, string>;
  onSectionUpdate: (sectionId: string, content: string) => void;
}

export function ManualContent({
  section,
  client,
  manualId,
  overrides,
  onSectionUpdate,
}: ManualContentProps) {
  const baseMap = useMemo(() => buildPlaceholderMap(client), [client]);
  const resolvedMap = useMemo(() => ({ ...baseMap, ...overrides }), [baseMap, overrides]);

  // Render content: replace tokens with highlighted spans
  const renderedHtml = useMemo(() => {
    return section.content.replace(
      /\{\{([A-Z0-9_]+)\}\}/g,
      (match, key: string) => {
        const value = resolvedMap[key];
        if (value) {
          return `<mark class="placeholder-token-resolved" title="${key}">${value}</mark>`;
        }
        return `<mark class="placeholder-token" title="Platzhalter: ${key}">${match}</mark>`;
      }
    );
  }, [section.content, resolvedMap]);

  const tokens = extractPlaceholders(section.content);
  const unresolvedCount = tokens.filter((k) => !resolvedMap[k]).length;

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Section header */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-8 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <span className="text-sm font-mono text-gray-400">{section.chapterNumber}</span>
          <h2 className="font-semibold text-gray-900">{section.title}</h2>
          {section.aiGenerated && <Badge variant="green">KI-generiert</Badge>}
          {unresolvedCount > 0 && (
            <Badge variant="orange">{unresolvedCount} Platzhalter offen</Badge>
          )}
        </div>
        <AiGenerateButton
          section={section}
          client={client}
          manualId={manualId}
          onSuccess={(id, content) => onSectionUpdate(id, content)}
        />
      </div>

      {/* Content */}
      <div
        className="px-8 py-6 prose prose-sm max-w-none text-gray-800"
        dangerouslySetInnerHTML={{ __html: renderedHtml.replace(/\n/g, "<br/>") }}
      />
    </div>
  );
}
