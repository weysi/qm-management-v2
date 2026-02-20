"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { buildPlaceholderMap, extractPlaceholders } from "@/lib/placeholders";
import type { Manual, Client } from "@/lib/schemas";

interface PlaceholderSidebarProps {
  manual: Manual;
  client: Client;
  overrides: Record<string, string>;
  onOverrideChange: (key: string, value: string) => void;
}

export function PlaceholderSidebar({
  manual,
  client,
  overrides,
  onOverrideChange,
}: PlaceholderSidebarProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");

  // Collect all unique tokens across all sections
  const allTokens = useMemo(() => {
    const seen = new Set<string>();
    manual.sections.forEach((s) => {
      extractPlaceholders(s.content).forEach((t) => seen.add(t));
    });
    return Array.from(seen).sort();
  }, [manual.sections]);

  // Base values from client
  const baseMap = useMemo(() => {
    return buildPlaceholderMap(client) as Record<string, string>;
  }, [client]);

  const resolvedMap = { ...baseMap, ...overrides };

  const resolved = allTokens.filter((k) => resolvedMap[k]);
  const unresolved = allTokens.filter((k) => !resolvedMap[k]);

  function startEdit(key: string) {
    setEditingKey(key);
    setDraftValue(resolvedMap[key] ?? "");
  }

  function commitEdit(key: string) {
    onOverrideChange(key, draftValue);
    setEditingKey(null);
  }

  return (
    <aside className="w-80 border-l border-gray-200 bg-white flex flex-col overflow-hidden">
      <div className="px-4 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900 text-sm">Platzhalter</h3>
        <div className="flex gap-2 mt-2">
          <Badge variant="green">{resolved.length} aufgelöst</Badge>
          <Badge variant="orange">{unresolved.length} offen</Badge>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
        {unresolved.length > 0 && (
          <div>
            <p className="px-4 py-2 text-xs font-semibold text-orange-600 uppercase tracking-wide bg-orange-50">
              Offene Platzhalter
            </p>
            {unresolved.map((key) => (
              <PlaceholderRow
                key={key}
                tokenKey={key}
                value=""
                status="unresolved"
                editing={editingKey === key}
                draftValue={draftValue}
                onEdit={() => startEdit(key)}
                onDraftChange={setDraftValue}
                onCommit={() => commitEdit(key)}
                onCancel={() => setEditingKey(null)}
              />
            ))}
          </div>
        )}

        {resolved.length > 0 && (
          <div>
            <p className="px-4 py-2 text-xs font-semibold text-green-600 uppercase tracking-wide bg-green-50">
              Aufgelöste Platzhalter
            </p>
            {resolved.map((key) => (
              <PlaceholderRow
                key={key}
                tokenKey={key}
                value={resolvedMap[key]}
                status="resolved"
                editing={editingKey === key}
                draftValue={draftValue}
                onEdit={() => startEdit(key)}
                onDraftChange={setDraftValue}
                onCommit={() => commitEdit(key)}
                onCancel={() => setEditingKey(null)}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

interface PlaceholderRowProps {
  tokenKey: string;
  value: string;
  status: "resolved" | "unresolved";
  editing: boolean;
  draftValue: string;
  onEdit: () => void;
  onDraftChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

function PlaceholderRow({
  tokenKey,
  value,
  status,
  editing,
  draftValue,
  onEdit,
  onDraftChange,
  onCommit,
  onCancel,
}: PlaceholderRowProps) {
  return (
    <div className="px-4 py-3 hover:bg-gray-50">
      <div className="flex items-start justify-between gap-2">
        <code className="text-xs font-mono text-gray-500 break-all">{`{{${tokenKey}}}`}</code>
        {!editing && (
          <button
            onClick={onEdit}
            className="text-xs text-brand-600 hover:underline shrink-0"
          >
            Bearbeiten
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <Input
            value={draftValue}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommit();
              if (e.key === "Escape") onCancel();
            }}
            autoFocus
            className="text-sm py-1"
          />
          <div className="flex gap-1">
            <Button size="sm" onClick={onCommit}>
              Speichern
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <p
          className={`text-sm mt-0.5 truncate ${
            status === "resolved" ? "text-gray-800" : "text-orange-500 italic"
          }`}
        >
          {value || "—"}
        </p>
      )}
    </div>
  );
}
