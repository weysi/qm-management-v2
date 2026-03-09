'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { CompletionStatusBadge } from '@/components/document-workflow/workflow/CompletionStatusBadge';
import { UiContainer, UiSection } from '@/components/ui-layout';
import type { WorkflowStepState } from '@/lib/document-workflow/workflow-schemas';
import { cn } from '@/lib/utils';

export interface WorkflowStepDefinition {
	id: 1 | 2 | 3 | 4;
	label: 'Upload' | 'Assets' | 'Review' | 'Export';
	title: string;
	description: string;
	state: WorkflowStepState;
	reason?: string | null;
	statusLabel?: string | null;
}

interface StepperShellProps {
	title: string;
	subtitle: string;
	steps: WorkflowStepDefinition[];
	currentStep: 1 | 2 | 3 | 4;
	onStepChange: (step: 1 | 2 | 3 | 4) => void | Promise<void>;
	children: React.ReactNode;
	headerActions?: React.ReactNode;
}

export function StepperShell({
	title,
	subtitle,
	steps,
	currentStep,
	onStepChange,
	children,
	headerActions,
}: StepperShellProps) {
	return (
		<div className="space-y-6">
			<UiContainer>
				<UiSection className="space-y-5">
					<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
						<div className="space-y-2">
							<p className="text-sm font-medium uppercase tracking-[0.16em] text-slate-500">
								Guided workflow
							</p>
							<div className="space-y-1">
								<h1 className="text-3xl font-semibold tracking-tight text-slate-950">
									{title}
								</h1>
								<p className="max-w-3xl text-sm text-slate-600">{subtitle}</p>
							</div>
						</div>
						{headerActions ? (
							<div className="flex flex-wrap items-center gap-2">
								{headerActions}
							</div>
						) : null}
					</div>

					<div className="grid gap-3 md:grid-cols-4">
						{steps.map(step => {
							const isActive = step.id === currentStep;
							const isLocked = step.state === 'locked';
							const statusBadge =
								step.state === 'invalidated'
									? {
											status: 'attention' as const,
											label: step.statusLabel ?? 'Invalidated',
										}
									: step.state === 'completed'
										? {
												status: 'saved' as const,
												label: step.statusLabel ?? 'Complete',
											}
										: step.state === 'active'
											? {
													status: 'processing' as const,
													label: step.statusLabel ?? 'In progress',
												}
											: step.state === 'locked'
												? {
														status: 'pending' as const,
														label: step.statusLabel ?? 'Locked',
													}
												: null;
							return (
								<Button
									key={step.id}
									type="button"
									variant="ghost"
									disabled={isLocked}
									className={cn(
										'h-auto min-h-[112px] flex-col items-start justify-between rounded-3xl border px-4 py-4 text-left shadow-none',
										isActive
											? 'border-primary/30 bg-primary/5'
											: step.state === 'invalidated'
												? 'border-orange-200 bg-orange-50/80 hover:bg-orange-50'
												: 'border-border bg-background hover:bg-muted/50',
										isLocked && 'cursor-not-allowed opacity-60',
									)}
									onClick={() => void onStepChange(step.id)}
								>
									<div className="space-y-3">
										<div className="flex items-center gap-2">
											<span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white">
												{step.label}
											</span>
											{statusBadge ? (
												<CompletionStatusBadge
													status={statusBadge.status}
													label={statusBadge.label}
												/>
											) : null}
										</div>
										<div className="space-y-1">
											<p className="text-sm font-semibold text-slate-900">
												{step.title}
											</p>
										</div>
									</div>
								</Button>
							);
						})}
					</div>
				</UiSection>
			</UiContainer>

			{children}
		</div>
	);
}
