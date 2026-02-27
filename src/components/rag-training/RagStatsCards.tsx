'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { RagAssetItem } from '@/hooks/useRagTraining';

interface StatsCardsProps {
	assets: RagAssetItem[];
	isLoading: boolean;
}

export function RagStatsCards({ assets, isLoading }: StatsCardsProps) {
	const totalFiles = assets.length;
	const templates = assets.filter(a => a.role === 'TEMPLATE').length;
	const references = assets.filter(
		a => a.role === 'REFERENCE' || a.role === 'CUSTOMER_REFERENCE',
	).length;
	const totalPlaceholders = new Set(assets.flatMap(a => a.placeholders)).size;
	const unresolvedPlaceholders = new Set(
		assets.flatMap(a => a.unresolved_placeholders),
	).size;
	const stats = [
		{
			label: 'Dateien gesamt',
			value: totalFiles,
			color: 'text-primary',
			icon: (
				<svg
					className="w-5 h-5 text-primary/60"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
					/>
				</svg>
			),
		},
		{
			label: 'Vorlagen',
			value: templates,
			color: 'text-blue-600',
			icon: (
				<svg
					className="w-5 h-5 text-blue-500/60"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
					/>
				</svg>
			),
		},
		{
			label: 'Referenzen',
			value: references,
			color: 'text-green-600',
			icon: (
				<svg
					className="w-5 h-5 text-green-500/60"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
					/>
				</svg>
			),
		},
		{
			label: 'Platzhalter',
			value: `${totalPlaceholders - unresolvedPlaceholders}/${totalPlaceholders}`,
			color: unresolvedPlaceholders > 0 ? 'text-orange-600' : 'text-green-600',
			icon: (
				<svg
					className="w-5 h-5 text-orange-500/60"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2}
						d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
					/>
				</svg>
			),
		},
	];

	return (
		<div className="grid grid-cols-4 gap-4">
			{stats.map(s => (
				<Card key={s.label}>
					<CardContent className="pt-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-xs text-gray-500 font-medium">{s.label}</p>
								<p className={`text-2xl font-bold mt-1 ${s.color}`}>
									{isLoading ? '—' : s.value}
								</p>
							</div>
							{s.icon}
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
