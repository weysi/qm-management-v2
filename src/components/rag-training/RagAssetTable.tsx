'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';
import type { RagAssetItem } from '@/hooks/useRagTraining';

interface RagAssetTableProps {
	assets: RagAssetItem[];
	isLoading: boolean;
}

function roleLabel(role: string): string {
	switch (role) {
		case 'TEMPLATE':
			return 'Vorlage';
		case 'REFERENCE':
			return 'Referenz';
		case 'CUSTOMER_REFERENCE':
			return 'Kundenreferenz';
		case 'GENERATED_OUTPUT':
			return 'Generiert';
		default:
			return role;
	}
}

function roleBadgeVariant(role: string) {
	switch (role) {
		case 'TEMPLATE':
			return 'blue' as const;
		case 'REFERENCE':
			return 'green' as const;
		case 'CUSTOMER_REFERENCE':
			return 'orange' as const;
		case 'GENERATED_OUTPUT':
			return 'gray' as const;
		default:
			return 'gray' as const;
	}
}

function formatSize(bytes: number): string {
	if (bytes === 0) return '—';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
	return new Date(iso).toLocaleString('de-DE', {
		day: '2-digit',
		month: '2-digit',
		year: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	});
}

export function RagAssetTable({ assets, isLoading }: RagAssetTableProps) {
	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<h3 className="font-semibold text-gray-900">Dateiindex</h3>
					<Badge variant="gray">{assets.length} Dateien</Badge>
				</div>
			</CardHeader>
			<CardContent className="p-0">
				{isLoading ? (
					<div className="flex justify-center py-12">
						<Spinner />
					</div>
				) : assets.length === 0 ? (
					<div className="text-center py-12 text-gray-500">
						<svg
							className="w-12 h-12 text-gray-300 mx-auto mb-3"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={1.5}
								d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
							/>
						</svg>
						<p className="text-sm">Noch keine Dateien indiziert.</p>
						<p className="text-xs mt-1">
							Laden Sie Dateien hoch, um den RAG-Index aufzubauen.
						</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-[300px]">Datei</TableHead>
									<TableHead>Rolle</TableHead>
									<TableHead>Format</TableHead>
									<TableHead className="text-right">Größe</TableHead>
									<TableHead className="text-right">Platzhalter</TableHead>
									<TableHead>Erstellt</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{assets.map(asset => (
									<TableRow key={asset.id}>
										<TableCell>
											<div className="min-w-0">
												<p className="font-medium text-sm text-gray-900 truncate">
													{asset.name}
												</p>
												<p className="text-xs text-gray-400 truncate">
													{asset.path}
												</p>
											</div>
										</TableCell>
										<TableCell>
											<Badge variant={roleBadgeVariant(asset.role)}>
												{roleLabel(asset.role)}
											</Badge>
										</TableCell>
										<TableCell>
											<span className="text-xs font-mono text-gray-600 uppercase">
												{asset.ext}
											</span>
										</TableCell>
										<TableCell className="text-right text-sm text-gray-600">
											{formatSize(asset.size)}
										</TableCell>
										<TableCell className="text-right">
											{asset.placeholders.length > 0 ? (
												<div className="flex items-center justify-end gap-1">
													<Badge
														variant={
															asset.unresolved_placeholders.length > 0
																? 'orange'
																: 'green'
														}
													>
														{asset.placeholders.length -
															asset.unresolved_placeholders.length}
														/{asset.placeholders.length}
													</Badge>
												</div>
											) : (
												<span className="text-xs text-gray-400">—</span>
											)}
										</TableCell>
										<TableCell className="text-xs text-gray-500">
											{formatDate(asset.created_at)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
