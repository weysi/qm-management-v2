import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  deleteWorkspaceAsset,
  listWorkspaceAssets,
  uploadWorkspaceAsset,
} from '@/lib/documents';
import { WorkspaceAssetSchema, type WorkspaceAsset } from '@/lib/schemas';

const ASSETS_KEY = 'workspace-assets';
const SaveSignatureResponseSchema = z.object({
  asset: WorkspaceAssetSchema,
});

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
      qc.invalidateQueries({ queryKey: ['handbooks', handbookId] });
    },
  });
}

type SaveSignaturePayload =
  | { file: File; filename?: string }
  | { dataUrl: string; filename?: string };

export function useSaveSignatureCanvas(handbookId: string) {
  const qc = useQueryClient();
  return useMutation<WorkspaceAsset, Error, SaveSignaturePayload>({
    mutationFn: async payload => {
      const endpoint = `/api/handbooks/${encodeURIComponent(handbookId)}/assets/signature`;
      let res: Response;

      if ('file' in payload) {
        const form = new FormData();
        form.append('file', payload.file);
        if (payload.filename) {
          form.append('filename', payload.filename);
        }
        res = await fetch(endpoint, {
          method: 'POST',
          body: form,
        });
      } else {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data_url: payload.dataUrl,
            filename: payload.filename ?? 'signature-canvas.png',
          }),
        });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? 'Failed to save signature');
      }
      const parsed = SaveSignatureResponseSchema.parse(data).asset;
      return normalizeAssetForUi(parsed);
    },
    onSuccess: savedSignature => {
      qc.setQueryData<WorkspaceAsset[]>([ASSETS_KEY, handbookId], previous => {
        const existing = Array.isArray(previous) ? previous : [];
        let replaced = false;
        const next = existing.map(asset => {
          if (asset.asset_type !== 'signature') {
            return asset;
          }
          replaced = true;
          return savedSignature;
        });
        if (replaced) return next;
        return [...next, savedSignature];
      });

      qc.invalidateQueries({ queryKey: ['handbook-completion', handbookId] });
      qc.invalidateQueries({ queryKey: ['handbook-tree', handbookId] });
      qc.invalidateQueries({ queryKey: ['handbooks', handbookId] });
    },
  });
}
