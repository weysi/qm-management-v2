'use client';

import { useRef, useState } from 'react';
import { UploadCloud, FileArchive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface ZipDropzoneProps {
  loading?: boolean;
  disabled?: boolean;
  selectedFile?: File | null;
  error?: string | null;
  onFileSelected: (file: File) => void;
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isZipFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed';
}

export function ZipDropzone({
  loading,
  disabled,
  selectedFile,
  error,
  onFileSelected,
}: ZipDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleCandidate(file: File | null) {
    if (!file) return;
    if (!isZipFile(file)) {
      setLocalError('Nur ZIP-Dateien sind erlaubt.');
      return;
    }
    setLocalError(null);
    onFileSelected(file);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        className="hidden"
        disabled={disabled || loading}
        onChange={event => {
          const file = event.target.files?.[0] ?? null;
          handleCandidate(file);
          event.target.value = '';
        }}
      />

      <div
        role="button"
        tabIndex={0}
        className={cn(
          'group rounded-lg border-2 border-dashed p-8 text-center transition-colors',
          dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-blue-300',
          (disabled || loading) && 'cursor-not-allowed opacity-70',
        )}
        onKeyDown={event => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          if (disabled || loading) return;
          inputRef.current?.click();
        }}
        onClick={() => {
          if (disabled || loading) return;
          inputRef.current?.click();
        }}
        onDragOver={event => {
          event.preventDefault();
          if (disabled || loading) return;
          setDragActive(true);
        }}
        onDragLeave={event => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDrop={event => {
          event.preventDefault();
          setDragActive(false);
          if (disabled || loading) return;
          const file = event.dataTransfer.files?.[0] ?? null;
          handleCandidate(file);
        }}
      >
        <UploadCloud className="mx-auto mb-3 h-8 w-8 text-blue-500" />
        <p className="text-sm font-medium text-gray-900">
          ZIP hier ablegen oder klicken
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Erlaubt: .zip
        </p>
        {loading && <p className="mt-2 text-xs text-blue-700">Upload läuft...</p>}
      </div>

      <div className="min-h-10 rounded border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-700">
        {selectedFile ? (
          <div className="flex items-center gap-2">
            <FileArchive className="h-4 w-4 text-gray-500" />
            <span className="font-medium">{selectedFile.name}</span>
            <span className="text-gray-500">({formatFileSize(selectedFile.size)})</span>
          </div>
        ) : (
          <span className="text-gray-500">Noch keine ZIP-Datei ausgewählt.</span>
        )}
      </div>

      {(localError || error) && (
        <p className="text-xs text-red-600">{localError ?? error}</p>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || loading}
        onClick={() => inputRef.current?.click()}
      >
        Datei auswählen
      </Button>
    </div>
  );
}
