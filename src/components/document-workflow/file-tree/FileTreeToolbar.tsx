'use client';

import { ListFilter, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface FileTreeToolbarProps {
	showAllFiles: boolean;
	search: string;
	onSearchChange: (value: string) => void;
	onToggleShowAllFiles: () => void;
	visibleFileCount: number;
	totalFileCount: number;
}

export function FileTreeToolbar({
	showAllFiles,
	search,
	onSearchChange,
	onToggleShowAllFiles,
	visibleFileCount,
	totalFileCount,
}: FileTreeToolbarProps) {
	return (
		<div className="sticky top-0 z-10 space-y-3 border-b border-border bg-white/95 px-5 py-4 backdrop-blur">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p className="text-sm font-semibold text-slate-900">Files</p>
					<p className="mt-1 text-sm text-slate-500">
						{showAllFiles
							? `${visibleFileCount} of ${totalFileCount} files shown`
							: `${visibleFileCount} files need attention`}
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={onToggleShowAllFiles}
				>
					<ListFilter className="h-4 w-4" />
					{showAllFiles ? 'Needs attention' : 'Show all'}
				</Button>
			</div>

			<div className="relative">
				<Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
				<Input
					value={search}
					onChange={event => onSearchChange(event.target.value)}
					placeholder="Search files"
					className="pl-9"
				/>
			</div>
		</div>
	);
}
