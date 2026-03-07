'use client';

import { useDeferredValue, useMemo } from 'react';
import { FileSearch } from 'lucide-react';
import { PlaceholderFilters } from './PlaceholderFilters';
import { PlaceholderRow } from './PlaceholderRow';
import {
	filterEditablePlaceholders,
	type EditablePlaceholder,
	type PlaceholderListFilterState,
} from '@/lib/document-workflow/view-models';

interface PlaceholderListProps {
	placeholders: EditablePlaceholder[];
	filters: PlaceholderListFilterState;
	onFiltersChange: (filters: PlaceholderListFilterState) => void;
	onEdit: (placeholder: EditablePlaceholder) => void;
	onAutofill: (placeholder: EditablePlaceholder) => void;
	onClear: (placeholder: EditablePlaceholder) => void;
	clearingPlaceholderId?: string | null;
}

export function PlaceholderList({
	placeholders,
	filters,
	onFiltersChange,
	onEdit,
	onAutofill,
	onClear,
	clearingPlaceholderId,
}: PlaceholderListProps) {
	const deferredSearch = useDeferredValue(filters.search);

	const filtered = useMemo(
		() =>
			filterEditablePlaceholders(placeholders, {
				...filters,
				search: deferredSearch,
			}),
		[deferredSearch, filters, placeholders],
	);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<PlaceholderFilters
				filters={filters}
				onFiltersChange={onFiltersChange}
			/>

			<div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
				{filtered.length === 0 ? (
					<div className="flex h-full min-h-[240px] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-6 text-center">
						<div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white text-slate-500 ring-1 ring-slate-200">
							<FileSearch className="h-6 w-6" />
						</div>
						<p className="mt-4 text-base font-semibold text-slate-900">
							No placeholders match your filters
						</p>
						<p className="mt-2 max-w-sm text-sm text-slate-500">
							Try another search or remove a filter to see the placeholders in this
							file.
						</p>
					</div>
				) : (
					<div className="space-y-3">
						{filtered.map(placeholder => (
							<PlaceholderRow
								key={placeholder.id}
								placeholder={placeholder}
								onEdit={onEdit}
								onAutofill={onAutofill}
								onClear={onClear}
								clearing={clearingPlaceholderId === placeholder.id}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
