'use client';

import { Button } from '@/components/ui/button';
import {
	ScrollableDialog,
	ScrollableDialogBody,
	ScrollableDialogContent,
	ScrollableDialogDescription,
	ScrollableDialogFooter,
	ScrollableDialogHeader,
	ScrollableDialogTitle,
} from '@/components/document-workflow/modals/ScrollableDialog';
import type { MissingPlaceholderItem } from '@/lib/document-workflow/view-models';

interface MissingPlaceholdersDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	items: MissingPlaceholderItem[];
	onFillNow: () => void;
}

export function MissingPlaceholdersDialog({
	open,
	onOpenChange,
	items,
	onFillNow,
}: MissingPlaceholdersDialogProps) {
	const grouped = groupByFile(items);

	return (
		<ScrollableDialog open={open} onOpenChange={onOpenChange}>
			<ScrollableDialogContent size="lg">
				<ScrollableDialogHeader>
					<ScrollableDialogTitle>
						Some placeholders are still empty
					</ScrollableDialogTitle>
					<ScrollableDialogDescription>
						Review the missing required placeholders before generating the final
						document package.
					</ScrollableDialogDescription>
				</ScrollableDialogHeader>

				<ScrollableDialogBody>
					<div className="space-y-4">
						{grouped.map(group => (
							<div
								key={group.filePath}
								className="rounded-3xl border border-orange-200 bg-orange-50 p-4"
							>
								<p className="text-sm font-semibold text-slate-900">
									{group.filePath}
								</p>
								<ul className="mt-3 space-y-2">
									{group.items.map(item => (
										<li
											key={`${item.fileId}:${item.name}`}
											className="rounded-2xl bg-white px-3 py-2 text-sm text-slate-700"
										>
											{item.label}
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</ScrollableDialogBody>

				<ScrollableDialogFooter className="gap-2">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Not now
					</Button>
					<Button
						onClick={() => {
							onOpenChange(false);
							onFillNow();
						}}
					>
						Review Missing Fields
					</Button>
				</ScrollableDialogFooter>
			</ScrollableDialogContent>
		</ScrollableDialog>
	);
}

function groupByFile(items: MissingPlaceholderItem[]) {
	const grouped = new Map<
		string,
		{ fileId: string; filePath: string; items: MissingPlaceholderItem[] }
	>();

	for (const item of items) {
		const existing = grouped.get(item.filePath);
		if (existing) {
			existing.items.push(item);
			continue;
		}
		grouped.set(item.filePath, {
			fileId: item.fileId,
			filePath: item.filePath,
			items: [item],
		});
	}

	return Array.from(grouped.values());
}
