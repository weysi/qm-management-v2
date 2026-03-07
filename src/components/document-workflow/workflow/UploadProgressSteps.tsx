'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const steps = [
	'Upload ZIP or Files',
	'Review Extracted Files',
	'Check Found Placeholders',
	'Fill Missing Values',
	'Generate Final Output',
];

interface UploadProgressStepsProps {
	currentStep: number;
}

export function UploadProgressSteps({
	currentStep,
}: UploadProgressStepsProps) {
	return (
		<div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-center justify-between gap-3">
				<div>
					<p className="text-sm font-semibold text-slate-900">Guided Workflow</p>
					<p className="mt-1 text-sm text-slate-500">
						Follow the steps from upload to final generation.
					</p>
				</div>
				<Badge variant="blue">Step {Math.min(Math.max(currentStep, 1), steps.length)}</Badge>
			</div>

			<div className="mt-5 grid gap-3 md:grid-cols-5">
				{steps.map((step, index) => {
					const isActive = index + 1 === currentStep;
					const isComplete = index + 1 < currentStep;
					return (
						<div
							key={step}
							className={cn(
								'rounded-2xl border px-4 py-3 text-sm',
								isComplete
									? 'border-green-200 bg-green-50 text-green-800'
									: isActive
										? 'border-primary/30 bg-primary/5 text-slate-900'
										: 'border-slate-200 bg-slate-50 text-slate-500',
							)}
						>
							<p className="text-xs font-semibold uppercase tracking-wide">
								{index + 1}
							</p>
							<p className="mt-2 font-medium">{step}</p>
						</div>
					);
				})}
			</div>
		</div>
	);
}
