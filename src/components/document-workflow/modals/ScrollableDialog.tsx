'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const sizeClasses = {
	md: 'sm:max-w-2xl',
	lg: 'sm:max-w-3xl',
	xl: 'sm:max-w-4xl',
	full: 'sm:max-w-5xl',
} as const;

interface ScrollableDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
}

interface ScrollableDialogContentProps extends HTMLAttributes<HTMLDivElement> {
	size?: keyof typeof sizeClasses;
}

export function ScrollableDialog({
	open,
	onOpenChange,
	children,
}: ScrollableDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{children}
		</Dialog>
	);
}

export function ScrollableDialogContent({
	className,
	size = 'lg',
	...props
}: ScrollableDialogContentProps) {
	return (
		<DialogContent
			className={cn(
				'overflow-hidden p-0',
				sizeClasses[size],
				className,
			)}
			{...props}
		/>
	);
}

export function ScrollableDialogHeader({
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<DialogHeader
			className={cn(
				'sticky top-0 z-10 gap-1 border-b border-slate-200 bg-white px-6 py-5',
				className,
			)}
			{...props}
		/>
	);
}

export function ScrollableDialogBody({
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn('min-h-0 flex-1 overflow-y-auto px-6 py-5', className)}
			{...props}
		/>
	);
}

export function ScrollableDialogFooter({
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<DialogFooter
			className={cn(
				'sticky bottom-0 z-10 border-t border-slate-200 bg-white px-6 py-4',
				className,
			)}
			{...props}
		/>
	);
}

export {
	DialogDescription as ScrollableDialogDescription,
	DialogTitle as ScrollableDialogTitle,
};
