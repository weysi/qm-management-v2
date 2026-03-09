"use client";


import { useRef } from 'react';
import { useRouter } from "next/navigation";
import { useForm } from 'react-hook-form';
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateClientSchema } from "@/lib/schemas";
import { useCreateClient } from "@/hooks/useClients";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { ImagePlus, RefreshCcw, Trash2 } from 'lucide-react';
import type { CreateClientInput } from '@/lib/schemas';

async function fileToDataUrl(file: File): Promise<string> {
	return await new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result !== 'string') {
				reject(new Error('Datei konnte nicht gelesen werden.'));
				return;
			}
			resolve(reader.result);
		};
		reader.onerror = () =>
			reject(new Error('Datei konnte nicht gelesen werden.'));
		reader.readAsDataURL(file);
	});
}

export default function NewClientPage() {
  const router = useRouter();
  const { mutate: createClient, isPending } = useCreateClient();
	const logoInputRef = useRef<HTMLInputElement | null>(null);
	const signatureInputRef = useRef<HTMLInputElement | null>(null);

  const {
		register,
		handleSubmit,
		setValue,
		watch,

		formState: { errors },
	} = useForm<CreateClientInput>({
		resolver: zodResolver(CreateClientSchema),
		mode: 'onTouched',
		defaultValues: {
			employeeCount: undefined,
			logoUrl: undefined,
			signatureUrl: undefined,
		},
	});

	const logoUrl = watch('logoUrl');
	const signatureUrl = watch('signatureUrl');

	async function handleAssetSelect(
		field: 'logoUrl' | 'signatureUrl',
		file: File | null,
	) {
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			toast.error('Bitte eine Bilddatei auswählen.');
			return;
		}

		try {
			const dataUrl = await fileToDataUrl(file);
			setValue(field, dataUrl, {
				shouldDirty: true,
				shouldTouch: true,
				shouldValidate: true,
			});
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Datei konnte nicht geladen werden.',
			);
		}
	}

	// ── Submit ─────────────────────────────────────────────────────────────
	function onSubmit(data: CreateClientInput) {
		createClient(data, {
			onSuccess: client => {
				router.push(`/clients/${client.id}`);
			},
		});
	}

	return (
		<div>
			<Header
				title="Neuer Kunde"
				subtitle="Kundendaten für QM-Handbuch erfassen"
			/>

			<form
				onSubmit={handleSubmit(onSubmit)}
				className="px-8 py-6 max-w-7xl space-y-6"
			>
				{/* ─── Main grid ───────────────────────────────────────────────────────── */}
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
					{/* ─ Left: text fields (spans 2 cols on large screens) ─────────── */}
					<div className="lg:col-span-2 space-y-6">
						{/* Firmendaten */}
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Firmendaten</CardTitle>
							</CardHeader>
							<CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div className="sm:col-span-2 space-y-1.5">
									<Label htmlFor="name">Firmenname *</Label>
									<Input
										id="name"
										placeholder="Musterfirma GmbH"
										{...register('name')}
									/>
									{errors.name && (
										<p className="text-xs text-red-500">
											{errors.name.message}
										</p>
									)}
								</div>

								<div className="space-y-1.5">
									<Label htmlFor="address">Straße &amp; Hausnummer *</Label>
									<Input
										id="address"
										placeholder="Musterstraße 1"
										{...register('address')}
									/>
									{errors.address && (
										<p className="text-xs text-red-500">
											{errors.address.message}
										</p>
									)}
								</div>

								<div className="space-y-1.5">
									<Label htmlFor="zipCity">PLZ und Ort *</Label>
									<Input
										id="zipCity"
										placeholder="12345 Musterstadt"
										{...register('zipCity')}
									/>
									{errors.zipCity && (
										<p className="text-xs text-red-500">
											{errors.zipCity.message}
										</p>
									)}
								</div>

								<div className="sm:col-span-2 space-y-1.5">
									<Label htmlFor="industry">Branche *</Label>
									<Input
										id="industry"
										placeholder="Maschinenbau, Software, Logistik…"
										{...register('industry')}
									/>
									{errors.industry && (
										<p className="text-xs text-red-500">
											{errors.industry.message}
										</p>
									)}
								</div>
							</CardContent>
						</Card>

						{/* Kontaktpersonen */}
						<Card>
							<CardHeader>
								<CardTitle className="text-base">Kontaktpersonen</CardTitle>
							</CardHeader>
							<CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div className="space-y-1.5">
									<Label htmlFor="ceo">Geschäftsführer (GF) *</Label>
									<Input
										id="ceo"
										placeholder="Max Mustermann"
										{...register('ceo')}
									/>
									{errors.ceo && (
										<p className="text-xs text-red-500">{errors.ceo.message}</p>
									)}
								</div>

								<div className="space-y-1.5">
									<Label htmlFor="qmManager">QM-Manager *</Label>
									<Input
										id="qmManager"
										placeholder="Erika Musterfrau"
										{...register('qmManager')}
									/>
									{errors.qmManager && (
										<p className="text-xs text-red-500">
											{errors.qmManager.message}
										</p>
									)}
								</div>

								<div className="space-y-1.5">
									<Label htmlFor="employeeCount">Mitarbeiteranzahl *</Label>
									<Input
										id="employeeCount"
										type="number"
										min={1}
										placeholder="50"
										{...register('employeeCount', { valueAsNumber: true })}
									/>
									{errors.employeeCount && (
										<p className="text-xs text-red-500">
											{errors.employeeCount.message}
										</p>
									)}
								</div>
							</CardContent>
						</Card>

						{/* Produkte & Dienstleistungen */}
						<Card>
							<CardHeader>
								<CardTitle className="text-base">
									Produkte &amp; Dienstleistungen
								</CardTitle>
							</CardHeader>
							<CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div className="space-y-1.5">
									<Label htmlFor="products">Produkte *</Label>
									<Textarea
										id="products"
										rows={4}
										placeholder="Beschreiben Sie die Produkte des Unternehmens…"
										{...register('products')}
									/>
									{errors.products && (
										<p className="text-xs text-red-500">
											{errors.products.message}
										</p>
									)}
								</div>

								<div className="space-y-1.5">
									<Label htmlFor="services">Dienstleistungen *</Label>
									<Textarea
										id="services"
										rows={4}
										placeholder="Beschreiben Sie die Dienstleistungen des Unternehmens…"
										{...register('services')}
									/>
									{errors.services && (
										<p className="text-xs text-red-500">
											{errors.services.message}
										</p>
									)}
								</div>
							</CardContent>
						</Card>
					</div>

					<div className="space-y-6">
						<Card>
							<CardHeader>
								<CardTitle className="text-base">
									Logo &amp; Unterschrift
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-5">
								<p className="text-sm text-slate-600">
									Diese Assets werden beim Erstellen neuer Workspaces als
									Standardwerte übernommen.
								</p>

								<AssetField
									title="Firmenlogo"
									description="Wird für passende Logo-Platzhalter im Handbook verwendet."
									value={logoUrl}
									inputRef={logoInputRef}
									error={errors.logoUrl?.message}
									onPick={() => logoInputRef.current?.click()}
									onClear={() =>
										setValue('logoUrl', undefined, {
											shouldDirty: true,
											shouldTouch: true,
											shouldValidate: true,
										})
									}
								/>
								<input
									ref={logoInputRef}
									type="file"
									accept="image/png,image/jpeg,image/jpg,image/gif,image/bmp,image/webp"
									className="hidden"
									onChange={event => {
										const file = event.target.files?.[0] ?? null;
										event.currentTarget.value = '';
										void handleAssetSelect('logoUrl', file);
									}}
								/>

								<AssetField
									title="Unterschrift"
									description="Wird für passende Signatur-Platzhalter im Handbook verwendet."
									value={signatureUrl}
									inputRef={signatureInputRef}
									error={errors.signatureUrl?.message}
									onPick={() => signatureInputRef.current?.click()}
									onClear={() =>
										setValue('signatureUrl', undefined, {
											shouldDirty: true,
											shouldTouch: true,
											shouldValidate: true,
										})
									}
								/>
								<input
									ref={signatureInputRef}
									type="file"
									accept="image/png,image/jpeg,image/jpg,image/gif,image/bmp,image/webp"
									className="hidden"
									onChange={event => {
										const file = event.target.files?.[0] ?? null;
										event.currentTarget.value = '';
										void handleAssetSelect('signatureUrl', file);
									}}
								/>
							</CardContent>
						</Card>
					</div>
				</div>

				<Separator />

				{/* Action buttons */}
				<div className="flex justify-between items-center pb-8">
					<Button
						type="button"
						variant="outline"
						onClick={() => router.back()}
					>
						Abbrechen
					</Button>
					<Button
						type="submit"
						loading={isPending}
					>
						Kunde anlegen
					</Button>
				</div>
			</form>
		</div>
	);
}

