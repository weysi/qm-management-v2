'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';
import { useRagRunDetail, type RagRunItem } from '@/hooks/useRagTraining';

interface RagRunsPanelProps {
	manualId: string;
	runs: RagRunItem[];
	isLoading: boolean;
}

function statusBadgeVariant(status: string) {
	switch (status) {
		case 'SUCCEEDED':
			return 'green' as const;
		case 'FAILED':
			return 'red' as const;
		case 'RUNNING':
			return 'blue' as const;
		case 'PENDING':
			return 'orange' as const;
		default:
			return 'gray' as const;
	}
}

function statusLabel(status: string) {
	switch (status) {
		case 'SUCCEEDED':
			return 'Erfolgreich';
		case 'FAILED':
			return 'Fehlgeschlagen';
		case 'RUNNING':
			return 'Läuft';
		case 'PENDING':
			return 'Wartend';
		default:
			return status;
	}
}

function kindLabel(kind: string) {
	switch (kind) {
		case 'INGEST':
			return 'Indizierung';
		case 'PLAN':
			return 'Planung';
		case 'GENERATE':
			return 'Generierung';
		case 'CHAT':
			return 'Chat';
		default:
			return kind;
	}
}

function formatDate(iso: string | null): string {
	if (!iso) return '—';
	return new Date(iso).toLocaleString('de-DE', {
		day: '2-digit',
		month: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});
}

function RunDetail({ manualId, run }: { manualId: string; run: RagRunItem }) {
	const { data, isLoading } = useRagRunDetail(manualId, run.id);

	if (isLoading) {
		return (
			<div className="flex justify-center py-4">
				<Spinner />
			</div>
		);
	}

	if (!data) return null;

	return (
		<div className="mt-2 space-y-2">
			{/* Metrics */}
			{data.run.metrics && Object.keys(data.run.metrics).length > 0 && (
				<div className="bg-gray-50 rounded p-2">
					<p className="text-xs font-medium text-gray-600 mb-1">Metriken</p>
					<pre className="text-xs text-gray-700 whitespace-pre-wrap break-all">
						{JSON.stringify(data.run.metrics, null, 2)}
					</pre>
				</div>
			)}

			{/* Events */}
			{data.events.length > 0 && (
				<div>
					<p className="text-xs font-medium text-gray-600 mb-1">
						Ereignisse ({data.events.length})
					</p>
					<div className="space-y-1 max-h-48 overflow-y-auto">
						{data.events.map(event => (
							<div
								key={event.id}
								className={`text-xs px-2 py-1 rounded ${
									event.level === 'ERROR'
										? 'bg-red-50 text-red-700'
										: event.level === 'WARNING'
											? 'bg-orange-50 text-orange-700'
											: 'bg-gray-50 text-gray-600'
								}`}
							>
								<span className="font-mono text-[10px] text-gray-400 mr-2">
									{new Date(event.ts).toLocaleTimeString('de-DE')}
								</span>
								{event.message}
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}

export function RagRunsPanel({ manualId, runs, isLoading }: RagRunsPanelProps) {
	const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<h3 className="font-semibold text-gray-900">Ausführungen</h3>
					<Badge variant="gray">{runs.length}</Badge>
				</div>
			</CardHeader>
			<CardContent className="p-0">
				{isLoading ? (
					<div className="flex justify-center py-12">
						<Spinner />
					</div>
				) : runs.length === 0 ? (
					<div className="text-center py-12 text-gray-500">
						<p className="text-sm">Noch keine Ausführungen.</p>
					</div>
				) : (
					<ScrollArea className="h-[500px]">
						<div className="divide-y divide-gray-50">
							{runs.map(run => (
								<div
									key={run.id}
									className="px-4 py-3"
								>
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-2">
											<Badge variant={statusBadgeVariant(run.status)}>
												{statusLabel(run.status)}
											</Badge>
											<span className="text-sm font-medium text-gray-700">
												{kindLabel(run.kind)}
											</span>
										</div>
										<Button
											variant="ghost"
											size="sm"
											onClick={() =>
												setExpandedRunId(
													expandedRunId === run.id ? null : run.id,
												)
											}
										>
											{expandedRunId === run.id ? 'Schließen' : 'Details'}
										</Button>
									</div>
									<div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
										<span>Start: {formatDate(run.started_at)}</span>
										<span>Ende: {formatDate(run.finished_at)}</span>
										{run.model && <Badge variant="gray">{run.model}</Badge>}
									</div>
									{expandedRunId === run.id && (
										<RunDetail
											manualId={manualId}
											run={run}
										/>
									)}
								</div>
							))}
						</div>
					</ScrollArea>
				)}
			</CardContent>
		</Card>
	);
}
