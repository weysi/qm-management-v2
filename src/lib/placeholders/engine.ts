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
		COMPANY_NAME: client.name,
		COMPANY_ADDRESS: client.address,
		COMPANY_ZIP_CITY: client.zipCity,
		CEO_NAME: client.ceo,
		QM_MANAGER_NAME: client.qmManager,
		EMPLOYEE_COUNT: String(client.employeeCount),
		PRODUCTS: client.products,
		SERVICES: client.services,
		INDUSTRY: client.industry,
		REVISION: '1.0',
		VALIDITY_DATE: new Date().toISOString().split('T')[0],
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
