"use client";

import { use, useEffect, useRef, useState, useCallback } from 'react';
import Link from "next/link";
import { toast } from 'sonner';
import { useManual } from "@/hooks/useManual";
import { useClient } from "@/hooks/useClients";
import { useRagAssets, useRagUpload } from '@/hooks/useRagTraining';
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { FileTree } from '@/components/handbook-wizard/FileTree';
import { GenerationPanel } from '@/components/handbook-wizard/GenerationPanel';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ManualPage({ params }: PageProps) {
	const { id } = use(params);
	const { data: manual, isLoading: loadingManual } = useManual(id);
	const { data: client, isLoading: loadingClient } = useClient(
		manual?.clientId ?? '',
	);

	// RAG assets for this manual
	const { data: ragAssets = [], isLoading: loadingAssets } = useRagAssets(id);

	// Upload via RAG backend
	const { mutateAsync: uploadAsset, isPending: isUploading } = useRagUpload(id);
	const inputRef = useRef<HTMLInputElement>(null);

	// File selection state
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	useEffect(() => {
		if (!inputRef.current) return;
		inputRef.current.setAttribute('webkitdirectory', '');
		inputRef.current.setAttribute('directory', '');
	}, []);

	const handleSelect = useCallback((assetId: string, selected: boolean) => {
		setSelectedIds(prev => {
			const next = new Set(prev);
			if (selected) next.add(assetId);
			else next.delete(assetId);
			return next;
		});
	}, []);

	const handleSelectAll = useCallback(
		(selected: boolean) => {
			if (selected) {
				setSelectedIds(new Set(ragAssets.map(a => a.id)));
			} else {
				setSelectedIds(new Set());
			}
		},
		[ragAssets],
	);

	if (loadingManual || loadingClient) {
		return (
			<div className="flex justify-center items-center h-64">
				<Spinner />
			</div>
		);
	}

	if (!manual || !client) {
		return <div className="p-8 text-gray-500">Handbuch nicht gefunden.</div>;
	}

	async function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
		if (!client) return;
		const list = event.target.files;
		if (!list || list.length === 0) return;

		const files = Array.from(list);
		let success = 0;
		let failed = 0;

		for (const file of files) {
			const rel = (file as File & { webkitRelativePath?: string })
				.webkitRelativePath;
			const path =
				typeof rel === 'string' && rel.trim() !== '' ? rel : file.name;

			try {
				await uploadAsset({
					file,
					manualId: id,
					tenantId: client.id,
					packageCode: 'ISO9001',
					packageVersion: 'v1',
					role: 'TEMPLATE',
					path,
				});
				success++;
			} catch {
				failed++;
			}
		}

		if (success > 0) toast.success(`${success} Datei(en) hochgeladen.`);
		if (failed > 0) toast.error(`${failed} Datei(en) fehlgeschlagen.`);
		event.target.value = '';
	}

	// Build customer profile from client data
	const customerProfile: Record<string, string> = {
		FIRMA_NAME: client.name,
		FIRMA_ADRESSE: client.address,
		FIRMA_PLZ_ORT: client.zipCity,
		GESCHAEFTSFUEHRER: client.ceo,
		QM_MANAGER: client.qmManager,
		MITARBEITER_ANZAHL: String(client.employeeCount),
		BRANCHE: client.industry,
		PRODUKTE: client.products,
		DIENSTLEISTUNGEN: client.services,
	};

	const templateAssets = ragAssets.filter(a => a.role === 'TEMPLATE');
	const referenceAssets = ragAssets.filter(
		a => a.role === 'REFERENCE' || a.role === 'CUSTOMER_REFERENCE',
	);

	return (
		<div className="flex flex-col h-screen overflow-hidden">
			<Header
				title={manual.title}
				subtitle={`v${manual.version} · ${client.name}`}
				actions={
					<div className="flex items-center gap-3">
						<Badge variant="blue">{ragAssets.length} Dateien</Badge>
						<Link href={`/manuals/${id}/reference-files`}>
							<Button
								variant="outline"
								size="sm"
							>
								Referenzdokumente
							</Button>
						</Link>
					</div>
				}
			/>

			<div className="flex-1 overflow-y-auto">
				<div className="px-8 py-6">
					<div className="grid grid-cols-3 gap-6">
						{/* Left: File tree (2 cols) */}
						<div className="col-span-2 space-y-4">
							{/* Upload area */}
							<Card>
								<CardContent className="py-4">
									<div className="flex items-center justify-between">
										<div>
											<input
												ref={inputRef}
												type="file"
												multiple
												accept=".docx,.pptx,.xlsx,.pdf,.doc"
												className="hidden"
												onChange={handleFileInput}
											/>
											<Button
												variant="outline"
												size="sm"
												loading={isUploading}
												onClick={() => inputRef.current?.click()}
											>
												Dateien / Ordner hochladen
											</Button>
										</div>
										<div className="flex items-center gap-2 text-xs text-gray-500">
											<Badge variant="blue">
												{templateAssets.length} Vorlagen
											</Badge>
											<Badge variant="green">
												{referenceAssets.length} Referenzen
											</Badge>
										</div>
									</div>
								</CardContent>
							</Card>

							{/* File tree */}
							{loadingAssets ? (
								<div className="flex justify-center py-12">
									<Spinner />
								</div>
							) : ragAssets.length === 0 ? (
								<Card>
									<CardContent className="py-16 text-center text-gray-500">
										<svg
											className="w-12 h-12 text-gray-300 mx-auto mb-3"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												strokeLinecap="round"
												strokeLinejoin="round"
												strokeWidth={1.5}
												d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
											/>
										</svg>
										<p className="font-medium">Keine Dateien vorhanden</p>
										<p className="text-sm mt-1">
											Laden Sie Dateien hoch oder importieren Sie ein Paket über
											das RAG Training Dashboard.
										</p>
									</CardContent>
								</Card>
							) : (
								<FileTree
									assets={ragAssets}
									selectedIds={selectedIds}
									onSelect={handleSelect}
									onSelectAll={handleSelectAll}
								/>
							)}
						</div>

						{/* Right sidebar (1 col) */}
						<div className="space-y-4">
							{/* Client info card */}
							<Card>
								<CardHeader>
									<h3 className="font-semibold text-gray-900 text-sm">
										Kundendaten
									</h3>
								</CardHeader>
								<CardContent className="space-y-2">
									{[
										{ label: 'Firma', value: client.name },
										{ label: 'Branche', value: client.industry },
										{ label: 'Ort', value: client.zipCity },
										{ label: 'GF', value: client.ceo },
										{ label: 'QM', value: client.qmManager },
									].map(({ label, value }) => (
										<div
											key={label}
											className="flex gap-2 text-xs"
										>
											<span className="text-gray-500 w-14 shrink-0">
												{label}:
											</span>
											<span className="text-gray-800 font-medium truncate">
												{value}
											</span>
										</div>
									))}
								</CardContent>
							</Card>

							{/* Generation panel */}
							<GenerationPanel
								manualId={id}
								tenantId={client.id}
								selectedAssetIds={Array.from(selectedIds)}
								customerProfile={customerProfile}
								totalAssets={ragAssets.length}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
