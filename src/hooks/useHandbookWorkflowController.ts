'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useClient } from '@/hooks/useClients';
import { useHandbook } from '@/hooks/useHandbook';
import {
	fetchHandbookFilePlaceholders,
	useComposePlaceholder,
	useExportHandbook,
	useFilePlaceholders,
	useHandbookCompletion,
	useHandbookTree,
	useHandbookVersions,
	useReferenceFiles,
	useSaveFilePlaceholders,
	useUploadHandbookZip,
} from '@/hooks/useHandbookWorkspace';
import {
	useDeleteWorkspaceAsset,
	useUploadWorkspaceAsset,
	useWorkspaceAssets,
} from '@/hooks/useWorkspaceAssets';
import {
	getPreferredReferenceId,
	setPreferredReferenceId,
} from '@/lib/document-workflow/reference-selection';
import { canonicalizePlaceholderKey } from '@/lib/document-workflow/placeholder-normalization';
import {
	ExportReadinessSchema,
	type UploadMetadata,
	UploadMetadataSchema,
} from '@/lib/document-workflow/workflow-schemas';
import {
	buildWorkflowStepCheckpoint,
	deriveWorkflowSteps,
	type WorkflowStepCheckpoint,
} from '@/lib/document-workflow/workflow-stepper';
import {
	buildExportFileStates,
	buildFileTreeItems,
	buildProjectUploadSummary,
	collectIncompleteFiles,
	findFileTreeItem,
	findFirstActionableFile,
	mapPlaceholdersToEditable,
	type EditablePlaceholder,
	type FileTreeItem,
	type PlaceholderListFilterState,
	type PlaceholderSaveState,
} from '@/lib/document-workflow/view-models';
import {
	createHandbookUploadArchive,
	isZipUpload,
} from '@/lib/document-workflow/upload';
import type { HandbookComposeResponse, ReferenceDocument } from '@/types';

const AUTOSAVE_DELAY_MS = 1800;

interface LatestUploadState extends UploadMetadata {}

interface DraftState {
	value: string;
	saveState: PlaceholderSaveState;
	errorMessage: string | null;
}

function fileLabel(count: number) {
	return `${count} file${count === 1 ? '' : 's'}`;
}

function getAssetTypeForPlaceholder(placeholder: EditablePlaceholder | null) {
	return placeholder?.type === 'signature' ? 'signature' : 'logo';
}

type WorkflowCheckpointKey = 'assets' | 'review';

