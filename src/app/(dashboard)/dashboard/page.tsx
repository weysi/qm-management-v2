"use client";

import Link from "next/link";
import { useClients } from "@/hooks/useClients";
import { useHandbooks } from '@/hooks/useHandbook';
import { Header } from "@/components/layout/Header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export default function DashboardPage() {
  const { data: clients = [] } = useClients();
  const { data: manuals = [] } = useHandbooks();

  const stats = [
    { label: "Kunden gesamt", value: clients.length, color: "text-primary" },
    { label: "Handbücher", value: manuals.length, color: "text-green-600" },
    {
      label: "Abgeschlossen",
      value: manuals.filter(m => m.status === "READY" || m.status === "EXPORTED").length,
      color: "text-purple-600",
    },
    {
      label: "In Bearbeitung",
      value: manuals.filter(m => m.status === "IN_PROGRESS").length,
      color: "text-orange-600",
    },
  ];

  return (
		<div>
			<Header
				title="Dashboard"
				subtitle="Übersicht über Kunden und Qualitätsmanagementhandbücher"
				actions={
					<Link href="/clients/new">
						<Button size="sm">+ Neuer Kunde</Button>
					</Link>
				}
			/>

			<div className="px-8 py-6 space-y-6">
				{/* Stats */}
				<div className="grid grid-cols-4 gap-4">
					{stats.map(s => (
						<Card key={s.label}>
							<CardContent>
								<p className="text-sm text-gray-500">{s.label}</p>
								<p className={`text-3xl font-bold mt-1 ${s.color}`}>
									{s.value}
								</p>
							</CardContent>
						</Card>
					))}
				</div>

				{/* Recent clients */}
				<Card>
					<div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
						<h2 className="font-semibold text-gray-900">Neueste Kunden</h2>
						<Link
							href="/clients"
							className="text-sm text-primary hover:underline"
						>
							Alle anzeigen →
						</Link>
					</div>
					<div className="divide-y divide-gray-50">
						{clients.slice(0, 5).map(c => (
							<Link
								key={c.id}
								href={`/clients/${c.id}`}
								className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
							>
								<div>
									<p className="font-medium text-gray-900">{c.name}</p>
									<p className="text-sm text-gray-500">
										{c.industry} · {c.zipCity}
									</p>
								</div>
								<div className="text-right">
									<Badge variant="blue">{c.employeeCount} MA</Badge>
									<p className="text-xs text-gray-400 mt-1">
										{formatDate(c.createdAt)}
									</p>
								</div>
							</Link>
						))}
						{clients.length === 0 && (
							<div className="px-6 py-8 text-center text-gray-500">
								<p className="text-sm">Noch keine Kunden vorhanden.</p>
								<Link href="/clients/new">
									<Button
										className="mt-3"
										size="sm"
									>
										Ersten Kunden anlegen
									</Button>
								</Link>
							</div>
						)}
					</div>
				</Card>

				{/* Recent manuals */}
				<Card>
					<div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
						<h2 className="font-semibold text-gray-900">Handbücher</h2>
						<Link
							href="/handbooks"
							className="text-sm text-primary hover:underline"
						>
							Alle anzeigen →
						</Link>
					</div>
					<div className="divide-y divide-gray-50">
							{manuals.slice(0, 5).map(m => {
								const statusVariant =
									m.status === 'READY' || m.status === 'EXPORTED'
										? 'green'
										: m.status === 'IN_PROGRESS'
											? 'orange'
											: 'gray';
								const statusLabel =
									m.status === 'READY'
										? 'Abgeschlossen'
										: m.status === 'EXPORTED'
											? 'Exportiert'
											: m.status === 'IN_PROGRESS'
											? 'In Bearbeitung'
											: 'Entwurf';
							return (
								<Link
									key={m.id}
									href={`/handbooks/${m.id}`}
									className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
									>
										<div>
											<p className="font-medium text-gray-900">{m.type}</p>
											<p className="text-sm text-gray-500">
												{formatDate(m.updated_at)}
											</p>
										</div>
									<Badge variant={statusVariant}>{statusLabel}</Badge>
								</Link>
							);
						})}
						{manuals.length === 0 && (
							<div className="px-6 py-8 text-center text-gray-500 text-sm">
								Noch keine Handbücher erstellt.
							</div>
						)}
					</div>
				</Card>
			</div>
		</div>
	);
}
