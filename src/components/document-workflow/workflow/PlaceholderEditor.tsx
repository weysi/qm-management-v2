'use client';

import { CalendarDays, CircleAlert, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CompletionStatusBadge } from '@/components/document-workflow/workflow/CompletionStatusBadge';
import type { EditablePlaceholder } from '@/lib/document-workflow/view-models';
import { cn } from '@/lib/utils';

/** DD.MM.YYYY → YYYY-MM-DD (for <input type="date">) */
function toInputDate(display: string): string {
	const match = display.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
	if (!match) return '';
	return `${match[3]}-${match[2]}-${match[1]}`;
}

/** YYYY-MM-DD → DD.MM.YYYY (stored format) */
function fromInputDate(value: string): string {
	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return value;
	return `${match[3]}.${match[2]}.${match[1]}`;
}

function todayGerman(): string {
	const d = new Date();
	const day = String(d.getDate()).padStart(2, '0');
	const month = String(d.getMonth() + 1).padStart(2, '0');
	return `${day}.${month}.${d.getFullYear()}`;
}

interface PlaceholderEditorProps {
	placeholder: EditablePlaceholder;
	expanded: boolean;
	onExpand: () => void;
	onTextChange: (placeholderId: string, value: string) => void;
	onBlurSave: (placeholderId: string) => void | Promise<void>;
	onClear: (placeholder: EditablePlaceholder) => void | Promise<void>;
	onOpenAi: (placeholderId: string) => void;
	onOpenAssetsStep: () => void;
}

export function PlaceholderEditor({
	placeholder,
	expanded,
	onExpand,
	onTextChange,
	onBlurSave,
	onClear,
	onOpenAi,
	onOpenAssetsStep,
}: PlaceholderEditorProps) {
	const isText = placeholder.type === 'text';

	return (
		<div
			className={cn(
				'rounded-3xl border border-border bg-background p-4 transition-colors',
				expanded && 'border-primary/30 bg-primary/[0.03]',
			)}
		>
			<button
				type="button"
				className="flex w-full flex-col gap-4 text-left"
				onClick={onExpand}
			>
				<div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
					<div className="min-w-0 flex-1 space-y-3">
						<div className="flex flex-wrap items-center gap-2">
							<p className="text-sm font-semibold text-slate-900">
								{placeholder.label}
							</p>
							<Badge
								variant="gray"
								className="capitalize"
							>
								{placeholder.type}
							</Badge>
							{placeholder.required ? (
								<Badge variant="blue">Required</Badge>
							) : null}
							{placeholder.isAutoFilled ? (
								<Badge variant="green">Default</Badge>
							) : null}
						</div>
						<p className="text-sm text-slate-500">{placeholder.preview}</p>
					</div>

					<div className="flex flex-wrap items-center gap-2">
						<CompletionStatusBadge
							status={mapSaveStatus(placeholder.saveState, placeholder.status)}
							label={buildSaveLabel(placeholder)}
						/>
					</div>
				</div>
			</button>

			{expanded ? (
				<div className="mt-4 space-y-4 border-t border-border pt-4">
					{isText ? (
						<>
							{placeholder.multiline ? (
								<Textarea
									rows={6}
									value={placeholder.value}
									onChange={event =>
										onTextChange(placeholder.id, event.target.value)
									}
									onBlur={() => void onBlurSave(placeholder.id)}
								/>
							) : placeholder.isDate ? (
								<div className="flex items-center gap-2">
									<Input
										type="date"
										value={toInputDate(placeholder.value)}
										onChange={event => {
											onTextChange(
												placeholder.id,
												fromInputDate(event.target.value),
											);
										}}
										onBlur={() => void onBlurSave(placeholder.id)}
									/>
									<Button
										type="button"
										variant="outline"
										size="sm"
										title="Set to today"
										onClick={() => {
											const today = todayGerman();
											onTextChange(placeholder.id, today);
											void onBlurSave(placeholder.id);
										}}
									>
										<CalendarDays className="h-4 w-4" />
										Today
									</Button>
								</div>
							) : (
								<Input
									type="text"
									value={placeholder.value}
									onChange={event =>
										onTextChange(placeholder.id, event.target.value)
									}
									onBlur={() => void onBlurSave(placeholder.id)}
								/>
							)}
							{placeholder.errorMessage ? (
								<div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
									<CircleAlert className="mt-0.5 h-4 w-4" />
									<span>{placeholder.errorMessage}</span>
								</div>
							) : null}
						</>
					) : (
						<div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-4 text-sm text-slate-600">
							{placeholder.type === 'signature'
								? 'This field uses the shared signature from Assets.'
								: 'This field uses the shared logo from Assets.'}
						</div>
					)}

					<div className="flex flex-wrap gap-2">
						{isText ? (
							<Button
								type="button"
								variant="outline"
								onClick={() => onOpenAi(placeholder.id)}
							>
								<Sparkles className="h-4 w-4" />
								Generate with AI
							</Button>
						) : (
							<Button
								type="button"
								variant="outline"
								onClick={onOpenAssetsStep}
							>
								Manage global asset
							</Button>
						)}
						<Button
							type="button"
							variant="ghost"
							className="text-slate-600"
							onClick={() => void onClear(placeholder)}
						>
							<Trash2 className="h-4 w-4" />
							Clear
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}

function mapSaveStatus(
	saveState: EditablePlaceholder['saveState'],
	placeholderStatus: EditablePlaceholder['status'],
) {
	if (saveState === 'editing') return 'editing';
	if (saveState === 'autosaving') return 'autosaving';
	if (saveState === 'error') return 'error';
	if (saveState === 'saved') return 'saved';
	return placeholderStatus === 'filled' ? 'saved' : 'pending';
}

function buildSaveLabel(placeholder: EditablePlaceholder) {
	if (placeholder.saveState === 'editing') return 'Unsaved';
	if (placeholder.saveState === 'autosaving') return 'Saving';
	if (placeholder.saveState === 'error') return 'Retry save';
	if (placeholder.status === 'filled' && placeholder.isAutoFilled) {
		return 'Default';
	}
	if (placeholder.status === 'filled') {
		return 'Complete';
	}
	return 'Missing';
}
