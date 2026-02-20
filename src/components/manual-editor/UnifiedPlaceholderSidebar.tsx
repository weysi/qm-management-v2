"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { buildPlaceholderMap, extractPlaceholders } from "@/lib/placeholders";
import type { Client, Manual, TemplateFileMetadata } from "@/lib/schemas";

interface UnifiedPlaceholderSidebarProps {
  manual: Manual;
  templateFiles: TemplateFileMetadata[];
  activeTemplateId: string | null;
  activeTemplatePlaceholders: string[];
  client: Client;
  globalOverrides: Record<string, string>;
  onGlobalOverrideChange: (key: string, value: string) => void;
  fileOverridesByFile: Record<string, Record<string, string>>;
  onFileOverrideChange: (fileId: string, key: string, value: string) => void;
}

export function UnifiedPlaceholderSidebar({
  manual,
  templateFiles,
  activeTemplateId,
  activeTemplatePlaceholders,
  client,
  globalOverrides,
  onGlobalOverrideChange,
  fileOverridesByFile,
  onFileOverrideChange,
}: UnifiedPlaceholderSidebarProps) {
  const allTokens = useMemo(() => {
    const seen = new Set<string>();

    manual.sections.forEach((section) => {
      extractPlaceholders(section.content).forEach((token) => seen.add(token));
    });

    templateFiles.forEach((file) => {
      file.placeholders.forEach((token) => seen.add(token));
    });

    return Array.from(seen).sort();
  }, [manual.sections, templateFiles]);

  const baseMap = useMemo(() => buildPlaceholderMap(client), [client]);
  const globalResolvedMap = { ...baseMap, ...globalOverrides };

  const globalResolvedCount = allTokens.filter((token) => {
    const value = globalResolvedMap[token];
    return value !== undefined && value.trim() !== "";
  }).length;

  const activeFileOverrides = activeTemplateId
    ? fileOverridesByFile[activeTemplateId] ?? {}
    : {};

  return (
    <aside className="w-96 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
      <div className="px-4 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900 text-sm">Platzhalter & Keys</h3>
        <div className="flex gap-2 mt-2">
          <Badge variant="green">{globalResolvedCount} global gesetzt</Badge>
          <Badge variant="orange">{allTokens.length - globalResolvedCount} global offen</Badge>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        <div>
          <p className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wide bg-gray-50">
            Globale Werte
          </p>
          {allTokens.length === 0 ? (
            <p className="px-4 py-4 text-xs text-gray-500">Keine Platzhalter gefunden.</p>
          ) : (
            allTokens.map((token) => (
              <div key={`global-${token}`} className="px-4 py-3">
                <code className="text-xs font-mono text-gray-500 break-all">{`{{${token}}}`}</code>
                <Input
                  className="mt-2 h-8 text-sm"
                  value={globalResolvedMap[token] ?? ""}
                  onChange={(event) => onGlobalOverrideChange(token, event.target.value)}
                />
              </div>
            ))
          )}
        </div>

        {activeTemplateId && (
          <div>
            <p className="px-4 py-2 text-xs font-semibold text-blue-600 uppercase tracking-wide bg-blue-50">
              Datei-Overrides ({activeTemplateId.slice(0, 8)}...)
            </p>
            {activeTemplatePlaceholders.length === 0 ? (
              <p className="px-4 py-4 text-xs text-gray-500">
                Diese Datei enthält keine Platzhalter.
              </p>
            ) : (
              activeTemplatePlaceholders.map((token) => (
                <div key={`file-${token}`} className="px-4 py-3">
                  <code className="text-xs font-mono text-gray-500 break-all">{`{{${token}}}`}</code>
                  <Input
                    className="mt-2 h-8 text-sm"
                    value={activeFileOverrides[token] ?? ""}
                    onChange={(event) =>
                      onFileOverrideChange(activeTemplateId, token, event.target.value)
                    }
                    placeholder={globalResolvedMap[token] ?? "leer"}
                  />
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