export function useHandbookWorkflowController(handbookId: string) {
	const { data: handbook, isLoading: handbookLoading } =
		useHandbook(handbookId);
	const { data: client, isLoading: clientLoading } = useClient(
		handbook?.customer_id ?? '',
	);
	const { data: tree = [], isLoading: treeLoading } =
		useHandbookTree(handbookId);
	const { data: completion } = useHandbookCompletion(handbookId);
	const { data: versions = [] } = useHandbookVersions(handbookId);
	const { data: assets = [] } = useWorkspaceAssets(handbookId);
	const { data: referenceFiles = [] } = useReferenceFiles(handbookId);

	const uploadZip = useUploadHandbookZip(handbookId);
	const savePlaceholders = useSaveFilePlaceholders(handbookId);
	const uploadWorkspaceAsset = useUploadWorkspaceAsset(handbookId);
	const deleteWorkspaceAsset = useDeleteWorkspaceAsset(handbookId);
	const composePlaceholder = useComposePlaceholder(handbookId);
	const exportHandbook = useExportHandbook(handbookId);

	const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [latestUpload, setLatestUpload] = useState<LatestUploadState | null>(
		null,
	);
	const [showAllFiles, setShowAllFiles] = useState(false);
	const [treeSearch, setTreeSearch] = useState('');
	const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
	const [treeSheetOpen, setTreeSheetOpen] = useState(false);
	const [placeholderFilters, setPlaceholderFilters] =
		useState<PlaceholderListFilterState>({
			search: '',
			status: 'all',
			type: 'all',
		});
	const [draftsById, setDraftsById] = useState<Record<string, DraftState>>({});
	const [expandedPlaceholderId, setExpandedPlaceholderId] = useState<
		string | null
	>(null);
	const [aiPlaceholderId, setAiPlaceholderId] = useState<string | null>(null);
	const [preferredReferenceId, setPreferredReferenceIdState] = useState<
		string | null
	>(null);
	const [assetActionType, setAssetActionType] = useState<
		'logo' | 'signature' | null
	>(null);
	const [stepCheckpoints, setStepCheckpoints] = useState<{
		assets: WorkflowStepCheckpoint | null;
		review: WorkflowStepCheckpoint | null;
	}>({
		assets: null,
		review: null,
	});
	const [localExportCompletionHash, setLocalExportCompletionHash] = useState<
		string | null
	>(null);
	const [missingPlaceholdersByFile, setMissingPlaceholdersByFile] = useState<
		Record<string, string[]>
	>({});
	const [missingReasonsLoading, setMissingReasonsLoading] = useState(false);

	const autosaveTimersRef = useRef<
		Record<string, ReturnType<typeof setTimeout>>
	>({});
	const latestDraftsRef = useRef<Record<string, DraftState>>({});

	const summary = useMemo(
		() => buildProjectUploadSummary(tree, completion),
		[completion, tree],
	);

	const latestExportCompletionHash = useMemo(() => {
		const versionHash =
			versions.find(item => item.downloadable)?.manifest?.completion_hash;
		return typeof versionHash === 'string'
			? versionHash
			: localExportCompletionHash;
	}, [localExportCompletionHash, versions]);

	const workflowCheckpoint = useMemo(
		() => buildWorkflowStepCheckpoint(completion, assets),
		[assets, completion],
	);

	const workflowSteps = useMemo(
		() =>
			deriveWorkflowSteps({
				currentStep,
				filesScanned: summary.filesScanned,
				handbookStatus: handbook?.status,
				completion,
				assets,
				assetsCheckpoint: stepCheckpoints.assets,
				reviewCheckpoint: stepCheckpoints.review,
				latestExportCompletionHash,
			}),
		[
			assets,
			completion,
			currentStep,
			handbook?.status,
			latestExportCompletionHash,
			stepCheckpoints.assets,
			stepCheckpoints.review,
			summary.filesScanned,
		],
	);

	function recordStepCheckpoint(step: WorkflowCheckpointKey) {
		if (!workflowCheckpoint) return;
		setStepCheckpoints(previous => ({
			...previous,
			[step]: workflowCheckpoint,
		}));
	}

	useEffect(() => {
		latestDraftsRef.current = draftsById;
	}, [draftsById]);

	useEffect(() => {
		setPreferredReferenceIdState(getPreferredReferenceId(handbookId));
	}, [handbookId]);

	const treeItems = useMemo(
		() =>
			buildFileTreeItems(
				tree,
				{
					showAllFiles,
					search: treeSearch,
				},
				completion,
			),
		[completion, showAllFiles, tree, treeSearch],
	);

	useEffect(() => {
		const visibleSelected = findFileTreeItem(treeItems, selectedFileId);
		if (visibleSelected) return;

		const fallback = findFirstActionableFile(tree);
		setSelectedFileId(fallback?.id ?? null);
	}, [selectedFileId, tree, treeItems]);

	const selectedFile = useMemo(
		() => findFileTreeItem(treeItems, selectedFileId),
		[selectedFileId, treeItems],
	);

	const { data: fileData, isLoading: placeholdersLoading } =
		useFilePlaceholders(handbookId, selectedFileId);

	useEffect(() => {
		if (!fileData) {
			setDraftsById({});
			setExpandedPlaceholderId(null);
			return;
		}

		setDraftsById(previous => {
			const next: Record<string, DraftState> = {};
			for (const placeholder of fileData.placeholders) {
				if (placeholder.kind !== 'TEXT') continue;
				const current = previous[placeholder.id];
				const persistedValue = placeholder.value_text ?? '';
				if (
					current &&
					(current.saveState === 'editing' ||
						current.saveState === 'autosaving' ||
						current.saveState === 'error')
				) {
					next[placeholder.id] = current;
					continue;
				}
				next[placeholder.id] = {
					value: persistedValue,
					saveState: placeholder.resolved ? 'saved' : 'idle',
					errorMessage: null,
				};
			}
			return next;
		});
	}, [fileData]);

	const logoAsset = useMemo(
		() => assets.find(item => item.asset_type === 'logo') ?? null,
		[assets],
	);
	const signatureAsset = useMemo(
		() => assets.find(item => item.asset_type === 'signature') ?? null,
		[assets],
	);

	const placeholders = useMemo(
		() =>
			mapPlaceholdersToEditable(fileData?.placeholders ?? [], {
				draftsById,
				activeAssets: {
					logo: Boolean(logoAsset),
					signature: Boolean(signatureAsset),
				},
			}),
		[draftsById, fileData, logoAsset, signatureAsset],
	);

	const placeholderById = useMemo(() => {
		return new Map(placeholders.map(item => [item.id, item]));
	}, [placeholders]);

	const selectedAiPlaceholder = useMemo(
		() =>
			placeholders.find(placeholder => placeholder.id === aiPlaceholderId) ??
			null,
		[aiPlaceholderId, placeholders],
	);

	const optimisticCompletion = useMemo(() => {
		if (!completion || !selectedFileId || placeholders.length === 0) {
			return completion;
		}

		const selectedCompletion = completion.files.find(
			file => file.file_id === selectedFileId,
		);
		if (!selectedCompletion) return completion;

		const requiredTotal = placeholders.filter(item => item.required).length;
		const requiredResolved = placeholders.filter(
			item => item.required && item.status === 'filled',
		).length;
		const delta = requiredResolved - selectedCompletion.required_resolved;

		const files = completion.files.map(file =>
			file.file_id === selectedFileId
				? {
						...file,
						required_total: requiredTotal,
						required_resolved: requiredResolved,
						is_complete_required: requiredTotal === requiredResolved,
					}
				: file,
		);

		return {
			...completion,
			required_total: completion.required_total,
			required_resolved: Math.max(completion.required_resolved + delta, 0),
			is_complete_required:
				completion.required_total ===
				Math.max(completion.required_resolved + delta, 0),
			files,
		};
	}, [completion, placeholders, selectedFileId]);

	const exportFileStates = useMemo(
		() =>
			buildExportFileStates(
				optimisticCompletion,
				missingPlaceholdersByFile,
			).map(state => ExportReadinessSchema.parse(state)),
		[missingPlaceholdersByFile, optimisticCompletion],
	);

	const readyFiles = useMemo(
		() => exportFileStates.filter(file => file.downloadState === 'ready'),
		[exportFileStates],
	);
	const blockedFiles = useMemo(
		() => exportFileStates.filter(file => file.downloadState === 'blocked'),
		[exportFileStates],
	);

	const totalRequired =
		optimisticCompletion?.required_total ?? summary.totalPlaceholders;
	const resolvedRequired =
		optimisticCompletion?.required_resolved ??
		Math.max(summary.totalPlaceholders - summary.unresolvedPlaceholders, 0);
	const allComplete =
		optimisticCompletion?.is_complete_required ??
		(totalRequired === 0 || resolvedRequired >= totalRequired);

	useEffect(() => {
		if (summary.filesScanned === 0) {
			setCurrentStep(1);
			setStepCheckpoints({
				assets: null,
				review: null,
			});
			setLocalExportCompletionHash(null);
		}
	}, [summary.filesScanned]);

	useEffect(() => {
		setPlaceholderFilters({
			search: '',
			status: 'all',
			type: 'all',
		});
	}, [selectedFileId]);

	useEffect(() => {
		const nextExpandable =
			placeholders.find(item => item.status === 'empty' && item.required)?.id ??
			placeholders[0]?.id ??
			null;
		setExpandedPlaceholderId(nextExpandable);
	}, [selectedFileId, placeholders]);

	useEffect(() => {
		if (currentStep !== 4) return;
		const incompleteFiles = collectIncompleteFiles(optimisticCompletion);
		if (incompleteFiles.length === 0) {
			setMissingPlaceholdersByFile({});
			return;
		}

		let cancelled = false;
		setMissingReasonsLoading(true);
		void Promise.all(
			incompleteFiles.map(async file => {
				const response = await fetchHandbookFilePlaceholders(
					handbookId,
					file.fileId,
				);
				return {
					fileId: file.fileId,
					missing: response.placeholders
						.filter(
							placeholder => placeholder.required && !placeholder.resolved,
						)
						.map(placeholder => canonicalizePlaceholderKey(placeholder.key))
						.map(humanizeMissingKey),
				};
			}),
		)
			.then(result => {
				if (cancelled) return;
				setMissingPlaceholdersByFile(
					Object.fromEntries(result.map(item => [item.fileId, item.missing])),
				);
			})
			.catch(error => {
				if (cancelled) return;
				toast.error(
					error instanceof Error
						? error.message
						: 'Could not load missing placeholder details.',
				);
			})
			.finally(() => {
				if (!cancelled) {
					setMissingReasonsLoading(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [currentStep, handbookId, optimisticCompletion]);

	async function handleUpload(files: File[]) {
		setUploadError(null);
		try {
			const archive = await createHandbookUploadArchive(files);
			const result = await uploadZip.mutateAsync(archive);
			const firstFile = findFirstActionableFile(result.tree);
			const nextUpload = UploadMetadataSchema.parse({
				sourceType:
					isZipUpload(archive) && files.length === 1 ? 'zip' : 'files',
				fileCount: result.summary.files_total,
				label:
					isZipUpload(archive) && files.length === 1
						? archive.name
						: `${fileLabel(files.length)} selected`,
				warnings: result.warnings.map(item => item.message),
			});

			setLatestUpload(nextUpload);
			setShowAllFiles(false);
			setTreeSearch('');
			setSelectedFileId(firstFile?.id ?? null);
			setCurrentStep(2);
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

	function scheduleAutosave(placeholderId: string) {
		const currentTimer = autosaveTimersRef.current[placeholderId];
		if (currentTimer) {
			clearTimeout(currentTimer);
		}

		autosaveTimersRef.current[placeholderId] = setTimeout(() => {
			void flushPlaceholderSave(placeholderId);
		}, AUTOSAVE_DELAY_MS);
	}

	function updateDraftState(placeholderId: string, draft: Partial<DraftState>) {
		setDraftsById(previous => ({
			...previous,
			[placeholderId]: {
				value: previous[placeholderId]?.value ?? '',
				saveState: previous[placeholderId]?.saveState ?? 'idle',
				errorMessage: previous[placeholderId]?.errorMessage ?? null,
				...draft,
			},
		}));
	}

	function updateTextPlaceholder(placeholderId: string, value: string) {
		updateDraftState(placeholderId, {
			value,
			saveState: 'editing',
			errorMessage: null,
		});
		scheduleAutosave(placeholderId);
	}

	async function flushPlaceholderSave(placeholderId: string) {
		const currentTimer = autosaveTimersRef.current[placeholderId];
		if (currentTimer) {
			clearTimeout(currentTimer);
			delete autosaveTimersRef.current[placeholderId];
		}

		const placeholder = placeholderById.get(placeholderId);
		const draft = latestDraftsRef.current[placeholderId];
		if (
			!selectedFileId ||
			!placeholder ||
			placeholder.type !== 'text' ||
			!draft
		) {
			return;
		}

		const valueToSave = draft.value;
		updateDraftState(placeholderId, {
			saveState: 'autosaving',
			errorMessage: null,
		});

		try {
			await savePlaceholders.mutateAsync({
				fileId: selectedFileId,
				values: [
					{
						key: placeholder.raw.key,
						value_text: valueToSave,
						source: 'MANUAL',
					},
				],
				source: 'MANUAL',
			});

			const latestDraft = latestDraftsRef.current[placeholderId];
			if (!latestDraft || latestDraft.value !== valueToSave) {
				updateDraftState(placeholderId, {
					saveState: 'editing',
					errorMessage: null,
				});
				scheduleAutosave(placeholderId);
				return;
			}

			updateDraftState(placeholderId, {
				saveState: 'saved',
				errorMessage: null,
			});
		} catch (error) {
			updateDraftState(placeholderId, {
				saveState: 'error',
				errorMessage:
					error instanceof Error ? error.message : 'Autosave failed.',
			});
		}
	}

	async function flushAllPendingDrafts() {
		const draftIds = Object.entries(latestDraftsRef.current)
			.filter(
				([, draft]) =>
					draft.saveState === 'editing' || draft.saveState === 'error',
			)
			.map(([placeholderId]) => placeholderId);

		for (const placeholderId of draftIds) {
			await flushPlaceholderSave(placeholderId);
		}
	}

	async function selectFile(fileId: string) {
		await flushAllPendingDrafts();
		setSelectedFileId(fileId);
		setTreeSheetOpen(false);
	}

	async function changeStep(step: 1 | 2 | 3 | 4) {
		const stepState = workflowSteps.find(item => item.id === step)?.state;
		if (stepState === 'locked') {
			return;
		}

		if (step >= 3) {
			await flushAllPendingDrafts();
		}

		if (currentStep === 2) {
			const currentAssetsStep = workflowSteps.find(item => item.id === 2);
			if (currentAssetsStep?.isComplete) {
				recordStepCheckpoint('assets');
			}
		}

		if (currentStep === 3) {
			const currentReviewStep = workflowSteps.find(item => item.id === 3);
			if (currentReviewStep?.isComplete) {
				recordStepCheckpoint('review');
			}
		}

		setCurrentStep(step);
	}

	async function clearTextPlaceholder(placeholderId: string) {
		updateTextPlaceholder(placeholderId, '');
		await flushPlaceholderSave(placeholderId);
	}

	async function uploadAsset(assetType: 'logo' | 'signature', file: File) {
		try {
			setAssetActionType(assetType);
			await uploadWorkspaceAsset.mutateAsync({
				file,
				assetType,
			});
			toast.success(
				assetType === 'logo' ? 'Logo updated.' : 'Signature updated.',
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Asset upload failed.',
			);
		} finally {
			setAssetActionType(null);
		}
	}

	async function removeAsset(assetType: 'logo' | 'signature') {
		try {
			setAssetActionType(assetType);
			await deleteWorkspaceAsset.mutateAsync({ assetType });
			toast.success(
				assetType === 'logo' ? 'Logo removed.' : 'Signature removed.',
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : 'Asset removal failed.',
			);
		} finally {
			setAssetActionType(null);
		}
	}

	async function clearPlaceholder(placeholder: EditablePlaceholder) {
		if (placeholder.type === 'text') {
			await clearTextPlaceholder(placeholder.id);
			return;
		}
		await removeAsset(getAssetTypeForPlaceholder(placeholder));
	}

	async function handleGenerateWithAi(input: {
		industry: string;
		instruction: string;
		referenceIds: string[];
	}): Promise<HandbookComposeResponse> {
		if (!selectedFileId || !selectedAiPlaceholder) {
			throw new Error('Open a placeholder first.');
		}

		const extraInstruction = [
			input.industry.trim()
				? `Company industry: ${input.industry.trim()}.`
				: '',
			input.instruction.trim(),
		]
			.filter(Boolean)
			.join('\n');

		const currentDraft = latestDraftsRef.current[selectedAiPlaceholder.id];
		const result = await composePlaceholder.mutateAsync({
			fileId: selectedFileId,
			placeholderKey: selectedAiPlaceholder.raw.key,
			currentValue: currentDraft?.value ?? selectedAiPlaceholder.value ?? '',
			instruction:
				extraInstruction ||
				`Create a clear and professional value for ${selectedAiPlaceholder.label}.`,
			language: 'de-DE',
			outputStyle: 'formal',
			referenceScope: 'handbook',
			referenceDocumentIds: input.referenceIds,
			useFileContext: true,
			constraints: {
				max_length:
					selectedAiPlaceholder.raw.suggested_output_class === 'short'
						? 220
						: 1600,
				required: selectedAiPlaceholder.raw.required,
			},
			modeHint: selectedAiPlaceholder.raw.suggested_mode,
		});

		if (input.referenceIds.length > 0) {
			setPreferredReferenceId(handbookId, input.referenceIds[0]);
			setPreferredReferenceIdState(input.referenceIds[0]);
		}

		toast.success('AI draft created.');
		return result;
	}

	async function exportPackage() {
		await flushAllPendingDrafts();

		if (!allComplete) {
			setCurrentStep(4);
			toast.error('Complete all required placeholders before exporting.');
			return;
		}

		try {
			const result = await exportHandbook.mutateAsync();
			const url = URL.createObjectURL(result.blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = result.filename;
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			URL.revokeObjectURL(url);
			setLocalExportCompletionHash(workflowCheckpoint?.completionHash ?? null);
			recordStepCheckpoint('review');
			toast.success('Document package generated successfully.');
		} catch (error) {
			const details = (
				error as Error & { details?: { errors?: Array<{ message?: string }> } }
			).details;
			if (
				details &&
				Array.isArray(details.errors) &&
				details.errors.length > 0
			) {
				toast.error(details.errors[0]?.message ?? 'Generation is blocked.');
				return;
			}
			toast.error(
				error instanceof Error ? error.message : 'Document generation failed.',
			);
		}
	}

	const autofillSummary = useMemo(
		(): Array<{
			id: string;
			label: string;
			status: 'ready' | 'pending';
			description: string;
		}> => [
			{
				id: 'logo',
				label: 'Logo asset',
				status: logoAsset ? 'ready' : 'pending',
				description: logoAsset
					? 'Applied automatically to every matching logo placeholder.'
					: 'Upload once to reuse the logo across the package.',
			},
			{
				id: 'signature',
				label: 'Signature asset',
				status: signatureAsset ? 'ready' : 'pending',
				description: signatureAsset
					? 'Applied automatically to every matching signature placeholder.'
					: 'Upload once to reuse the signature across the package.',
			},
			{
				id: 'dates',
				label: 'Date defaults',
				status: summary.filesScanned > 0 ? 'ready' : 'pending',
				description:
					"Date fields can start with today's date and can still be changed later.",
			},
		],
		[logoAsset, signatureAsset, summary.filesScanned],
	);

	useEffect(() => {
		return () => {
			Object.values(autosaveTimersRef.current).forEach(timer =>
				clearTimeout(timer),
			);
		};
	}, []);

	return {
		handbook,
		client,
		loading: handbookLoading || clientLoading,
		summary,
		currentStep,
		changeStep,
		latestUpload,
		uploadError,
		handleUpload,
		uploadPending: uploadZip.isPending,
		assets,
		logoAsset,
		signatureAsset,
		workflowSteps,
		assetActionType,
		uploadAsset,
		removeAsset,
		autofillSummary,
		treeLoading,
		treeItems,
		showAllFiles,
		setShowAllFiles,
		treeSearch,
		setTreeSearch,
		selectedFile,
		selectedFileId,
		selectFile,
		treeSheetOpen,
		setTreeSheetOpen,
		placeholdersLoading,
		placeholders,
		placeholderFilters,
		setPlaceholderFilters,
		expandedPlaceholderId,
		setExpandedPlaceholderId,
		updateTextPlaceholder,
		flushPlaceholderSave,
		clearPlaceholder,
		aiPlaceholderId,
		setAiPlaceholderId,
		selectedAiPlaceholder,
		handleGenerateWithAi,
		aiLoading: composePlaceholder.isPending,
		referenceFiles: referenceFiles as ReferenceDocument[],
		preferredReferenceId,
		allComplete,
		totalRequired,
		resolvedRequired,
		exportFileStates,
		readyFiles,
		blockedFiles,
		missingReasonsLoading,
		exportPackage,
		exportPending: exportHandbook.isPending,
	};
}

function humanizeMissingKey(key: string) {
	return key
		.replace(/^assets\./, '')
		.replace(/[._-]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map(
			segment =>
				segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase(),
		)
		.join(' ');
}
