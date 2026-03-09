'use client';

import { PanelLeft, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { PlaceholderFilters } from '@/components/document-workflow/placeholders/PlaceholderFilters';
import { PlaceholderEditor } from '@/components/document-workflow/workflow/PlaceholderEditor';
import {
	UiContainer,
	UiScrollableArea,
	UiSection,
} from '@/components/ui-layout';
import {
	filterEditablePlaceholders,
	type EditablePlaceholder,
	type FileTreeItem,
	type PlaceholderListFilterState,
} from '@/lib/document-workflow/view-models';

interface FilePreviewPanelProps {
	selectedFile: FileTreeItem | null;
	loading: boolean;
	placeholders: EditablePlaceholder[];
	filters: PlaceholderListFilterState;
	onFiltersChange: (filters: PlaceholderListFilterState) => void;
	expandedPlaceholderId: string | null;
	onExpandPlaceholder: (placeholderId: string) => void;
	onTextChange: (placeholderId: string, value: string) => void;
	onBlurSave: (placeholderId: string) => void | Promise<void>;
	onClear: (placeholder: EditablePlaceholder) => void | Promise<void>;
	onOpenAi: (placeholderId: string) => void;
	onOpenAssetsStep: () => void;
	onOpenTree?: () => void;
}

export function FilePreviewPanel({
	selectedFile,
	loading,
	placeholders,
	filters,
	onFiltersChange,
	expandedPlaceholderId,
	onExpandPlaceholder,
	onTextChange,
	onBlurSave,
	onClear,
	onOpenAi,
	onOpenAssetsStep,
	onOpenTree,
}: FilePreviewPanelProps) {
	if (!selectedFile) {
		return (
			<UiContainer>
				<UiSection className="flex min-h-[560px] flex-col items-center justify-center px-6 text-center">
					<div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
						<Sparkles className="h-6 w-6" />
					</div>
					<p className="mt-4 text-base font-semibold text-slate-900">
						Select a file to review placeholders
					</p>
					<p className="mt-2 max-w-sm text-sm text-slate-500">
						Choose a file from the list to edit its placeholders.
					</p>
				</UiSection>
			</UiContainer>
		);
	}

	const filtered = filterEditablePlaceholders(placeholders, filters);
	const missingCount = placeholders.filter(
		item => item.status === 'empty',
	).length;

	return (
		<UiContainer className="max-h-[720px]">
			<UiSection className="space-y-4 border-b border-border">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<h3 className="text-xl font-semibold text-slate-900">
								{selectedFile.name}
							</h3>
							{selectedFile.fileType ? (
								<Badge variant="gray">{selectedFile.fileType}</Badge>
							) : null}
						</div>
						<p className="text-sm text-slate-500">{selectedFile.path}</p>
					</div>
					<div className="flex flex-wrap gap-2">
						{onOpenTree ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								className="md:hidden"
								onClick={onOpenTree}
							>
								<PanelLeft className="h-4 w-4" />
								Browse files
							</Button>
						) : null}
						<Badge variant={missingCount === 0 ? 'green' : 'orange'}>
							{missingCount === 0 ? 'Ready' : `${missingCount} left`}
						</Badge>
					</div>
				</div>
				<div className="flex flex-wrap gap-2 text-sm text-slate-500">
					<span className="rounded-full bg-slate-100 px-3 py-1">
						{selectedFile.requiredResolved}/{selectedFile.requiredTotal} done
					</span>
					<span className="rounded-full bg-slate-100 px-3 py-1">
						{selectedFile.placeholderCount} fields
					</span>
				</div>
			</UiSection>

			<PlaceholderFilters
				filters={filters}
				onFiltersChange={onFiltersChange}
			/>

			{loading ? (
				<div className="flex min-h-[320px] flex-1 items-center justify-center">
					<Spinner />
				</div>
			) : (
				<UiScrollableArea viewportClassName="space-y-3 p-5">
					{filtered.length === 0 ? (
						<div className="flex min-h-[240px] items-center justify-center rounded-3xl border border-dashed border-border bg-muted/20 px-6 text-center text-sm text-slate-500">
							Change the filters to see more fields.
						</div>
					) : (
						filtered.map(placeholder => (
							<PlaceholderEditor
								key={placeholder.id}
								placeholder={placeholder}
								expanded={expandedPlaceholderId === placeholder.id}
								onExpand={() => onExpandPlaceholder(placeholder.id)}
								onTextChange={onTextChange}
								onBlurSave={onBlurSave}
								onClear={onClear}
								onOpenAi={onOpenAi}
								onOpenAssetsStep={onOpenAssetsStep}
							/>
						))
					)}
				</UiScrollableArea>
			)}
		</UiContainer>
	);
}
