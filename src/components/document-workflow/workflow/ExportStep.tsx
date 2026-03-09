'use client';

import { ArrowLeft, WandSparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DownloadStatePanel } from '@/components/document-workflow/workflow/DownloadStatePanel';
import type { ExportFileState } from '@/lib/document-workflow/view-models';

interface ExportStepProps {
	readyFiles: ExportFileState[];
	blockedFiles: ExportFileState[];
	resolvedRequired: number;
	totalRequired: number;
	loadingReasons?: boolean;
	exportPending?: boolean;
	canExport: boolean;
	onBack: () => void | Promise<void>;
	onExport: () => void | Promise<void>;
}

export function ExportStep({
	readyFiles,
	blockedFiles,
	resolvedRequired,
	totalRequired,
	loadingReasons,
	exportPending,
	canExport,
	onBack,
	onExport,
}: ExportStepProps) {
	const completionPercentage =
		totalRequired === 0
			? 100
			: Math.round((resolvedRequired / totalRequired) * 100);

	return (
		<div className="space-y-4">
			<div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
				<div className="space-y-3">
					<p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
						Export
					</p>
					<div className="space-y-2">
						<h2 className="text-2xl font-semibold text-slate-950">
							Download and export
						</h2>
						<p className="max-w-3xl text-sm text-slate-600">
							Files can be downloaded when all required values are complete. Any
							blocked file stays listed with the reason.
						</p>
					</div>
					<div className="rounded-3xl border border-border bg-muted/20 px-4 py-4">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<p className="text-sm font-semibold text-slate-900">
									Overall completion
								</p>
								<p className="text-sm text-slate-500">
									{resolvedRequired}/{totalRequired} required placeholders
									complete
								</p>
							</div>
							<p className="text-2xl font-semibold text-slate-900">
								{completionPercentage}%
							</p>
						</div>
					</div>
				</div>
			</div>

			<DownloadStatePanel
				readyFiles={readyFiles}
				blockedFiles={blockedFiles}
				loadingReasons={loadingReasons}
			/>

			<div className="flex flex-wrap justify-between gap-3">
				<Button
					type="button"
					variant="outline"
					onClick={() => void onBack()}
				>
					<ArrowLeft className="h-4 w-4" />
					Back to review
				</Button>
				<Button
					type="button"
					onClick={() => void onExport()}
					disabled={!canExport}
					loading={exportPending}
				>
					<WandSparkles className="h-4 w-4" />
					Generate final ZIP
				</Button>
			</div>
		</div>
	);
}
