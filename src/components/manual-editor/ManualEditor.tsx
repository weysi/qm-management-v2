"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAiGenerate } from "@/hooks/useAiGenerate";
import { useUpdateManualSection } from "@/hooks/useManual";
import { useTemplateFiles, useUploadTemplateFiles } from "@/hooks/useTemplateFiles";
import { ManualContent } from "./ManualContent";
import { TemplateCanvasWorkspace } from "./TemplateCanvasWorkspace";
import { UnifiedNavigator } from "./UnifiedNavigator";
import { UnifiedPlaceholderSidebar } from "./UnifiedPlaceholderSidebar";
import type { Client, Manual } from "@/lib/schemas";

interface ManualEditorProps {
  manual: Manual;
  client: Client;
}

type ActiveItem =
  | { kind: "section"; id: string }
  | { kind: "template"; id: string };

export function ManualEditor({ manual, client }: ManualEditorProps) {
  const [globalOverrides, setGlobalOverrides] = useState<Record<string, string>>({});
  const [fileOverridesByFile, setFileOverridesByFile] = useState<
    Record<string, Record<string, string>>
  >({});
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
  const [localSections, setLocalSections] = useState(manual.sections);
  const [activeItem, setActiveItem] = useState<ActiveItem>(() => ({
    kind: "section",
    id: manual.sections[0]?.id ?? "",
  }));

  const { data: templateFiles = [] } = useTemplateFiles(manual.id);
  const { mutate: uploadTemplateFiles, isPending: isUploading } =
    useUploadTemplateFiles(manual.id);

  const { mutate: updateSection } = useUpdateManualSection(manual.id);
  const { mutate: generateAi, isPending: isGeneratingAll } = useAiGenerate(manual.id);

  useEffect(() => {
    setLocalSections(manual.sections);

    setActiveItem((current) => {
      if (current.kind === "section") {
        const exists = manual.sections.some((section) => section.id === current.id);
        if (exists) return current;
      }

      return {
        kind: "section",
        id: manual.sections[0]?.id ?? "",
      };
    });
  }, [manual.sections]);

  useEffect(() => {
    const validIds = new Set(templateFiles.map((file) => file.id));

    setSelectedTemplateIds((current) => {
      const next = new Set<string>();
      current.forEach((id) => {
        if (validIds.has(id)) next.add(id);
      });
      return next;
    });

    setActiveItem((current) => {
      if (current.kind !== "template") return current;

      const exists = templateFiles.some((file) => file.id === current.id);
      if (exists) return current;

      return {
        kind: "section",
        id: localSections[0]?.id ?? "",
      };
    });
  }, [templateFiles, localSections]);

  const activeSection =
    activeItem.kind === "section"
      ? localSections.find((section) => section.id === activeItem.id)
      : undefined;

  const activeTemplate =
    activeItem.kind === "template"
      ? templateFiles.find((file) => file.id === activeItem.id)
      : undefined;

  const activeTemplatePlaceholders = useMemo(() => {
    return activeTemplate?.placeholders ?? [];
  }, [activeTemplate]);

  const handleGlobalOverrideChange = useCallback((key: string, value: string) => {
    setGlobalOverrides((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleFileOverrideChange = useCallback(
    (fileId: string, key: string, value: string) => {
      setFileOverridesByFile((prev) => ({
        ...prev,
        [fileId]: {
          ...(prev[fileId] ?? {}),
          [key]: value,
        },
      }));
    },
    []
  );

  const handleSectionUpdate = useCallback(
    (sectionId: string, content: string) => {
      setLocalSections((prev) =>
        prev.map((section) =>
          section.id === sectionId
            ? { ...section, content, aiGenerated: true }
            : section
        )
      );
      updateSection({ sectionId, content });
    },
    [updateSection]
  );

  function handleFillAllSections() {
    const pending = localSections.filter((section) => !section.aiGenerated);

    pending.forEach((section) => {
      generateAi(
        {
          sectionId: section.id,
          clientData: client,
          sectionContent: section.content,
          chapterNumber: section.chapterNumber,
          chapterTitle: section.title,
        },
        {
          onSuccess: (data) => {
            handleSectionUpdate(data.sectionId, data.content);
          },
        }
      );
    });
  }

  function handleUploadTemplateFolder(files: File[], paths: string[]) {
    uploadTemplateFiles(
      { files, paths },
      {
        onSuccess: (result) => {
          toast.success(`${result.files.length} Datei(en) hochgeladen.`);

          if (result.rejected.length > 0) {
            toast.warning(`${result.rejected.length} Datei(en) wurden abgelehnt.`);
          }

          if (result.files[0]) {
            setActiveItem({ kind: "template", id: result.files[0].id });
          }
        },
        onError: (error) => {
          toast.error(error.message);
        },
      }
    );
  }

  const aiDoneCount = localSections.filter((section) => section.aiGenerated).length;

  return (
    <div className="flex h-full overflow-hidden">
      <UnifiedNavigator
        sections={localSections}
        templateFiles={templateFiles}
        activeKind={activeItem.kind}
        activeId={activeItem.id}
        selectedTemplateIds={selectedTemplateIds}
        onSelectSection={(id) => setActiveItem({ kind: "section", id })}
        onSelectTemplate={(id) => setActiveItem({ kind: "template", id })}
        onToggleTemplateSelection={(id) => {
          setSelectedTemplateIds((current) => {
            const next = new Set(current);
            if (next.has(id)) {
              next.delete(id);
            } else {
              next.add(id);
            }
            return next;
          });
        }}
        onSelectAllTemplates={() =>
          setSelectedTemplateIds(new Set(templateFiles.map((file) => file.id)))
        }
        onClearTemplateSelection={() => setSelectedTemplateIds(new Set())}
        onUploadFolder={handleUploadTemplateFolder}
        uploadPending={isUploading}
      />

      <div className="flex flex-1 overflow-hidden">
        {activeSection ? (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="bg-primary/5 border-b border-primary/10 px-6 py-2 flex items-center justify-between">
              <p className="text-sm text-primary">
                {aiDoneCount}/{localSections.length} Kapitel KI-generiert
              </p>
              <Button
                size="sm"
                loading={isGeneratingAll}
                onClick={handleFillAllSections}
                disabled={aiDoneCount === localSections.length}
              >
                Alle Kapitel mit KI füllen
              </Button>
            </div>

            <ManualContent
              section={activeSection}
              client={client}
              manualId={manual.id}
              overrides={globalOverrides}
              onSectionUpdate={handleSectionUpdate}
            />
          </div>
        ) : activeTemplate ? (
          <TemplateCanvasWorkspace
            manualId={manual.id}
            client={client}
            file={activeTemplate}
            selectedFileIds={selectedTemplateIds}
            globalOverrides={globalOverrides}
            fileOverridesByFile={fileOverridesByFile}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
            Wähle ein Kapitel oder eine Datei aus.
          </div>
        )}

        <UnifiedPlaceholderSidebar
          manual={{ ...manual, sections: localSections }}
          templateFiles={templateFiles}
          activeTemplateId={activeTemplate?.id ?? null}
          activeTemplatePlaceholders={activeTemplatePlaceholders}
          client={client}
          globalOverrides={globalOverrides}
          onGlobalOverrideChange={handleGlobalOverrideChange}
          fileOverridesByFile={fileOverridesByFile}
          onFileOverrideChange={handleFileOverrideChange}
        />
      </div>
    </div>
  );
}
