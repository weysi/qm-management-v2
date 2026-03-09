import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteWorkspaceAsset,
  listWorkspaceAssets,
  uploadWorkspaceAsset,
} from '@/lib/documents';
import type { WorkspaceAsset } from '@/lib/schemas';

const ASSETS_KEY = 'workspace-assets';

function normalizeAssetForUi(asset: WorkspaceAsset): WorkspaceAsset {
  const versionToken = encodeURIComponent(asset.updated_at || asset.id);
  const proxyBase = `/api/handbooks/${encodeURIComponent(asset.handbook_id)}/assets/${encodeURIComponent(asset.asset_type)}/download`;
  const proxied = `${proxyBase}?v=${versionToken}`;
  return {
    ...asset,
    preview_url: asset.preview_url ? proxied : asset.preview_url,
    download_url: proxied,
  };
}

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
      qc.invalidateQueries({ queryKey: ['handbook-completion', handbookId] });
      qc.invalidateQueries({ queryKey: ['handbook-tree', handbookId] });
      qc.invalidateQueries({ queryKey: ['handbook-file-placeholders', handbookId] });
      qc.invalidateQueries({ queryKey: ['handbooks', handbookId] });
    },
  });
}

export function useDeleteWorkspaceAsset(handbookId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, { assetType: 'logo' | 'signature' }>({
    mutationFn: payload => deleteWorkspaceAsset({ handbookId, ...payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ASSETS_KEY, handbookId] });
      qc.invalidateQueries({ queryKey: ['handbook-completion', handbookId] });
      qc.invalidateQueries({ queryKey: ['handbook-tree', handbookId] });
      qc.invalidateQueries({ queryKey: ['handbook-file-placeholders', handbookId] });
      qc.invalidateQueries({ queryKey: ['handbooks', handbookId] });
    },
  });
}
