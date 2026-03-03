import { useMutation, useQueryClient } from '@tanstack/react-query';
import { rewriteDocument, type RewriteDocumentResponse } from '@/lib/documents';

export function useAiRewriteDocument(handbookId: string) {
  const qc = useQueryClient();
  return useMutation<
    RewriteDocumentResponse,
    Error,
    { documentId: string; instruction: string; targetVersion?: number }
  >({
    mutationFn: payload => rewriteDocument(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', handbookId] });
      qc.invalidateQueries({ queryKey: ['files-tree', handbookId] });
    },
  });
}
