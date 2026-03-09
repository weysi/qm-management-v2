'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
	AlertTriangle,
	ArrowRight,
	Building2,
	CalendarDays,
	Clock3,
	FileText,
	Trash2,
} from 'lucide-react';
import { useDeleteHandbook, useHandbooks } from '@/hooks/useHandbook';
import { useClients } from '@/hooks/useClients';
import { Header } from '@/components/layout/Header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

function statusVariant(status: string) {
  if (status === 'READY' || status === 'EXPORTED') return 'green';
  if (status === 'IN_PROGRESS') return 'orange';
  return 'gray';
}

export default function HandbooksPage() {
  const { data: handbooks = [], isLoading } = useHandbooks();
  const { data: clients = [] } = useClients();
  const deleteHandbook = useDeleteHandbook();
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));
  const handbookToDelete =
		handbooks.find(item => item.id === pendingDeleteId) ?? null;
	const summary = useMemo(() => {
		const ready = handbooks.filter(
			item => item.status === 'READY' || item.status === 'EXPORTED',
		).length;
		const inProgress = handbooks.filter(
			item => item.status === 'IN_PROGRESS',
		).length;

		return {
			total: handbooks.length,
			ready,
			inProgress,
		};
	}, [handbooks]);

	async function handleDeleteHandbook() {
		if (!handbookToDelete) return;

		try {
			await deleteHandbook.mutateAsync(handbookToDelete.id);
			toast.success('Workspace wurde gelöscht.');
			setPendingDeleteId(null);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Workspace konnte nicht gelöscht werden.',
			);
		}
	}

  return (
		<div className="min-h-screen bg-slate-50">
			<Header
				title="Dokumente"
				subtitle={`${handbooks.length} Dokumenten-Workspaces`}
			/>

			<div className="px-8 py-6">
				{isLoading ? (
					<div className="flex justify-center py-12">
						<Spinner />
					</div>
				) : handbooks.length === 0 ? (
					<Card className="mx-auto max-w-2xl border-dashed border-slate-300 bg-white/80 shadow-sm">
						<CardContent className="flex flex-col items-center gap-3 py-16 text-center text-slate-500">
							<div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
								<FileText className="h-6 w-6" />
							</div>
							<div className="space-y-1">
								<p className="text-base font-semibold text-slate-900">
									Noch keine Dokumenten-Workspaces vorhanden.
								</p>
								<p className="text-sm">
									Öffne einen Kunden und starte einen neuen Workspace.
								</p>
							</div>
						</CardContent>
					</Card>
				) : (
					<div className="mx-auto flex max-w-6xl flex-col gap-6">
						<div className="grid gap-3 sm:grid-cols-3">
							<Card className="border-slate-200 bg-white/90 shadow-sm">
								<CardContent className="py-5">
									<p className="text-sm text-slate-500">Gesamt</p>
									<p className="mt-1 text-2xl font-semibold text-slate-950">
										{summary.total}
									</p>
								</CardContent>
							</Card>
							<Card className="border-emerald-200 bg-emerald-50/70 shadow-sm">
								<CardContent className="py-5">
									<p className="text-sm text-emerald-700">Fertig</p>
									<p className="mt-1 text-2xl font-semibold text-emerald-950">
										{summary.ready}
									</p>
								</CardContent>
							</Card>
							<Card className="border-amber-200 bg-amber-50/70 shadow-sm">
								<CardContent className="py-5">
									<p className="text-sm text-amber-700">In Arbeit</p>
									<p className="mt-1 text-2xl font-semibold text-amber-950">
										{summary.inProgress}
									</p>
								</CardContent>
							</Card>
						</div>

						<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
							{handbooks.map(item => {
								const client = clientMap[item.customer_id];

								return (
									<Card
										key={item.id}
										className="group border-slate-200 bg-white/95 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
									>
										<CardContent className="p-0">
											<div className="flex h-full flex-col">
												<Link
													href={`/handbooks/${item.id}`}
													className="flex flex-1 flex-col gap-5 p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
												>
													<div className="flex items-start justify-between gap-4">
														<div className="min-w-0 flex-1 space-y-3">
															<div className="flex items-center gap-2">
																<div className="rounded-xl bg-slate-100 p-2 text-slate-700">
																	<FileText className="h-4 w-4" />
																</div>
																<Badge variant={statusVariant(item.status)}>
																	{item.status}
																</Badge>
															</div>
															<div className="space-y-1">
																<p className="truncate text-lg font-semibold text-slate-950">
																	{item.type}
																</p>
																<p className="text-sm text-slate-500">
																	Dokumenten-Workspace
																</p>
															</div>
														</div>
														<div className="flex items-center text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-slate-700">
															<ArrowRight className="h-5 w-5" />
														</div>
													</div>

													<div className="grid gap-3 sm:grid-cols-2">
														<div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
															<div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
																<Building2 className="h-3.5 w-3.5" />
																Kunde
															</div>
															<p className="truncate text-sm font-medium text-slate-900">
																{client?.name ?? 'Unbekannter Kunde'}
															</p>
															<p className="truncate text-xs text-slate-500">
																{client?.industry ?? 'Branche nicht gesetzt'}
															</p>
														</div>
														<div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
															<div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
																<Clock3 className="h-3.5 w-3.5" />
																Letzte Änderung
															</div>
															<p className="text-sm font-medium text-slate-900">
																{formatDate(item.updated_at)}
															</p>
															<p className="text-xs text-slate-500">
																Erstellt am {formatDate(item.created_at)}
															</p>
														</div>
													</div>
												</Link>

												<div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
													<div className="flex items-center gap-2 text-xs text-slate-500">
														<CalendarDays className="h-3.5 w-3.5" />
														Aktualisiert {formatDate(item.updated_at)}
													</div>
													<div className="flex items-center gap-2">
														<Button
															asChild
															size="sm"
															variant="outline"
														>
															<Link href={`/handbooks/${item.id}`}>Öffnen</Link>
														</Button>
														<Button
															type="button"
															size="sm"
															variant="ghost"
															className="text-red-600 hover:bg-red-50 hover:text-red-700"
															disabled={deleteHandbook.isPending}
															onClick={() => setPendingDeleteId(item.id)}
														>
															<Trash2 className="h-4 w-4" />
															Löschen
														</Button>
													</div>
												</div>
											</div>
										</CardContent>
									</Card>
								);
							})}
						</div>
					</div>
				)}
			</div>

			<Dialog
				open={Boolean(handbookToDelete)}
				onOpenChange={open => {
					if (!open) {
						setPendingDeleteId(null);
					}
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2">
							<AlertTriangle className="h-5 w-5 text-red-500" />
							Workspace löschen
						</DialogTitle>
						<DialogDescription>
							Der Workspace wird dauerhaft entfernt. Dieser Schritt kann nicht
							rückgängig gemacht werden.
						</DialogDescription>
					</DialogHeader>
					{handbookToDelete ? (
						<div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-900">
							<p className="font-medium">{handbookToDelete.type}</p>
							<p className="text-red-700">
								{clientMap[handbookToDelete.customer_id]?.name ??
									'Unbekannter Kunde'}
							</p>
						</div>
					) : null}
					<DialogFooter className="gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => setPendingDeleteId(null)}
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
