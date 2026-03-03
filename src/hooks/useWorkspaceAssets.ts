import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteWorkspaceAsset,
  listWorkspaceAssets,
  uploadWorkspaceAsset,
} from '@/lib/documents';
import type { WorkspaceAsset } from '@/lib/schemas';

const ASSETS_KEY = 'workspace-assets';

export function useWorkspaceAssets(handbookId: string) {
  return useQuery<WorkspaceAsset[]>({
    queryKey: [ASSETS_KEY, handbookId],
    queryFn: () => listWorkspaceAssets(handbookId),
    enabled: Boolean(handbookId),
  });
}

export function useUploadWorkspaceAsset(handbookId: string) {
  const qc = useQueryClient();
  return useMutation<
    WorkspaceAsset,
    Error,
    { file: File; assetType: 'logo' | 'signature' }
  >({
    mutationFn: payload => uploadWorkspaceAsset({ handbookId, ...payload }),
    onSuccess: () => {
      if (process.env.NODE_ENV !== 'production') {
        console.info('[assets] invalidating cache after upload', { handbookId });
      }
      qc.invalidateQueries({ queryKey: [ASSETS_KEY, handbookId] });
    },
  });
}

export function useDeleteWorkspaceAsset(handbookId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, { assetType: 'logo' | 'signature' }>({
    mutationFn: payload => deleteWorkspaceAsset({ handbookId, ...payload }),
    onSuccess: () => {
      if (process.env.NODE_ENV !== 'production') {
        console.info('[assets] invalidating cache after delete', { handbookId });
      }
      qc.invalidateQueries({ queryKey: [ASSETS_KEY, handbookId] });
    },
  });
}
