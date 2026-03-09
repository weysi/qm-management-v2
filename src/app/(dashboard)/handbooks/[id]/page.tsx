'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, FileText, Trash2, WandSparkles } from 'lucide-react';
import { AIPlaceholderGenerator } from '@/components/document-workflow/AIPlaceholderGenerator';
import { AssetSetupStep } from '@/components/document-workflow/workflow/AssetSetupStep';
import { ExportStep } from '@/components/document-workflow/workflow/ExportStep';
import { PlaceholderReviewStep } from '@/components/document-workflow/workflow/PlaceholderReviewStep';
import { StepperShell } from '@/components/document-workflow/workflow/StepperShell';
import { UploadStep } from '@/components/document-workflow/workflow/UploadStep';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useDeleteHandbook } from '@/hooks';
import { useHandbookWorkflowController } from '@/hooks/useHandbookWorkflowController';
import { toast } from 'sonner';

interface PageProps {
	params: Promise<{ id: string }>;
}

export default function HandbookPage({ params }: PageProps) {
	const { id } = use(params);
	const router = useRouter();
	const controller = useHandbookWorkflowController(id);
	const deleteHandbook = useDeleteHandbook(controller.client?.id);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);

	if (controller.loading || isDeletingWorkspace) {
		return (
			<div className="flex h-64 items-center justify-center">
				<Spinner />
			</div>
		);
	}

	if (!controller.handbook || !controller.client) {
		return (
			<div className="p-8 text-gray-500">Document workspace not found.</div>
		);
	}

	const exportStep = controller.workflowSteps.find(step => step.id === 4);
	const steps = controller.workflowSteps.map(step => ({
		id: step.id,
		label:
			step.id === 1
				? ('Upload' as const)
				: step.id === 2
					? ('Assets' as const)
					: step.id === 3
						? ('Review' as const)
						: ('Export' as const),
		title:
			step.id === 1
				? 'Upload'
				: step.id === 2
					? 'Assets'
					: step.id === 3
						? 'Review'
						: 'Export',
		description:
			step.id === 1
				? 'Add handbook files.'
				: step.id === 2
					? 'Shared logo, signature, and defaults.'
					: step.id === 3
						? 'Complete the required placeholders.'
						: 'Download the final ZIP export.',
		state: step.state,
		reason: step.reason,
		statusLabel: step.isInvalidated
			? 'Needs refresh'
			: step.state === 'completed'
				? 'Complete'
				: step.state === 'active'
					? 'Current'
					: step.state === 'locked'
						? 'Locked'
						: null,
		statusTone: step.isInvalidated
			? ('attention' as const)
			: step.state === 'completed'
				? ('saved' as const)
				: step.state === 'active'
					? ('processing' as const)
					: step.state === 'locked'
						? ('pending' as const)
						: null,
	}));

	const latestUpload = {
		sourceType: controller.latestUpload?.sourceType ?? null,
		fileCount: controller.latestUpload?.fileCount ?? 0,
		label: controller.latestUpload?.label,
		warnings: controller.latestUpload?.warnings,
	};

	async function handleDeleteHandbook() {
		if (!controller.handbook || !controller.client) return;
		const clientId = controller.client.id;
		setIsDeletingWorkspace(true);
		try {
			await deleteHandbook.mutateAsync(controller.handbook.id);
			toast.success('Workspace wurde gelöscht.');
			setDeleteDialogOpen(false);
			router.replace(`/clients/${clientId}`);
		} catch (error) {
			setIsDeletingWorkspace(false);
			toast.error(
				error instanceof Error
					? error.message
					: 'Workspace konnte nicht gelöscht werden.',
			);
		}
	}

	return (
		<div className="min-h-screen bg-slate-50">
			<div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
				<StepperShell
					title="Handbook workflow"
					subtitle={`${controller.client.name} · ${controller.summary.filesScanned} scanned files`}
					currentStep={controller.currentStep}
					onStepChange={step => void controller.changeStep(step)}
					steps={steps}
					headerActions={
						<>
							<Badge variant={controller.allComplete ? 'green' : 'orange'}>
								{controller.resolvedRequired}/{controller.totalRequired}{' '}
								required complete
							</Badge>
							<Button
								asChild
								variant="outline"
								size="sm"
							>
								<Link href={`/handbooks/${id}/reference-files`}>
									<FileText className="h-4 w-4" />
									Reference files
								</Link>
							</Button>
							<Button
								size="sm"
								variant="outline"
								disabled={exportStep?.state === 'locked'}
								onClick={() => void controller.changeStep(4)}
							>
								Go to export
							</Button>
							<Button
								size="sm"
								disabled={!controller.allComplete}
								loading={controller.exportPending}
								onClick={() => void controller.exportPackage()}
							>
								<WandSparkles className="h-4 w-4" />
								Export ZIP
							</Button>
							<Button
								size="sm"
								variant="ghost"
								className="text-red-600 hover:text-red-700"
								onClick={() => setDeleteDialogOpen(true)}
							>
								<Trash2 className="h-4 w-4" />
								Delete workspace
							</Button>
						</>
					}
				>
					{controller.currentStep === 1 ? (
						<UploadStep
							loading={controller.uploadPending}
							error={controller.uploadError}
							onUpload={controller.handleUpload}
							latestUpload={latestUpload}
							summary={controller.summary}
							onContinue={() => void controller.changeStep(2)}
							canContinue={controller.summary.filesScanned > 0}
						/>
					) : null}

					{controller.currentStep === 2 ? (
						<AssetSetupStep
							logoAsset={controller.logoAsset}
							signatureAsset={controller.signatureAsset}
							assetActionType={controller.assetActionType}
							autofillSummary={controller.autofillSummary}
							onUploadAsset={controller.uploadAsset}
							onRemoveAsset={controller.removeAsset}
							onBack={() => void controller.changeStep(1)}
							onContinue={() => void controller.changeStep(3)}
						/>
					) : null}

					{controller.currentStep === 3 ? (
						<PlaceholderReviewStep
							treeItems={controller.treeItems}
							showAllFiles={controller.showAllFiles}
							treeSearch={controller.treeSearch}
							totalFileCount={controller.summary.filesScanned}
							selectedFileId={controller.selectedFileId}
							onTreeSearchChange={controller.setTreeSearch}
							onToggleShowAllFiles={() =>
								controller.setShowAllFiles(current => !current)
							}
							onSelectFile={controller.selectFile}
							selectedFile={controller.selectedFile}
							placeholders={controller.placeholders}
							loading={controller.placeholdersLoading || controller.treeLoading}
							filters={controller.placeholderFilters}
							onFiltersChange={controller.setPlaceholderFilters}
							expandedPlaceholderId={controller.expandedPlaceholderId}
							onExpandPlaceholder={controller.setExpandedPlaceholderId}
							onTextChange={controller.updateTextPlaceholder}
							onBlurSave={controller.flushPlaceholderSave}
							onClear={controller.clearPlaceholder}
							onOpenAi={controller.setAiPlaceholderId}
							onOpenAssetsStep={() => void controller.changeStep(2)}
							treeSheetOpen={controller.treeSheetOpen}
							onTreeSheetOpenChange={controller.setTreeSheetOpen}
							onBack={() => void controller.changeStep(2)}
							onContinue={() => void controller.changeStep(4)}
						/>
					) : null}

					{controller.currentStep === 4 ? (
						<ExportStep
							readyFiles={controller.readyFiles}
							blockedFiles={controller.blockedFiles}
							resolvedRequired={controller.resolvedRequired}
							totalRequired={controller.totalRequired}
							loadingReasons={controller.missingReasonsLoading}
							exportPending={controller.exportPending}
							canExport={controller.allComplete}
							onBack={() => void controller.changeStep(3)}
							onExport={() => void controller.exportPackage()}
						/>
					) : null}
				</StepperShell>
			</div>

			<AIPlaceholderGenerator
				open={Boolean(controller.selectedAiPlaceholder)}
				onOpenChange={open => {
					if (!open) {
						controller.setAiPlaceholderId(null);
					}
				}}
				placeholder={controller.selectedAiPlaceholder}
				referenceFiles={controller.referenceFiles}
				defaultIndustry={controller.client.industry}
				defaultReferenceId={controller.preferredReferenceId}
				loading={controller.aiLoading}
				onGenerate={controller.handleGenerateWithAi}
				onApply={value => {
					if (!controller.selectedAiPlaceholder) return;
					controller.updateTextPlaceholder(
						controller.selectedAiPlaceholder.id,
						value,
					);
				}}
			/>

			<Dialog
				open={deleteDialogOpen}
				onOpenChange={setDeleteDialogOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<AlertTriangle className="h-5 w-5 text-red-500" />
							Workspace löschen
						</DialogTitle>
						<DialogDescription>
							Der gesamte Workspace inklusive Dateien, Versionen, Referenzen und
							Assets wird dauerhaft entfernt.
						</DialogDescription>
					</DialogHeader>
					<div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-900">
						{controller.handbook.type}
					</div>
					<DialogFooter className="gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setDeleteDialogOpen(false)}
							disabled={deleteHandbook.isPending}
						>
							Abbrechen
						</Button>
						<Button
							type="button"
							variant="destructive"
							loading={deleteHandbook.isPending}
							onClick={() => void handleDeleteHandbook()}
						>
							Endgültig löschen
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
