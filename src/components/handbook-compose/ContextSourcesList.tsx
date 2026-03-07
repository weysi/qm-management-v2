import { Badge } from '@/components/ui/badge';

interface ContextSourcesListProps {
  trace?: {
    fallback_path?: string;
    file_context_used?: Record<string, unknown>;
    selected_references?: Array<{
      reference_document_title?: string | null;
      title?: string | null;
      estimated_tokens?: number | null;
    }>;
  } | null;
}

export function ContextSourcesList({ trace }: ContextSourcesListProps) {
  if (!trace) {
    return <p className="text-xs text-gray-500">Noch keine Kontextquellen verwendet.</p>;
  }

  const references = trace.selected_references ?? [];
  const strategy = trace.file_context_used?.strategy;

  return (
    <div className="space-y-2 text-xs text-gray-600">
      <div className="flex flex-wrap gap-2">
        <Badge variant="gray">Fallback: {trace.fallback_path ?? 'n/a'}</Badge>
        <Badge variant="gray">Dateikontext: {typeof strategy === 'string' ? strategy : 'aus'}</Badge>
      </div>
      {references.length > 0 ? (
        <ul className="space-y-1">
          {references.map((item, index) => (
            <li key={`${item.reference_document_title}-${index}`} className="rounded border border-gray-100 bg-gray-50 px-2 py-1">
              <strong>{item.reference_document_title ?? 'Referenz'}</strong>
              {item.title ? ` · ${item.title}` : ''}
              {typeof item.estimated_tokens === 'number' ? ` · ~${item.estimated_tokens} Tokens` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-500">Keine Referenzdateien verwendet.</p>
      )}
    </div>
  );
}
