'use client';

import { CheckCircle2, CircleAlert, Sparkles, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { EditablePlaceholder } from '@/lib/document-workflow/view-models';

interface PlaceholderRowProps {
	placeholder: EditablePlaceholder;
	onEdit: (placeholder: EditablePlaceholder) => void;
	onAutofill: (placeholder: EditablePlaceholder) => void;
	onClear: (placeholder: EditablePlaceholder) => void;
	clearing?: boolean;
}

export function PlaceholderRow({
	placeholder,
	onEdit,
	onAutofill,
	onClear,
	clearing,
}: PlaceholderRowProps) {
	return (
		<div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
			<div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<p className="text-sm font-semibold text-slate-900">
							{placeholder.label}
						</p>
						<Badge variant="gray" className="capitalize">
							{placeholder.type}
						</Badge>
						{placeholder.required ? <Badge variant="blue">Required</Badge> : null}
					</div>
					<div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
						{placeholder.status === 'filled' ? (
							<span className="inline-flex items-center gap-1 text-green-700">
								<CheckCircle2 className="h-3.5 w-3.5" />
								Filled
							</span>
						) : (
							<span className="inline-flex items-center gap-1 text-orange-700">
								<CircleAlert className="h-3.5 w-3.5" />
								Empty
							</span>
						)}
					</div>
					<p className="mt-3 text-sm text-slate-500">{placeholder.preview}</p>
				</div>

				<div className="flex flex-wrap gap-2">
					<Button
						size="sm"
						variant="outline"
						onClick={() => onEdit(placeholder)}
					>
						Edit
					</Button>
					{placeholder.type === 'text' ? (
						<Button
							size="sm"
							variant="outline"
							onClick={() => onAutofill(placeholder)}
						>
							<Sparkles className="h-4 w-4" />
							Auto-fill
						</Button>
					) : null}
					<Button
						size="sm"
						variant="ghost"
						className="text-slate-600"
						onClick={() => onClear(placeholder)}
						loading={clearing}
						disabled={clearing}
					>
						<Trash2 className="h-4 w-4" />
						Clear
					</Button>
				</div>
			</div>
		</div>
	);
}
