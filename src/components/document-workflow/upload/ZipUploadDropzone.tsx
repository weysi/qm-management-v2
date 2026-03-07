'use client';

import { useState } from 'react';
import { FileArchive, FileUp, UploadCloud } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
	isZipUpload,
	ZIP_FIRST_UPLOAD_ACCEPT,
} from '@/lib/document-workflow/upload';

interface ZipUploadDropzoneProps {
	loading?: boolean;
	error?: string | null;
	onUpload: (files: File[]) => void | Promise<void>;
}

export function ZipUploadDropzone({
	loading,
	error,
	onUpload,
}: ZipUploadDropzoneProps) {
	const [localError, setLocalError] = useState<string | null>(null);

	const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
		accept: ZIP_FIRST_UPLOAD_ACCEPT,
		multiple: true,
		noClick: true,
		disabled: loading,
		onDropAccepted: acceptedFiles => {
			const zipFiles = acceptedFiles.filter(isZipUpload);
			if (zipFiles.length > 1) {
				setLocalError('Please upload one ZIP file at a time.');
				return;
			}
			if (zipFiles.length === 1 && acceptedFiles.length > 1) {
				setLocalError('Upload either one ZIP file or one or more individual files.');
				return;
			}

			setLocalError(null);
			void onUpload(acceptedFiles);
		},
		onDropRejected: () => {
			setLocalError('Upload a ZIP file or DOCX, PPTX, XLSX, and PDF documents.');
		},
	});

	return (
		<div className="space-y-4">
			<div
				{...getRootProps()}
				className={cn(
					'rounded-[28px] border border-dashed px-6 py-10 text-center transition',
					isDragActive
						? 'border-primary bg-primary/5'
						: 'border-slate-300 bg-slate-50 hover:border-primary/60 hover:bg-white',
					loading && 'pointer-events-none opacity-70',
				)}
			>
				<input {...getInputProps()} />
				<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
					<UploadCloud className="h-7 w-7 text-slate-700" />
				</div>

				<div className="mt-5 space-y-2">
					<p className="text-lg font-semibold text-slate-900">
						{isDragActive ? 'Drop ZIP or files here' : 'Upload Template Package'}
					</p>
					<p className="mx-auto max-w-2xl text-sm text-slate-600">
						Drag and drop a ZIP file or supported documents. Uploading a ZIP file is
						the easiest way to scan the full folder structure automatically.
					</p>
				</div>

				<div className="mt-6 flex flex-wrap items-center justify-center gap-3">
					<Button type="button" size="sm" onClick={open} loading={loading}>
						<FileUp className="h-4 w-4" />
						Select ZIP or Files
					</Button>
					<div className="flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-slate-500 ring-1 ring-slate-200">
						<FileArchive className="h-3.5 w-3.5" />
						Recommended: ZIP project upload
					</div>
				</div>
			</div>

			<div className="flex flex-wrap gap-2 text-xs text-slate-500">
				<span className="rounded-full bg-slate-100 px-3 py-1">ZIP</span>
				<span className="rounded-full bg-slate-100 px-3 py-1">DOCX</span>
				<span className="rounded-full bg-slate-100 px-3 py-1">PPTX</span>
				<span className="rounded-full bg-slate-100 px-3 py-1">XLSX</span>
				<span className="rounded-full bg-slate-100 px-3 py-1">PDF</span>
			</div>

			{error || localError ? (
				<p className="text-sm text-red-600">{error ?? localError}</p>
			) : null}
		</div>
	);
}
