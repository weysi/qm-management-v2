function getStorageKey(handbookId: string) {
	return `qm-management:preferred-reference:${handbookId}`;
}

export function getPreferredReferenceId(handbookId: string): string | null {
	if (typeof window === 'undefined') return null;
	return window.localStorage.getItem(getStorageKey(handbookId));
}

export function setPreferredReferenceId(
	handbookId: string,
	referenceId: string,
) {
	if (typeof window === 'undefined') return;
	window.localStorage.setItem(getStorageKey(handbookId), referenceId);
}

export function clearPreferredReferenceId(handbookId: string) {
	if (typeof window === 'undefined') return;
	window.localStorage.removeItem(getStorageKey(handbookId));
}
