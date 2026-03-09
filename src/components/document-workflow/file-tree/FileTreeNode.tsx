'use client';

import {
	ChevronRight,
	FileText,
	Folder,
	FolderOpen,
	Loader2,
	TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CompletionStatusBadge } from '@/components/document-workflow/workflow/CompletionStatusBadge';
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
						className={cn(
							'h-4 w-4 shrink-0 transition',
							isExpanded && 'rotate-90',
						)}
					/>
					{isExpanded ? (
						<FolderOpen className="h-4 w-4 shrink-0 text-slate-500" />
					) : (
						<Folder className="h-4 w-4 shrink-0 text-slate-500" />
					)}
					<span
						className="min-w-0 flex-1 truncate"
						title={node.name}
					>
						{node.name}
					</span>
					{node.requiredTotal > 0 ? (
						<span className="ml-auto text-xs text-slate-500">
							{node.requiredResolved}/{node.requiredTotal}
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
				'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition',
				isSelected
					? 'border-primary/20 bg-primary/10 text-slate-900'
					: 'border-transparent bg-background hover:bg-slate-100',
			)}
			style={{ paddingLeft: `${depth * 14 + 24}px` }}
		>
			<FileText className="h-4 w-4 shrink-0 text-slate-500" />
			<div className="min-w-0 flex-1 overflow-hidden">
				<div className="flex items-center gap-2 overflow-hidden">
					<p
						className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900"
						title={node.name}
					>
						{node.name}
					</p>
					{node.fileType ? (
						<Badge
							variant="gray"
							className="shrink-0"
						>
							{node.fileType}
						</Badge>
					) : null}
				</div>
				<div className="mt-1.5 flex items-center gap-2 overflow-hidden text-xs text-slate-500">
					<StatusChip status={node.status} />
					{node.requiredTotal > 0 ? (
						<span className="shrink-0">
							{node.requiredResolved}/{node.requiredTotal} done
						</span>
					) : (
						<span className="shrink-0">No inputs</span>
					)}
				</div>
			</div>
			<CompletionStatusBadge
				status={node.downloadState === 'ready' ? 'ready' : node.downloadState}
				label={
					node.downloadState === 'ready'
						? 'Done'
						: `${node.missingRequiredCount} left`
				}
			/>
		</button>
	);
}

function StatusChip({ status }: { status: FileTreeItem['status'] }) {
	if (status === 'attention') {
		return (
			<span className="inline-flex shrink-0 items-center gap-1 text-red-700">
				<TriangleAlert className="h-3.5 w-3.5" />
				Review
			</span>
		);
	}

	if (status === 'processing') {
		return (
			<span className="inline-flex shrink-0 items-center gap-1 text-blue-700">
				<Loader2 className="h-3.5 w-3.5 animate-spin" />
				Processing
			</span>
		);
	}

	if (status === 'needs-input') {
		return (
			<span className="inline-flex shrink-0 items-center gap-1 text-orange-700">
				<TriangleAlert className="h-3.5 w-3.5" />
				Review
			</span>
		);
	}

	return (
		<span className="inline-flex shrink-0 items-center gap-1 text-green-700">
			Done
		</span>
	);
}
