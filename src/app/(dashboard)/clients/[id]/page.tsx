"use client";

import { use, useState } from 'react';
import Link from "next/link";
import { useClient } from "@/hooks/useClients";
import { useManuals } from '@/hooks/useManual';
import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { CreateHandbookDialog } from '@/components/handbook-wizard/CreateHandbookDialog';
import { formatDate } from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ClientDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: client, isLoading } = useClient(id);
  const { data: allManuals = [] } = useManuals();
  const [dialogOpen, setDialogOpen] = useState(false);

  const clientManuals = allManuals.filter((m) => m.clientId === id);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner />
      </div>
    );
  }

  if (!client) {
    return <div className="p-8 text-gray-500">Kunde nicht gefunden.</div>;
  }

  const fields = [
    { label: "Firmenname", value: client.name },
    { label: "Adresse", value: `${client.address}, ${client.zipCity}` },
    { label: "Branche", value: client.industry },
    { label: "Geschäftsführung", value: client.ceo },
    { label: "QM-Manager/-in", value: client.qmManager },
    { label: "Mitarbeiter/-innen", value: String(client.employeeCount) },
    { label: "Produkte", value: client.products },
    { label: "Dienstleistungen", value: client.services },
  ];

  return (
		<div>
			<Header
				title={client.name}
				subtitle={`${client.industry} · ${client.zipCity}`}
				actions={
					<Button onClick={() => setDialogOpen(true)}>
						+ Handbuch erstellen
					</Button>
				}
			/>

			<div className="px-8 py-6 grid grid-cols-2 gap-6">
				{/* Client details */}
				<Card>
					<CardHeader>
						<h2 className="font-semibold text-gray-900">Firmendaten</h2>
					</CardHeader>
					<CardContent className="space-y-3">
						{fields.map(({ label, value }) => (
							<div
								key={label}
								className="flex gap-3"
							>
								<span className="text-sm text-gray-500 w-36 shrink-0">
									{label}
								</span>
								<span className="text-sm text-gray-900 font-medium">
									{value}
								</span>
							</div>
						))}
						<div className="pt-1 text-xs text-gray-400">
							Erstellt: {formatDate(client.createdAt)}
						</div>
					</CardContent>
				</Card>

				{/* Manuals */}
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between">
							<h2 className="font-semibold text-gray-900">Handbücher</h2>
							<Badge variant="gray">{clientManuals.length}</Badge>
						</div>
					</CardHeader>
					<CardContent className="space-y-3">
						{clientManuals.length === 0 ? (
							<p className="text-sm text-gray-500">
								Noch kein Handbuch für diesen Kunden.
							</p>
						) : (
							clientManuals.map(m => {
								const statusVariant =
									m.status === 'complete'
										? 'green'
										: m.status === 'in_progress'
											? 'orange'
											: 'gray';
								return (
									<Link
										key={m.id}
										href={`/manuals/${m.id}`}
										className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
									>
										<div>
											<p className="font-medium text-sm text-gray-900">
												{m.title}
											</p>
											<p className="text-xs text-gray-400">
												v{m.version} · {formatDate(m.updatedAt)}
											</p>
										</div>
										<Badge variant={statusVariant}>
											{m.status === 'complete'
												? 'Fertig'
												: m.status === 'in_progress'
													? 'In Arbeit'
													: 'Entwurf'}
										</Badge>
									</Link>
								);
							})
						)}
					</CardContent>
				</Card>
			</div>

			{/* Create Handbook Dialog */}
			<CreateHandbookDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				client={client}
			/>
		</div>
	);
}
