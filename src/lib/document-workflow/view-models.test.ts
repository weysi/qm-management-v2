import {
	buildFileTreeItems,
	buildProjectUploadSummary,
	mapPlaceholdersToEditable,
} from './view-models';

describe('document workflow view-models', () => {
	it('builds a filtered file tree that hides non-placeholder files by default', () => {
		const items = buildFileTreeItems([
			{
				kind: 'folder',
				name: 'handbook',
				path: 'handbook',
				children: [
					{
						kind: 'file',
						id: 'file-1',
						name: 'quality-manual.docx',
						path: 'handbook/quality-manual.docx',
						file_type: 'DOCX',
						parse_status: 'PARSED',
						placeholder_total: 3,
						placeholder_resolved: 1,
					},
					{
						kind: 'file',
						id: 'file-2',
						name: 'readme.pdf',
						path: 'handbook/readme.pdf',
						file_type: 'OTHER',
						parse_status: 'PARSED',
						placeholder_total: 0,
						placeholder_resolved: 0,
					},
				],
			},
		]);

		expect(items).toHaveLength(1);
		expect(items[0].children).toHaveLength(1);
		expect(items[0].children[0]).toEqual(
			expect.objectContaining({
				id: 'file-1',
				placeholderCount: 3,
				status: 'needs-input',
			}),
		);
	});

	it('summarizes scanned files and unresolved placeholders', () => {
		const summary = buildProjectUploadSummary(
			[
				{
					kind: 'file',
					id: 'file-1',
					name: 'manual.docx',
					path: 'manual.docx',
					file_type: 'DOCX',
					parse_status: 'PARSED',
					placeholder_total: 4,
					placeholder_resolved: 2,
				},
				{
					kind: 'file',
					id: 'file-2',
					name: 'slides.pptx',
					path: 'slides.pptx',
					file_type: 'PPTX',
					parse_status: 'PARSED',
					placeholder_total: 1,
					placeholder_resolved: 1,
				},
			],
			undefined,
		);

		expect(summary).toEqual({
			filesScanned: 2,
			filesWithPlaceholders: 2,
			totalPlaceholders: 5,
			unresolvedPlaceholders: 2,
		});
	});

	it('maps placeholder labels, types, and previews for the simplified editor', () => {
		const placeholders = mapPlaceholdersToEditable([
			{
				id: 'text-1',
				key: 'company.name',
				kind: 'TEXT',
				required: true,
				occurrences: 1,
				meta: {},
				value_text: 'ACME GmbH',
				asset_id: null,
				source: 'MANUAL',
				resolved: true,
				latest_audit: null,
				suggested_mode: 'quick_fill',
				suggested_output_class: 'short',
				supported_capabilities: [],
			},
			{
				id: 'asset-1',
				key: 'assets.signature',
				kind: 'ASSET',
				required: true,
				occurrences: 1,
				meta: {},
				value_text: null,
				asset_id: null,
				source: null,
				resolved: false,
				latest_audit: null,
				suggested_mode: undefined,
				suggested_output_class: undefined,
				supported_capabilities: [],
			},
		]);

		expect(placeholders[0]).toEqual(
			expect.objectContaining({
				label: 'Company Name',
				type: 'text',
				preview: 'ACME GmbH',
			}),
		);
		expect(placeholders[1]).toEqual(
			expect.objectContaining({
				label: 'Signature',
				type: 'signature',
				preview: 'No signature yet',
			}),
		);
	});
});
