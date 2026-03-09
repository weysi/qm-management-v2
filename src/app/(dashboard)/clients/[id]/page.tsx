"use client";

import { use, useState } from 'react';
import Link from "next/link";
import { useClient } from "@/hooks/useClients";
import { useHandbooks } from '@/hooks/useHandbook';
import { useDeleteHandbook } from '@/hooks';
import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { CreateHandbookDialog } from '@/components/handbook-wizard/CreateHandbookDialog';
import { formatDate } from "@/lib/utils";
import { toast } from 'sonner';
import type { Handbook } from '@/lib/schemas';
import {
	MapPin,
	Briefcase,
	User,
	Users,
	Package,
	Wrench,
	Building2,
	Calendar,
	FileText,
	Plus,
	BookOpen,
	Trash2,
	AlertTriangle,
} from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ClientDetailPage({ params }: PageProps) {
	const { id } = use(params);
	const { data: client, isLoading } = useClient(id);
	const { data: allManuals = [] } = useHandbooks();
	const deleteHandbook = useDeleteHandbook(id);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [pendingHandbook, setPendingHandbook] = useState<Handbook | null>(null);

	const clientManuals = allManuals.filter(m => m.customer_id === id);

	async function handleDeleteHandbook() {
		if (!pendingHandbook) return;
		try {
			await deleteHandbook.mutateAsync(pendingHandbook.id);
			toast.success('Workspace wurde gelöscht.');
			setPendingHandbook(null);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Workspace konnte nicht gelöscht werden.',
			);
		}
	}

	if (isLoading) {
		return (
			<div className="flex justify-center items-center h-64">
				<Spinner />
			</div>
		);
	}

	if (!client) {
		return (
			<div className="flex flex-col items-center justify-center p-12 text-center">
				<Building2 className="w-12 h-12 text-gray-300 mb-4" />
				<h3 className="text-lg font-medium text-gray-900">
					Kunde nicht gefunden
				</h3>
				<p className="text-sm text-gray-500 mt-1">
					Dieser Kunde existiert nicht oder wurde gelöscht.
				</p>
				<Link
					href="/clients"
					className="mt-6 text-sm text-blue-600 hover:underline"
				>
					Zurück zur Übersicht
				</Link>
			</div>
		);
	}

	return (
		<div className="bg-gray-50/50 min-h-screen pb-12">
			<Header
				title={client.name}
				subtitle={`${client.industry} · ${client.zipCity}`}
				actions={
					<Button
						onClick={() => setDialogOpen(true)}
						className="flex items-center gap-2"
					>
						<Plus className="w-4 h-4" /> Dokumenten-Workspace erstellen
					</Button>
				}
			/>

			<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
					{/* Left Column: Firmendaten & Logo */}
					<div className="lg:col-span-2 space-y-8">
						<Card className="shadow-sm border-gray-200/60 overflow-hidden">
							<CardHeader className="border-b border-gray-100 bg-white px-6 py-5">
								<CardTitle className="text-lg font-semibold flex items-center gap-2 text-gray-900">
									<Building2 className="w-5 h-5 text-gray-400" />
									Firmendaten
								</CardTitle>
							</CardHeader>
							<CardContent className="p-0 bg-white">
								<div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
									{/* General Info */}
									<div className="p-6 space-y-6">
										<div className="flex gap-4">
											<div className="shrink-0 mt-0.5 bg-blue-50 p-2.5 rounded-xl text-blue-600">
												<MapPin className="w-4 h-4" />
											</div>
											<div>
												<p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
													Standort
												</p>
												<p className="text-sm text-gray-900 font-medium">
													{client.address}
												</p>
												<p className="text-sm text-gray-600">
													{client.zipCity}
												</p>
											</div>
										</div>

										<div className="flex gap-4">
											<div className="shrink-0 mt-0.5 bg-purple-50 p-2.5 rounded-xl text-purple-600">
												<Briefcase className="w-4 h-4" />
											</div>
											<div>
												<p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
													Branche
												</p>
												<p className="text-sm text-gray-900 font-medium">
													{client.industry}
												</p>
											</div>
										</div>

										<div className="flex gap-4">
											<div className="shrink-0 mt-0.5 bg-amber-50 p-2.5 rounded-xl text-amber-600">
												<Calendar className="w-4 h-4" />
											</div>
											<div>
												<p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
													Kunde seit
												</p>
												<p className="text-sm text-gray-900 font-medium">
													{formatDate(client.createdAt)}
												</p>
											</div>
										</div>
									</div>

									{/* Contact & Structure Info */}
									<div className="p-6 space-y-6">
										<div className="flex gap-4">
											<div className="shrink-0 mt-0.5 bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
												<User className="w-4 h-4" />
											</div>
											<div>
												<p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
													Geschäftsführung
												</p>
												<p className="text-sm text-gray-900 font-medium">
													{client.ceo}
												</p>
											</div>
										</div>

										<div className="flex gap-4">
											<div className="shrink-0 mt-0.5 bg-teal-50 p-2.5 rounded-xl text-teal-600">
												<User className="w-4 h-4" />
											</div>
											<div>
												<p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
													QM-Beauftragte/r
												</p>
												<p className="text-sm text-gray-900 font-medium">
													{client.qmManager}
												</p>
											</div>
										</div>

										<div className="flex gap-4">
											<div className="shrink-0 mt-0.5 bg-green-50 p-2.5 rounded-xl text-green-600">
												<Users className="w-4 h-4" />
											</div>
											<div>
												<p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
													Unternehmensgröße
												</p>
												<p className="text-sm text-gray-900 font-medium">
													{client.employeeCount} Mitarbeiter/-innen
												</p>
											</div>
										</div>
									</div>
								</div>

								{/* Products & Services */}
								<div className="grid grid-cols-1 md:grid-cols-2 border-t border-gray-100 bg-gray-50/50">
									<div className="p-6 border-b md:border-b-0 md:border-r border-gray-100">
										<div className="flex items-center gap-2 mb-3">
											<Package className="w-4 h-4 text-gray-500" />
											<h4 className="text-sm font-semibold text-gray-900">
												Produkte
											</h4>
										</div>
										<p className="text-sm text-gray-600 leading-relaxed">
											{client.products || (
												<span className="italic text-gray-400">
													Keine Angabe
												</span>
											)}
										</p>
									</div>
									<div className="p-6">
										<div className="flex items-center gap-2 mb-3">
											<Wrench className="w-4 h-4 text-gray-500" />
											<h4 className="text-sm font-semibold text-gray-900">
												Dienstleistungen
											</h4>
										</div>
										<p className="text-sm text-gray-600 leading-relaxed">
											{client.services || (
												<span className="italic text-gray-400">
													Keine Angabe
												</span>
											)}
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Right Column: Manuals */}
					<div className="lg:col-span-1 space-y-6">
						<Card className="shadow-sm border-gray-200/60 overflow-hidden">
							<CardHeader className="border-b border-gray-100 bg-gray-50/50 px-6 py-5">
								<div className="flex items-center justify-between">
									<CardTitle className="text-lg font-semibold flex items-center gap-2 text-gray-900">
										<BookOpen className="w-5 h-5 text-gray-500" />
										Dokumente
									</CardTitle>
									<Badge
										variant="gray"
										className="bg-white border-gray-200 text-gray-700 font-medium shadow-sm"
									>
										{clientManuals.length}
									</Badge>
								</div>
							</CardHeader>
							<CardContent className="p-0 bg-white">
								{clientManuals.length === 0 ? (
									<div className="p-10 text-center flex flex-col items-center">
										<div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center mb-4">
											<BookOpen className="w-6 h-6 text-blue-500" />
										</div>
										<p className="text-base font-medium text-gray-900 mb-1">
											Keine Dokumente
										</p>
										<p className="text-sm text-gray-500 mb-6 text-center max-w-[200px]">
											Es wurde noch kein Dokumenten-Workspace für diesen Kunden
											erstellt.
										</p>
										<Button
											onClick={() => setDialogOpen(true)}
											className="w-full"
										>
											Erstes Handbuch erstellen
										</Button>
									</div>
								) : (
									<div className="divide-y divide-gray-100">
										{clientManuals.map(m => {
											const statusVariant =
												m.status === 'READY' || m.status === 'EXPORTED'
													? 'green'
													: m.status === 'IN_PROGRESS'
														? 'orange'
														: 'gray';

											const statusText =
												m.status === 'READY'
													? 'Fertig'
													: m.status === 'EXPORTED'
														? 'Exportiert'
														: m.status === 'IN_PROGRESS'
															? 'In Arbeit'
															: 'Entwurf';

											return (
												<div
													key={m.id}
													className="p-5 transition-colors hover:bg-gray-50/80"
												>
													<div className="flex items-start justify-between gap-4">
														<Link
															href={`/handbooks/${m.id}`}
															className="group min-w-0 flex-1"
														>
															<div className="flex items-start gap-4">
																<p className="min-w-0 flex-1 font-semibold text-sm text-gray-900 transition-colors group-hover:text-blue-600 line-clamp-2">
																	{m.type}
																</p>
																<Badge
																	variant={statusVariant}
																	className="shrink-0 mt-0.5"
																>
																	{statusText}
																</Badge>
															</div>
															<div className="mt-3 flex flex-wrap items-center text-xs text-gray-500 gap-4">
																<span className="flex items-center gap-1.5 bg-gray-100 px-2 py-1 rounded-md text-gray-600 font-medium">
																	<FileText className="w-3.5 h-3.5" /> {m.type}
																</span>
																<span className="flex items-center gap-1.5">
																	<Calendar className="w-3.5 h-3.5 text-gray-400" />{' '}
																	{formatDate(m.updated_at)}
																</span>
															</div>
														</Link>
														<Button
															type="button"
															size="sm"
															variant="ghost"
															className="shrink-0 text-red-600 hover:text-red-700"
															onClick={() => setPendingHandbook(m)}
														>
															<Trash2 className="h-4 w-4" />
															Löschen
														</Button>
													</div>
												</div>
											);
										})}
									</div>
								)}
							</CardContent>
						</Card>
					</div>
				</div>
			</div>

			<CreateHandbookDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				client={client}
			/>

			<Dialog
				open={Boolean(pendingHandbook)}
				onOpenChange={open => {
					if (!open) setPendingHandbook(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<AlertTriangle className="h-5 w-5 text-red-500" />
							Workspace löschen
						</DialogTitle>
						<DialogDescription>
							Der gesamte Dokumenten-Workspace inklusive Dateien, Versionen und
							Referenzen wird dauerhaft entfernt. Die anderen Ansichten werden
							danach sofort aktualisiert.
						</DialogDescription>
					</DialogHeader>
					<div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-900">
						{pendingHandbook?.type ?? 'Workspace'}
					</div>
					<DialogFooter className="gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setPendingHandbook(null)}
							disabled={deleteHandbook.isPending}
						>
							Abbrechen
						</Button>
						<Button
							type="button"
							variant="destructive"
							loading={deleteHandbook.isPending}
							onClick={() => void handleDeleteHandbook()}
						>
							Endgültig löschen
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
