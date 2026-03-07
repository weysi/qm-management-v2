"use client";


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
import type { CreateClientInput } from '@/lib/schemas';

export default function NewClientPage() {
  const router = useRouter();
  const { mutate: createClient, isPending } = useCreateClient();

  const {
		register,
		handleSubmit,

		formState: { errors },
	} = useForm<CreateClientInput>({
		resolver: zodResolver(CreateClientSchema),
		mode: 'onTouched',
		defaultValues: { employeeCount: undefined },
	});

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
