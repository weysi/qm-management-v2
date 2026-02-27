import { NextResponse } from 'next/server';

/**
 * GET /api/packages
 * Returns the available standard packages (matches backend catalog).
 */
export async function GET() {
	const packages = [
		{
			code: 'ISO9001',
			version: 'v1',
			label: 'ISO 9001',
			description: 'Qualitätsmanagementsystem – Anforderungen und Handbuch',
			lang: 'DE',
		},
		{
			code: 'SSCP',
			version: 'v1',
			label: 'SSCP',
			description: 'Summary of Safety & Clinical Performance',
			lang: 'EN',
		},
		{
			code: 'ISO14007',
			version: 'v1',
			label: 'ISO 14007',
			description: 'Umweltmanagement – Kosten der Umweltauswirkungen',
			lang: 'EN',
		},
	];

	return NextResponse.json(packages);
}
