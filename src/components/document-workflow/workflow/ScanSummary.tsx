'use client';

import { Badge } from '@/components/ui/badge';
import type { ProjectUploadSummary } from '@/lib/document-workflow/view-models';

interface ScanSummaryProps {
	summary: ProjectUploadSummary;
}

export function ScanSummary({ summary }: ScanSummaryProps) {
	return (
		<div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
				<div className="flex-1">
					<p className="text-sm font-semibold text-slate-900">Scan Complete</p>
					<p className="mt-1 text-sm text-slate-500">
						The workspace keeps the file structure and groups placeholders by
						file.
					</p>
				</div>
				<Badge
					variant={summary.unresolvedPlaceholders === 0 ? 'green' : 'orange'}
					className="shrink-0"
				>
					{summary.unresolvedPlaceholders === 0
						? 'No missing placeholders'
						: `${summary.unresolvedPlaceholders} missing`}
				</Badge>
			</div>

			<div className="mt-5 flex flex-col gap-3 sm:gap-4">
				<SummaryStat
					label="Files scanned"
					value={summary.filesScanned}
				/>
				<SummaryStat
					label="Files with placeholders"
					value={summary.filesWithPlaceholders}
				/>
				<SummaryStat
					label="Placeholders found"
					value={summary.totalPlaceholders}
				/>
				<SummaryStat
					label="Unfilled placeholders"
					value={summary.unresolvedPlaceholders}
				/>
			</div>
		</div>
	);
}

function SummaryStat({ label, value }: { label: string; value: number }) {
	return (
		<div className="flex h-full flex-col justify-between rounded-2xl bg-slate-50 p-4 sm:p-5">
			<p className="text-xs font-semibold uppercase leading-snug tracking-wider text-slate-500 text-pretty">
				{label}
			</p>
			<p className="mt-3 text-2xl sm:text-3xl font-semibold text-slate-900">
				{value}
			</p>
		</div>
	);
}
