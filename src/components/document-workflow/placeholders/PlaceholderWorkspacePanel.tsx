'use client';

import { PanelLeft, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { PlaceholderList } from './PlaceholderList';
import type {
	EditablePlaceholder,
	FileTreeItem,
	PlaceholderListFilterState,
} from '@/lib/document-workflow/view-models';

interface PlaceholderWorkspacePanelProps {
	selectedFile: FileTreeItem | null;
	loading?: boolean;
	placeholders: EditablePlaceholder[];
	filters: PlaceholderListFilterState;
	onFiltersChange: (filters: PlaceholderListFilterState) => void;
	onEdit: (placeholder: EditablePlaceholder) => void;
	onAutofill: (placeholder: EditablePlaceholder) => void;
	onClear: (placeholder: EditablePlaceholder) => void;
	clearingPlaceholderId?: string | null;
	onOpenTree?: () => void;
}

export function PlaceholderWorkspacePanel({
	selectedFile,
	loading,
	placeholders,
	filters,
	onFiltersChange,
	onEdit,
	onAutofill,
	onClear,
	clearingPlaceholderId,
	onOpenTree,
}: PlaceholderWorkspacePanelProps) {
	if (!selectedFile) {
		return (
			<div className="flex min-h-[520px] flex-col items-center justify-center rounded-[28px] border border-slate-200 bg-white px-6 text-center shadow-sm">
				<div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
					<Sparkles className="h-6 w-6" />
				</div>
				<p className="mt-4 text-base font-semibold text-slate-900">
					Select a file to review placeholders
				</p>
				<p className="mt-2 max-w-sm text-sm text-slate-500">
					Choose a file from the left panel to view only the placeholders that
					belong to that file.
				</p>
			</div>
		);
	}

	const missingCount = placeholders.filter(
		placeholder => placeholder.status === 'empty',
	).length;

	return (
		<div className="flex min-h-[520px] flex-col rounded-[28px] border border-slate-200 bg-white shadow-sm">
			<div className="border-b border-slate-200 px-5 py-4">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<div className="flex flex-wrap items-center gap-2">
							<p className="text-lg font-semibold text-slate-900">
								{selectedFile.name}
							</p>
							{selectedFile.fileType ? (
								<Badge variant="gray">{selectedFile.fileType}</Badge>
							) : null}
						</div>
						<p className="mt-2 text-sm text-slate-500">{selectedFile.path}</p>
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
								Browse Files
							</Button>
						) : null}
						<Badge variant={missingCount === 0 ? 'green' : 'orange'}>
							{missingCount === 0
								? 'All placeholders filled'
								: `${missingCount} empty`}
						</Badge>
					</div>
				</div>

				<div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-500">
					<span className="rounded-full bg-slate-100 px-3 py-1">
						{placeholders.length} placeholder{placeholders.length === 1 ? '' : 's'}
					</span>
					<span className="rounded-full bg-slate-100 px-3 py-1">
						{selectedFile.filledCount}/{selectedFile.placeholderCount} filled
					</span>
				</div>
			</div>

			{loading ? (
				<div className="flex flex-1 items-center justify-center">
					<Spinner />
				</div>
			) : selectedFile.placeholderCount === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
					<p className="text-base font-semibold text-slate-900">
						No placeholders were found in this file
					</p>
					<p className="mt-2 max-w-sm text-sm text-slate-500">
						Choose another file or show all files if you want to review the rest of
						the project package.
					</p>
				</div>
			) : (
				<PlaceholderList
					placeholders={placeholders}
					filters={filters}
					onFiltersChange={onFiltersChange}
					onEdit={onEdit}
					onAutofill={onAutofill}
					onClear={onClear}
					clearingPlaceholderId={clearingPlaceholderId}
				/>
			)}
		</div>
	);
}
