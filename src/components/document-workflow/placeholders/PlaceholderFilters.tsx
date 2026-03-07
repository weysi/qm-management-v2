'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import type { PlaceholderListFilterState } from '@/lib/document-workflow/view-models';

interface PlaceholderFiltersProps {
	filters: PlaceholderListFilterState;
	onFiltersChange: (filters: PlaceholderListFilterState) => void;
}

export function PlaceholderFilters({
	filters,
	onFiltersChange,
}: PlaceholderFiltersProps) {
	return (
		<div className="grid gap-3 border-b border-slate-200 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
			<div className="relative">
				<Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
				<Input
					value={filters.search}
					onChange={event =>
						onFiltersChange({
							...filters,
							search: event.target.value,
						})
					}
					placeholder="Search placeholders"
					className="pl-9"
				/>
			</div>

			<Select
				value={filters.status}
				onValueChange={value =>
					onFiltersChange({
						...filters,
						status: value as PlaceholderListFilterState['status'],
					})
				}
			>
				<SelectTrigger>
					<SelectValue placeholder="Status" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All statuses</SelectItem>
					<SelectItem value="empty">Empty</SelectItem>
					<SelectItem value="filled">Filled</SelectItem>
				</SelectContent>
			</Select>

			<Select
				value={filters.type}
				onValueChange={value =>
					onFiltersChange({
						...filters,
						type: value as PlaceholderListFilterState['type'],
					})
				}
			>
				<SelectTrigger>
					<SelectValue placeholder="Type" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">All types</SelectItem>
					<SelectItem value="text">Text</SelectItem>
					<SelectItem value="image">Image</SelectItem>
					<SelectItem value="signature">Signature</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
