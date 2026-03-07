'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ScrollableSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: ReactNode;
}

interface ScrollableSheetContentProps
	extends DialogPrimitive.DialogContentProps {
	side?: 'left' | 'right';
}

export function ScrollableSheet({
	open,
	onOpenChange,
	children,
}: ScrollableSheetProps) {
	return (
		<DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
			{children}
		</DialogPrimitive.Root>
	);
}

export function ScrollableSheetContent({
	className,
	children,
	side = 'left',
	...props
}: ScrollableSheetContentProps) {
	return (
		<DialogPrimitive.Portal>
			<DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
			<DialogPrimitive.Content
				className={cn(
					'fixed top-0 z-50 flex h-dvh w-[min(24rem,100vw)] flex-col overflow-hidden border bg-white shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
					side === 'left'
						? 'left-0 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left'
						: 'right-0 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
					className,
				)}
				{...props}
			>
				{children}
			</DialogPrimitive.Content>
		</DialogPrimitive.Portal>
	);
}

export function ScrollableSheetHeader({
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				'sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4',
				className,
			)}
			{...props}
		/>
	);
}

export function ScrollableSheetTitle({
	className,
	...props
}: DialogPrimitive.DialogTitleProps) {
	return (
		<DialogPrimitive.Title
			className={cn('text-lg font-semibold text-slate-900', className)}
			{...props}
		/>
	);
}

export function ScrollableSheetDescription({
	className,
	...props
}: DialogPrimitive.DialogDescriptionProps) {
	return (
		<DialogPrimitive.Description
			className={cn('mt-1 text-sm text-slate-500', className)}
			{...props}
		/>
	);
}

export function ScrollableSheetBody({
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn('min-h-0 flex-1 overflow-y-auto px-5 py-4', className)}
			{...props}
		/>
	);
}

export function ScrollableSheetFooter({
	className,
	...props
}: HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			className={cn(
				'sticky bottom-0 z-10 border-t border-slate-200 bg-white px-5 py-4',
				className,
			)}
			{...props}
		/>
	);
}
