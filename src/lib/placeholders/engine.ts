import type { Client } from '@/lib/schemas';

const PLACEHOLDER_REGEX = /\{\{([A-Z0-9_]+)\}\}/g;

/**
 * Extract all unique {{KEY}} placeholder tokens from a string.
 */
export function extractPlaceholders(text: string): string[] {
	const matches = new Set<string>();
	let match: RegExpExecArray | null;
	const regex = new RegExp(PLACEHOLDER_REGEX.source, 'g');
	while ((match = regex.exec(text)) !== null) {
		matches.add(match[1]);
	}
	return Array.from(matches);
}

/**
 * Replace all {{KEY}} tokens in text using the provided map.
 * Unresolved tokens are left as-is.
 */
export function resolvePlaceholders(
	text: string,
	map: Record<string, string>,
): string {
	return text.replace(new RegExp(PLACEHOLDER_REGEX.source, 'g'), (_, key) => {
		return map[key] ?? `{{${key}}}`;
	});
}

/**
 * Build a placeholder map from a Client object.
 * Keys match the {{TOKEN}} names used in ISO manual templates.
 */
export function buildPlaceholderMap(client: Client): Record<string, string> {
	return {
		FIRMA_NAME: client.name,
		FIRMA_STRASSE: client.address,
		FIRMA_PLZ_ORT: client.zipCity,
		GESCHAEFTSFUEHRER_NAME: client.ceo,
		QM_MANAGER_NAME: client.qmManager,
		MITARBEITER_ANZAHL: String(client.employeeCount),
		PRODUKT_BESCHREIBUNG: client.products,
		DIENSTLEISTUNG_BESCHREIBUNG: client.services,
		BRANCHE: client.industry,
		FB_PREFIX: 'FB',
		FB_4_0: 'FB 4.1.0 / 4.2.0',
		FSADFD: 'adfaf',
	};
}

/**
 * Returns a status map: key → "resolved" | "unresolved"
 */
export function getPlaceholderStatuses(
	tokens: string[],
	map: Record<string, string>,
): Record<string, 'resolved' | 'unresolved'> {
	return Object.fromEntries(
		tokens.map(key => [
			key,
			map[key] !== undefined && map[key] !== '' ? 'resolved' : 'unresolved',
		]),
	);
}
