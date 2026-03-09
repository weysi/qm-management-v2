'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { ContextSourcesList } from '@/components/handbook-compose/ContextSourcesList';
import { TokenUsageBadge } from '@/components/handbook-compose/TokenUsageBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
	ScrollableDialog,
	ScrollableDialogBody,
	ScrollableDialogContent,
	ScrollableDialogDescription,
	ScrollableDialogFooter,
	ScrollableDialogHeader,
	ScrollableDialogTitle,
} from '@/components/document-workflow/modals/ScrollableDialog';
import type { EditablePlaceholder } from '@/lib/document-workflow/view-models';
import type { HandbookComposeResponse, ReferenceDocument } from '@/types';

interface AIPlaceholderGeneratorProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	placeholder: EditablePlaceholder | null;
	referenceFiles: ReferenceDocument[];
	defaultIndustry?: string;
	defaultReferenceId?: string | null;
	loading?: boolean;
	onGenerate: (input: {
		industry: string;
		instruction: string;
		referenceIds: string[];
	}) => Promise<HandbookComposeResponse>;
	onApply: (value: string) => void;
}

export function AIPlaceholderGenerator({
	open,
	onOpenChange,
	placeholder,
	referenceFiles,
	defaultIndustry,
	defaultReferenceId,
	loading,
	onGenerate,
	onApply,
}: AIPlaceholderGeneratorProps) {
	const [industry, setIndustry] = useState(defaultIndustry ?? '');
	const [instruction, setInstruction] = useState('');
	const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>(
		defaultReferenceId ? [defaultReferenceId] : [],
	);
	const [result, setResult] = useState<HandbookComposeResponse | null>(null);

	useEffect(() => {
		if (!open) return;
		setIndustry(defaultIndustry ?? '');
		setSelectedReferenceIds(defaultReferenceId ? [defaultReferenceId] : []);
		setInstruction('');
		setResult(null);
	}, [defaultIndustry, defaultReferenceId, open]);

	function toggleReference(referenceDocumentId: string) {
		setSelectedReferenceIds(previous =>
			previous.includes(referenceDocumentId)
				? previous.filter(item => item !== referenceDocumentId)
				: [...previous, referenceDocumentId],
		);
	}

	return (
		<ScrollableDialog open={open} onOpenChange={onOpenChange}>
			<ScrollableDialogContent size="lg">
				<ScrollableDialogHeader>
					<ScrollableDialogTitle className="flex items-center gap-2">
						<Sparkles className="h-4 w-4" />
						AI Content Generation
					</ScrollableDialogTitle>
					<ScrollableDialogDescription>
						Generate a draft for {placeholder?.label ?? placeholder?.name ?? 'this placeholder'}.
					</ScrollableDialogDescription>
				</ScrollableDialogHeader>

				<ScrollableDialogBody className="space-y-4">
					<div className="space-y-2">
						<div className="flex items-center justify-between gap-3">
							<Label>Reference files</Label>
							<Badge variant="gray">
								{selectedReferenceIds.length} selected
							</Badge>
						</div>
						<div className="max-h-56 space-y-2 overflow-y-auto rounded-2xl border border-border bg-slate-50/70 p-3">
							{referenceFiles.length === 0 ? (
								<p className="text-sm text-slate-500">
									No reference files uploaded yet.
								</p>
							) : (
								referenceFiles.map(file => {
									const selected = selectedReferenceIds.includes(file.id);
									const selectable = file.parse_status === 'PARSED';
									return (
										<button
											key={file.id}
											type="button"
											disabled={!selectable}
											onClick={() => toggleReference(file.id)}
											className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
												selected
													? 'border-primary/30 bg-primary/5'
													: 'border-border bg-white hover:bg-slate-50'
											} ${!selectable ? 'cursor-not-allowed opacity-70' : ''}`}
										>
											<div className="flex flex-wrap items-center justify-between gap-2">
												<p className="text-sm font-medium text-slate-900">
													{file.original_filename}
												</p>
												<div className="flex flex-wrap items-center gap-2">
													<Badge
														variant={
															file.parse_status === 'PARSED'
																? 'green'
																: file.parse_status === 'PENDING'
																	? 'blue'
																	: 'orange'
														}
													>
														{file.parse_status === 'PARSED'
															? 'Ready'
															: file.parse_status === 'PENDING'
																? 'Processing'
																: 'Unavailable'}
													</Badge>
													{selected ? (
														<Badge variant="blue">Used as context</Badge>
													) : null}
												</div>
											</div>
											<p className="mt-2 line-clamp-2 text-sm text-slate-500">
												{file.summary?.trim()
													? file.summary
													: file.parse_error?.trim()
														? file.parse_error
														: 'No summary available yet.'}
											</p>
										</button>
									);
								})
							)}
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="company-industry">Company industry</Label>
						<Input
							id="company-industry"
							value={industry}
							onChange={event => setIndustry(event.target.value)}
							placeholder="e.g. mechanical engineering"
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="ai-instruction">Additional guidance</Label>
						<Textarea
							id="ai-instruction"
							rows={4}
							value={instruction}
							onChange={event => setInstruction(event.target.value)}
							placeholder="Describe the tone or details you want in the generated text."
						/>
					</div>

					{result ? (
						<div className="space-y-2 rounded-3xl border border-primary/20 bg-primary/5 p-4">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<p className="text-sm font-medium text-slate-900">
									Generated draft
								</p>
								<TokenUsageBadge usage={result.usage} label="AI tokens" />
							</div>
							<Textarea
								value={result.value}
								readOnly
								rows={8}
								className="bg-white"
							/>
							<div className="space-y-2 rounded-2xl border border-white/80 bg-white/80 p-3">
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant="gray">
										Intent: {result.trace.target_intent ?? 'generic'}
									</Badge>
									<Badge variant="gray">
										Used refs: {result.trace.used_reference_ids?.length ?? 0}
									</Badge>
									{(result.trace.skipped_references?.length ?? 0) > 0 ? (
										<Badge variant="orange">
											Skipped refs: {result.trace.skipped_references.length}
										</Badge>
									) : null}
								</div>
								<ContextSourcesList trace={result.trace} />
							</div>
						</div>
					) : null}
				</ScrollableDialogBody>

				<ScrollableDialogFooter className="gap-2">
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					{result ? (
						<Button
							onClick={() => {
								if (!result) return;
								onApply(result.value);
								onOpenChange(false);
							}}
						>
							Use Text
						</Button>
					) : (
						<Button
							onClick={async () => {
								const nextResult = await onGenerate({
									industry,
									instruction,
									referenceIds: selectedReferenceIds,
								});
								setResult(nextResult);
							}}
							loading={loading}
						>
							Generate
						</Button>
					)}
				</ScrollableDialogFooter>
			</ScrollableDialogContent>
		</ScrollableDialog>
	);
}
