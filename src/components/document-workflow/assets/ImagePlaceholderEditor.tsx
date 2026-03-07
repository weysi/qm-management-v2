'use client';

import { useEffect, useMemo, useRef } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImagePlaceholderEditorProps {
	selectedFile: File | null;
	previewUrl?: string | null;
	disabled?: boolean;
	onFileChange: (file: File | null) => void;
}

export function ImagePlaceholderEditor({
	selectedFile,
	previewUrl,
	disabled,
	onFileChange,
}: ImagePlaceholderEditorProps) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const localPreview = useMemo(
		() => (selectedFile ? URL.createObjectURL(selectedFile) : null),
		[selectedFile],
	);

	useEffect(() => {
		return () => {
			if (localPreview) {
				URL.revokeObjectURL(localPreview);
			}
		};
	}, [localPreview]);

	const imageUrl = localPreview ?? previewUrl ?? null;

	return (
		<div className="space-y-4">
			<input
				ref={inputRef}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={event => {
					onFileChange(event.target.files?.[0] ?? null);
					event.currentTarget.value = '';
				}}
			/>

			<div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<p className="text-sm font-semibold text-slate-900">Upload image</p>
						<p className="mt-1 text-sm text-slate-500">
							Use PNG, JPG, GIF, or BMP for the best result.
						</p>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => inputRef.current?.click()}
							disabled={disabled}
						>
							<ImagePlus className="h-4 w-4" />
							Choose Image
						</Button>
						{selectedFile ? (
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={() => onFileChange(null)}
								disabled={disabled}
							>
								<Trash2 className="h-4 w-4" />
								Remove selection
							</Button>
						) : null}
					</div>
				</div>
			</div>

			<div className="rounded-3xl border border-slate-200 bg-white p-4">
				<p className="mb-3 text-sm font-medium text-slate-900">Preview</p>
				{imageUrl ? (
					<img
						src={imageUrl}
						alt="Selected placeholder preview"
						className="max-h-72 rounded-2xl border border-slate-200 object-contain"
					/>
				) : (
					<div className="rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
						No image selected yet.
					</div>
				)}
			</div>
		</div>
	);
}
