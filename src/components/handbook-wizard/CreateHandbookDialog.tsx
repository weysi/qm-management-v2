'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PackageSelector, getPackageInfo } from './PackageSelector';
import type { Client } from '@/types';

interface CreateHandbookDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	client: Client;
}

type Step = 'package' | 'review' | 'creating';

export function CreateHandbookDialog({
	open,
	onOpenChange,
	client,
}: CreateHandbookDialogProps) {
	const router = useRouter();
	const [step, setStep] = useState<Step>('package');
	const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);

	const pkg = selectedPackage ? getPackageInfo(selectedPackage) : null;

	function handleClose() {
		setStep('package');
		setSelectedPackage(null);
		setIsCreating(false);
		onOpenChange(false);
	}

	async function handleCreate() {
		if (!pkg) return;
		setStep('creating');
		setIsCreating(true);

		try {
			const res = await fetch('/api/manuals', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					clientId: client.id,
					packageCode: pkg.code,
					packageVersion: pkg.version,
				}),
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(
					(err as { error?: string }).error ??
						'Handbuch konnte nicht erstellt werden',
				);
			}

			const manual = await res.json();
			toast.success('Handbuch erstellt!');
			handleClose();
			router.push(`/manuals/${manual.id}`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Unbekannter Fehler');
			setStep('review');
			setIsCreating(false);
		}
	}

	const clientFields = [
		{ label: 'Firma', value: client.name },
		{ label: 'Branche', value: client.industry },
		{ label: 'Standort', value: client.zipCity },
		{ label: 'Geschäftsführung', value: client.ceo },
		{ label: 'QM-Manager', value: client.qmManager },
		{ label: 'Mitarbeiter', value: String(client.employeeCount) },
	];

	return (
		<Dialog
			open={open}
			onOpenChange={handleClose}
		>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{step === 'package'
							? 'Paket auswählen'
							: step === 'review'
								? 'Zusammenfassung'
								: 'Handbuch wird erstellt…'}
					</DialogTitle>
					<DialogDescription>
						{step === 'package'
							? 'Wählen Sie das Normpaket für das neue Handbuch.'
							: step === 'review'
								? 'Prüfen Sie die Daten und starten Sie die Erstellung.'
								: 'Bitte warten Sie, während das Handbuch angelegt wird.'}
					</DialogDescription>
				</DialogHeader>

				{/* Step 1: Package selection */}
				{step === 'package' && (
					<div className="py-2">
						<PackageSelector
							value={selectedPackage}
							onChange={setSelectedPackage}
						/>
					</div>
				)}

				{/* Step 2: Review */}
				{step === 'review' && pkg && (
					<div className="py-2 space-y-4">
						{/* Selected package */}
						<div className="bg-primary/5 rounded-lg p-3 flex items-center gap-3">
							{pkg.icon}
							<div>
								<p className="font-semibold text-gray-900">{pkg.label}</p>
								<p className="text-sm text-gray-500">{pkg.description}</p>
							</div>
							<Badge
								variant="blue"
								className="ml-auto"
							>
								{pkg.lang}
							</Badge>
						</div>

						{/* Client data */}
						<div>
							<p className="text-sm font-medium text-gray-700 mb-2">
								Kundendaten
							</p>
							<div className="space-y-1.5">
								{clientFields.map(({ label, value }) => (
									<div
										key={label}
										className="flex gap-2 text-sm"
									>
										<span className="text-gray-500 w-32 shrink-0">
											{label}:
										</span>
										<span className="text-gray-900 font-medium">{value}</span>
									</div>
								))}
							</div>
						</div>
					</div>
				)}

				{/* Step 3: Creating */}
				{step === 'creating' && (
					<div className="py-8 text-center">
						<div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
						<p className="text-sm text-gray-600">
							Handbuch wird erstellt und Paket initialisiert…
						</p>
					</div>
				)}

				<DialogFooter>
					{step === 'package' && (
						<>
							<Button
								variant="outline"
								onClick={handleClose}
							>
								Abbrechen
							</Button>
							<Button
								disabled={!selectedPackage}
								onClick={() => setStep('review')}
							>
								Weiter
							</Button>
						</>
					)}
					{step === 'review' && (
						<>
							<Button
								variant="outline"
								onClick={() => setStep('package')}
							>
								Zurück
							</Button>
							<Button
								onClick={handleCreate}
								loading={isCreating}
							>
								Handbuch erstellen
							</Button>
						</>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
