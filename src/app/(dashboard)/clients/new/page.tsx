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
import { Separator } from '@/components/ui/separator';
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form';
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

	const form = useForm<CreateClientInput>({
		resolver: zodResolver(CreateClientSchema),
		mode: 'onTouched',
		defaultValues: {
			employeeCount: undefined,
			logoUrl: undefined,
			signatureUrl: undefined,
		},
	});

	const logoUrl = form.watch('logoUrl');
	const signatureUrl = form.watch('signatureUrl');

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
			form.setValue(field, dataUrl, {
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

			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="mx-auto max-w-5xl px-4 py-8 space-y-8"
				>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
						{/* ─ Left: text fields ─────────── */}
						<div className="md:col-span-2 space-y-8">
							{/* Firmendaten */}
							<section className="space-y-4">
								<h3 className="text-lg font-medium text-slate-900 border-b pb-2">
									Firmendaten
								</h3>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
									<FormField
										control={form.control}
										name="name"
										render={({ field }) => (
											<FormItem className="sm:col-span-2">
												<FormLabel>Firmenname *</FormLabel>
												<FormControl>
													<Input
														placeholder="Musterfirma GmbH"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="address"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Straße &amp; Hausnummer *</FormLabel>
												<FormControl>
													<Input
														placeholder="Musterstraße 1"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="zipCity"
										render={({ field }) => (
											<FormItem>
												<FormLabel>PLZ und Ort *</FormLabel>
												<FormControl>
													<Input
														placeholder="12345 Musterstadt"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="industry"
										render={({ field }) => (
											<FormItem className="sm:col-span-2">
												<FormLabel>Branche *</FormLabel>
												<FormControl>
													<Input
														placeholder="Maschinenbau, Software, Logistik…"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							</section>

							{/* Kontaktpersonen */}
							<section className="space-y-4">
								<h3 className="text-lg font-medium text-slate-900 border-b pb-2">
									Kontaktpersonen
								</h3>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
									<FormField
										control={form.control}
										name="ceo"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Geschäftsführer (GF) *</FormLabel>
												<FormControl>
													<Input
														placeholder="Max Mustermann"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="qmManager"
										render={({ field }) => (
											<FormItem>
												<FormLabel>QM-Manager *</FormLabel>
												<FormControl>
													<Input
														placeholder="Erika Musterfrau"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="employeeCount"
										render={({ field }) => (
											<FormItem className="sm:col-span-2">
												<FormLabel>Mitarbeiteranzahl *</FormLabel>
												<FormControl>
													<Input
														type="number"
														min={1}
														placeholder="50"
														{...field}
														onChange={e =>
															field.onChange(e.target.valueAsNumber)
														}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							</section>

							{/* Produkte & Dienstleistungen */}
							<section className="space-y-4">
								<h3 className="text-lg font-medium text-slate-900 border-b pb-2">
									Produkte &amp; Dienstleistungen
								</h3>
								<div className="grid grid-cols-1 gap-5">
									<FormField
										control={form.control}
										name="products"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Produkte *</FormLabel>
												<FormControl>
													<Textarea
														rows={3}
														placeholder="Beschreiben Sie die Produkte des Unternehmens…"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="services"
										render={({ field }) => (
											<FormItem>
												<FormLabel>Dienstleistungen *</FormLabel>
												<FormControl>
													<Textarea
														rows={3}
														placeholder="Beschreiben Sie die Dienstleistungen des Unternehmens…"
														{...field}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							</section>
						</div>

						{/* ─ Right: Branding sidebar ─────────── */}
						<div className="space-y-8">
							<section className="space-y-4 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
								<div className="mb-2">
									<h3 className="text-lg font-medium text-slate-900">
										Branding
									</h3>
									<p className="text-sm text-slate-500 mt-1">
										Diese Assets werden in generierten Handbüchern verwendet.
									</p>
								</div>

								<div className="space-y-6">
									<FormField
										control={form.control}
										name="logoUrl"
										render={() => (
											<FormItem>
												<AssetField
													title="Firmenlogo"
													description="Idealerweise als transparentes PNG."
													value={logoUrl}
													onPick={() => logoInputRef.current?.click()}
													onClear={() =>
														form.setValue('logoUrl', undefined, {
															shouldDirty: true,
															shouldTouch: true,
															shouldValidate: true,
														})
													}
												/>
												<input
													ref={logoInputRef}
													type="file"
													accept="image/png,image/jpeg,image/jpg,image/webp"
													className="hidden"
													onChange={event => {
														const file = event.target.files?.[0] ?? null;
														event.currentTarget.value = '';
														void handleAssetSelect('logoUrl', file);
													}}
												/>
												<FormMessage />
											</FormItem>
										)}
									/>

									<Separator className="bg-slate-200" />

									<FormField
										control={form.control}
										name="signatureUrl"
										render={() => (
											<FormItem>
												<AssetField
													title="Unterschrift"
													description="GF-Signatur, freigestellt (PNG)."
													value={signatureUrl}
													onPick={() => signatureInputRef.current?.click()}
													onClear={() =>
														form.setValue('signatureUrl', undefined, {
															shouldDirty: true,
															shouldTouch: true,
															shouldValidate: true,
														})
													}
												/>
												<input
													ref={signatureInputRef}
													type="file"
													accept="image/png,image/jpeg,image/jpg,image/webp"
													className="hidden"
													onChange={event => {
														const file = event.target.files?.[0] ?? null;
														event.currentTarget.value = '';
														void handleAssetSelect('signatureUrl', file);
													}}
												/>
												<FormMessage />
											</FormItem>
										)}
									/>
								</div>
							</section>
						</div>
					</div>

					<Separator />

					<div className="flex justify-end gap-3 pb-8">
						<Button
							type="button"
							variant="ghost"
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
			</Form>
		</div>
	);
}

interface AssetFieldProps {
	title: string;
	description?: string;
	value: string | undefined;
	onPick: () => void;
	onClear: () => void;
}

function AssetField({
	title,
	description,
	value,
	onPick,
	onClear,
}: AssetFieldProps) {
	return (
		<div className="space-y-3">
			<div>
				<p className="text-sm font-semibold text-slate-800">{title}</p>
				{description && (
					<p className="text-xs text-slate-500 mt-0.5">{description}</p>
				)}
			</div>

			<div
				onClick={!value ? onPick : undefined}
				className={`group relative flex min-h-[140px] w-full items-center justify-center overflow-hidden rounded-xl border-2 transition-all ${
					value
						? 'border-slate-200 bg-white'
						: 'border-dashed border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100 cursor-pointer'
				}`}
			>
				{value ? (
					<>
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={value}
							alt={title}
							className="max-h-28 w-auto object-contain p-2"
						/>
						{/* Overlay actions on hover */}
						<div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-900/60 opacity-0 transition-opacity group-hover:opacity-100">
							<Button
								type="button"
								variant="secondary"
								size="sm"
								onClick={e => {
									e.stopPropagation();
									onPick();
								}}
								className="h-8 text-xs font-medium"
							>
								<RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
								Ändern
							</Button>
							<Button
								type="button"
								variant="destructive"
								size="sm"
								onClick={e => {
									e.stopPropagation();
									onClear();
								}}
								className="h-8 text-xs font-medium"
							>
								<Trash2 className="mr-1.5 h-3.5 w-3.5" />
								Löschen
							</Button>
						</div>
					</>
				) : (
					<div className="flex flex-col items-center justify-center gap-2 text-slate-500">
						<div className="rounded-full bg-white p-2.5 shadow-sm ring-1 ring-slate-200/50">
							<ImagePlus className="h-5 w-5 text-slate-400" />
						</div>
						<div className="text-center">
							<p className="text-sm font-medium text-slate-700">Hochladen</p>
							<p className="text-[11px] text-slate-400 mt-0.5">
								Klick zum Auswählen
							</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
