'use client';

import {
	CheckCircle2,
	ChevronRight,
	CircleAlert,
	FileText,
	Folder,
	FolderOpen,
	Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { FileTreeItem } from '@/lib/document-workflow/view-models';

interface FileTreeNodeProps {
	node: FileTreeItem;
	depth?: number;
	expandedPaths: Set<string>;
	selectedFileId: string | null;
	onToggleFolder: (path: string) => void;
	onSelectFile: (fileId: string) => void;
}

export function FileTreeNode({
	node,
	depth = 0,
	expandedPaths,
	selectedFileId,
	onToggleFolder,
	onSelectFile,
}: FileTreeNodeProps) {
	const isFolder = node.kind === 'folder';
	const isExpanded = isFolder ? expandedPaths.has(node.path) : false;
	const isSelected = node.id !== null && node.id === selectedFileId;

	if (isFolder) {
		return (
			<div>
				<button
					type="button"
					onClick={() => onToggleFolder(node.path)}
					className="flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
					style={{ paddingLeft: `${depth * 14 + 12}px` }}
				>
					<ChevronRight
						className={cn('h-4 w-4 shrink-0 transition', isExpanded && 'rotate-90')}
					/>
					{isExpanded ? (
						<FolderOpen className="h-4 w-4 shrink-0 text-slate-500" />
					) : (
						<Folder className="h-4 w-4 shrink-0 text-slate-500" />
					)}
					<span className="truncate">{node.name}</span>
					{node.placeholderCount > 0 ? (
						<span className="ml-auto text-xs text-slate-500">
							{node.placeholderCount}
						</span>
					) : null}
				</button>

				{isExpanded ? (
					<div className="space-y-1">
						{node.children.map(child => (
							<FileTreeNode
								key={child.path}
								node={child}
								depth={depth + 1}
								expandedPaths={expandedPaths}
								selectedFileId={selectedFileId}
								onToggleFolder={onToggleFolder}
								onSelectFile={onSelectFile}
							/>
						))}
					</div>
				) : null}
			</div>
		);
	}

	return (
		<button
			type="button"
			onClick={() => {
				if (node.id) onSelectFile(node.id);
			}}
			className={cn(
				'flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition',
				isSelected
					? 'bg-primary/10 text-slate-900 ring-1 ring-primary/20'
					: 'hover:bg-slate-100',
				node.placeholderCount === 0 && node.status === 'complete' && 'opacity-75',
			)}
			style={{ paddingLeft: `${depth * 14 + 24}px` }}
		>
			<FileText className="h-4 w-4 shrink-0 text-slate-500" />
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<p className="truncate text-sm font-medium">{node.name}</p>
					{node.fileType ? <Badge variant="gray">{node.fileType}</Badge> : null}
				</div>
				<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
					{renderStatus(node.status)}
					<span>
						{node.placeholderCount} placeholder{node.placeholderCount === 1 ? '' : 's'}
					</span>
				</div>
			</div>
		</button>
	);
}

function renderStatus(status: FileTreeItem['status']) {
	if (status === 'attention') {
		return (
			<span className="inline-flex items-center gap-1 text-red-700">
				<CircleAlert className="h-3.5 w-3.5" />
				Needs review
			</span>
		);
	}

	if (status === 'processing') {
		return (
			<span className="inline-flex items-center gap-1 text-orange-700">
				<Loader2 className="h-3.5 w-3.5 animate-spin" />
				Processing
			</span>
		);
	}

	if (status === 'needs-input') {
		return (
			<span className="inline-flex items-center gap-1 text-orange-700">
				<CircleAlert className="h-3.5 w-3.5" />
				Missing values
			</span>
		);
	}

	return (
		<span className="inline-flex items-center gap-1 text-green-700">
			<CheckCircle2 className="h-3.5 w-3.5" />
			Ready
		</span>
	);
}
