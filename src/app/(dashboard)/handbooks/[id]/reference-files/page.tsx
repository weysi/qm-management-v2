'use client';

import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { ReferenceFileModal } from '@/components/document-workflow';
import { Header } from '@/components/layout/Header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import {
	useDeleteReferenceFile,
	useHandbook,
	useReferenceFiles,
	useReferencePreview,
	useReprocessReferenceFile,
	useUploadReferenceFile,
} from '@/hooks';
import { setPreferredReferenceId } from '@/lib/document-workflow/reference-selection';

interface PageProps {
	params: Promise<{ id: string }>;
}

export default function HandbookReferenceFilesPage({ params }: PageProps) {
	const { id } = use(params);

	const { data: handbook } = useHandbook(id);
	const { data: referenceFiles = [], isLoading } = useReferenceFiles(id);
	const uploadReferenceFile = useUploadReferenceFile(id);
	const deleteReferenceFile = useDeleteReferenceFile(id);
	const reprocessReferenceFile = useReprocessReferenceFile(id);

	const inputRef = useRef<HTMLInputElement | null>(null);
	const [selectedReferenceId, setSelectedReferenceId] = useState<string | null>(
		null,
	);
	const [modalOpen, setModalOpen] = useState(false);
	const selectedReference =
		referenceFiles.find(file => file.id === selectedReferenceId) ?? null;
	const { data: preview, isLoading: previewLoading } = useReferencePreview(
		id,
		modalOpen ? selectedReferenceId : null,
	);

	useEffect(() => {
		if (!selectedReferenceId && referenceFiles[0]) {
			setSelectedReferenceId(referenceFiles[0].id);
		}
	}, [referenceFiles, selectedReferenceId]);

	async function handleUpload(file: File) {
		try {
			const uploaded = await uploadReferenceFile.mutateAsync(file);
			setSelectedReferenceId(uploaded.id);
			setModalOpen(true);
			toast.success('Reference file uploaded.');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Upload failed.');
		}
	}

	async function handleDelete() {
		if (!selectedReferenceId || !confirm('Remove this reference document?')) {
			return;
		}

		try {
			await deleteReferenceFile.mutateAsync(selectedReferenceId);
			setModalOpen(false);
			setSelectedReferenceId(null);
			toast.success('Reference file removed.');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Remove failed.');
		}
	}

	async function handleReprocess() {
		if (!selectedReferenceId) return;

		try {
			await reprocessReferenceFile.mutateAsync(selectedReferenceId);
			toast.success('Reference file reprocessed.');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Reprocess failed.');
		}
	}

	function handleUseForAi() {
		if (!selectedReferenceId) return;
		setPreferredReferenceId(id, selectedReferenceId);
		toast.success('This reference will be suggested in AI generation.');
		setModalOpen(false);
	}

	return (
		<div className="min-h-screen bg-slate-50">
			<Header
				title="Reference Documents"
				subtitle={handbook ? `${handbook.type} workspace` : 'Document workspace'}
				actions={
					<Button asChild size="sm" variant="outline">
						<Link href={`/handbooks/${id}`}>Back to Documents</Link>
					</Button>
				}
			/>

			<div className="mx-auto max-w-5xl space-y-6 px-8 py-6">
				<Card className="border-slate-200 shadow-sm">
					<CardHeader>
						<h3 className="text-lg font-semibold text-slate-900">
							Reference Documents
						</h3>
						<p className="text-sm text-slate-500">
							Upload source material you want to reuse during AI generation.
						</p>
					</CardHeader>
					<CardContent className="space-y-4">
						<input
							ref={inputRef}
							type="file"
							className="hidden"
							accept=".docx,.pptx,.xlsx,.txt,.md,.pdf"
							onChange={event => {
								const file = event.target.files?.[0];
								if (!file) return;
								void handleUpload(file);
								event.currentTarget.value = '';
							}}
						/>

						<div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6">
							<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
								<div>
									<p className="text-base font-semibold text-slate-900">
										Upload a reference file
									</p>
									<p className="mt-1 text-sm text-slate-500">
										DOCX, PPTX, XLSX, TXT, MD, and PDF are supported.
									</p>
								</div>
								<Button
									onClick={() => inputRef.current?.click()}
									loading={uploadReferenceFile.isPending}
								>
									<Upload className="h-4 w-4" />
									Choose File
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card className="border-slate-200 shadow-sm">
					<CardHeader>
						<h3 className="text-lg font-semibold text-slate-900">
							Available Reference Files
						</h3>
					</CardHeader>
					<CardContent>
						{isLoading ? (
							<div className="flex justify-center py-10">
								<Spinner />
							</div>
						) : referenceFiles.length === 0 ? (
							<div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
								<p className="text-base font-medium text-slate-900">
									No reference files uploaded yet
								</p>
								<p className="mt-2 text-sm text-slate-500">
									Reference files help the AI generate more specific text when needed.
								</p>
							</div>
						) : (
							<div className="space-y-3">
								{referenceFiles.map(file => (
									<button
										key={file.id}
										type="button"
										onClick={() => {
											setSelectedReferenceId(file.id);
											setModalOpen(true);
										}}
										className="flex w-full items-center justify-between rounded-3xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-primary/60 hover:bg-primary/5"
									>
										<div className="min-w-0">
											<div className="flex items-center gap-3">
												<div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
													<FileText className="h-4 w-4" />
												</div>
												<div className="min-w-0">
													<p className="truncate text-sm font-medium text-slate-900">
														{file.original_filename}
													</p>
													<div className="mt-2 flex flex-wrap gap-2">
														<Badge variant="gray">{file.file_type}</Badge>
														<Badge
															variant={
																file.parse_status === 'PARSED'
																	? 'green'
																	: file.parse_status === 'FAILED'
																		? 'red'
																		: 'orange'
															}
														>
															{file.parse_status}
														</Badge>
													</div>
												</div>
											</div>
										</div>
										<span className="text-sm font-medium text-primary">
											Open preview
										</span>
									</button>
								))}
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			<ReferenceFileModal
				open={modalOpen}
				onOpenChange={setModalOpen}
				referenceFile={selectedReference}
				preview={preview}
				loading={previewLoading}
				onUseForAi={handleUseForAi}
				onReprocess={() => void handleReprocess()}
				onDelete={() => void handleDelete()}
				busy={deleteReferenceFile.isPending || reprocessReferenceFile.isPending}
			/>
		</div>
	);
}
