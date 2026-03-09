import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ClientHandbookFileGroupsResponseSchema } from '@/lib/schemas';

const CLIENT_HANDBOOK_FILES_KEY = 'client-handbook-files';

async function fetchClientHandbookFiles(clientId: string) {
  const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/handbook-files`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? 'Failed to fetch uploaded files');
  }
  return ClientHandbookFileGroupsResponseSchema.parse(data);
}

export function useClientHandbookFiles(clientId: string) {
  return useQuery({
    queryKey: [CLIENT_HANDBOOK_FILES_KEY, clientId],
    queryFn: () => fetchClientHandbookFiles(clientId),
    enabled: Boolean(clientId),
  });
}

const DeleteHandbookFileResponseSchema = z.object({
  status: z.literal('deleted'),
  file: z.object({
    id: z.string().uuid(),
    path_in_handbook: z.string(),
  }),
  completion: z.record(z.string(), z.unknown()).optional(),
});

export function useDeleteHandbookFile(handbookId: string, clientId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fileId: string) => {
      const res = await fetch(
        `/api/handbooks/${encodeURIComponent(handbookId)}/files/${encodeURIComponent(fileId)}`,
        {
          method: 'DELETE',
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? 'Failed to delete file');
      }
      return DeleteHandbookFileResponseSchema.parse(data);
    },
    onMutate: async fileId => {
      if (!clientId) return undefined;
      await qc.cancelQueries({ queryKey: [CLIENT_HANDBOOK_FILES_KEY, clientId] });
      const previous = qc.getQueryData<z.infer<typeof ClientHandbookFileGroupsResponseSchema>>([
        CLIENT_HANDBOOK_FILES_KEY,
        clientId,
      ]);

      if (previous) {
        qc.setQueryData([CLIENT_HANDBOOK_FILES_KEY, clientId], {
          ...previous,
          groups: previous.groups
            .map(group => ({
              ...group,
              file_count: group.files.filter(file => file.id !== fileId).length,
              files: group.files.filter(file => file.id !== fileId),
            }))
            .filter(group => group.files.length > 0),
        });
      }

      return { previous };
    },
    onError: (_error, _fileId, context) => {
      if (context?.previous && clientId) {
        qc.setQueryData([CLIENT_HANDBOOK_FILES_KEY, clientId], context.previous);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['handbook-tree', handbookId] });
      qc.invalidateQueries({ queryKey: ['handbook-completion', handbookId] });
      qc.invalidateQueries({ queryKey: ['handbook-file-placeholders', handbookId] });
      qc.invalidateQueries({ queryKey: ['handbook-versions', handbookId] });
      qc.invalidateQueries({ queryKey: ['handbooks', handbookId] });
      qc.invalidateQueries({ queryKey: ['handbooks'] });
      if (clientId) {
        qc.invalidateQueries({ queryKey: [CLIENT_HANDBOOK_FILES_KEY, clientId] });
      }
    },
  });
}
