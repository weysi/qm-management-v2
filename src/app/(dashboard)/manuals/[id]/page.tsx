"use client";

import { use, useEffect, useRef } from 'react';
import Link from "next/link";
import { toast } from 'sonner';
import { useManual } from "@/hooks/useManual";
import { useClient } from "@/hooks/useClients";
import {
	useTemplateFiles,
	useUploadTemplateFiles,
} from '@/hooks/useTemplateFiles';
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from '@/components/ui/card';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ManualPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: manual, isLoading: loadingManual } = useManual(id);
  const { data: client, isLoading: loadingClient } = useClient(
    manual?.clientId ?? ""
  );
  const { data: templateFiles = [], isLoading: loadingFiles } =
		useTemplateFiles(id);
	const { mutate: uploadTemplateFiles, isPending: isUploading } =
		useUploadTemplateFiles(id);
	const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
		if (!inputRef.current) return;
		inputRef.current.setAttribute('webkitdirectory', '');
		inputRef.current.setAttribute('directory', '');
	}, []);

	if (loadingManual || loadingClient || loadingFiles) {
		return (
			<div className="flex justify-center items-center h-64">
				<Spinner />
			</div>
		);
	}

  if (!manual || !client) {
    return <div className="p-8 text-gray-500">Handbuch nicht gefunden.</div>;
  }

  function handleFileInput(event: React.ChangeEvent<HTMLInputElement>) {
		const list = event.target.files;
		if (!list || list.length === 0) return;

		const files = Array.from(list);
		const paths = files.map(file => {
			const rel = (file as File & { webkitRelativePath?: string })
				.webkitRelativePath;
			return typeof rel === 'string' && rel.trim() !== '' ? rel : file.name;
		});

		uploadTemplateFiles(
			{ files, paths },
			{
				onSuccess: result => {
					toast.success(`${result.files.length} Datei(en) hochgeladen.`);
					if (result.rejected.length > 0) {
						toast.warning(
							`${result.rejected.length} Datei(en) wurden abgelehnt.`,
						);
					}
				},
				onError: error => {
					toast.error(error.message);
				},
			},
		);

		event.target.value = '';
	}

  return (
		<div className="flex flex-col h-screen overflow-hidden">
			<Header
				title={manual.title}
				subtitle={`v${manual.version} · ${client.name}`}
				actions={
					<div className="flex items-center gap-3">
						<Badge variant="blue">{templateFiles.length} Dateien</Badge>
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

			<div className="flex-1 overflow-y-auto px-8 py-6">
				{/* Upload area */}
				<div className="mb-6">
					<input
						ref={inputRef}
						type="file"
						multiple
						accept=".docx,.pptx,.xlsx"
						className="hidden"
						onChange={handleFileInput}
					/>
					<Button
						variant="outline"
						loading={isUploading}
						onClick={() => inputRef.current?.click()}
					>
						Ordner / Dateien hochladen
					</Button>
					<p className="text-xs text-gray-500 mt-1">
						DOCX-Dateien können im Canvas-Editor mit Tiptap bearbeitet werden.
					</p>
				</div>

				{/* File list */}
				{templateFiles.length === 0 ? (
					<div className="text-center py-16 text-gray-500">
						<p>Noch keine Dateien hochgeladen.</p>
						<p className="text-sm mt-1">
							Lade DOCX-Dateien hoch, um sie im Canvas-Editor zu bearbeiten.
						</p>
					</div>
				) : (
					<div className="grid grid-cols-1 gap-3 max-w-4xl">
						{templateFiles.map(file => {
							const isDocx = file.ext === 'docx';
							return (
								<Link
									key={file.id}
									href={
										isDocx ? `/manuals/${id}/canvas-editor/${file.id}` : '#'
									}
									className={isDocx ? '' : 'pointer-events-none'}
								>
									<Card
										className={`transition-shadow ${isDocx ? 'hover:shadow-md cursor-pointer' : 'opacity-60'}`}
									>
										<CardContent className="py-3">
											<div className="flex items-center justify-between gap-4">
												<div className="min-w-0 flex-1">
													<p className="font-medium text-sm text-gray-900 truncate">
														{file.name}
													</p>
													<p className="text-xs text-gray-500 truncate mt-0.5">
														{file.path}
													</p>
												</div>
												<div className="flex items-center gap-2 shrink-0">
													<Badge
														variant={
															file.placeholders.length > 0 ? 'orange' : 'gray'
														}
													>
														{file.placeholders.length} Platzhalter
													</Badge>
													<Badge variant={isDocx ? 'green' : 'gray'}>
														{file.ext.toUpperCase()}
													</Badge>
												</div>
											</div>
										</CardContent>
									</Card>
								</Link>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}
