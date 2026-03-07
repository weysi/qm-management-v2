'use client';

import { useEffect, useState } from 'react';
import { FolderSearch } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileTreeToolbar } from './FileTreeToolbar';
import { FileTreeNode } from './FileTreeNode';
import type { FileTreeItem } from '@/lib/document-workflow/view-models';

interface FileTreePanelProps {
	items: FileTreeItem[];
	showAllFiles: boolean;
	totalFileCount: number;
	selectedFileId: string | null;
	onToggleShowAllFiles: () => void;
	onSelectFile: (fileId: string) => void;
}

export function FileTreePanel({
	items,
	showAllFiles,
	totalFileCount,
	selectedFileId,
	onToggleShowAllFiles,
	onSelectFile,
}: FileTreePanelProps) {
	const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

	useEffect(() => {
		setExpandedPaths(new Set(collectFolderPaths(items)));
	}, [items]);

	const visibleFileCount = countFiles(items);

	return (
		<div className="flex h-full min-h-[520px] flex-col rounded-[28px] border border-slate-200 bg-white shadow-sm">
			<FileTreeToolbar
				showAllFiles={showAllFiles}
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
						Try showing all files or upload a ZIP package to restore the full
						project structure.
					</p>
				</div>
			) : (
				<ScrollArea className="min-h-0 flex-1">
					<div className="space-y-1 p-3">
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
					</div>
				</ScrollArea>
			)}
		</div>
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
