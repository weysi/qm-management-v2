import JSZip from 'jszip';

export const ZIP_FIRST_UPLOAD_ACCEPT = {
	'application/zip': ['.zip'],
	'application/x-zip-compressed': ['.zip'],
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
		'.docx',
	],
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': [
		'.pptx',
	],
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
	'application/pdf': ['.pdf'],
} as const;

export function isZipUpload(file: File): boolean {
	const type = file.type.toLowerCase();
	const name = file.name.toLowerCase();
	return (
		name.endsWith('.zip') ||
		type === 'application/zip' ||
		type === 'application/x-zip-compressed'
	);
}

export async function createHandbookUploadArchive(files: File[]): Promise<File> {
	if (files.length === 0) {
		throw new Error('Please select at least one file.');
	}

	if (files.length === 1 && isZipUpload(files[0])) {
		return files[0];
	}

	const zip = new JSZip();
	for (const file of files) {
		zip.file(file.name, await file.arrayBuffer());
	}

	const blob = await zip.generateAsync({ type: 'blob' });
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	return new File([blob], `documents-${timestamp}.zip`, {
		type: 'application/zip',
	});
}
