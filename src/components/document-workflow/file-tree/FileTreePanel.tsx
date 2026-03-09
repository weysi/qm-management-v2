'use client';

import { useEffect, useState } from 'react';
import { FolderSearch } from 'lucide-react';
import { UiContainer, UiScrollableArea } from '@/components/ui-layout';
import { FileTreeToolbar } from './FileTreeToolbar';
import { FileTreeNode } from './FileTreeNode';
import type { FileTreeItem } from '@/lib/document-workflow/view-models';

interface FileTreePanelProps {
	items: FileTreeItem[];
	showAllFiles: boolean;
	search: string;
	totalFileCount: number;
	selectedFileId: string | null;
	onSearchChange: (value: string) => void;
	onToggleShowAllFiles: () => void;
	onSelectFile: (fileId: string) => void;
}

export function FileTreePanel({
	items,
	showAllFiles,
	search,
	totalFileCount,
	selectedFileId,
	onSearchChange,
	onToggleShowAllFiles,
	onSelectFile,
}: FileTreePanelProps) {
	const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

	useEffect(() => {
		setExpandedPaths(new Set(collectFolderPaths(items)));
	}, [items]);

	const visibleFileCount = countFiles(items);

	return (
		<UiContainer className="max-h-[720px] min-h-[560px]">
			<FileTreeToolbar
				showAllFiles={showAllFiles}
				search={search}
				onSearchChange={onSearchChange}
				onToggleShowAllFiles={onToggleShowAllFiles}
				visibleFileCount={visibleFileCount}
				totalFileCount={totalFileCount}
			/>

			{items.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
					<div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-100 text-slate-500">
						<FolderSearch className="h-6 w-6" />
					</div>
					<p className="mt-4 text-base font-semibold text-slate-900">
						No files to show
					</p>
					<p className="mt-2 max-w-sm text-sm text-slate-500">
						Try another search or switch views.
					</p>
				</div>
			) : (
				<UiScrollableArea viewportClassName="space-y-1 p-3">
					{items.map(node => (
						<FileTreeNode
							key={node.path}
							node={node}
							expandedPaths={expandedPaths}
							selectedFileId={selectedFileId}
							onToggleFolder={path => {
								setExpandedPaths(previous => {
									const next = new Set(previous);
									if (next.has(path)) {
										next.delete(path);
									} else {
										next.add(path);
									}
									return next;
								});
							}}
							onSelectFile={onSelectFile}
						/>
					))}
				</UiScrollableArea>
			)}
		</UiContainer>
	);
}

function collectFolderPaths(items: FileTreeItem[]): string[] {
	return items.flatMap(item => {
		if (item.kind !== 'folder') return [];
		return [item.path, ...collectFolderPaths(item.children)];
	});
}

function countFiles(items: FileTreeItem[]): number {
	return items.reduce((count, item) => {
		if (item.kind === 'file') return count + 1;
		return count + countFiles(item.children);
	}, 0);
}
