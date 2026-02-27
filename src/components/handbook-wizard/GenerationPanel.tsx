'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { RagRunItem } from '@/hooks/useRagTraining';

interface GenerationPanelProps {
	manualId: string;
	tenantId?: string;
	selectedAssetIds: string[];
	customerProfile: Record<string, string>;
	totalAssets: number;
}

async function postRag(
	url: string,
	body: unknown,
): Promise<Record<string, unknown>> {
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({}));
		throw new Error(
			(err as { error?: string }).error ?? 'Anfrage fehlgeschlagen',
		);
	}
	return res.json();
}

function extractRun(result: Record<string, unknown>): RagRunItem | null {
	const run = (result.run ?? result.runReport ?? null) as RagRunItem | null;
	if (run && typeof run === 'object' && 'status' in run) {
		return run;
	}
	return null;
}

type PipelineStage =
	| 'idle'
	| 'ingesting'
	| 'planning'
	| 'generating'
	| 'downloading'
	| 'done'
	| 'error';

function stageLabel(stage: PipelineStage): string {
	switch (stage) {
		case 'idle':
			return 'Bereit';
		case 'ingesting':
			return 'Indizierung…';
		case 'planning':
			return 'Planung…';
		case 'generating':
			return 'Generierung…';
		case 'downloading':
			return 'Download wird vorbereitet…';
		case 'done':
			return 'Abgeschlossen';
		case 'error':
			return 'Fehler';
		default:
			return stage;
	}
}

function stageProgress(stage: PipelineStage): number {
	switch (stage) {
		case 'idle':
			return 0;
		case 'ingesting':
			return 20;
		case 'planning':
			return 45;
		case 'generating':
			return 75;
		case 'downloading':
			return 90;
		case 'done':
			return 100;
		case 'error':
			return 0;
		default:
			return 0;
	}
}

export function GenerationPanel({
	manualId,
	selectedAssetIds,
	customerProfile,
	totalAssets,
}: GenerationPanelProps) {
	const [stage, setStage] = useState<PipelineStage>('idle');
	const [runs, setRuns] = useState<RagRunItem[]>([]);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	async function handleFullPipeline() {
		setErrorMessage(null);

		try {
			// Step 1: Ingest
			setStage('ingesting');
			const ingestResult = await postRag(`/api/rag-training/ingest`, {
				manualId,
				sync: true,
				force: false,
			});
			const ingestRun = extractRun(ingestResult);
			if (ingestRun) setRuns(prev => [ingestRun, ...prev]);

			// Step 2: Plan
			setStage('planning');
			const planResult = await postRag(
				`/api/manual-generation/${manualId}/plan`,
				{
					sync: true,
					selected_asset_ids:
						selectedAssetIds.length > 0 ? selectedAssetIds : undefined,
				},
			);
			const planRun = extractRun(planResult);
			if (planRun) setRuns(prev => [planRun, ...prev]);

			// Step 3: Generate
			setStage('generating');
			const genResult = await postRag(
				`/api/manual-generation/${manualId}/execute`,
				{
					sync: true,
					customer_profile: customerProfile,
					selected_asset_ids:
						selectedAssetIds.length > 0 ? selectedAssetIds : undefined,
				},
			);
			const genRun = extractRun(genResult);
			if (genRun) setRuns(prev => [genRun, ...prev]);

			setStage('done');
			toast.success('Handbuch erfolgreich generiert!');
		} catch (err) {
			setStage('error');
			const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
			setErrorMessage(msg);
			toast.error(msg);
		}
	}

	async function handleDownload() {
		setStage('downloading');
		try {
			const res = await fetch(`/api/manual-generation/${manualId}/download`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					file_ids: selectedAssetIds.length > 0 ? selectedAssetIds : undefined,
					generated_only: false,
				}),
			});

			if (!res.ok) {
				throw new Error('Download fehlgeschlagen');
			}

			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `handbuch-${manualId}.zip`;
			a.click();
			URL.revokeObjectURL(url);
			setStage('done');
			toast.success('Download gestartet');
		} catch (err) {
			setStage('error');
			const msg =
				err instanceof Error ? err.message : 'Download fehlgeschlagen';
			setErrorMessage(msg);
			toast.error(msg);
		}
	}

	const isProcessing =
		stage === 'ingesting' ||
		stage === 'planning' ||
		stage === 'generating' ||
		stage === 'downloading';

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<h3 className="font-semibold text-gray-900">Generierung</h3>
					<Badge
						variant={
							stage === 'done'
								? 'green'
								: stage === 'error'
									? 'red'
									: isProcessing
										? 'blue'
										: 'gray'
						}
					>
						{stageLabel(stage)}
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Info */}
				<div className="text-sm text-gray-600 space-y-1">
					<p>
						<span className="text-gray-500">Dateien:</span>{' '}
						<span className="font-medium">
							{selectedAssetIds.length > 0
								? `${selectedAssetIds.length} ausgewählt`
								: `${totalAssets} gesamt`}
						</span>
					</p>
					<p>
						<span className="text-gray-500">Pipeline:</span> Indizieren → Planen
						→ Generieren → Herunterladen
					</p>
				</div>

				{/* Progress */}
				{isProcessing && (
					<div className="space-y-2">
						<Progress value={stageProgress(stage)} />
						<p className="text-xs text-gray-500 text-center">
							{stageLabel(stage)}
						</p>
					</div>
				)}

				{/* Error */}
				{stage === 'error' && errorMessage && (
					<div className="bg-red-50 border border-red-100 rounded-lg p-3">
						<p className="text-sm text-red-700">{errorMessage}</p>
					</div>
				)}

				{/* Run history */}
				{runs.length > 0 && (
					<div className="space-y-1">
						<p className="text-xs font-medium text-gray-500">
							Letzte Ausführungen
						</p>
						{runs.filter(Boolean).slice(0, 5).map(run => (
							<div
								key={run.id}
								className="flex items-center justify-between text-xs py-1"
							>
								<div className="flex items-center gap-2">
									<Badge
										variant={
											run.status === 'SUCCEEDED'
												? 'green'
												: run.status === 'FAILED'
													? 'red'
													: 'blue'
										}
									>
										{run.status}
									</Badge>
									<span className="text-gray-600">{run.kind}</span>
								</div>
								{run.finished_at && (
									<span className="text-gray-400">
										{new Date(run.finished_at).toLocaleTimeString('de-DE')}
									</span>
								)}
							</div>
						))}
					</div>
				)}

				{/* Actions */}
				<div className="flex items-center gap-2 pt-2">
					<Button
						onClick={handleFullPipeline}
						loading={isProcessing}
						disabled={isProcessing}
					>
						{stage === 'done' ? 'Erneut generieren' : 'Generierung starten'}
					</Button>
					{stage === 'done' && (
						<Button
							variant="outline"
							onClick={handleDownload}
						>
							ZIP herunterladen
						</Button>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
