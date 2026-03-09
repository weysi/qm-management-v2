const ASSET_ALIASES: Record<string, string> = {
	'assets.logo': 'assets.logo',
	asset_logo: 'assets.logo',
	assets_logo: 'assets.logo',
	logo: 'assets.logo',
	company_logo: 'assets.logo',
	'[logo]': 'assets.logo',
	__asset_logo__: 'assets.logo',
	'company.logo': 'assets.logo',
	'assets.signature': 'assets.signature',
	asset_signature: 'assets.signature',
	assets_signature: 'assets.signature',
	signature: 'assets.signature',
	company_signature: 'assets.signature',
	'[signature]': 'assets.signature',
	__asset_signature__: 'assets.signature',
	'company.signature': 'assets.signature',
};

const CURRENT_DATE_KEYS = new Set([
	'date',
	'validity_date',
	'document.current_date',
	'document.validity_date',
]);

export function extractPlaceholderSegments(raw: string): string[] {
	let token = (raw || '').trim();
	if (!token) return [];

	if (token.startsWith('{{') && token.endsWith('}}')) {
		token = token.slice(2, -2).trim();
	}

	if (token.includes('{') || token.includes('}')) {
		return [];
	}

	if (token.startsWith('__ASSET_') || token.startsWith('[')) {
		token = token.split(':', 1)[0]?.trim() ?? token;
	}

	return token
		.split(/[|,]/)
		.map(part => part.trim())
		.filter(Boolean);
}

export function canonicalizePlaceholderKey(raw: string): string {
	const segments = extractPlaceholderSegments(raw);
	if (segments.length === 0) return '';

	const normalized = segments[0].replace(/\s+/g, '').toLowerCase();
	if (!normalized) return '';

	return ASSET_ALIASES[normalized] ?? normalized;
}

export function placeholderHasModifier(raw: string, modifier: string): boolean {
	const normalizedModifier = modifier.replace(/\s+/g, '').toLowerCase();
	return extractPlaceholderSegments(raw)
		.slice(1)
		.some(
			segment =>
				segment.replace(/\s+/g, '').toLowerCase() === normalizedModifier,
		);
}

export function isDatePlaceholder(raw: string): boolean {
	const canonical = canonicalizePlaceholderKey(raw);
	if (!canonical) return false;
	return (
		CURRENT_DATE_KEYS.has(canonical) ||
		placeholderHasModifier(raw, 'date') ||
		canonical.endsWith('_date')
	);
}

export function formatCurrentDateInputValue(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${day}.${month}.${year}`;
}

export function describePlaceholderSource(
	rawSource: string | null | undefined,
): string {
	switch ((rawSource || '').toUpperCase()) {
		case 'IMPORTED':
			return 'Auto-filled';
		case 'AI':
			return 'AI draft';
		case 'COMPOSED':
			return 'Composed';
		case 'MANUAL':
			return 'Saved';
		default:
			return 'Pending';
	}
}
