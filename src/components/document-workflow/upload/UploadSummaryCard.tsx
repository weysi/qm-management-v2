'use client';

import { FileArchive, Files } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface UploadSummaryCardProps {
	sourceType: 'zip' | 'files' | null;
	fileCount: number;
	label?: string | null;
	warnings?: string[];
}

export function UploadSummaryCard({
	sourceType,
	fileCount,
	label,
	warnings = [],
}: UploadSummaryCardProps) {
	if (!sourceType) {
		return (
			<div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
				<p className="text-sm font-semibold text-slate-900">Upload Summary</p>
				<p className="mt-2 text-sm text-slate-500">
					Upload a ZIP file or individual documents to start placeholder detection.
				</p>
			</div>
		);
	}

	return (
		<div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-sm font-semibold text-slate-900">Latest Upload</p>
					<p className="mt-1 text-sm text-slate-500">
						{sourceType === 'zip'
							? 'The workspace was updated from a ZIP package.'
							: 'The selected files were packaged and uploaded together.'}
					</p>
				</div>
				<Badge variant={warnings.length === 0 ? 'green' : 'orange'}>
					{warnings.length === 0 ? 'Ready' : `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`}
				</Badge>
			</div>

			<div className="mt-4 flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
				<div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-700 ring-1 ring-slate-200">
					{sourceType === 'zip' ? (
						<FileArchive className="h-4 w-4" />
					) : (
						<Files className="h-4 w-4" />
					)}
				</div>
				<div className="min-w-0">
					<p className="truncate text-sm font-medium text-slate-900">
						{label ?? (sourceType === 'zip' ? 'ZIP package' : 'Selected files')}
					</p>
					<p className="text-xs text-slate-500">
						{fileCount} file{fileCount === 1 ? '' : 's'} processed
					</p>
				</div>
			</div>

			{warnings.length > 0 ? (
				<div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
					<p className="text-xs font-semibold uppercase tracking-wide text-orange-700">
						Needs review
					</p>
					<ul className="mt-2 space-y-1 text-sm text-orange-800">
						{warnings.slice(0, 3).map(warning => (
							<li key={warning}>{warning}</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}
