'use client';

import { ListFilter } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FileTreeToolbarProps {
	showAllFiles: boolean;
	onToggleShowAllFiles: () => void;
	visibleFileCount: number;
	totalFileCount: number;
}

export function FileTreeToolbar({
	showAllFiles,
	onToggleShowAllFiles,
	visibleFileCount,
	totalFileCount,
}: FileTreeToolbarProps) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
			<div>
				<p className="text-sm font-semibold text-slate-900">Project Files</p>
				<p className="mt-1 text-sm text-slate-500">
					{showAllFiles
						? `${visibleFileCount} of ${totalFileCount} files shown`
						: `${visibleFileCount} files with placeholders or review items`}
				</p>
			</div>
			<Button variant="outline" size="sm" onClick={onToggleShowAllFiles}>
				<ListFilter className="h-4 w-4" />
				{showAllFiles ? 'Show only placeholders' : 'Show all files'}
			</Button>
		</div>
	);
}
