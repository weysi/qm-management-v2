"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { RotateCcw, Clock, User, Bot, Server } from "lucide-react";

interface VersionMeta {
  id: string;
  label: string;
  createdAt: string;
  createdBy: "user" | "ai_operation" | "system";
  pageCount: number;
  hasDocx: boolean;
}

interface VersionHistoryPanelProps {
  versions: VersionMeta[];
  isLoading: boolean;
  onRestore: (versionId: string) => void;
  onCreateSnapshot: () => void;
  isRestoring: boolean;
  isCreating: boolean;
}

const CREATOR_ICONS = {
  user: <User className="h-3 w-3" />,
  ai_operation: <Bot className="h-3 w-3" />,
  system: <Server className="h-3 w-3" />,
};

const CREATOR_LABELS = {
  user: "Benutzer",
  ai_operation: "KI",
  system: "System",
};

export function VersionHistoryPanel({
  versions,
  isLoading,
  onRestore,
  onCreateSnapshot,
  isRestoring,
  isCreating,
}: VersionHistoryPanelProps) {
  return (
    <div className="p-3 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Versionen</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-xs"
          onClick={onCreateSnapshot}
          disabled={isCreating}
        >
          {isCreating ? (
            <Spinner className="h-3 w-3" />
          ) : (
            "Snapshot"
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner className="h-4 w-4" />
        </div>
      ) : versions.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          Keine Versionen vorhanden
        </p>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {versions.map((v) => (
            <div
              key={v.id}
              className="border rounded p-2 space-y-1 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium leading-tight">{v.label}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 shrink-0"
                  onClick={() => onRestore(v.id)}
                  disabled={isRestoring}
                  title="Version wiederherstellen"
                >
                  {isRestoring ? (
                    <Spinner className="h-3 w-3" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[9px] px-1 h-4 flex items-center gap-0.5">
                  {CREATOR_ICONS[v.createdBy]}
                  {CREATOR_LABELS[v.createdBy]}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(v.createdAt).toLocaleString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
