'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Header } from '@/components/layout/Header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { FileTree } from '@/components/handbook-wizard/FileTree';
import { AssetSlotCard } from '@/components/handbook-wizard/AssetSlotCard';
import { useClient } from '@/hooks/useClients';
import {
  useAiRewriteDocument,
  useDeleteWorkspaceAsset,
  useDeleteFilePath,
  useDocuments,
  useFileTree,
  useHandbook,
  useRenderDocument,
  useUploadDocument,
  useUploadWorkspaceAsset,
  useWorkspaceAssets,
} from '@/hooks';
import { ApiRequestError } from '@/lib/documents';
import type { Document, DocumentVariable } from '@/lib/schemas';

interface PageProps {
  params: Promise<{ id: string }>;
}

function fallbackValueByVariable(variable: string, client: {
  name: string;
  address: string;
  zipCity: string;
  ceo: string;
  qmManager: string;
  industry: string;
  products: string;
  services: string;
}) {
  const map: Record<string, string> = {
    'company.name': client.name,
    'company.address': client.address,
    'company.zip_city': client.zipCity,
    'user.name': client.qmManager,
    'user.ceo': client.ceo,
    'company.industry': client.industry,
    'company.products': client.products,
    'company.services': client.services,
  };
  return map[variable] ?? '';
}

