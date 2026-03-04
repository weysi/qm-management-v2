import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteDocument,
  getDocument,
  listDocuments,
  uploadDocument,
  type UploadDocumentResponse,
} from '@/lib/documents';
import type { Document } from '@/lib/schemas';

const DOCUMENTS_KEY = 'documents';

export function useDocuments(handbookId: string) {
  return useQuery<Document[]>({
    queryKey: [DOCUMENTS_KEY, handbookId],
    queryFn: () => listDocuments(handbookId),
    enabled: Boolean(handbookId),
  });
}

export function useDocument(documentId: string) {
  return useQuery<Document>({
    queryKey: [DOCUMENTS_KEY, 'detail', documentId],
    queryFn: () => getDocument(documentId),
    enabled: Boolean(documentId),
  });
}

export function useUploadDocument(handbookId: string) {
  const qc = useQueryClient();
  return useMutation<UploadDocumentResponse, Error, { file: File; path?: string }>({
    mutationFn: ({ file, path }) => uploadDocument({ handbookId, file, path }),
    onSuccess: response => {
      qc.setQueryData<Document[]>([DOCUMENTS_KEY, handbookId], prev => {
        const existing = Array.isArray(prev) ? prev : [];
        if (response.kind === 'file') {
          if (existing.some(item => item.id === response.document.id)) {
            return existing;
          }
          return [...existing, response.document];
        }

        const byId = new Map(existing.map(item => [item.id, item]));
        for (const item of response.documents) {
          byId.set(item.id, item);
        }
        return Array.from(byId.values());
      });
      qc.invalidateQueries({ queryKey: [DOCUMENTS_KEY, handbookId] });
      qc.invalidateQueries({ queryKey: ['files-tree', handbookId] });
      qc.invalidateQueries({ queryKey: ['workspace-assets', handbookId] });
    },
  });
}

export function useDeleteDocument(handbookId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (documentId: string) => deleteDocument(documentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [DOCUMENTS_KEY, handbookId] });
      qc.invalidateQueries({ queryKey: ['files-tree', handbookId] });
    },
  });
}
