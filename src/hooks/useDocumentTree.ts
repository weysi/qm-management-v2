import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deletePath, fetchTree } from '@/lib/documents';
import type { FileTreeNode } from '@/lib/schemas';

const TREE_KEY = 'files-tree';

export function useFileTree(handbookId: string) {
  return useQuery<FileTreeNode[]>({
    queryKey: [TREE_KEY, handbookId],
    queryFn: () => fetchTree(handbookId),
    enabled: Boolean(handbookId),
  });
}

export function useDeleteFilePath(handbookId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, { path: string; recursive?: boolean }>({
    mutationFn: ({ path, recursive }) =>
      deletePath({ handbookId, path, recursive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TREE_KEY, handbookId] });
      qc.invalidateQueries({ queryKey: ['documents', handbookId] });
    },
  });
}
