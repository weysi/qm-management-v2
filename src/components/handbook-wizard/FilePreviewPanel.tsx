'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { RagAssetItem } from '@/hooks/useRagTraining';

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface FilePreviewPanelProps {
	asset: RagAssetItem;
	customerProfile: Record<string, string>;
	handbookId: string;
	onClose: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function roleBadge(role: string) {
	switch (role) {
		case 'TEMPLATE':
			return <Badge variant="blue">Vorlage</Badge>;
		case 'REFERENCE':
			return <Badge variant="green">Referenz</Badge>;
		case 'CUSTOMER_REFERENCE':
			return <Badge variant="orange">Kundenref.</Badge>;
		case 'GENERATED_OUTPUT':
			return <Badge variant="gray">Generiert</Badge>;
		default:
			return <Badge variant="gray">{role}</Badge>;
	}
}

/* ------------------------------------------------------------------ */
/*  FilePreviewPanel                                                    */
/* ------------------------------------------------------------------ */

export function FilePreviewPanel({
	asset,
	customerProfile,
	handbookId,
	onClose,
}: FilePreviewPanelProps) {
	const [isDownloading, setIsDownloading] = useState(false);

	const resolvedTokens = asset.placeholders.filter(
		token =>
			customerProfile[token] !== undefined && customerProfile[token] !== '',
	);
	const unresolvedTokens = asset.placeholders.filter(
		token => !customerProfile[token],
	);

	const fillRate =
		asset.placeholders.length > 0
			? Math.round((resolvedTokens.length / asset.placeholders.length) * 100)
			: 100;

	async function handleDownload() {
		setIsDownloading(true);
		try {
			const res = await fetch(
				`/api/handbook-generation/${handbookId}/download`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						file_ids: [asset.id],
						generated_only: false,
					}),
				},
			);

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(
					(err as { error?: string }).error ?? 'Download fehlgeschlagen',
				);
			}

			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = asset.name;
			a.click();
			URL.revokeObjectURL(url);
			toast.success(`${asset.name} heruntergeladen`);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : 'Download fehlgeschlagen',
			);
		} finally {
			setIsDownloading(false);
		}
	}

	return (
		<Card className="border-primary/20">
			<CardHeader>
				<div className="flex items-start justify-between gap-3">
					<div className="flex-1 min-w-0">
						<p className="font-semibold text-gray-900 truncate text-sm">
							{asset.name}
						</p>
						<p className="text-xs text-gray-500 truncate mt-0.5">
							{asset.path}
						</p>
						<div className="flex items-center gap-2 mt-2">
							{roleBadge(asset.role)}
							<span className="text-xs text-gray-400">
								{formatBytes(asset.size)}
							</span>
							<span className="text-xs text-gray-400 uppercase">
								.{asset.ext}
							</span>
						</div>
					</div>
					<button
						onClick={onClose}
						className="text-gray-400 hover:text-gray-600 transition-colors shrink-0 p-1"
						aria-label="Schließen"
					>
						<svg
							className="w-4 h-4"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				</div>
			</CardHeader>

			<CardContent className="space-y-4">
				{/* Fill rate summary */}
				{asset.placeholders.length > 0 ? (
					<div className="space-y-2">
						<div className="flex items-center justify-between text-xs">
							<span className="text-gray-600 font-medium">
								Platzhalter befüllt
							</span>
							<span
								className={cn(
									'font-semibold',
									fillRate === 100
										? 'text-green-600'
										: fillRate >= 50
											? 'text-orange-500'
											: 'text-red-500',
								)}
							>
								{resolvedTokens.length}/{asset.placeholders.length} ({fillRate}
								%)
							</span>
						</div>
						<div className="bg-gray-100 rounded-full h-1.5">
							<div
								className={cn(
									'h-1.5 rounded-full transition-all',
									fillRate === 100
										? 'bg-green-500'
										: fillRate >= 50
											? 'bg-orange-400'
											: 'bg-red-400',
								)}
								style={{ width: `${fillRate}%` }}
							/>
						</div>
					</div>
				) : (
					<p className="text-xs text-gray-400">
						Keine Platzhalter in dieser Datei erkannt.
					</p>
				)}

				{/* Resolved placeholders */}
				{resolvedTokens.length > 0 && (
					<div className="space-y-1">
						<p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
							Automatisch befüllt
						</p>
						<div className="space-y-1 max-h-48 overflow-y-auto">
							{resolvedTokens.map(token => (
								<div
									key={token}
									className="flex items-start gap-2 py-1 px-2 rounded bg-green-50 border border-green-100"
								>
									<svg
										className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M5 13l4 4L19 7"
										/>
									</svg>
									<div className="flex-1 min-w-0">
										<span className="text-xs font-mono text-green-700">
											{'{{'}
											{token}
											{'}}'}
										</span>
										<p className="text-xs text-green-600 truncate mt-0.5">
											{customerProfile[token]}
										</p>
									</div>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Unresolved placeholders */}
				{unresolvedTokens.length > 0 && (
					<div className="space-y-1">
						<p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
							Nicht befüllt
						</p>
						<div className="space-y-1 max-h-32 overflow-y-auto">
							{unresolvedTokens.map(token => (
								<div
									key={token}
									className="flex items-center gap-2 py-1 px-2 rounded bg-orange-50 border border-orange-100"
								>
									<svg
										className="w-3.5 h-3.5 text-orange-400 shrink-0"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											strokeLinecap="round"
											strokeLinejoin="round"
											strokeWidth={2}
											d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
										/>
									</svg>
									<span className="text-xs font-mono text-orange-600">
										{'{{'}
										{token}
										{'}}'}
									</span>
								</div>
							))}
						</div>
					</div>
				)}

				{/* Download button */}
				<Button
					size="sm"
					variant="outline"
					className="w-full"
					onClick={handleDownload}
					loading={isDownloading}
					disabled={isDownloading}
				>
					<svg
						className="w-4 h-4 mr-1.5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2}
							d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
						/>
					</svg>
					Datei herunterladen
				</Button>
			</CardContent>
		</Card>
	);
}
