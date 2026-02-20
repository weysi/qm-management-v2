import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { ReferenceFile } from "@/lib/schemas";

interface ReferenceFilePreviewProps {
  file: ReferenceFile;
}

export function ReferenceFilePreview({ file }: ReferenceFilePreviewProps) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <code className="text-sm font-mono text-primary bg-primary/10 px-2 py-0.5 rounded">
              {file.code}
            </code>
            <h2 className="text-lg font-semibold text-gray-900 mt-1">{file.title}</h2>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-1">
              {file.linkedChapters.map((ch) => (
                <Badge key={ch} variant="blue">
                  Kap. {ch}
                </Badge>
              ))}
            </div>
            <span className="text-xs text-gray-400">{formatDate(file.generatedAt)}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
          {file.content}
        </div>
      </CardContent>
    </Card>
  );
}
