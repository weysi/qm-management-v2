import type { WorkspaceAsset } from '@/lib/schemas/document.schema';
import type {
	HandbookCompletion,
	HandbookStatus,
} from '@/lib/schemas/handbook.schema';
import type { WorkflowStepState } from '@/lib/document-workflow/workflow-schemas';

export type WorkflowStepId = 1 | 2 | 3 | 4;

export interface WorkflowStepCheckpoint {
	completionHash: string | null;
	fileSignature: string;
	assetSignature: string;
}

export interface DerivedWorkflowStep {
	id: WorkflowStepId;
	state: WorkflowStepState;
	isComplete: boolean;
	isInvalidated: boolean;
	reason: string | null;
}

interface DeriveWorkflowStepsInput {
	currentStep: WorkflowStepId;
	filesScanned: number;
	handbookStatus?: HandbookStatus;
	completion?: HandbookCompletion;
	assets?: WorkspaceAsset[];
	assetsCheckpoint?: WorkflowStepCheckpoint | null;
	reviewCheckpoint?: WorkflowStepCheckpoint | null;
	latestExportCompletionHash?: string | null;
}

export function buildWorkflowStepCheckpoint(
	completion?: HandbookCompletion,
	assets: WorkspaceAsset[] = [],
): WorkflowStepCheckpoint | null {
	if (!completion) return null;

	return {
		completionHash: completion.completion_hash ?? null,
		fileSignature: completion.file_checksums
			.map(item => `${item.file_id}:${item.path}:${item.checksum}:${item.file_type}`)
			.sort()
			.join('|'),
		assetSignature: assets
			.map(
				asset =>
					`${asset.asset_type}:${asset.id}:${asset.status}:${asset.updated_at ?? ''}`,
			)
			.sort()
			.join('|'),
	};
}

export function deriveWorkflowSteps({
	currentStep,
	filesScanned,
	handbookStatus,
	completion,
	assets = [],
	assetsCheckpoint,
	reviewCheckpoint,
	latestExportCompletionHash,
}: DeriveWorkflowStepsInput): DerivedWorkflowStep[] {
	const hasFiles = filesScanned > 0;
	const currentCheckpoint = buildWorkflowStepCheckpoint(completion, assets);
	const requiredAssetPlaceholders = (completion?.placeholders ?? []).filter(
		item => item.required && item.kind === 'ASSET',
	);
	const requiredAssetsResolved = requiredAssetPlaceholders.every(
		item => item.resolved,
	);

	const assetsComplete = hasFiles && requiredAssetsResolved;
	const reviewComplete = hasFiles && Boolean(completion?.is_complete_required);
	const exportComplete =
		hasFiles &&
		reviewComplete &&
		Boolean(
			latestExportCompletionHash &&
				currentCheckpoint?.completionHash &&
				latestExportCompletionHash === currentCheckpoint.completionHash,
		);

	const assetsInvalidated =
		hasFiles &&
		Boolean(
			assetsCheckpoint &&
				currentCheckpoint &&
				!sameCheckpoint(assetsCheckpoint, currentCheckpoint) &&
				!assetsComplete,
		);
	const hasPersistedReviewHistory =
		Boolean(reviewCheckpoint) ||
		handbookStatus === 'READY' ||
		handbookStatus === 'EXPORTED';
	const reviewInvalidated =
		hasFiles &&
		hasPersistedReviewHistory &&
		Boolean(
			currentCheckpoint &&
				((reviewCheckpoint &&
					!sameCheckpoint(reviewCheckpoint, currentCheckpoint)) ||
					(handbookStatus === 'EXPORTED' &&
						latestExportCompletionHash &&
						currentCheckpoint.completionHash &&
						latestExportCompletionHash !== currentCheckpoint.completionHash)) &&
				!reviewComplete,
		);
	const exportInvalidated =
		hasFiles &&
		Boolean(
			latestExportCompletionHash &&
				currentCheckpoint?.completionHash &&
				latestExportCompletionHash !== currentCheckpoint.completionHash,
		);

	return [
		{
			id: 1,
			state: resolveStepState({
				currentStep,
				id: 1,
				locked: false,
				complete: hasFiles,
				invalidated: false,
			}),
			isComplete: hasFiles,
			isInvalidated: false,
			reason: null,
		},
		{
			id: 2,
			state: resolveStepState({
				currentStep,
				id: 2,
				locked: !hasFiles,
				complete: assetsComplete,
				invalidated: assetsInvalidated,
			}),
			isComplete: assetsComplete,
			isInvalidated: assetsInvalidated,
			reason: assetsInvalidated
				? buildInvalidationReason({
						label: 'assets',
						previous: assetsCheckpoint,
						current: currentCheckpoint,
				  })
				: requiredAssetPlaceholders.length > 0 && !requiredAssetsResolved
					? 'A required logo or signature asset is still missing.'
					: null,
		},
		{
			id: 3,
			state: resolveStepState({
				currentStep,
				id: 3,
				locked: !hasFiles,
				complete: reviewComplete,
				invalidated: reviewInvalidated,
			}),
			isComplete: reviewComplete,
			isInvalidated: reviewInvalidated,
			reason: reviewInvalidated
				? buildInvalidationReason({
						label: 'review',
						previous: reviewCheckpoint,
						current: currentCheckpoint,
				  })
				: !reviewComplete && hasFiles
					? 'Some required placeholders still need a saved value.'
					: null,
		},
		{
			id: 4,
			state: resolveStepState({
				currentStep,
				id: 4,
				locked: !hasFiles,
				complete: exportComplete,
				invalidated: exportInvalidated,
			}),
			isComplete: exportComplete,
			isInvalidated: exportInvalidated,
			reason: exportInvalidated
				? 'The workspace changed after the last export. Generate a new ZIP to refresh it.'
				: !reviewComplete && hasFiles
					? 'Finish all required placeholders before exporting.'
					: null,
		},
	];
}

function resolveStepState({
	currentStep,
	id,
	locked,
	complete,
	invalidated,
}: {
	currentStep: WorkflowStepId;
	id: WorkflowStepId;
	locked: boolean;
	complete: boolean;
	invalidated: boolean;
}): WorkflowStepState {
	if (locked) return 'locked';
	if (currentStep === id) return 'active';
	if (invalidated) return 'invalidated';
	if (complete) return 'completed';
	return 'available';
}

function sameCheckpoint(
	left: WorkflowStepCheckpoint,
	right: WorkflowStepCheckpoint,
) {
	return (
		left.completionHash === right.completionHash &&
		left.fileSignature === right.fileSignature &&
		left.assetSignature === right.assetSignature
	);
}

function buildInvalidationReason({
	label,
	previous,
	current,
}: {
	label: 'assets' | 'review';
	previous?: WorkflowStepCheckpoint | null;
	current?: WorkflowStepCheckpoint | null;
}) {
	if (!previous || !current) {
		return label === 'assets'
			? 'Asset requirements changed after the files were updated.'
			: 'Review data changed after the workflow moved forward.';
	}

	if (previous.fileSignature !== current.fileSignature) {
		return label === 'assets'
			? 'Files changed after assets were prepared.'
			: 'Files changed after review was completed.';
	}

	if (previous.assetSignature !== current.assetSignature) {
		return label === 'assets'
			? 'A required asset was replaced or removed.'
			: 'A required asset changed after review.';
	}

	return 'Saved placeholder values changed after this step was completed.';
}