export default function HandbookPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: handbook, isLoading: handbookLoading } = useHandbook(id);
  const { data: client, isLoading: clientLoading } = useClient(handbook?.clientId ?? '');

  const { data: documents = [], isLoading: docsLoading } = useDocuments(id);
  const {
    data: tree = [],
    isLoading: treeLoading,
    isError: treeIsError,
    error: treeError,
  } = useFileTree(id);
  const { data: assets = [] } = useWorkspaceAssets(id);

  const uploadDocument = useUploadDocument(id);
  const deletePath = useDeleteFilePath(id);
  const renderDocument = useRenderDocument(id);
  const rewriteDocument = useAiRewriteDocument(id);
  const uploadAsset = useUploadWorkspaceAsset(id);
  const deleteAsset = useDeleteWorkspaceAsset(id);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [renderErrors, setRenderErrors] = useState<
    Array<{ message: string; variable?: string | null }>
  >([]);
  const [rewriteInstruction, setRewriteInstruction] = useState('');

  const selectedDocument = useMemo<Document | null>(() => {
    if (!selectedPath) return null;
    return documents.find(item => item.relative_path === selectedPath) ?? null;
  }, [documents, selectedPath]);

  const editableVariables = useMemo<DocumentVariable[]>(() => {
    if (!selectedDocument) return [];
    return selectedDocument.variables.filter(variable => variable.source === 'user_input');
  }, [selectedDocument]);

  const systemVariables = useMemo<DocumentVariable[]>(() => {
    if (!selectedDocument) return [];
    return selectedDocument.variables.filter(variable => variable.source === 'system');
  }, [selectedDocument]);

  useEffect(() => {
    if (!selectedDocument || !client) {
      setVariableValues({});
      return;
    }

    const next: Record<string, string> = {};
    for (const item of editableVariables) {
      next[item.variable_name] = fallbackValueByVariable(item.variable_name, client);
    }
    setVariableValues(next);
    setRenderErrors([]);
  }, [selectedDocument, client, editableVariables]);

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

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const list = event.target.files;
    if (!list || list.length === 0) return;

    let success = 0;
    let failed = 0;

    for (const file of Array.from(list)) {
      const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      const path = typeof relPath === 'string' && relPath.trim() ? relPath : file.name;
      try {
        const response = await uploadDocument.mutateAsync({ file, path });
        success += 1;
        if (response.kind === 'zip') {
          const { documents_created, assets_bound, warnings } = response.summary;
          toast.success(
            `ZIP verarbeitet: ${documents_created} Dokument(e), ${assets_bound} Asset(s)`,
          );
          if (warnings > 0) {
            toast.warning(`${warnings} Eintrag/Einträge im ZIP wurden übersprungen.`);
          }
        }
      } catch (err) {
        failed += 1;
        toast.error(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
      }
    }

    if (success > 0) toast.success(`${success} Datei(en) hochgeladen`);
    if (failed > 0) toast.error(`${failed} Datei(en) fehlgeschlagen`);
    event.target.value = '';
  }

  async function handleUploadAsset(file: File, assetType: 'logo' | 'signature') {
    try {
      await uploadAsset.mutateAsync({ file, assetType });
      toast.success(`${assetType === 'logo' ? 'Logo' : 'Signatur'} gespeichert`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Asset Upload fehlgeschlagen');
    }
  }

  async function handleRemoveAsset(assetType: 'logo' | 'signature') {
    try {
      await deleteAsset.mutateAsync({ assetType });
      toast.success(`${assetType === 'logo' ? 'Logo' : 'Signatur'} entfernt`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Asset konnte nicht entfernt werden');
    }
  }

  async function handleRender() {
    if (!selectedDocument) {
      toast.error('Bitte zuerst ein Dokument auswählen');
      return;
    }

    try {
      const result = await renderDocument.mutateAsync({
        documentId: selectedDocument.id,
        variables: variableValues,
      });
      setRenderErrors([]);
      toast.success(`Version v${result.version.version_number} erstellt`);
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const details = err.details as { errors?: Array<{ message?: string; variable?: string | null }> };
        if (Array.isArray(details.errors) && details.errors.length > 0) {
          setRenderErrors(
            details.errors.map(item => ({
              message: item.message ?? err.message,
              variable: item.variable ?? null,
            })),
          );
        } else {
          setRenderErrors([{ message: err.message }]);
        }
      } else {
        const message = err instanceof Error ? err.message : 'Render fehlgeschlagen';
        setRenderErrors([{ message }]);
      }

      const message = err instanceof Error ? err.message : 'Render fehlgeschlagen';
      toast.error(message);
    }
  }

  async function handleRewrite() {
    if (!selectedDocument) {
      toast.error('Bitte zuerst ein Dokument auswählen');
      return;
    }
    if (!rewriteInstruction.trim()) {
      toast.error('Bitte Anweisung eingeben');
      return;
    }

    try {
      const result = await rewriteDocument.mutateAsync({
        documentId: selectedDocument.id,
        instruction: rewriteInstruction.trim(),
      });
      toast.success(`AI-Version v${result.version.version_number} erstellt`);
      setRewriteInstruction('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI-Rewrite fehlgeschlagen');
    }
  }

  async function handleDeleteFile(path: string) {
    if (!confirm(`Datei löschen: ${path}?`)) return;
    try {
      await deletePath.mutateAsync({ path, recursive: false });
      if (selectedPath === path) setSelectedPath(null);
      toast.success('Datei entfernt');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Löschen fehlgeschlagen');
    }
  }

  async function handleDeleteFolder(path: string) {
    if (!confirm(`Ordner inkl. Unterdateien löschen: ${path}?`)) return;
    try {
      await deletePath.mutateAsync({ path, recursive: true });
      if (selectedPath?.startsWith(`${path}/`)) setSelectedPath(null);
      toast.success('Ordner entfernt');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ordner löschen fehlgeschlagen');
    }
  }

  const logoAsset = assets.find(item => item.asset_type === 'logo');
  const signatureAsset = assets.find(item => item.asset_type === 'signature');

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header
        title={handbook.title}
        subtitle={`v${handbook.version} · ${client.name}`}
        actions={<Badge variant="blue">{documents.length} Dokumente</Badge>}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-gray-900">Dokument Upload</h3>
              </CardHeader>
              <CardContent>
                <input
                  type="file"
                  multiple
                  className="block w-full text-sm"
                  accept=".docx,.pptx,.xlsx,.md,.txt,.html,.htm,.zip"
                  onChange={handleUpload}
                />
                <p className="mt-2 text-xs text-gray-500">
                  Unterstützt: DOCX, PPTX, XLSX, MD, TXT, HTML, ZIP. Legacy DOC wird in v1 abgelehnt.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-gray-900">Dateibaum</h3>
              </CardHeader>
              <CardContent>
                {treeLoading || docsLoading ? (
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : treeIsError ? (
                  <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <p className="font-medium">Dateibaum konnte nicht geladen werden.</p>
                    <p className="mt-1 text-xs">
                      {treeError instanceof Error ? treeError.message : 'Unbekannter Fehler'}
                    </p>
                  </div>
                ) : (
                  <FileTree
                    nodes={tree}
                    selectedPath={selectedPath}
                    onSelectFile={setSelectedPath}
                    onDeleteFile={handleDeleteFile}
                    onDeleteFolder={handleDeleteFolder}
                  />
                )}
              </CardContent>
            </Card>

            {selectedDocument && (
              <Card>
                <CardHeader>
                  <h3 className="text-sm font-semibold text-gray-900">
                    {selectedDocument.name}
                  </h3>
                  <p className="text-xs text-gray-500">{selectedDocument.relative_path}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-gray-700">Variablen</h4>
                    {editableVariables.length === 0 ? (
                      <p className="text-xs text-gray-500">Keine editierbaren Variablen gefunden.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {editableVariables.map(item => (
                          <div key={item.id} className="space-y-1">
                            <Label className="text-xs">
                              {item.variable_name}
                              {item.required ? ' *' : ' (optional)'}
                            </Label>
                            <Input
                              value={variableValues[item.variable_name] ?? ''}
                              onChange={event =>
                                setVariableValues(prev => ({
                                  ...prev,
                                  [item.variable_name]: event.target.value,
                                }))
                              }
                              placeholder={item.variable_name}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {systemVariables.length > 0 && (
                      <div className="rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
                        <p className="font-semibold text-gray-800">Systemvariablen</p>
                      <div className="mt-1 space-y-1">
                        {systemVariables.map(item => (
                          <div key={item.id} className="flex items-center justify-between gap-2">
                            <p>
                              {item.variable_name}
                              {item.required ? ' *' : ''}
                            </p>
                            {item.variable_name === 'assets.logo' && (
                              <Badge variant="gray">Alias: [LOGO]</Badge>
                            )}
                            {item.variable_name === 'assets.signature' && (
                              <Badge variant="gray">Alias: [SIGNATURE]</Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                    {renderErrors.length > 0 && (
                      <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                        {renderErrors.map((item, idx) => (
                          <p key={idx}>
                            {item.variable ? `${item.variable}: ` : ''}
                            {item.message}
                          </p>
                        ))}
                      </div>
                    )}
                    <Button
                      size="sm"
                      onClick={handleRender}
                      loading={renderDocument.isPending}
                    >
                      Rendern
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-gray-700">AI: Modify Content</h4>
                    <Textarea
                      rows={4}
                      value={rewriteInstruction}
                      onChange={event => setRewriteInstruction(event.target.value)}
                      placeholder="Beispiel: Kürze den Text, formeller Ton, Deutsch beibehalten."
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRewrite}
                      loading={rewriteDocument.isPending}
                    >
                      AI Rewrite
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-gray-700">Versionen</h4>
                    <div className="space-y-1">
                      {[...selectedDocument.versions]
                        .sort((a, b) => b.version_number - a.version_number)
                        .map(version => (
                          <div
                            key={version.id}
                            className="flex items-center justify-between rounded border border-gray-100 px-2 py-1.5 text-xs"
                          >
                            <span>
                              v{version.version_number} · {version.created_by}
                            </span>
                            <a
                              href={`/api/documents/${selectedDocument.id}/download?version=${version.version_number}`}
                              className="text-blue-600 hover:underline"
                            >
                              Download
                            </a>
                          </div>
                        ))}
                    </div>
                  </div>
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
                  aliases={['__ASSET_LOGO__', '[LOGO]', '{{assets.logo}}']}
                  asset={logoAsset}
                  busy={uploadAsset.isPending || deleteAsset.isPending}
                  onUpload={handleUploadAsset}
                  onRemove={handleRemoveAsset}
                />
                <AssetSlotCard
                  title="Signatur"
                  assetType="signature"
                  canonicalKey="assets.signature"
                  aliases={['__ASSET_SIGNATURE__', '[SIGNATURE]', '{{assets.signature}}']}
                  asset={signatureAsset}
                  busy={uploadAsset.isPending || deleteAsset.isPending}
                  onUpload={handleUploadAsset}
                  onRemove={handleRemoveAsset}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-gray-900">Kundendaten</h3>
              </CardHeader>
              <CardContent className="space-y-1 text-xs text-gray-700">
                <p>Firma: {client.name}</p>
                <p>Branche: {client.industry}</p>
                <p>GF: {client.ceo}</p>
                <p>QM: {client.qmManager}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
