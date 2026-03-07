'use client';

import {
	ScrollableDialog,
	ScrollableDialogBody,
	ScrollableDialogContent,
	ScrollableDialogDescription,
	ScrollableDialogFooter,
	ScrollableDialogHeader,
	ScrollableDialogTitle,
} from '@/components/document-workflow/modals/ScrollableDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import type { ReferenceDocument, ReferencePreview } from '@/types';

interface ReferenceFileModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	referenceFile: ReferenceDocument | null;
	preview?: ReferencePreview | null;
	loading?: boolean;
	onUseForAi: () => void;
	onReprocess?: () => void;
	onDelete?: () => void;
	busy?: boolean;
}

export function ReferenceFileModal({
	open,
	onOpenChange,
	referenceFile,
	preview,
	loading,
	onUseForAi,
	onReprocess,
	onDelete,
	busy,
}: ReferenceFileModalProps) {
	return (
		<ScrollableDialog open={open} onOpenChange={onOpenChange}>
			<ScrollableDialogContent size="xl">
				<ScrollableDialogHeader>
					<ScrollableDialogTitle>
						{referenceFile?.original_filename ?? 'Reference document'}
					</ScrollableDialogTitle>
					<ScrollableDialogDescription>
						Preview this reference before using it for AI generation.
					</ScrollableDialogDescription>
				</ScrollableDialogHeader>

				{loading ? (
					<ScrollableDialogBody className="flex justify-center py-10">
						<Spinner />
					</ScrollableDialogBody>
				) : !referenceFile || !preview ? (
					<ScrollableDialogBody>
						<p className="text-sm text-slate-500">No preview available.</p>
					</ScrollableDialogBody>
				) : (
					<ScrollableDialogBody className="space-y-4">
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="gray">{referenceFile.file_type}</Badge>
							<Badge
								variant={
									referenceFile.parse_status === 'PARSED'
										? 'green'
										: referenceFile.parse_status === 'FAILED'
											? 'red'
											: 'orange'
								}
							>
								{referenceFile.parse_status}
							</Badge>
							<Badge variant="gray">{referenceFile.section_count} sections</Badge>
						</div>

						<div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
							<p className="text-sm font-medium text-slate-900">Preview</p>
							<p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
								{preview.summary || 'No summary available yet.'}
							</p>
						</div>

						<div className="space-y-3">
							{preview.sections.map(section => (
								<div
									key={`${section.title}-${section.ordinal ?? section.content.slice(0, 12)}`}
									className="rounded-3xl border border-slate-200 bg-white p-4"
								>
									<p className="text-sm font-semibold text-slate-900">
										{section.title}
									</p>
									<p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">
										{section.content}
									</p>
								</div>
							))}
						</div>
					</ScrollableDialogBody>
				)}

				<ScrollableDialogFooter className="gap-2">
					{onDelete ? (
						<Button
							variant="ghost"
							className="text-red-600"
							onClick={onDelete}
							disabled={busy}
						>
							Remove
						</Button>
					) : null}
					{onReprocess ? (
						<Button
							variant="outline"
							onClick={onReprocess}
							disabled={busy}
						>
							Reprocess
						</Button>
					) : null}
					<Button
						onClick={onUseForAi}
						disabled={busy || referenceFile?.parse_status !== 'PARSED'}
					>
						Use for AI Generation
					</Button>
				</ScrollableDialogFooter>
			</ScrollableDialogContent>
		</ScrollableDialog>
	);
}
