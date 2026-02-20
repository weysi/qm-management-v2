"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ReferenceFilePreview } from "./ReferenceFilePreview";
import { formatDate } from "@/lib/utils";
import type { ReferenceFile } from "@/lib/schemas";

interface ReferenceFileListProps {
  files: ReferenceFile[];
}

export function ReferenceFileList({ files }: ReferenceFileListProps) {
  const [selected, setSelected] = useState<ReferenceFile | null>(files[0] ?? null);

  if (files.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>Noch keine Referenzdokumente vorhanden.</p>
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-full">
      {/* List */}
      <div className="w-80 shrink-0 space-y-2">
        {files.map((f) => (
          <Card
            key={f.id}
            className={`cursor-pointer transition-shadow hover:shadow-md ${
              selected?.id === f.id ? "ring-2 ring-brand-500" : ""
            }`}
          >
            <button
              className="w-full text-left p-4"
              onClick={() => setSelected(f)}
            >
              <code className="text-xs font-mono text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">
                {f.code}
              </code>
              <p className="font-medium text-sm text-gray-900 mt-2">{f.title}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {f.linkedChapters.map((ch) => (
                  <Badge key={ch} variant="gray">
                    Kap. {ch}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">{formatDate(f.generatedAt)}</p>
            </button>
          </Card>
        ))}
      </div>

      {/* Preview */}
      <div className="flex-1">
        {selected && <ReferenceFilePreview file={selected} />}
      </div>
    </div>
  );
}
