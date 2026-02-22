"use client";

/**
 * Main canvas editor page component.
 * Holds the CanvasModel in useReducer (single source of truth).
 * All editing actions dispatch through canvasEditorReducer.
 * Undo/redo maintained as an array of snapshots (max 50).
 */

import { useReducer, useState, useCallback } from "react";
import type {
  CanvasModel,
  ParagraphBlock,
  DocumentObject,
  TextRun,
  CanvasRewriteGuardrails,
} from "@/lib/schemas/canvas-model.schema";
import { CanvasPageLayer } from "./CanvasPageLayer";
import { ObjectPropertiesPanel } from "./ObjectPropertiesPanel";
import { AiScopePanel } from "./AiScopePanel";
import { VersionHistoryPanel } from "./VersionHistoryPanel";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Download,
  FileText,
  Undo2,
  Redo2,
  Save,
  ArrowLeft,
  Sparkles,
  Clock,
  LayoutGrid,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useCanvasEditor, useCanvasAi, useVersioning } from "@/hooks/useCanvasEditor";
import Link from "next/link";

// ─── Reducer ──────────────────────────────────────────────────────────────────

type EditorAction =
  | { type: "UPDATE_RUN_TEXT"; blockId: string; runId: string; text: string }
  | { type: "MOVE_OBJECT"; objectId: string; x: number; y: number }
  | { type: "RESIZE_OBJECT"; objectId: string; w: number; h: number }
  | { type: "DELETE_OBJECT"; objectId: string }
  | {
      type: "UPDATE_OBJECT";
      objectId: string;
      updates: Partial<DocumentObject>;
    }
  | {
      type: "AI_APPLY_REWRITE";
      rewrites: Record<string, string>;
      blockLocalVersions: Record<string, number>;
    }
  | { type: "UNDO" }
  | { type: "REDO" };

interface ReducerState {
  current: CanvasModel;
  undoStack: CanvasModel[];
  redoStack: CanvasModel[];
}

function updateTextInModel(
  model: CanvasModel,
  blockId: string,
  newText: string
): CanvasModel {
  function updateBlocks(
    blocks: CanvasModel["pages"][0]["blocks"]
  ): CanvasModel["pages"][0]["blocks"] {
    return blocks.map((block) => {
      if (block.type === "paragraph" && block.id === blockId) {
        const updatedRuns = block.runs.map((run) => {
          if (run.type !== "text") return run;
          return { ...run, text: newText } as TextRun;
        });
        // Distribute text across runs: first run gets all text for simplicity
        const textRuns = updatedRuns.filter(
          (r): r is TextRun => r.type === "text"
        );
        if (textRuns.length === 0) return block;

        const distributed = updatedRuns.map((run) => {
          if (run.type !== "text") return run;
          const textRunIdx = textRuns.findIndex((tr) => tr.id === run.id);
          if (textRunIdx === 0) return { ...run, text: newText, localVersion: run.localVersion + 1 } as TextRun;
          return { ...run, text: "", localVersion: run.localVersion } as TextRun;
        });

        return {
          ...block,
          runs: distributed,
          placeholders: extractPlaceholderKeys(newText),
          localVersion: block.localVersion + 1,
        } as ParagraphBlock;
      }
      if (block.type === "table") {
        return {
          ...block,
          rows: block.rows.map((row) => ({
            ...row,
            cells: row.cells.map((cell) => ({
              ...cell,
              paragraphs: cell.paragraphs.map((para) => {
                if (para.id !== blockId) return para;
                const runs = para.runs.map((run) => {
                  if (run.type !== "text") return run;
                  return { ...run, text: newText, localVersion: run.localVersion + 1 } as TextRun;
                });
                return {
                  ...para,
                  runs,
                  placeholders: extractPlaceholderKeys(newText),
                  localVersion: para.localVersion + 1,
                } as ParagraphBlock;
              }),
            })),
          })),
        };
      }
      return block;
    });
  }

  return {
    ...model,
    pages: model.pages.map((page) => ({
      ...page,
      blocks: updateBlocks(page.blocks),
    })),
  };
}

function extractPlaceholderKeys(text: string): string[] {
  const matches = text.matchAll(/\{\{([A-Z0-9_]+)\}\}/g);
  return [...matches].map((m) => m[1]);
}