interface AssetFieldProps {
	title: string;
	description: string;
	value: string | undefined;
	inputRef: React.RefObject<HTMLInputElement | null>;
	error?: string;
	onPick: () => void;
	onClear: () => void;
}

function AssetField({
	title,
	description,
	value,
	error,
	onPick,
	onClear,
}: AssetFieldProps) {
	const hasAsset = Boolean(value);

	return (
		<div className="space-y-3 rounded-2xl border border-slate-200 p-4">
			<div>
				<p className="text-sm font-semibold text-slate-900">{title}</p>
				<p className="mt-1 text-sm text-slate-500">{description}</p>
			</div>

			<div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
				{value ? (
					<img
						src={value}
						alt={title}
						className="max-h-36 rounded-xl object-contain"
					/>
				) : (
					<p className="text-center text-sm text-slate-500">
						Noch kein Asset hochgeladen.
					</p>
				)}
			</div>

			<div className="flex flex-col gap-2">
				<Button
					type="button"
					variant="outline"
					onClick={onPick}
				>
					{hasAsset ? (
						<RefreshCcw className="h-4 w-4" />
					) : (
						<ImagePlus className="h-4 w-4" />
					)}
					{hasAsset ? 'Ersetzen' : 'Bild hochladen'}
				</Button>
				<Button
					type="button"
					variant="ghost"
					className="text-slate-600"
					disabled={!hasAsset}
					onClick={onClear}
				>
					<Trash2 className="h-4 w-4" />
					Entfernen
				</Button>
			</div>

			{error ? <p className="text-xs text-red-500">{error}</p> : null}
		</div>
	);
}
