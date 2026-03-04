'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { FileTree } from '@/components/handbook-wizard/FileTree';
import { AssetSlotCard } from '@/components/handbook-wizard/AssetSlotCard';
import { SignatureCanvasCard } from '@/components/handbook-wizard/SignatureCanvasCard';
import { ZipDropzone } from '@/components/handbook-wizard/ZipDropzone';
import { useClient } from '@/hooks/useClients';
import { useCompletionTransitionModal } from '@/hooks/useCompletionTransitionModal';
import {
	useAiFillHandbookPlaceholder,
	useCreateHandbookVersion,
	useDeleteHandbookVersion,
	useDownloadHandbookVersion,
	useDeleteWorkspaceAsset,
	useExportHandbook,
	useFilePlaceholders,
	useHandbookCompletion,
	useHandbook,
	useHandbookTree,
	useHandbookVersions,
	useSaveFilePlaceholders,
	useSaveSignatureCanvas,
	useUploadHandbookZip,
	useUploadWorkspaceAsset,
	useWorkspaceAssets,
} from '@/hooks';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface FlatFileNode {
  id: string;
  path: string;
  name: string;
  placeholder_total: number;
  placeholder_resolved: number;
}

function flattenFileNodes(tree: Array<Record<string, unknown>> | Array<any>): FlatFileNode[] {
  const out: FlatFileNode[] = [];
  const walk = (nodes: Array<Record<string, unknown>>) => {
    for (const node of nodes) {
      const kind = String(node.kind ?? '');
      if (kind === 'file' && typeof node.id === 'string' && typeof node.path === 'string') {
        out.push({
          id: node.id,
          path: node.path,
          name: String(node.name ?? node.path),
          placeholder_total: Number(node.placeholder_total ?? 0),
          placeholder_resolved: Number(node.placeholder_resolved ?? 0),
        });
      }
      if (kind === 'folder' && Array.isArray(node.children)) {
        walk(node.children as Array<Record<string, unknown>>);
      }
    }
  };
  walk(tree);
  return out;
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function HandbookPage({ params }: PageProps) {
  const { id } = use(params);

  const { data: handbook, isLoading: handbookLoading } = useHandbook(id);
  const { data: client, isLoading: clientLoading } = useClient(handbook?.customer_id ?? '');
  const { data: treeResponse = [], isLoading: treeLoading } = useHandbookTree(id);
  const { data: completion } = useHandbookCompletion(id);
  const { data: assets = [] } = useWorkspaceAssets(id);
  const { data: versions = [] } = useHandbookVersions(id);

  const uploadZip = useUploadHandbookZip(id);
  const uploadAsset = useUploadWorkspaceAsset(id);
  const saveSignature = useSaveSignatureCanvas(id);
  const deleteAsset = useDeleteWorkspaceAsset(id);
  const savePlaceholders = useSaveFilePlaceholders(id);
  const aiFill = useAiFillHandbookPlaceholder(id);
  const deleteVersion = useDeleteHandbookVersion(id);
  const downloadVersion = useDownloadHandbookVersion(id);
  const createVersion = useCreateHandbookVersion(id);
  const exportHandbook = useExportHandbook(id);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedVersionNumber, setSelectedVersionNumber] = useState<number | null>(null);
  const [selectedZipFile, setSelectedZipFile] = useState<File | null>(null);
	const [zipUploadError, setZipUploadError] = useState<string | null>(null);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiLanguage, setAiLanguage] = useState<'de-DE' | 'en-US'>('de-DE');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  const flatFiles = useMemo(() => flattenFileNodes(treeResponse), [treeResponse]);
  const totalPlaceholders =
		completion?.required_total ??
		flatFiles.reduce((sum, item) => sum + item.placeholder_total, 0);
	const resolvedPlaceholders =
		completion?.required_resolved ??
		flatFiles.reduce((sum, item) => sum + item.placeholder_resolved, 0);
	const allComplete =
		completion?.is_complete_required ??
		(totalPlaceholders === 0 || resolvedPlaceholders === totalPlaceholders);
	const { open: completionDialogOpen, setOpen: setCompletionDialogOpen } =
		useCompletionTransitionModal(completion?.is_complete_required);

  const selectedFile = useMemo(
    () => flatFiles.find(file => file.id === selectedFileId) ?? null,
    [flatFiles, selectedFileId],
  );
  const selectedVersion = useMemo(
    () => versions.find(version => version.version_number === selectedVersionNumber) ?? null,
    [versions, selectedVersionNumber],
  );

  const { data: fileData, isLoading: placeholdersLoading } = useFilePlaceholders(id, selectedFileId);

  const textPlaceholders = useMemo(
    () => (fileData?.placeholders ?? []).filter(item => item.kind === 'TEXT'),
    [fileData],
  );
  const assetPlaceholders = useMemo(
    () => (fileData?.placeholders ?? []).filter(item => item.kind === 'ASSET'),
    [fileData],
  );

  useEffect(() => {
    if (!fileData) return;
    const next: Record<string, string> = {};
    for (const placeholder of fileData.placeholders) {
      if (placeholder.kind !== 'TEXT') continue;
      next[placeholder.key] = placeholder.value_text ?? '';
    }
    setVariableValues(next);
  }, [fileData]);

  useEffect(() => {
    if (selectedVersionNumber === null) return;
    const stillPresent = versions.some(version => version.version_number === selectedVersionNumber);
    if (!stillPresent) {
      setSelectedVersionNumber(null);
    }
  }, [selectedVersionNumber, versions]);

  if (handbookLoading || clientLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    );
  }

  if (!handbook || !client) {
    return <div className="p-8 text-gray-500">Handbuch nicht gefunden.</div>;
  }

  async function handleUploadZip(file: File) {
		setZipUploadError(null);
		setSelectedZipFile(file);
		try {
			const result = await uploadZip.mutateAsync(file);
			toast.success(`ZIP verarbeitet: ${result.summary.files_total} Dateien`);
			if (result.warnings.length > 0) {
				toast.warning(
					`${result.warnings.length} ZIP-Eintraege wurden uebersprungen.`,
				);
			}

			const parsedFile = result.files.find(
				item => item.parse_status !== 'FAILED',
			);
			if (parsedFile) {
				setSelectedFileId(parsedFile.id);
				setSelectedPath(parsedFile.path_in_handbook);
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'ZIP Upload fehlgeschlagen';
			setZipUploadError(message);
			toast.error(message);
		}
	}

  async function handleUploadAsset(file: File, assetType: 'logo' | 'signature') {
    try {
      await uploadAsset.mutateAsync({ file, assetType });
      toast.success(`${assetType === 'logo' ? 'Logo' : 'Signatur'} gespeichert`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Asset Upload fehlgeschlagen');
    }
  }

  async function handleRemoveAsset(assetType: 'logo' | 'signature') {
    try {
      await deleteAsset.mutateAsync({ assetType });
      toast.success(`${assetType === 'logo' ? 'Logo' : 'Signatur'} entfernt`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Asset loeschen fehlgeschlagen');
    }
  }

  function selectFileByPath(path: string) {
    setSelectedPath(path);
    const selected = flatFiles.find(item => item.path === path);
    setSelectedFileId(selected?.id ?? null);
  }

  async function handleAiFill(key: string, required: boolean) {
    if (!client || !handbook) {
      toast.error('Handbuch- oder Kundendaten nicht geladen');
      return;
    }
    if (!selectedFileId || !selectedFile) {
      toast.error('Bitte zuerst eine Datei auswaehlen');
      return;
    }
    if (!aiInstruction.trim()) {
      toast.error('Bitte globale AI-Anweisung ausfuellen');
      return;
    }

    try {
      const result = await aiFill.mutateAsync({
        fileId: selectedFileId,
        placeholderKey: key,
        currentValue: variableValues[key] ?? '',
        instruction: aiInstruction,
        language: aiLanguage,
        context: {
          customer: {
            name: client.name,
            address: client.address,
            zip_city: client.zipCity,
            ceo: client.ceo,
            qm_manager: client.qmManager,
            industry: client.industry,
            products: client.products,
            services: client.services,
          },
          handbook_type: handbook.type,
          file_path: selectedFile.path,
        },
        constraints: {
          max_length: 800,
          required,
        },
      });

      setVariableValues(prev => ({ ...prev, [key]: result.value }));
      toast.success(`AI-Wert fuer ${key} aktualisiert`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'AI Fill fehlgeschlagen');
    }
  }

  async function handleSavePlaceholders() {
    if (!selectedFileId) {
      toast.error('Bitte zuerst eine Datei auswaehlen');
      return;
    }

    try {
      const values = textPlaceholders.map(item => ({
        key: item.key,
        value_text: variableValues[item.key] ?? '',
      }));
      await savePlaceholders.mutateAsync({ fileId: selectedFileId, values, source: 'MANUAL' });
      toast.success('Platzhalter gespeichert');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Speichern fehlgeschlagen');
    }
  }

  async function handleSaveSignature(file: File) {
		try {
			await saveSignature.mutateAsync({
				file,
				filename: 'signature-canvas.png',
			});
			toast.success('Signatur gespeichert');
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Signatur speichern fehlgeschlagen',
			);
		}
	}

	async function handleCreateVersion(reason = 'manual_completion') {
		try {
			const result = await createVersion.mutateAsync({
				createdBy: 'user',
				reason,
			});
			setSelectedVersionNumber(result.snapshot.version_number);
			setCompletionDialogOpen(false);
			if (result.created) {
				toast.success(`Version v${result.snapshot.version_number} erstellt`);
			} else {
				toast.info(`Keine Aenderung seit v${result.snapshot.version_number}`);
			}
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Version erstellen fehlgeschlagen',
			);
		}
	}

  async function handleExport() {
    try {
      const result = await exportHandbook.mutateAsync();
      triggerBrowserDownload(result.blob, result.filename);
      toast.success('Export erfolgreich erstellt');
    } catch (error) {
      const details = (error as Error & { details?: { errors?: Array<{ message?: string }> } }).details;
      if (details && Array.isArray(details.errors) && details.errors.length > 0) {
        toast.error(details.errors[0].message ?? 'Export blockiert: Pflichtwerte fehlen');
      } else {
        toast.error(error instanceof Error ? error.message : 'Export fehlgeschlagen');
      }
    }
  }

  async function handleDeleteVersion(versionNumber: number) {
    if (!confirm(`Version ${versionNumber} loeschen?`)) return;
    try {
      await deleteVersion.mutateAsync(versionNumber);
      if (selectedVersionNumber === versionNumber) {
        setSelectedVersionNumber(null);
      }
      toast.success(`Version ${versionNumber} geloescht`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Version loeschen fehlgeschlagen');
    }
  }

  async function handleDownloadSelectedVersion() {
    if (!selectedVersionNumber) {
      toast.error('Bitte zuerst eine Version auswaehlen');
      return;
    }
    if (!selectedVersion?.downloadable) {
      toast.error('Die ausgewaehlte Version ist nicht downloadbar');
      return;
    }

    try {
      const result = await downloadVersion.mutateAsync(selectedVersionNumber);
      triggerBrowserDownload(result.blob, result.filename);
      toast.success(`Version v${selectedVersionNumber} heruntergeladen`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Version Download fehlgeschlagen');
    }
  }

  const logoAsset = assets.find(item => item.asset_type === 'logo');
  const signatureAsset = assets.find(item => item.asset_type === 'signature');

  return (
		<div className="flex flex-col h-screen overflow-hidden">
			<Header
				title={`${handbook.type} Handbuch`}
				subtitle={`${client.name} · ${resolvedPlaceholders}/${totalPlaceholders} Pflicht-Platzhalter geloest`}
				actions={<Badge variant="blue">{handbook.status}</Badge>}
			/>

			<div className="flex-1 overflow-y-auto px-8 py-6">
				<div className="grid grid-cols-3 gap-6">
					<div className="col-span-2 space-y-4">
						<Card>
							<CardHeader>
								<h3 className="text-sm font-semibold text-gray-900">
									ZIP Upload
								</h3>
							</CardHeader>
							<CardContent>
								<ZipDropzone
									loading={uploadZip.isPending}
									selectedFile={selectedZipFile}
									error={zipUploadError}
									onFileSelected={file => {
										void handleUploadZip(file);
									}}
								/>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<h3 className="text-sm font-semibold text-gray-900">
									Dateibaum
								</h3>
							</CardHeader>
							<CardContent>
								{treeLoading ? (
									<div className="flex justify-center py-8">
										<Spinner />
									</div>
								) : (
									<FileTree
										nodes={treeResponse as any}
										selectedPath={selectedPath}
										onSelectFile={selectFileByPath}
									/>
								)}
							</CardContent>
						</Card>

						{selectedFile && (
							<Card>
								<CardHeader>
									<h3 className="text-sm font-semibold text-gray-900">
										{selectedFile.name}
									</h3>
									<p className="text-xs text-gray-500">{selectedFile.path}</p>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="space-y-2 rounded border border-gray-200 bg-gray-50 p-3">
										<Label className="text-xs">Globale AI-Anweisung</Label>
										<Textarea
											rows={3}
											value={aiInstruction}
											onChange={event => setAiInstruction(event.target.value)}
											placeholder="Beispiel: Formuliere ISO/SCC-konform, praezise und sachlich."
										/>
										<div className="flex items-center gap-2">
											<Label className="text-xs">Sprache</Label>
											<select
												value={aiLanguage}
												onChange={event =>
													setAiLanguage(event.target.value as 'de-DE' | 'en-US')
												}
												className="h-8 rounded border border-gray-200 bg-white px-2 text-xs"
											>
												<option value="de-DE">Deutsch (de-DE)</option>
												<option value="en-US">English (en-US)</option>
											</select>
										</div>
									</div>

									{placeholdersLoading ? (
										<div className="flex justify-center py-8">
											<Spinner />
										</div>
									) : (
										<>
											<div className="space-y-2">
												<h4 className="text-xs font-semibold text-gray-700">
													Text-Platzhalter
												</h4>
												{textPlaceholders.length === 0 ? (
													<p className="text-xs text-gray-500">
														Keine Text-Platzhalter in dieser Datei.
													</p>
												) : (
													textPlaceholders.map(item => {
														const currentValue = variableValues[item.key] ?? '';
														const isUnresolved =
															Boolean(item.required) &&
															currentValue.trim() === '';
														return (
															<div
																key={item.id}
																className="space-y-1"
															>
																<Label
																	className={
																		isUnresolved
																			? 'text-xs text-orange-800'
																			: 'text-xs'
																	}
																>
																	{item.key}
																	{item.required ? ' *' : ' (optional)'}
																</Label>
																<div className="flex w-full items-center gap-2">
																	<div className="flex-1 min-w-0">
																		<Input
																			value={currentValue}
																			className={
																				isUnresolved
																					? 'border-orange-300 focus-visible:ring-orange-500'
																					: undefined
																			}
																			onChange={event =>
																				setVariableValues(prev => ({
																					...prev,
																					[item.key]: event.target.value,
																				}))
																			}
																		/>
																	</div>
																	<Button
																		size="sm"
																		variant="outline"
																		loading={aiFill.isPending}
																		onClick={() =>
																			void handleAiFill(
																				item.key,
																				Boolean(item.required),
																			)
																		}
																	>
																		AI
																	</Button>
																</div>
															</div>
														);
													})
												)}
											</div>

											<div className="space-y-2">
												<h4 className="text-xs font-semibold text-gray-700">
													Asset-Platzhalter
												</h4>
												{assetPlaceholders.length === 0 ? (
													<p className="text-xs text-gray-500">
														Keine Asset-Platzhalter in dieser Datei.
													</p>
												) : (
													<div className="rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700 space-y-1">
														{assetPlaceholders.map(item => (
															<p key={item.id}>
																{item.key}
																{item.required ? ' *' : ''} ·{' '}
																{item.resolved ? 'gelöst' : 'offen'}
															</p>
														))}
													</div>
												)}
											</div>

											<div className="flex items-center gap-2">
												<Button
													onClick={handleSavePlaceholders}
													loading={savePlaceholders.isPending}
												>
													Platzhalter speichern
												</Button>
												{fileData?.completion && (
													<Badge
														variant={
															fileData.completion.is_complete
																? 'green'
																: 'orange'
														}
													>
														Datei: {fileData.completion.resolved}/
														{fileData.completion.total}
													</Badge>
												)}
											</div>
										</>
									)}
								</CardContent>
							</Card>
						)}
					</div>

					<div className="space-y-4">
						<Card>
							<CardHeader>
								<h3 className="text-sm font-semibold text-gray-900">Assets</h3>
							</CardHeader>
							<CardContent className="space-y-3">
								<AssetSlotCard
									title="Logo"
									assetType="logo"
									canonicalKey="assets.logo"
									aliases={['{{assets.logo}}', '__ASSET_LOGO__', '[LOGO]']}
									asset={logoAsset}
									busy={uploadAsset.isPending || deleteAsset.isPending}
									onUpload={handleUploadAsset}
									onRemove={handleRemoveAsset}
								/>
								<SignatureCanvasCard
									asset={signatureAsset}
									busy={saveSignature.isPending || deleteAsset.isPending}
									onSave={handleSaveSignature}
									onRemove={() => handleRemoveAsset('signature')}
								/>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<h3 className="text-sm font-semibold text-gray-900">
									Fortschritt
								</h3>
							</CardHeader>
							<CardContent className="space-y-3 text-xs">
								<p>
									Gesamt: <strong>{resolvedPlaceholders}</strong> /{' '}
									<strong>{totalPlaceholders}</strong>
								</p>
								<Button
									onClick={handleExport}
									loading={exportHandbook.isPending}
									disabled={!allComplete}
								>
									Export ZIP
								</Button>
								{!allComplete && (
									<p className="text-amber-700">
										Export ist erst möglich, wenn alle Pflicht-Platzhalter
										gelöst sind.
									</p>
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<h3 className="text-sm font-semibold text-gray-900">
									Versionen
								</h3>
							</CardHeader>
							<CardContent className="space-y-2">
								<Button
									size="sm"
									onClick={() => void handleCreateVersion('manual_click')}
									loading={createVersion.isPending}
									disabled={!allComplete}
								>
									Neue Version erstellen
								</Button>
								<Button
									size="sm"
									variant="outline"
									disabled={!selectedVersion?.downloadable}
									loading={downloadVersion.isPending}
									onClick={handleDownloadSelectedVersion}
								>
									Ausgewaehlte Version herunterladen
								</Button>
								{versions.length === 0 ? (
									<p className="text-xs text-gray-500">
										Keine Snapshots vorhanden.
									</p>
								) : (
									versions.map(version => (
										<div
											key={version.id}
											className="flex items-center justify-between rounded border border-gray-100 px-2 py-1.5 text-xs"
										>
											<label className="flex min-w-0 items-center gap-2">
												<input
													type="checkbox"
													checked={
														selectedVersionNumber === version.version_number
													}
													onChange={event =>
														setSelectedVersionNumber(
															event.target.checked
																? version.version_number
																: null,
														)
													}
													className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
												/>
												<span>v{version.version_number}</span>
												<Badge
													variant={version.downloadable ? 'green' : 'gray'}
												>
													{version.downloadable
														? 'downloadbar'
														: 'nicht downloadbar'}
												</Badge>
											</label>
											<div className="flex items-center gap-1">
												<Button
													size="sm"
													variant="ghost"
													className="h-7 px-2 text-red-600"
													onClick={() =>
														void handleDeleteVersion(version.version_number)
													}
												>
													Löschen
												</Button>
											</div>
										</div>
									))
								)}
							</CardContent>
						</Card>
					</div>
				</div>
			</div>

			<Dialog
				open={completionDialogOpen}
				onOpenChange={setCompletionDialogOpen}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Alle Pflicht-Platzhalter sind geloest</DialogTitle>
						<DialogDescription>
							Moechtest du jetzt eine neue Version als Snapshot anlegen?
						</DialogDescription>
					</DialogHeader>

					<div className="space-y-2 rounded border border-gray-100 bg-gray-50 p-3 text-xs text-gray-700">
						<p>
							<strong>Handbuch:</strong> {handbook.type}
						</p>
						<p>
							<strong>Kunde:</strong> {client.name}
						</p>
						<p>
							<strong>Pflicht-Platzhalter:</strong> {resolvedPlaceholders}/
							{totalPlaceholders}
						</p>
						<p>
							<strong>Zeitpunkt:</strong> {new Date().toLocaleString('de-DE')}
						</p>
					</div>

					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setCompletionDialogOpen(false)}
						>
							Not now
						</Button>
						<Button
							loading={createVersion.isPending}
							onClick={() => void handleCreateVersion('completion_transition')}
						>
							Create version
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
