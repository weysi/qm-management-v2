import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listWorkspaceAssets, uploadWorkspaceAsset } from '@/lib/documents';
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
      qc.invalidateQueries({ queryKey: [ASSETS_KEY, handbookId] });
    },
  });
}