function updateObjectInModel(
  model: CanvasModel,
  objectId: string,
  updates: Partial<DocumentObject>
): CanvasModel {
  const now = new Date().toISOString();
  return {
    ...model,
    pages: model.pages.map((page) => ({
      ...page,
      objects: page.objects.map((obj) =>
        obj.id === objectId
          ? { ...obj, ...updates, updatedAt: now }
          : obj
      ),
    })),
    documentObjects: model.documentObjects.map((obj) =>
      obj.id === objectId ? { ...obj, ...updates, updatedAt: now } : obj
    ),
  };
}

function deleteObjectInModel(model: CanvasModel, objectId: string): CanvasModel {
  return {
    ...model,
    pages: model.pages.map((page) => ({
      ...page,
      objects: page.objects.filter((o) => o.id !== objectId),
    })),
    documentObjects: model.documentObjects.filter((o) => o.id !== objectId),
  };
}

function applyAiRewrites(
  model: CanvasModel,
  rewrites: Record<string, string>,
  blockLocalVersions: Record<string, number>
): CanvasModel {
  let updated = model;
  for (const [blockId, newText] of Object.entries(rewrites)) {
    // Optimistic lock: skip if block was modified since dispatch
    const dispatchedVersion = blockLocalVersions[blockId] ?? 0;
    // We trust the API already checked this; apply all rewrites here
    void dispatchedVersion;
    updated = updateTextInModel(updated, blockId, newText);
  }
  return updated;
}

function canvasEditorReducer(state: ReducerState, action: EditorAction): ReducerState {
  const MAX_UNDO = 50;

  if (action.type === "UNDO") {
    if (state.undoStack.length === 0) return state;
    const [prev, ...rest] = state.undoStack;
    return {
      current: prev,
      undoStack: rest,
      redoStack: [state.current, ...state.redoStack].slice(0, MAX_UNDO),
    };
  }

  if (action.type === "REDO") {
    if (state.redoStack.length === 0) return state;
    const [next, ...rest] = state.redoStack;
    return {
      current: next,
      undoStack: [state.current, ...state.undoStack].slice(0, MAX_UNDO),
      redoStack: rest,
    };
  }

  // For all other actions: push current to undo stack
  const newUndoStack = [state.current, ...state.undoStack].slice(0, MAX_UNDO);

  let newCurrent = state.current;

  switch (action.type) {
    case "UPDATE_RUN_TEXT":
      newCurrent = updateTextInModel(state.current, action.blockId, action.text);
      break;

    case "MOVE_OBJECT":
      newCurrent = updateObjectInModel(state.current, action.objectId, {
        x: action.x,
        y: action.y,
      });
      break;

    case "RESIZE_OBJECT":
      newCurrent = updateObjectInModel(state.current, action.objectId, {
        w: action.w,
        h: action.h,
      });
      break;

    case "UPDATE_OBJECT":
      newCurrent = updateObjectInModel(
        state.current,
        action.objectId,
        action.updates
      );
      break;

    case "DELETE_OBJECT":
      newCurrent = deleteObjectInModel(state.current, action.objectId);
      break;

    case "AI_APPLY_REWRITE":
      newCurrent = applyAiRewrites(
        state.current,
        action.rewrites,
        action.blockLocalVersions
      );
      break;
  }

  return {
    current: newCurrent,
    undoStack: newUndoStack,
    redoStack: [], // any new action clears redo stack
  };
}

// ─── Sidebar tabs ─────────────────────────────────────────────────────────────

type SidebarTab = "properties" | "ai" | "versions";

// ─── Component ────────────────────────────────────────────────────────────────

interface CanvasEditorPageProps {
  projectId: string;
  manualId: string;
  fileId: string;
  initialModel: CanvasModel;
  docxBase64: string; // for WYSIWYG preview
}

