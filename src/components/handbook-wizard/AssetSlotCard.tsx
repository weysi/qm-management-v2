'use client';

import { useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { WorkspaceAsset } from '@/lib/schemas';

interface AssetSlotCardProps {
	title: string;
	assetType: 'logo' | 'signature';
	canonicalKey: string;
	aliases: string[];
	asset?: WorkspaceAsset;
	busy?: boolean;
	onUpload: (
		file: File,
		assetType: 'logo' | 'signature',
	) => Promise<void> | void;
	onRemove: (assetType: 'logo' | 'signature') => Promise<void> | void;
}

function formatBytes(size: number) {
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
	return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function statusVariant(status: WorkspaceAsset['status']) {
	if (status === 'READY') return 'green';
	if (status === 'PROCESSING') return 'orange';
	return 'red';
}

export function AssetSlotCard({
	title,
	assetType,
	canonicalKey,
	aliases,
	asset,
	busy,
	onUpload,
	onRemove,
}: AssetSlotCardProps) {
	const inputRef = useRef<HTMLInputElement | null>(null);

	return (
		<div className="rounded-lg border border-gray-200 bg-white p-3">
			<div className="flex items-start justify-between">
				<div>
					<p className="text-sm font-semibold text-gray-900">{title}</p>
					<p className="text-xs text-gray-500">
						Used by placeholders: {canonicalKey} (aliases: {aliases.join(', ')})
					</p>
				</div>
				{asset ? (
					<Badge variant={statusVariant(asset.status)}>{asset.status}</Badge>
				) : (
					<Badge variant="gray">EMPTY</Badge>
				)}
			</div>

			<div className="mt-3">
				{asset?.preview_url ? (
					<div
						className="h-20 w-full overflow-hidden rounded border border-gray-200"
						style={{
							backgroundColor: '#ffffff',
							backgroundImage:
								'linear-gradient(45deg, #f5f5f5 25%, transparent 25%), linear-gradient(-45deg, #f5f5f5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f5f5f5 75%), linear-gradient(-45deg, transparent 75%, #f5f5f5 75%)',
							backgroundSize: '12px 12px',
							backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
						}}
					>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={asset.preview_url}
							alt={`${title} Vorschau`}
							className="h-full w-full object-contain"
						/>
					</div>
				) : (
					<div className="flex h-20 items-center justify-center rounded border border-dashed border-gray-200 bg-white text-xs text-gray-500">
						Keine Vorschau
					</div>
				)}
			</div>

				<div className="mt-2 min-h-10 text-xs text-gray-600">
					{asset ? (
						<div>
							<p className="font-medium text-gray-800">{asset.filename}</p>
							<p>{formatBytes(asset.size_bytes)}</p>
						</div>
					) : (
						<p>PNG/JPG/SVG hochladen. Office-Exports betten das Bild als Binärdatei ein.</p>
					)}
				</div>

			<div className="mt-3 flex flex-wrap gap-2">
				<input
					ref={inputRef}
					type="file"
					accept="image/*"
					className="hidden"
					onChange={event => {
						const file = event.target.files?.[0];
						if (!file) return;
						void onUpload(file, assetType);
						event.target.value = '';
					}}
				/>
				<Button
					size="sm"
					variant="outline"
					loading={busy}
					onClick={() => inputRef.current?.click()}
				>
					{asset ? 'Ersetzen' : 'Upload'}
				</Button>
				<Button
					size="sm"
					variant="ghost"
					disabled={!asset?.download_url}
					onClick={() => {
						if (!asset?.download_url) return;
						window.location.href = asset.download_url;
					}}
				>
					Download
				</Button>
				<Button
					size="sm"
					variant="ghost"
					disabled={!asset || busy}
					onClick={() => void onRemove(assetType)}
				>
					Entfernen
				</Button>
			</div>
		</div>
	);
}
