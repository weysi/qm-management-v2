'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AIPlaceholderGenerator } from '@/components/document-workflow/AIPlaceholderGenerator';
import { ImagePlaceholderEditor } from '@/components/document-workflow/assets/ImagePlaceholderEditor';
import { SignatureCanvasEditor } from '@/components/document-workflow/assets/SignatureCanvasEditor';
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

interface PlaceholderEditorDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	placeholder: EditablePlaceholder | null;
	value: string;
	onValueChange: (value: string) => void;
	onSaveText: () => void | Promise<void>;
	onSaveImage: (file: File) => void | Promise<void>;
	onSaveSignature: (dataUrl: string) => void | Promise<void>;
	onGenerateWithAi: (input: {
		industry: string;
		instruction: string;
		referenceId: string | null;
	}) => Promise<string>;
	referenceFiles: ReferenceDocument[];
	defaultIndustry?: string;
	defaultReferenceId?: string | null;
	assetPreviewUrl?: string | null;
	saving?: boolean;
	aiLoading?: boolean;
	aiOpen?: boolean;
	onAiOpenChange?: (open: boolean) => void;
}

export function PlaceholderEditorDialog({
	open,
	onOpenChange,
	placeholder,
	value,
	onValueChange,
	onSaveText,
	onSaveImage,
	onSaveSignature,
	onGenerateWithAi,
	referenceFiles,
	defaultIndustry,
	defaultReferenceId,
	assetPreviewUrl,
	saving,
	aiLoading,
	aiOpen = false,
	onAiOpenChange,
}: PlaceholderEditorDialogProps) {
	const [selectedImage, setSelectedImage] = useState<File | null>(null);
	const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setSelectedImage(null);
		setSignatureDataUrl(null);
	}, [open, placeholder?.id]);

	if (!placeholder) return null;

	const isText = placeholder.type === 'text';
	const isImage = placeholder.type === 'image';
	const isSignature = placeholder.type === 'signature';

	return (
		<>
			<ScrollableDialog open={open} onOpenChange={onOpenChange}>
				<ScrollableDialogContent size="lg">
					<ScrollableDialogHeader>
						<ScrollableDialogTitle>
							Edit Placeholder
						</ScrollableDialogTitle>
						<ScrollableDialogDescription>
							{placeholder.label} ({placeholder.type})
						</ScrollableDialogDescription>
					</ScrollableDialogHeader>

					<ScrollableDialogBody className="space-y-5">
						<div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
							<span className="rounded-full bg-slate-100 px-3 py-1 capitalize">
								{placeholder.type}
							</span>
							<span
								className={`rounded-full px-3 py-1 ${
									placeholder.status === 'filled'
										? 'bg-green-100 text-green-700'
										: 'bg-orange-100 text-orange-700'
								}`}
							>
								{placeholder.status === 'filled' ? 'Filled' : 'Empty'}
							</span>
							{placeholder.required ? (
								<span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">
									Required
								</span>
							) : null}
						</div>

						{isText ? (
							<div className="space-y-3">
								<div className="space-y-2">
									<Label htmlFor="placeholder-value">Input value</Label>
									{placeholder.multiline ? (
										<Textarea
											id="placeholder-value"
											rows={10}
											value={value}
											onChange={event => onValueChange(event.target.value)}
										/>
									) : (
										<Input
											id="placeholder-value"
											value={value}
											onChange={event => onValueChange(event.target.value)}
										/>
									)}
								</div>

								<Button
									type="button"
									variant="outline"
									onClick={() => onAiOpenChange?.(true)}
								>
									Generate with AI
								</Button>
							</div>
						) : null}

						{isImage ? (
							<ImagePlaceholderEditor
								selectedFile={selectedImage}
								previewUrl={assetPreviewUrl}
								onFileChange={setSelectedImage}
								disabled={saving}
							/>
						) : null}

						{isSignature ? (
							<SignatureCanvasEditor
								previewUrl={assetPreviewUrl}
								onSignatureChange={setSignatureDataUrl}
								disabled={saving}
							/>
						) : null}
					</ScrollableDialogBody>

					<ScrollableDialogFooter className="gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>

						{isText ? (
							<Button onClick={() => void onSaveText()} loading={saving}>
								Save
							</Button>
						) : null}

						{isImage ? (
							<Button
								onClick={() => {
									if (!selectedImage) return;
									void onSaveImage(selectedImage);
								}}
								loading={saving}
								disabled={!selectedImage}
							>
								Save
							</Button>
						) : null}

						{isSignature ? (
							<Button
								onClick={() => {
									if (!signatureDataUrl) return;
									void onSaveSignature(signatureDataUrl);
								}}
								loading={saving}
								disabled={!signatureDataUrl}
							>
								Save
							</Button>
						) : null}
					</ScrollableDialogFooter>
				</ScrollableDialogContent>
			</ScrollableDialog>

			<AIPlaceholderGenerator
				open={aiOpen}
				onOpenChange={open => onAiOpenChange?.(open)}
				placeholder={placeholder}
				referenceFiles={referenceFiles}
				defaultIndustry={defaultIndustry}
				defaultReferenceId={defaultReferenceId}
				loading={aiLoading}
				onGenerate={onGenerateWithAi}
				onApply={onValueChange}
			/>
		</>
	);
}
