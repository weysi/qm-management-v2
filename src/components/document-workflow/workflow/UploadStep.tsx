'use client';

import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UiContainer, UiSection } from '@/components/ui-layout';
import { ScanSummary } from '@/components/document-workflow/workflow/ScanSummary';
import { UploadSummaryCard } from '@/components/document-workflow/upload/UploadSummaryCard';
import { ZipUploadDropzone } from '@/components/document-workflow/upload/ZipUploadDropzone';
import type { ProjectUploadSummary } from '@/lib/document-workflow/view-models';

interface UploadStepProps {
	loading: boolean;
	error: string | null;
	onUpload: (files: File[]) => void | Promise<void>;
	latestUpload: {
		sourceType: 'zip' | 'files' | null;
		fileCount: number;
		label?: string | null;
		warnings?: string[];
	};
	summary: ProjectUploadSummary;
	onContinue: () => void;
	canContinue: boolean;
}

export function UploadStep({
	loading,
	error,
	onUpload,
	latestUpload,
	summary,
	onContinue,
	canContinue,
}: UploadStepProps) {
	return (
		<div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_360px]">
			<UiContainer>
				<UiSection className="space-y-6">
					<div className="space-y-3">
						<p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
							Upload
						</p>
						<div className="space-y-2">
							<h2 className="text-2xl font-semibold text-slate-950">
								Upload files
							</h2>
							<p className="max-w-2xl text-sm text-slate-600">
								Upload a ZIP or a small set of files. The system will detect
								placeholders and prepare the next steps.
							</p>
						</div>
					</div>

					<ZipUploadDropzone
						loading={loading}
						error={error}
						onUpload={files => void onUpload(files)}
					/>

					<div className="flex justify-end">
						<Button
							type="button"
							onClick={onContinue}
							disabled={!canContinue}
						>
							Continue to assets
							<ArrowRight className="h-4 w-4" />
						</Button>
					</div>
				</UiSection>
			</UiContainer>

			<div className="space-y-4">
				<UploadSummaryCard
					sourceType={latestUpload.sourceType}
					fileCount={latestUpload.fileCount}
					label={latestUpload.label}
					warnings={latestUpload.warnings}
				/>
				<ScanSummary summary={summary} />
			</div>
		</div>
	);
}
