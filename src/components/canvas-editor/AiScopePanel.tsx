"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import type { CanvasRewriteGuardrails } from "@/lib/schemas/canvas-model.schema";
import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";

interface AiScopePanelProps {
  selectedBlockCount: number;
  onRewrite: (params: {
    scope: "selection" | "paragraph" | "section" | "document";
    prompt: string;
    guardrails: CanvasRewriteGuardrails;
  }) => void;
  isLoading: boolean;
  lastResult?: {
    acceptedCount: number;
    rejectedCount: number;
  };
}

const DEFAULT_GUARDRAILS: CanvasRewriteGuardrails = {
  preserveStyles: true,
  preserveHeadersFooters: true,
  preserveTables: true,
  preservePlaceholders: true,
  preserveSignatures: true,
  maxTextLengthRatioChange: 1.5,
};

type Scope = "selection" | "paragraph" | "section" | "document";

const SCOPE_LABELS: Record<Scope, string> = {
  selection: "Auswahl",
  paragraph: "Absatz",
  section: "Abschnitt",
  document: "Dokument",
};

export function AiScopePanel({
  selectedBlockCount,
  onRewrite,
  isLoading,
  lastResult,
}: AiScopePanelProps) {
  const [scope, setScope] = useState<Scope>("selection");
  const [prompt, setPrompt] = useState("");
  const [guardrails, setGuardrails] = useState<CanvasRewriteGuardrails>(DEFAULT_GUARDRAILS);
  const [showGuardrails, setShowGuardrails] = useState(false);

  const toggleGuardrail = (key: keyof CanvasRewriteGuardrails) => {
    if (key === "maxTextLengthRatioChange") return;
    setGuardrails((g) => ({ ...g, [key]: !g[key] }));
  };

  const handleSubmit = () => {
    if (!prompt.trim()) return;
    onRewrite({ scope, prompt: prompt.trim(), guardrails });
  };

  return (
    <div className="p-3 space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-purple-500" />
        <span className="font-medium">KI-Neuschreibung</span>
      </div>

      {/* Scope selector */}
      <div>
        <Label className="text-xs text-muted-foreground">Umfang</Label>
        <div className="flex gap-1 mt-1 flex-wrap">
          {(Object.keys(SCOPE_LABELS) as Scope[]).map((s) => (
            <Button
              key={s}
              variant={scope === s ? "default" : "outline"}
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => setScope(s)}
            >
              {SCOPE_LABELS[s]}
              {s === "selection" && selectedBlockCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-1 text-[9px] h-4 px-1"
                >
                  {selectedBlockCount}
                </Badge>
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* Prompt */}
      <div>
        <Label className="text-xs text-muted-foreground">Anweisung</Label>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="z.B. Vereinfache den Text, behalte alle Fakten…"
          className="mt-1 text-xs resize-none"
          rows={3}
          disabled={isLoading}
        />
      </div>

      {/* Guardrails toggle */}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-xs w-full justify-between px-2"
        onClick={() => setShowGuardrails((v) => !v)}
      >
        Einschränkungen
        {showGuardrails ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </Button>

      {showGuardrails && (
        <div className="space-y-1.5 pl-1">
          {(
            [
              ["preserveStyles", "Formatierung erhalten"],
              ["preserveHeadersFooters", "Kopf-/Fußzeilen schützen"],
              ["preserveTables", "Tabellen schützen"],
              ["preservePlaceholders", "Platzhalter erhalten"],
              ["preserveSignatures", "Unterschriften schützen"],
            ] as Array<[keyof CanvasRewriteGuardrails, string]>
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={guardrails[key] as boolean}
                onChange={() => toggleGuardrail(key)}
                className="h-3 w-3"
              />
              <span className="text-xs">{label}</span>
            </label>
          ))}
        </div>
      )}

      <Button
        onClick={handleSubmit}
        disabled={isLoading || !prompt.trim()}
        size="sm"
        className="w-full"
      >
        {isLoading ? (
          <>
            <Spinner className="mr-2 h-3 w-3" />
            Schreibe um…
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-3 w-3" />
            Neuschreiben
          </>
        )}
      </Button>

      {lastResult && (
        <div className="flex gap-2 text-xs">
          <Badge variant="outline" className="text-green-700 border-green-300">
            {lastResult.acceptedCount} übernommen
          </Badge>
          {lastResult.rejectedCount > 0 && (
            <Badge variant="outline" className="text-orange-700 border-orange-300">
              {lastResult.rejectedCount} abgelehnt
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
