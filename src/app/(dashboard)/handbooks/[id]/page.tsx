'use client';

import Link from 'next/link';
import { use, useEffect, useMemo, useState } from 'react';
import { FileArchive, Sparkles, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';
import { FileTreePanel } from '@/components/document-workflow/file-tree/FileTreePanel';
import {
	ScrollableDialog,
	ScrollableDialogBody,
	ScrollableDialogContent,
	ScrollableDialogDescription,
	ScrollableDialogFooter,
	ScrollableDialogHeader,
	ScrollableDialogTitle,
} from '@/components/document-workflow/modals/ScrollableDialog';
import {
	ScrollableSheet,
	ScrollableSheetBody,
	ScrollableSheetContent,
	ScrollableSheetDescription,
	ScrollableSheetHeader,
	ScrollableSheetTitle,
} from '@/components/document-workflow/modals/ScrollableSheet';
import { MissingPlaceholdersDialog } from '@/components/document-workflow/placeholders/MissingPlaceholdersDialog';
import { PlaceholderEditorDialog } from '@/components/document-workflow/placeholders/PlaceholderEditorDialog';
import { PlaceholderWorkspacePanel } from '@/components/document-workflow/placeholders/PlaceholderWorkspacePanel';
import { UploadSummaryCard } from '@/components/document-workflow/upload/UploadSummaryCard';
import { ZipUploadDropzone } from '@/components/document-workflow/upload/ZipUploadDropzone';
import { ScanSummary } from '@/components/document-workflow/workflow/ScanSummary';
import { UploadProgressSteps } from '@/components/document-workflow/workflow/UploadProgressSteps';
import { Header } from '@/components/layout/Header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useClient } from '@/hooks/useClients';
import {
	fetchHandbookFilePlaceholders,
	useComposePlaceholder,
	useCreateHandbookVersion,
	useDeleteHandbookVersion,
	useDownloadHandbookVersion,
	useExportHandbook,
	useFilePlaceholders,
	useHandbook,
	useHandbookCompletion,
	useHandbookTree,
	useHandbookVersions,
	useReferenceFiles,
	useSaveFilePlaceholders,
	useSaveSignatureCanvas,
	useUploadHandbookZip,
	useUploadWorkspaceAsset,
	useWorkspaceAssets,
	useDeleteWorkspaceAsset,
} from '@/hooks';
import {
	getPreferredReferenceId,
	setPreferredReferenceId,
} from '@/lib/document-workflow/reference-selection';
import {
	createHandbookUploadArchive,
	isZipUpload,
} from '@/lib/document-workflow/upload';
import {
	buildFileTreeItems,
	buildProjectUploadSummary,
	collectIncompleteFiles,
	findFirstActionableFile,
	findFileTreeItem,
	humanizePlaceholderLabel,
	mapPlaceholdersToEditable,
	type EditablePlaceholder,
	type FileTreeItem,
	type MissingPlaceholderItem,
	type PlaceholderListFilterState,
} from '@/lib/document-workflow/view-models';

interface PageProps {
	params: Promise<{ id: string }>;
}

interface LatestUploadState {
	sourceType: 'zip' | 'files';
	fileCount: number;
	label: string;
	warnings: string[];
}

function triggerBrowserDownload(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}

function getPlaceholderAssetType(placeholder: EditablePlaceholder | null) {
	return placeholder?.type === 'signature' ? 'signature' : 'logo';
}

function buildCurrentStep({
	filesScanned,
	selectedFile,
	totalPlaceholders,
	allComplete,
}: {
	filesScanned: number;
	selectedFile: FileTreeItem | null;
	totalPlaceholders: number;
	allComplete: boolean;
}) {
	if (filesScanned === 0) return 1;
	if (!selectedFile) return 2;
	if (totalPlaceholders === 0) return 3;
	if (allComplete) return 5;
	return 4;
}

function findFirstVisibleFile(items: FileTreeItem[]): FileTreeItem | null {
	for (const item of items) {
		if (item.kind === 'file' && item.id) {
			return item;
		}
		const nested = findFirstVisibleFile(item.children);
		if (nested) return nested;
	}
	return null;
}

function fileLabel(count: number) {
	return `${count} file${count === 1 ? '' : 's'}`;
}

export default function HandbookPage({ params }: PageProps) {
	const { id } = use(params);

	const { data: handbook, isLoading: handbookLoading } = useHandbook(id);
	const { data: client, isLoading: clientLoading } = useClient(
		handbook?.customer_id ?? '',
	);
	const { data: tree = [], isLoading: treeLoading } = useHandbookTree(id);
	const { data: completion } = useHandbookCompletion(id);
	const { data: assets = [] } = useWorkspaceAssets(id);
	const { data: versions = [] } = useHandbookVersions(id);
	const { data: referenceFiles = [] } = useReferenceFiles(id);

	const uploadZip = useUploadHandbookZip(id);
	const savePlaceholders = useSaveFilePlaceholders(id);
	const uploadWorkspaceAsset = useUploadWorkspaceAsset(id);
	const deleteWorkspaceAsset = useDeleteWorkspaceAsset(id);
	const saveSignature = useSaveSignatureCanvas(id);
	const composePlaceholder = useComposePlaceholder(id);
	const exportHandbook = useExportHandbook(id);
	const createVersion = useCreateHandbookVersion(id);
	const downloadVersion = useDownloadHandbookVersion(id);
	const deleteVersion = useDeleteHandbookVersion(id);

	const [uploadError, setUploadError] = useState<string | null>(null);
	const [showAllFiles, setShowAllFiles] = useState(false);
	const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
	const [treeSheetOpen, setTreeSheetOpen] = useState(false);
	const [editingPlaceholderId, setEditingPlaceholderId] = useState<string | null>(
		null,
	);
	const [draftValues, setDraftValues] = useState<Record<string, string>>({});
	const [placeholderFilters, setPlaceholderFilters] =
		useState<PlaceholderListFilterState>({
			search: '',
			status: 'all',
			type: 'all',
		});
	const [missingItems, setMissingItems] = useState<MissingPlaceholderItem[]>([]);
	const [missingDialogOpen, setMissingDialogOpen] = useState(false);
	const [missingDialogLoading, setMissingDialogLoading] = useState(false);
	const [actionsOpen, setActionsOpen] = useState(false);
	const [preferredReferenceId, setPreferredReferenceIdState] = useState<
		string | null
	>(null);
	const [latestUpload, setLatestUpload] = useState<LatestUploadState | null>(null);
	const [aiDialogOpen, setAiDialogOpen] = useState(false);
	const [clearingPlaceholderId, setClearingPlaceholderId] = useState<string | null>(
		null,
	);

	const summary = useMemo(
		() => buildProjectUploadSummary(tree, completion),
		[completion, tree],
	);
	const treeItems = useMemo(
		() => buildFileTreeItems(tree, { showAllFiles }),
		[showAllFiles, tree],
	);
	const selectedFile = useMemo(
		() => findFileTreeItem(treeItems, selectedFileId),
		[selectedFileId, treeItems],
	);
	const { data: fileData, isLoading: placeholdersLoading } = useFilePlaceholders(
		id,
		selectedFileId,
	);
	const placeholders = useMemo(
		() => mapPlaceholdersToEditable(fileData?.placeholders ?? []),
		[fileData],
	);
	const editingPlaceholder = useMemo(
		() =>
			placeholders.find(placeholder => placeholder.id === editingPlaceholderId) ??
			null,
		[editingPlaceholderId, placeholders],
	);

	const logoAsset = assets.find(item => item.asset_type === 'logo');
	const signatureAsset = assets.find(item => item.asset_type === 'signature');
	const totalRequired = completion?.required_total ?? summary.totalPlaceholders;
	const resolvedRequired =
		completion?.required_resolved ??
		Math.max(summary.totalPlaceholders - summary.unresolvedPlaceholders, 0);
	const missingRequired = Math.max(totalRequired - resolvedRequired, 0);
	const allComplete =
		completion?.is_complete_required ??
		(totalRequired === 0 || resolvedRequired >= totalRequired);
	const currentStep = buildCurrentStep({
		filesScanned: summary.filesScanned,
		selectedFile,
		totalPlaceholders: summary.totalPlaceholders,
		allComplete,
	});
	const currentTextValue =
		editingPlaceholder?.type === 'text'
			? draftValues[editingPlaceholder.raw.key] ?? editingPlaceholder.value
			: '';
	const currentAssetPreviewUrl =
		editingPlaceholder?.type === 'signature'
			? signatureAsset?.preview_url ?? signatureAsset?.download_url ?? null
			: editingPlaceholder?.type === 'image'
				? logoAsset?.preview_url ?? logoAsset?.download_url ?? null
				: null;
	const isPlaceholderSaving =
		savePlaceholders.isPending ||
		uploadWorkspaceAsset.isPending ||
		saveSignature.isPending ||
		deleteWorkspaceAsset.isPending;

	useEffect(() => {
		setPreferredReferenceIdState(getPreferredReferenceId(id));
	}, [id]);

	useEffect(() => {
		if (!fileData) {
			setDraftValues({});
			return;
		}

		const nextDraftValues: Record<string, string> = {};
		for (const placeholder of fileData.placeholders) {
			if (placeholder.kind !== 'TEXT') continue;
			nextDraftValues[placeholder.key] = placeholder.value_text ?? '';
		}
		setDraftValues(nextDraftValues);
	}, [fileData]);

	useEffect(() => {
		const visibleSelected = findFileTreeItem(treeItems, selectedFileId);
		if (visibleSelected) return;

		const fallback =
			findFirstVisibleFile(treeItems) ?? findFirstActionableFile(tree);
		setSelectedFileId(fallback?.id ?? null);
	}, [selectedFileId, tree, treeItems]);

	useEffect(() => {
		setPlaceholderFilters({
			search: '',
			status: 'all',
			type: 'all',
		});
	}, [selectedFileId]);

	if (handbookLoading || clientLoading) {
		return (
			<div className="flex h-64 items-center justify-center">
				<Spinner />
			</div>
		);
	}

	if (!handbook || !client) {
		return <div className="p-8 text-gray-500">Document workspace not found.</div>;
	}

	async function handleUpload(files: File[]) {
		setUploadError(null);
		try {
			const archive = await createHandbookUploadArchive(files);
			const result = await uploadZip.mutateAsync(archive);
			const firstFile = findFirstActionableFile(result.tree);

			setLatestUpload({
				sourceType: isZipUpload(archive) && files.length === 1 ? 'zip' : 'files',
				fileCount: result.summary.files_total,
				label:
					isZipUpload(archive) && files.length === 1
						? archive.name
						: `${fileLabel(files.length)} selected`,
				warnings: result.warnings.map(item => item.message),
			});
			setShowAllFiles(false);
			setSelectedFileId(firstFile?.id ?? null);
			toast.success(
				result.summary.files_total === 1
					? 'Document package uploaded successfully.'
					: `${result.summary.files_total} files were uploaded successfully.`,
			);
			if (result.warnings.length > 0) {
				toast.warning(
					`${result.warnings.length} file${result.warnings.length === 1 ? '' : 's'} need review.`,
				);
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Document upload failed.';
			setUploadError(message);
			toast.error(message);
		}
	}

	function updateDraftValue(value: string) {
		if (!editingPlaceholder || editingPlaceholder.type !== 'text') return;
		setDraftValues(previous => ({
			...previous,
			[editingPlaceholder.raw.key]: value,
		}));
	}

	async function handleSaveTextPlaceholder() {
		if (!selectedFileId || !editingPlaceholder) return;

		try {
			await savePlaceholders.mutateAsync({
				fileId: selectedFileId,
				values: [
					{
						key: editingPlaceholder.raw.key,
						value_text: draftValues[editingPlaceholder.raw.key] ?? '',
						source: 'MANUAL',
					},
				],
				source: 'MANUAL',
			});
			toast.success('Placeholder saved.');
			setEditingPlaceholderId(null);
			setAiDialogOpen(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Saving the placeholder failed.',
			);
		}
	}

	async function handleSaveImagePlaceholder(file: File) {
		if (!editingPlaceholder) return;

		try {
			await uploadWorkspaceAsset.mutateAsync({
				file,
				assetType: getPlaceholderAssetType(editingPlaceholder),
			});
			toast.success('Image saved.');
			setEditingPlaceholderId(null);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Saving the image failed.',
			);
		}
	}

	async function handleSaveSignature(dataUrl: string) {
		try {
			await saveSignature.mutateAsync({ dataUrl });
			toast.success('Signature saved.');
			setEditingPlaceholderId(null);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Saving the signature failed.',
			);
		}
	}

	async function handleClearPlaceholder(placeholder: EditablePlaceholder) {
		if (!selectedFileId) return;

		try {
			setClearingPlaceholderId(placeholder.id);
			if (placeholder.type === 'text') {
				await savePlaceholders.mutateAsync({
					fileId: selectedFileId,
					values: [
						{
							key: placeholder.raw.key,
							value_text: '',
							source: 'MANUAL',
						},
					],
					source: 'MANUAL',
				});
			} else {
				await deleteWorkspaceAsset.mutateAsync({
					assetType: getPlaceholderAssetType(placeholder),
				});
			}
			toast.success(`${placeholder.label} cleared.`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Clearing the placeholder failed.',
			);
		} finally {
			setClearingPlaceholderId(null);
		}
	}

	async function handleGenerateWithAi(input: {
		industry: string;
		instruction: string;
		referenceId: string | null;
	}) {
		if (!selectedFileId || !selectedFile || !editingPlaceholder) {
			throw new Error('Open a file and placeholder first.');
		}

		const extraInstruction = [
			input.industry.trim()
				? `Company industry: ${input.industry.trim()}.`
				: '',
			input.instruction.trim(),
		]
			.filter(Boolean)
			.join('\n');

		const result = await composePlaceholder.mutateAsync({
			fileId: selectedFileId,
			placeholderKey: editingPlaceholder.raw.key,
			currentValue: draftValues[editingPlaceholder.raw.key] ?? '',
			instruction:
				extraInstruction ||
				`Create a clear and professional value for ${editingPlaceholder.label}.`,
			language: 'de-DE',
			outputStyle: 'formal',
			referenceScope: 'handbook',
			referenceDocumentIds: input.referenceId ? [input.referenceId] : [],
			useFileContext: true,
			constraints: {
				max_length:
					editingPlaceholder.raw.suggested_output_class === 'short' ? 220 : 1600,
				required: editingPlaceholder.raw.required,
			},
			modeHint: editingPlaceholder.raw.suggested_mode,
		});

		if (input.referenceId) {
			setPreferredReferenceId(id, input.referenceId);
			setPreferredReferenceIdState(input.referenceId);
		}

		toast.success('AI draft created.');
		return result.value;
	}

	async function buildMissingPlaceholderItems() {
		const incompleteFiles = collectIncompleteFiles(completion);
		if (incompleteFiles.length === 0) return [];

		const payload = await Promise.all(
			incompleteFiles.map(async file => {
				const response = await fetchHandbookFilePlaceholders(id, file.fileId);
				return response.placeholders
					.filter(placeholder => placeholder.required && !placeholder.resolved)
					.map(placeholder => ({
						fileId: file.fileId,
						filePath: file.filePath,
						name: placeholder.key,
						label: humanizePlaceholderLabel(placeholder.key),
					}));
			}),
		);

		return payload.flat();
	}

	async function handleGenerateDocument() {
		if (!allComplete) {
			try {
				setMissingDialogLoading(true);
				const items = await buildMissingPlaceholderItems();
				setMissingItems(items);
				setMissingDialogOpen(true);
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: 'Could not load missing placeholders.',
				);
			} finally {
				setMissingDialogLoading(false);
			}
			return;
		}

		try {
			const result = await exportHandbook.mutateAsync();
			triggerBrowserDownload(result.blob, result.filename);
			toast.success('Document package generated successfully.');
		} catch (error) {
			const details = (
				error as Error & { details?: { errors?: Array<{ message?: string }> } }
			).details;
			if (details && Array.isArray(details.errors) && details.errors.length > 0) {
				toast.error(details.errors[0].message ?? 'Generation is blocked.');
				return;
			}
			toast.error(
				error instanceof Error ? error.message : 'Document generation failed.',
			);
		}
	}

	function handleReviewMissing() {
		const firstItem = missingItems[0];
		if (!firstItem) return;
		setSelectedFileId(firstItem.fileId);
		setTreeSheetOpen(false);
	}

	async function handleCreateSnapshot() {
		try {
			const result = await createVersion.mutateAsync({
				createdBy: 'user',
				reason: 'manual_snapshot',
			});
			if (result.created) {
				toast.success(`Snapshot v${result.snapshot.version_number} created.`);
				return;
			}
			toast.info(`No changes since v${result.snapshot.version_number}.`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Creating the snapshot failed.',
			);
		}
	}

	async function handleDownloadVersion(versionNumber: number) {
		try {
			const result = await downloadVersion.mutateAsync(versionNumber);
			triggerBrowserDownload(result.blob, result.filename);
			toast.success(`Snapshot v${versionNumber} downloaded.`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Downloading the snapshot failed.',
			);
		}
	}

	async function handleDeleteVersion(versionNumber: number) {
		if (!confirm(`Delete snapshot v${versionNumber}?`)) return;
		try {
			await deleteVersion.mutateAsync(versionNumber);
			toast.success(`Snapshot v${versionNumber} deleted.`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Deleting the snapshot failed.',
			);
		}
	}

	return (
		<div className="min-h-screen bg-slate-50">
			<Header
				title="Documents"
				subtitle={`${client.name} · ${fileLabel(summary.filesScanned)} scanned`}
				actions={
					<div className="flex items-center gap-2">
						<Badge variant={missingRequired === 0 ? 'green' : 'orange'}>
							{resolvedRequired}/{totalRequired} required filled
						</Badge>
						<Button asChild size="sm" variant="outline">
							<Link href={`/handbooks/${id}/reference-files`}>Reference Files</Link>
						</Button>
						<Button size="sm" variant="outline" onClick={() => setActionsOpen(true)}>
							More Actions
						</Button>
						<Button
							size="sm"
							onClick={() => void handleGenerateDocument()}
							loading={exportHandbook.isPending || missingDialogLoading}
						>
							<WandSparkles className="h-4 w-4" />
							Generate Output
						</Button>
					</div>
				}
			/>

			<div className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8">
				<UploadProgressSteps currentStep={currentStep} />

				<div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
					<div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
						<div className="space-y-2">
							<Badge variant="blue">Step 1</Badge>
							<h2 className="text-2xl font-semibold text-slate-900">
								Upload your template package
							</h2>
							<p className="max-w-2xl text-sm text-slate-600">
								Use a ZIP file to restore the full project structure automatically.
								You can still upload individual files if needed.
							</p>
						</div>

						<div className="mt-6">
							<ZipUploadDropzone
								loading={uploadZip.isPending}
								error={uploadError}
								onUpload={handleUpload}
							/>
						</div>
					</div>

					<div className="space-y-6">
						<UploadSummaryCard
							sourceType={latestUpload?.sourceType ?? null}
							fileCount={latestUpload?.fileCount ?? 0}
							label={latestUpload?.label}
							warnings={latestUpload?.warnings ?? []}
						/>
						<ScanSummary summary={summary} />
					</div>
				</div>

				<div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
					<div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
						<div className="space-y-2">
							<Badge variant="gray">Steps 2 to 4</Badge>
							<h3 className="text-xl font-semibold text-slate-900">
								Review extracted files and fill placeholders
							</h3>
							<p className="max-w-3xl text-sm text-slate-500">
								Select a file from the tree to work only on the placeholders that
								belong to that file. Reference material stays separate so the main
								workflow remains simple.
							</p>
						</div>
						<div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
							<div className="flex items-center gap-2">
								<FileArchive className="h-4 w-4" />
								<span>
									{summary.filesWithPlaceholders} files with placeholders,{' '}
									{summary.unresolvedPlaceholders} still empty
								</span>
							</div>
						</div>
					</div>

					{treeLoading ? (
						<div className="flex justify-center py-16">
							<Spinner />
						</div>
					) : (
						<div className="mt-6 grid gap-6 md:grid-cols-[340px_minmax(0,1fr)]">
							<div className="hidden md:block">
								<FileTreePanel
									items={treeItems}
									showAllFiles={showAllFiles}
									totalFileCount={summary.filesScanned}
									selectedFileId={selectedFileId}
									onToggleShowAllFiles={() =>
										setShowAllFiles(current => !current)
									}
									onSelectFile={fileId => {
										setSelectedFileId(fileId);
										setTreeSheetOpen(false);
									}}
								/>
							</div>

							<PlaceholderWorkspacePanel
								selectedFile={selectedFile}
								loading={placeholdersLoading}
								placeholders={placeholders}
								filters={placeholderFilters}
								onFiltersChange={setPlaceholderFilters}
								onEdit={placeholder => {
									setEditingPlaceholderId(placeholder.id);
									setAiDialogOpen(false);
								}}
								onAutofill={placeholder => {
									setEditingPlaceholderId(placeholder.id);
									setAiDialogOpen(true);
								}}
								onClear={placeholder => void handleClearPlaceholder(placeholder)}
								clearingPlaceholderId={clearingPlaceholderId}
								onOpenTree={() => setTreeSheetOpen(true)}
							/>
						</div>
					)}
				</div>
			</div>

			<ScrollableSheet open={treeSheetOpen} onOpenChange={setTreeSheetOpen}>
				<ScrollableSheetContent side="left" className="md:hidden">
					<ScrollableSheetHeader>
						<ScrollableSheetTitle>Project Files</ScrollableSheetTitle>
						<ScrollableSheetDescription>
							Select a file to review its placeholders.
						</ScrollableSheetDescription>
					</ScrollableSheetHeader>
					<ScrollableSheetBody className="p-0">
						<FileTreePanel
							items={treeItems}
							showAllFiles={showAllFiles}
							totalFileCount={summary.filesScanned}
							selectedFileId={selectedFileId}
							onToggleShowAllFiles={() => setShowAllFiles(current => !current)}
							onSelectFile={fileId => {
								setSelectedFileId(fileId);
								setTreeSheetOpen(false);
							}}
						/>
					</ScrollableSheetBody>
				</ScrollableSheetContent>
			</ScrollableSheet>

			<PlaceholderEditorDialog
				open={Boolean(editingPlaceholder)}
				onOpenChange={open => {
					if (!open) {
						setEditingPlaceholderId(null);
						setAiDialogOpen(false);
					}
				}}
				placeholder={editingPlaceholder}
				value={currentTextValue}
				onValueChange={updateDraftValue}
				onSaveText={handleSaveTextPlaceholder}
				onSaveImage={handleSaveImagePlaceholder}
				onSaveSignature={handleSaveSignature}
				onGenerateWithAi={handleGenerateWithAi}
				referenceFiles={referenceFiles}
				defaultIndustry={client.industry}
				defaultReferenceId={preferredReferenceId}
				assetPreviewUrl={currentAssetPreviewUrl}
				saving={isPlaceholderSaving}
				aiLoading={composePlaceholder.isPending}
				aiOpen={aiDialogOpen}
				onAiOpenChange={setAiDialogOpen}
			/>

			<MissingPlaceholdersDialog
				open={missingDialogOpen}
				onOpenChange={setMissingDialogOpen}
				items={missingItems}
				onFillNow={handleReviewMissing}
			/>

			<ScrollableDialog open={actionsOpen} onOpenChange={setActionsOpen}>
				<ScrollableDialogContent size="xl">
					<ScrollableDialogHeader>
						<ScrollableDialogTitle>More Actions</ScrollableDialogTitle>
						<ScrollableDialogDescription>
							Access snapshots and supporting tools without adding extra clutter to
							the main workspace.
						</ScrollableDialogDescription>
					</ScrollableDialogHeader>

					<ScrollableDialogBody className="space-y-6">
						<div className="flex flex-wrap gap-2">
							<Button asChild variant="outline">
								<Link href={`/handbooks/${id}/reference-files`}>Open Reference Files</Link>
							</Button>
							<Button
								onClick={() => void handleCreateSnapshot()}
								loading={createVersion.isPending}
							>
								Create Snapshot
							</Button>
						</div>

						<div className="space-y-3">
							<h3 className="text-sm font-semibold text-slate-900">Snapshots</h3>
							{versions.length === 0 ? (
								<div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
									No snapshots created yet.
								</div>
							) : (
								<div className="space-y-3">
									{versions.map(version => (
										<div
											key={version.id}
											className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
										>
											<div>
												<p className="font-medium text-slate-900">
													Snapshot v{version.version_number}
												</p>
												<p className="text-sm text-slate-500">
													Created {new Date(version.created_at).toLocaleString('de-DE')}
												</p>
											</div>
											<div className="flex flex-wrap gap-2">
												<Button
													size="sm"
													variant="outline"
													onClick={() => void handleDownloadVersion(version.version_number)}
													loading={
														downloadVersion.isPending &&
														downloadVersion.variables === version.version_number
													}
												>
													Download
												</Button>
												<Button
													size="sm"
													variant="ghost"
													className="text-red-600"
													onClick={() => void handleDeleteVersion(version.version_number)}
													loading={
														deleteVersion.isPending &&
														deleteVersion.variables === version.version_number
													}
												>
													Delete
												</Button>
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					</ScrollableDialogBody>
				</ScrollableDialogContent>
			</ScrollableDialog>
		</div>
	);
}
