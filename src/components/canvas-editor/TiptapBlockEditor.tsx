"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useCallback } from "react";
import type { ParagraphBlock, TextRun } from "@/lib/schemas/canvas-model.schema";

interface TiptapBlockEditorProps {
  block: ParagraphBlock;
  onChangeText: (blockId: string, runId: string, text: string) => void;
  onBlur?: () => void;
  className?: string;
}

/**
 * Inline Tiptap rich-text editor for a single paragraph block.
 * Maps Tiptap document updates back to run-level text changes.
 * Strips markdown formatting (preserveStyles guardrail).
 */
export function TiptapBlockEditor({
  block,
  onChangeText,
  onBlur,
  className,
}: TiptapBlockEditorProps) {
  // Flatten all text runs into a single string for the editor
  const currentText = block.runs
    .filter((r): r is TextRun => r.type === "text")
    .map((r) => r.text)
    .join("");

  const handleUpdate = useCallback(
    (plainText: string) => {
      // Distribute updated text back to runs (map to first text run for simplicity)
      const textRuns = block.runs.filter((r): r is TextRun => r.type === "text");
      if (textRuns.length === 0) return;

      // Update all text through the first text run (the reducer handles distribution)
      onChangeText(block.id, textRuns[0].id, plainText);
    },
    [block.id, block.runs, onChangeText]
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Disable block-level extensions — we only want inline text editing
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: "Text hier eingeben...",
      }),
    ],
    content: currentText,
    onUpdate({ editor }) {
      // Get plain text (no markdown) to enforce preserveStyles
      const text = editor.getText();
      handleUpdate(text);
    },
    onBlur() {
      onBlur?.();
    },
    editorProps: {
      attributes: {
        class: "outline-none min-h-[1.5em] w-full",
        spellcheck: "true",
        lang: "de",
      },
    },
  });

  // Sync content when block changes externally (e.g. AI rewrite)
  useEffect(() => {
    if (!editor) return;
    const editorText = editor.getText();
    if (editorText !== currentText) {
      editor.commands.setContent(currentText, { emitUpdate: false, parseOptions: { preserveWhitespace: "full" } });
    }
  }, [editor, currentText]);

  // Render placeholder tokens as styled spans
  // (MVP: render as plain text; v2 adds custom extension for chip rendering)
  return (
    <div className={className}>
      <EditorContent editor={editor} />
    </div>
  );
}
