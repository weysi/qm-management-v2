import { useMutation, useQueryClient } from '@tanstack/react-query';
import { renderDocument, type RenderDocumentResponse } from '@/lib/documents';

export function useRenderDocument(handbookId: string) {
  const qc = useQueryClient();
  return useMutation<
    RenderDocumentResponse,
    Error,
    { documentId: string; variables: Record<string, string>; assetOverrides?: Record<string, string> }
  >({
    mutationFn: payload => renderDocument(payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['documents', handbookId] });
      qc.invalidateQueries({ queryKey: ['documents', 'detail', variables.documentId] });
    },
  });
}
