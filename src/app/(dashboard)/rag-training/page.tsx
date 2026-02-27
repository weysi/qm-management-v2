'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { RagStatsCards } from '@/components/rag-training/RagStatsCards';
import { RagFileUpload } from '@/components/rag-training/RagFileUpload';
import { RagAssetTable } from '@/components/rag-training/RagAssetTable';
import { RagRunsPanel } from '@/components/rag-training/RagRunsPanel';
import { RagChatPanel } from '@/components/rag-training/RagChatPanel';
import {
	useRagAssets,
	useRagStartPackage,
	useRagIngest,
	type RagRunItem,
} from '@/hooks/useRagTraining';

const PACKAGES = [
	{
		code: 'ISO9001',
		version: 'v1',
		label: 'ISO 9001 – Qualitätsmanagement',
		lang: 'DE',
	},
	{
		code: 'SSCP',
		version: 'v1',
		label: 'SSCP – Summary of Safety & Clinical Performance',
		lang: 'EN',
	},
	{
		code: 'ISO14007',
		version: 'v1',
		label: 'ISO 14007 – Umweltmanagement',
		lang: 'EN',
	},
];

export default function RagTrainingPage() {
	// Context configuration
	const [tenantId, setTenantId] = useState('default-tenant');
	const [manualId, setManualId] = useState('rag-training-manual');
	const [selectedPackage, setSelectedPackage] = useState('ISO9001');
	const [runs, setRuns] = useState<RagRunItem[]>([]);

	const pkg = PACKAGES.find(p => p.code === selectedPackage) ?? PACKAGES[0];

	// Asset data
	const { data: assets = [], isLoading: assetsLoading } =
		useRagAssets(manualId);

	// Start-package mutation
	const { mutateAsync: startPackage, isPending: startingPackage } =
		useRagStartPackage();

	// Ingest mutation
	const { mutateAsync: ingest, isPending: ingesting } = useRagIngest();

	// Track runs from mutations
	const addRun = (run: RagRunItem) => {
		setRuns(prev => [run, ...prev]);
	};

	async function handleStartPackage() {
		try {
			const result = await startPackage({
				manualId,
				tenantId,
				packageCode: pkg.code,
				packageVersion: pkg.version,
				sync: false,
				force: false,
			});
			addRun(result.run);
			toast.success('Paket-Ingestion gestartet');
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : 'Paket-Start fehlgeschlagen',
			);
		}
	}

	async function handleReindex() {
		try {
			const result = await ingest({
				manualId,
				force: true,
				sync: false,
			});
			addRun(result.run);
			toast.success('Neuindizierung gestartet');
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : 'Indizierung fehlgeschlagen',
			);
		}
	}

	return (
		<div className="flex flex-col h-screen overflow-hidden">
			<Header
				title="RAG Training"
				subtitle="Dateien verwalten, indizieren und das RAG-System überwachen"
				actions={
					<div className="flex items-center gap-2">
						<Badge variant="blue">{assets.length} Dateien</Badge>
						<Button
							variant="outline"
							size="sm"
							loading={ingesting}
							onClick={handleReindex}
							disabled={assets.length === 0}
						>
							Neu indizieren
						</Button>
						<Button
							size="sm"
							loading={startingPackage}
							onClick={handleStartPackage}
						>
							Paket importieren
						</Button>
					</div>
				}
			/>

			<div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
				{/* Configuration row */}
				<Card>
					<CardHeader>
						<h3 className="font-semibold text-gray-900">Konfiguration</h3>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-3 gap-4">
							<div className="space-y-1.5">
								<Label className="text-xs">Mandant (Tenant)</Label>
								<Input
									value={tenantId}
									onChange={e => setTenantId(e.target.value)}
									placeholder="default-tenant"
								/>
							</div>
							<div className="space-y-1.5">
								<Label className="text-xs">Handbuch-ID</Label>
								<Input
									value={manualId}
									onChange={e => setManualId(e.target.value)}
									placeholder="manual-id"
								/>
							</div>
							<div className="space-y-1.5">
								<Label className="text-xs">Paket</Label>
								<Select
									value={selectedPackage}
									onValueChange={setSelectedPackage}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{PACKAGES.map(p => (
											<SelectItem
												key={p.code}
												value={p.code}
											>
												{p.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Stats */}
				<RagStatsCards
					assets={assets}
					isLoading={assetsLoading}
				/>

				{/* Main content tabs */}
				<Tabs
					defaultValue="files"
					className="w-full"
				>
					<TabsList>
						<TabsTrigger value="files">Dateien</TabsTrigger>
						<TabsTrigger value="upload">Hochladen</TabsTrigger>
						<TabsTrigger value="runs">
							Ausführungen
							{runs.length > 0 && (
								<Badge
									variant="gray"
									className="ml-1.5 text-[10px] px-1.5"
								>
									{runs.length}
								</Badge>
							)}
						</TabsTrigger>
						<TabsTrigger value="chat">Chat Test</TabsTrigger>
					</TabsList>

					<TabsContent
						value="files"
						className="mt-4"
					>
						<RagAssetTable
							assets={assets}
							isLoading={assetsLoading}
						/>
					</TabsContent>

					<TabsContent
						value="upload"
						className="mt-4"
					>
						<RagFileUpload
							manualId={manualId}
							tenantId={tenantId}
							packageCode={pkg.code}
							packageVersion={pkg.version}
						/>
					</TabsContent>

					<TabsContent
						value="runs"
						className="mt-4"
					>
						<RagRunsPanel
							manualId={manualId}
							runs={runs}
							isLoading={false}
						/>
					</TabsContent>

					<TabsContent
						value="chat"
						className="mt-4"
					>
						<RagChatPanel
							manualId={manualId}
							tenantId={tenantId}
						/>
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
