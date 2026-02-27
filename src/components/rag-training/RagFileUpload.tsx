'use client';

import { useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { useRagUpload } from '@/hooks/useRagTraining';

interface RagFileUploadProps {
	manualId: string;
	tenantId: string;
	packageCode: string;
	packageVersion: string;
}

export function RagFileUpload({
	manualId,
	tenantId,
	packageCode,
	packageVersion,
}: RagFileUploadProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [role, setRole] = useState<string>('TEMPLATE');
	const [isDragOver, setIsDragOver] = useState(false);
	const { mutateAsync: upload, isPending } = useRagUpload(manualId);

	const handleFiles = useCallback(
		async (files: File[]) => {
			let success = 0;
			let failed = 0;
			for (const file of files) {
				try {
					await upload({
						file,
						manualId,
						tenantId,
						packageCode,
						packageVersion,
						role,
						path: file.webkitRelativePath || file.name,
					});
					success++;
				} catch {
					failed++;
				}
			}
			if (success > 0) {
				toast.success(`${success} Datei(en) erfolgreich hochgeladen`);
			}
			if (failed > 0) {
				toast.error(`${failed} Datei(en) fehlgeschlagen`);
			}
		},
		[upload, manualId, tenantId, packageCode, packageVersion, role],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragOver(false);
			const files = Array.from(e.dataTransfer.files);
			if (files.length > 0) handleFiles(files);
		},
		[handleFiles],
	);

	const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const list = e.target.files;
		if (!list || list.length === 0) return;
		handleFiles(Array.from(list));
		e.target.value = '';
	};

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<h3 className="font-semibold text-gray-900">Dateien hochladen</h3>
					<Badge variant="blue">{isPending ? 'Wird geladen…' : 'Bereit'}</Badge>
				</div>
			</CardHeader>
			<CardContent className="space-y-4">
				{/* Role selector */}
				<div className="flex items-center gap-3">
					<label className="text-sm text-gray-600 w-20 shrink-0">Rolle:</label>
					<Select
						value={role}
						onValueChange={setRole}
					>
						<SelectTrigger className="w-52">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="TEMPLATE">Vorlage (Template)</SelectItem>
							<SelectItem value="REFERENCE">Referenz (Norm)</SelectItem>
							<SelectItem value="CUSTOMER_REFERENCE">Kundenreferenz</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{/* Drop zone */}
				<div
					className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
						isDragOver
							? 'border-primary bg-primary/5'
							: 'border-gray-200 hover:border-gray-300'
					}`}
					onDragOver={e => {
						e.preventDefault();
						setIsDragOver(true);
					}}
					onDragLeave={() => setIsDragOver(false)}
					onDrop={handleDrop}
					onClick={() => inputRef.current?.click()}
				>
					<input
						ref={inputRef}
						type="file"
						multiple
						accept=".docx,.pptx,.xlsx,.pdf,.doc,.txt,.md"
						className="hidden"
						onChange={handleInputChange}
					/>
					<svg
						className="w-10 h-10 text-gray-400 mx-auto mb-3"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={1.5}
							d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
						/>
					</svg>
					<p className="text-sm text-gray-600 font-medium">
						Dateien hierher ziehen oder klicken
					</p>
					<p className="text-xs text-gray-400 mt-1">
						DOCX, PPTX, XLSX, PDF, DOC, TXT, MD
					</p>
				</div>

				<Button
					variant="outline"
					size="sm"
					loading={isPending}
					onClick={() => inputRef.current?.click()}
				>
					Dateien auswählen
				</Button>
			</CardContent>
		</Card>
	);
}
