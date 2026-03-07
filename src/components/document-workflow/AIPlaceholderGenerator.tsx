'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
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
import type { ReferenceDocument } from '@/types';

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
		referenceId: string | null;
	}) => Promise<string>;
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
	const [referenceId, setReferenceId] = useState(defaultReferenceId ?? '');
	const [generatedValue, setGeneratedValue] = useState('');

	useEffect(() => {
		if (!open) return;
		setIndustry(defaultIndustry ?? '');
		setReferenceId(defaultReferenceId ?? '');
		setInstruction('');
		setGeneratedValue('');
	}, [defaultIndustry, defaultReferenceId, open]);

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
						<Label htmlFor="reference-file">Reference file</Label>
						<select
							id="reference-file"
							value={referenceId}
							onChange={event => setReferenceId(event.target.value)}
							className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
						>
							<option value="">No reference selected</option>
							{referenceFiles.map(file => (
								<option key={file.id} value={file.id}>
									{file.original_filename}
								</option>
							))}
						</select>
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

					{generatedValue ? (
						<div className="space-y-2 rounded-3xl border border-primary/20 bg-primary/5 p-4">
							<p className="text-sm font-medium text-slate-900">Generated draft</p>
							<Textarea value={generatedValue} readOnly rows={8} className="bg-white" />
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
					{generatedValue ? (
						<Button
							onClick={() => {
								onApply(generatedValue);
								onOpenChange(false);
							}}
						>
							Use Text
						</Button>
					) : (
						<Button
							onClick={async () => {
								const value = await onGenerate({
									industry,
									instruction,
									referenceId: referenceId || null,
								});
								setGeneratedValue(value);
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
