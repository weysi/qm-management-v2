'use client';

import { Badge } from '@/components/ui/badge';

type CompletionStatus =
	| 'ready'
	| 'blocked'
	| 'processing'
	| 'attention'
	| 'editing'
	| 'autosaving'
	| 'saved'
	| 'error'
	| 'pending';

interface CompletionStatusBadgeProps {
	status: CompletionStatus;
	label?: string;
	className?: string;
}

const STATUS_CONFIG: Record<
	CompletionStatus,
	{ variant: React.ComponentProps<typeof Badge>['variant']; label: string }
> = {
	ready: { variant: 'green', label: 'Ready' },
	blocked: { variant: 'orange', label: 'Needs input' },
	processing: { variant: 'blue', label: 'Processing' },
	attention: { variant: 'red', label: 'Needs review' },
	editing: { variant: 'orange', label: 'Unsaved' },
	autosaving: { variant: 'blue', label: 'Saving' },
	saved: { variant: 'green', label: 'Saved' },
	error: { variant: 'red', label: 'Save failed' },
	pending: { variant: 'gray', label: 'Pending' },
};

export function CompletionStatusBadge({
	status,
	label,
	className,
}: CompletionStatusBadgeProps) {
	const config = STATUS_CONFIG[status];
	return (
		<Badge
			variant={config.variant}
			className={className}
		>
			{label ?? config.label}
		</Badge>
	);
}
