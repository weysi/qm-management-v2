"use client";

import { useRef } from "react";
import { ImagePlus, RefreshCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompletionStatusBadge } from "@/components/document-workflow/workflow/CompletionStatusBadge";
import { UiContainer, UiFormSection, UiSection } from "@/components/ui-layout";
import type { WorkspaceAsset } from "@/types";

interface GlobalAssetManagerProps {
  logoAsset: WorkspaceAsset | null;
  signatureAsset: WorkspaceAsset | null;
  busyType: "logo" | "signature" | null;
  onUpload: (assetType: "logo" | "signature", file: File) => void | Promise<void>;
  onRemove: (assetType: "logo" | "signature") => void | Promise<void>;
}

export function GlobalAssetManager({
  logoAsset,
  signatureAsset,
  busyType,
  onUpload,
  onRemove,
}: GlobalAssetManagerProps) {
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const signatureInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <AssetCard
        title="Global logo"
        description="Upload the company logo once and reuse it in every matching placeholder."
        asset={logoAsset}
        busy={busyType === "logo"}
        placeholderLabel="logo placeholders"
        inputRef={logoInputRef}
        onUpload={file => onUpload("logo", file)}
        onRemove={() => onRemove("logo")}
      />
      <AssetCard
        title="Global signature"
        description="Upload a signature image once. The workflow no longer uses a signature canvas."
        asset={signatureAsset}
        busy={busyType === "signature"}
        placeholderLabel="signature placeholders"
        inputRef={signatureInputRef}
        onUpload={file => onUpload("signature", file)}
        onRemove={() => onRemove("signature")}
      />
    </div>
  );
}

interface AssetCardProps {
  title: string;
  description: string;
  asset: WorkspaceAsset | null;
  busy: boolean;
  placeholderLabel: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onUpload: (file: File) => void | Promise<void>;
  onRemove: () => void | Promise<void>;
}

function AssetCard({
  title,
  description,
  asset,
  busy,
  placeholderLabel,
  inputRef,
  onUpload,
  onRemove,
}: AssetCardProps) {
  return (
    <UiContainer>
      <UiSection className="space-y-5">
        <UiFormSection title={title} description={description}>
          <div className="flex items-center justify-between gap-3 rounded-3xl border border-border bg-muted/30 px-4 py-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900">Current status</p>
              <p className="text-sm text-slate-500">
                {asset
                  ? `Ready for all matching ${placeholderLabel}.`
                  : `No reusable ${title.toLowerCase()} uploaded yet.`}
              </p>
            </div>
            <CompletionStatusBadge
              status={asset ? "ready" : "blocked"}
              label={asset ? "Reusable" : "Missing"}
            />
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/gif,image/bmp"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0] ?? null;
              event.currentTarget.value = "";
              if (!file) return;
              void onUpload(file);
            }}
          />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="rounded-3xl border border-dashed border-border bg-muted/20 p-4">
              <p className="text-sm font-medium text-slate-900">Preview</p>
              <div className="mt-3 flex min-h-[180px] items-center justify-center rounded-3xl bg-white">
                {asset?.preview_url || asset?.download_url ? (
                  <img
                    src={asset.preview_url ?? asset.download_url}
                    alt={title}
                    className="max-h-40 rounded-2xl object-contain"
                  />
                ) : (
                  <p className="px-6 text-center text-sm text-slate-500">
                    Upload an image to keep this asset available across the whole handbook.
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-3xl border border-border bg-background p-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-900">Usage</p>
                <p className="text-sm text-slate-500">
                  Matching {placeholderLabel} pick up the latest uploaded asset automatically.
                </p>
                {asset ? (
                  <p className="text-xs text-slate-500">
                    {asset.filename} · {(asset.size_bytes / 1024).toFixed(1)} KB
                  </p>
                ) : null}
              </div>

              <div className="mt-5 flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  loading={busy}
                  onClick={() => inputRef.current?.click()}
                >
                  {asset ? <RefreshCcw className="h-4 w-4" /> : <ImagePlus className="h-4 w-4" />}
                  {asset ? "Replace asset" : "Upload asset"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-slate-600"
                  disabled={!asset || busy}
                  onClick={() => void onRemove()}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove asset
                </Button>
              </div>
            </div>
          </div>
        </UiFormSection>
      </UiSection>
    </UiContainer>
  );
}