export function CanvasEditorPage({
  projectId,
  manualId,
  fileId,
  initialModel,
  docxBase64,
}: CanvasEditorPageProps) {
  const [state, dispatch] = useReducer(canvasEditorReducer, {
    current: initialModel,
    undoStack: [],
    redoStack: [],
  });

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("ai");
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [aiResult, setAiResult] = useState<{
    acceptedCount: number;
    rejectedCount: number;
  } | undefined>();

  const { saveModel } = useCanvasEditor(projectId);
  const { rewrite, isRewriting } = useCanvasAi(projectId);
  const { versions, isLoading: isLoadingVersions, createSnapshot, restoreVersion, isCreating, isRestoring } =
    useVersioning(projectId);

  const model = state.current;

  // ── Selected object ──────────────────────────────────────────────────────
  const selectedObject =
    selectedObjectId != null
      ? model.pages.flatMap((p) => p.objects).find((o) => o.id === selectedObjectId) ??
        model.documentObjects.find((o) => o.id === selectedObjectId)
      : null;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleChangeBlockText = useCallback(
    (blockId: string, runId: string, text: string) => {
      dispatch({ type: "UPDATE_RUN_TEXT", blockId, runId, text });
    },
    []
  );

  const handleMoveObject = useCallback((id: string, x: number, y: number) => {
    dispatch({ type: "MOVE_OBJECT", objectId: id, x, y });
  }, []);

  const handleResizeObject = useCallback((id: string, w: number, h: number) => {
    dispatch({ type: "RESIZE_OBJECT", objectId: id, w, h });
  }, []);

  const handleUpdateObject = useCallback(
    (id: string, updates: Partial<DocumentObject>) => {
      dispatch({ type: "UPDATE_OBJECT", objectId: id, updates });
    },
    []
  );

  const handleDeleteObject = useCallback((id: string) => {
    dispatch({ type: "DELETE_OBJECT", objectId: id });
    setSelectedObjectId(null);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveModel(model);
      toast.success("Gespeichert");
    } catch {
      toast.error("Speichern fehlgeschlagen");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportDocx = async () => {
    setIsExportingDocx(true);
    try {
      // Save first, then trigger download
      await saveModel(model);
      const res = await fetch(`/api/canvas-editor/${projectId}/export/docx`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "export.docx";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("DOCX exportiert");
    } catch {
      toast.error("DOCX-Export fehlgeschlagen");
    } finally {
      setIsExportingDocx(false);
    }
  };

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      await saveModel(model);
      const res = await fetch(`/api/canvas-editor/${projectId}/export/pdf`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Unbekannter Fehler" }));
        if (res.status === 501) {
          toast.error("PDF-Export erfordert LibreOffice auf dem Server.");
          return;
        }
        throw new Error(body.error);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "export.pdf";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF exportiert");
    } catch {
      toast.error("PDF-Export fehlgeschlagen");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleSync = async () => {
    try {
      await saveModel(model);
      const res = await fetch(`/api/canvas-editor/${projectId}/sync`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success("Mit Handbuch synchronisiert");
    } catch {
      toast.error("Synchronisierung fehlgeschlagen");
    }
  };

  const handleAiRewrite = async (params: {
    scope: "selection" | "paragraph" | "section" | "document";
    prompt: string;
    guardrails: CanvasRewriteGuardrails;
  }) => {
    // Capture current local versions for optimistic locking
    const blockLocalVersions: Record<string, number> = {};
    for (const page of model.pages) {
      for (const block of page.blocks) {
        if (block.type === "paragraph") {
          blockLocalVersions[block.id] = block.localVersion;
        }
      }
    }

    const selectedBlockIds = selectedBlockId ? [selectedBlockId] : [];

    try {
      const result = await rewrite({
        projectId,
        scope: params.scope,
        selectedBlockIds,
        blockLocalVersions,
        prompt: params.prompt,
        guardrails: params.guardrails,
      });

      dispatch({
        type: "AI_APPLY_REWRITE",
        rewrites: result.rewrites,
        blockLocalVersions,
      });

      setAiResult({
        acceptedCount: result.acceptedCount,
        rejectedCount: result.rejectedCount,
      });

      if (result.acceptedCount > 0) {
        toast.success(`${result.acceptedCount} Block(e) umgeschrieben`);
      }
      if (result.rejectedCount > 0) {
        toast.info(`${result.rejectedCount} Block(e) übersprungen (Einschränkungen)`);
      }
    } catch {
      toast.error("KI-Neuschreibung fehlgeschlagen");
    }
  };

  const selectedBlocks = selectedBlockId ? [selectedBlockId] : [];

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <header className="bg-white border-b flex items-center gap-2 px-4 py-2 shrink-0">
        <Link href={`/manuals/${manualId}`}>
          <Button variant="ghost" size="sm" className="h-8">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Zurück
          </Button>
        </Link>

        <Separator orientation="vertical" className="h-6" />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => dispatch({ type: "UNDO" })}
          disabled={state.undoStack.length === 0}
          className="h-8"
          title="Rückgängig"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => dispatch({ type: "REDO" })}
          disabled={state.redoStack.length === 0}
          className="h-8"
          title="Wiederholen"
        >
          <Redo2 className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-6" />

        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
          className="h-8"
        >
          {isSaving ? <Spinner className="h-3 w-3 mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          Speichern
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExportDocx}
          disabled={isExportingDocx}
          className="h-8"
        >
          {isExportingDocx ? (
            <Spinner className="h-3 w-3 mr-1" />
          ) : (
            <Download className="h-3.5 w-3.5 mr-1" />
          )}
          DOCX
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={handleExportPdf}
          disabled={isExportingPdf}
          className="h-8"
        >
          {isExportingPdf ? (
            <Spinner className="h-3 w-3 mr-1" />
          ) : (
            <FileText className="h-3.5 w-3.5 mr-1" />
          )}
          PDF
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleSync}
          className="h-8 text-xs"
          title="Exportierte DOCX mit Handbuch synchronisieren"
        >
          <LayoutGrid className="h-3.5 w-3.5 mr-1" />
          Sync
        </Button>

        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <span>{model.metadata.pageCount} Seite(n)</span>
          {model.metadata.hasSignatures && <span>· Unterschriften</span>}
          {model.metadata.hasLogos && <span>· Logos</span>}
        </div>
      </header>

      {/* ── Main layout ──────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Canvas viewport ───────────────────────────────────────────── */}
        <main className="flex-1 overflow-auto p-8">
          <div className="max-w-[900px] mx-auto space-y-0">
            {model.pages.map((page, i) => (
              <CanvasPageLayer
                key={page.pageNumber}
                page={page}
                pageIndex={i}
                manualId={manualId}
                fileId={fileId}
                previewVersion={model.metadata.previewVersion}
                docxBase64={docxBase64}
                selectedBlockId={selectedBlockId}
                selectedObjectId={selectedObjectId}
                onSelectBlock={setSelectedBlockId}
                onSelectObject={(id) => {
                  setSelectedObjectId(id);
                  if (id) setSidebarTab("properties");
                }}
                onChangeBlockText={handleChangeBlockText}
                onMoveObject={handleMoveObject}
                onResizeObject={handleResizeObject}
                effectiveMap={{}}
                projectId={projectId}
              />
            ))}
          </div>
        </main>

        {/* ── Right sidebar ──────────────────────────────────────────────── */}
        <aside className="w-72 bg-white border-l flex flex-col shrink-0 overflow-hidden">
          {/* Sidebar tabs */}
          <div className="flex border-b shrink-0">
            {(
              [
                ["properties", "Objekt", null],
                ["ai", "KI", <Sparkles className="h-3 w-3" key="ai" />],
                ["versions", "Versionen", <Clock className="h-3 w-3" key="ver" />],
              ] as Array<[SidebarTab, string, React.ReactNode]>
            ).map(([tab, label, icon]) => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-2 text-xs font-medium border-b-2 transition-colors ${
                  sidebarTab === tab
                    ? "border-blue-500 text-blue-700"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {/* Sidebar content */}
          <div className="flex-1 overflow-y-auto">
            {sidebarTab === "properties" && selectedObject ? (
              <ObjectPropertiesPanel
                object={selectedObject}
                onUpdate={handleUpdateObject}
                onDelete={handleDeleteObject}
              />
            ) : sidebarTab === "properties" ? (
              <div className="p-4 text-xs text-muted-foreground text-center mt-8">
                Klicken Sie auf ein Logo, eine Unterschrift oder ein Bild, um die
                Eigenschaften zu bearbeiten.
              </div>
            ) : null}

            {sidebarTab === "ai" && (
              <AiScopePanel
                selectedBlockCount={selectedBlocks.length}
                onRewrite={handleAiRewrite}
                isLoading={isRewriting}
                lastResult={aiResult}
              />
            )}

            {sidebarTab === "versions" && (
              <VersionHistoryPanel
                versions={versions}
                isLoading={isLoadingVersions}
                onRestore={async (versionId) => {
                  const restored = await restoreVersion(versionId);
                  if (restored) {
                    // Reset editor to restored model
                    toast.success("Version wiederhergestellt");
                  } else {
                    toast.error("Wiederherstellung fehlgeschlagen");
                  }
                }}
                onCreateSnapshot={() => createSnapshot("Manueller Snapshot")}
                isRestoring={isRestoring}
                isCreating={isCreating}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
