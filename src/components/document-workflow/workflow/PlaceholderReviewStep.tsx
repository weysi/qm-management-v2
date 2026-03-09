'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
	ScrollableSheet,
	ScrollableSheetBody,
	ScrollableSheetContent,
	ScrollableSheetDescription,
	ScrollableSheetHeader,
	ScrollableSheetTitle,
} from '@/components/document-workflow/modals/ScrollableSheet';
import { FileTreePanel } from '@/components/document-workflow/file-tree/FileTreePanel';
import { FilePreviewPanel } from '@/components/document-workflow/workflow/FilePreviewPanel';
import type {
	EditablePlaceholder,
	FileTreeItem,
	PlaceholderListFilterState,
} from '@/lib/document-workflow/view-models';

interface PlaceholderReviewStepProps {
	treeItems: FileTreeItem[];
	showAllFiles: boolean;
	treeSearch: string;
	totalFileCount: number;
	selectedFileId: string | null;
	onTreeSearchChange: (value: string) => void;
	onToggleShowAllFiles: () => void;
	onSelectFile: (fileId: string) => void | Promise<void>;
	selectedFile: FileTreeItem | null;
	placeholders: EditablePlaceholder[];
	loading: boolean;
	filters: PlaceholderListFilterState;
	onFiltersChange: (filters: PlaceholderListFilterState) => void;
	expandedPlaceholderId: string | null;
	onExpandPlaceholder: (placeholderId: string) => void;
	onTextChange: (placeholderId: string, value: string) => void;
	onBlurSave: (placeholderId: string) => void | Promise<void>;
	onClear: (placeholder: EditablePlaceholder) => void | Promise<void>;
	onOpenAi: (placeholderId: string) => void;
	onOpenAssetsStep: () => void | Promise<void>;
	treeSheetOpen: boolean;
	onTreeSheetOpenChange: (open: boolean) => void;
	onBack: () => void | Promise<void>;
	onContinue: () => void | Promise<void>;
}

export function PlaceholderReviewStep({
	treeItems,
	showAllFiles,
	treeSearch,
	totalFileCount,
	selectedFileId,
	onTreeSearchChange,
	onToggleShowAllFiles,
	onSelectFile,
	selectedFile,
	placeholders,
	loading,
	filters,
	onFiltersChange,
	expandedPlaceholderId,
	onExpandPlaceholder,
	onTextChange,
	onBlurSave,
	onClear,
	onOpenAi,
	onOpenAssetsStep,
	treeSheetOpen,
	onTreeSheetOpenChange,
	onBack,
	onContinue,
}: PlaceholderReviewStepProps) {
	return (
		<div className="space-y-4">
			<div className="rounded-3xl border border-border bg-white p-6 shadow-sm">
				<div className="space-y-3">
					<p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
						Review
					</p>
					<div className="space-y-2">
						<h2 className="text-2xl font-semibold text-slate-950">
							Review and complete placeholders
						</h2>
						<p className="max-w-3xl text-sm text-slate-600">
							Work through one file at a time. Changes save automatically after
							a short pause.
						</p>
					</div>
				</div>
			</div>

			<div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
				<div className="hidden xl:block">
					<FileTreePanel
						items={treeItems}
						showAllFiles={showAllFiles}
						search={treeSearch}
						totalFileCount={totalFileCount}
						selectedFileId={selectedFileId}
						onSearchChange={onTreeSearchChange}
						onToggleShowAllFiles={onToggleShowAllFiles}
						onSelectFile={fileId => void onSelectFile(fileId)}
					/>
				</div>

				<FilePreviewPanel
					selectedFile={selectedFile}
					loading={loading}
					placeholders={placeholders}
					filters={filters}
					onFiltersChange={onFiltersChange}
					expandedPlaceholderId={expandedPlaceholderId}
					onExpandPlaceholder={onExpandPlaceholder}
					onTextChange={onTextChange}
					onBlurSave={onBlurSave}
					onClear={onClear}
					onOpenAi={onOpenAi}
					onOpenAssetsStep={() => void onOpenAssetsStep()}
					onOpenTree={() => onTreeSheetOpenChange(true)}
				/>
			</div>

			<ScrollableSheet
				open={treeSheetOpen}
				onOpenChange={onTreeSheetOpenChange}
			>
				<ScrollableSheetContent
					side="left"
					className="xl:hidden"
				>
					<ScrollableSheetHeader>
						<ScrollableSheetTitle>Files</ScrollableSheetTitle>
						<ScrollableSheetDescription>
							Choose a file to edit.
						</ScrollableSheetDescription>
					</ScrollableSheetHeader>
					<ScrollableSheetBody className="p-0">
						<FileTreePanel
							items={treeItems}
							showAllFiles={showAllFiles}
							search={treeSearch}
							totalFileCount={totalFileCount}
							selectedFileId={selectedFileId}
							onSearchChange={onTreeSearchChange}
							onToggleShowAllFiles={onToggleShowAllFiles}
							onSelectFile={fileId => void onSelectFile(fileId)}
						/>
					</ScrollableSheetBody>
				</ScrollableSheetContent>
			</ScrollableSheet>

			<div className="flex flex-wrap justify-between gap-3">
				<Button
					type="button"
					variant="outline"
					onClick={() => void onBack()}
				>
					<ArrowLeft className="h-4 w-4" />
					Back to assets
				</Button>
				<Button
					type="button"
					onClick={() => void onContinue()}
				>
					Continue to export
					<ArrowRight className="h-4 w-4" />
				</Button>
			</div>
		</div>
	);
}
