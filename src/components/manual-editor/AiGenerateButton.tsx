"use client";

import { Button } from "@/components/ui/button";
import { useAiGenerate } from "@/hooks/useAiGenerate";
import type { ManualSection, Client } from "@/lib/schemas";

interface AiGenerateButtonProps {
  section: ManualSection;
  client: Client;
  manualId: string;
  onSuccess?: (sectionId: string, content: string) => void;
}

export function AiGenerateButton({
  section,
  client,
  manualId,
  onSuccess,
}: AiGenerateButtonProps) {
  const { mutate, isPending, error, reset } = useAiGenerate(manualId);

  function handleClick() {
    reset();
    mutate(
      {
        sectionId: section.id,
        clientData: client,
        sectionContent: section.content,
        chapterNumber: section.chapterNumber,
        chapterTitle: section.title,
      },
      {
        onSuccess: (data) => {
          onSuccess?.(data.sectionId, data.content);
        },
      }
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2">
        <span
          className="text-xs text-red-600 max-w-xs truncate"
          title={error.message}
        >
          {error.message}
        </span>
        <Button variant="ghost" size="sm" onClick={handleClick}>
          Wiederholen
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      loading={isPending}
      onClick={handleClick}
      title="Abschnitt mit KI füllen"
    >
      {section.aiGenerated ? (
        <>
          <svg className="w-3.5 h-3.5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          KI-generiert
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Mit KI füllen
        </>
      )}
    </Button>
  );
}
