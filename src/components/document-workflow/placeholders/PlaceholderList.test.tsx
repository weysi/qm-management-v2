import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PlaceholderList } from './PlaceholderList';
import type {
	EditablePlaceholder,
	PlaceholderListFilterState,
} from '@/lib/document-workflow/view-models';

function makePlaceholder(
	overrides: Partial<EditablePlaceholder>,
): EditablePlaceholder {
	return {
		id: overrides.id ?? 'placeholder-1',
		name: overrides.name ?? 'company.name',
		normalizedKey: overrides.normalizedKey ?? overrides.name ?? 'company.name',
		label: overrides.label ?? 'Company Name',
		type: overrides.type ?? 'text',
		status: overrides.status ?? 'empty',
		required: overrides.required ?? true,
		value: overrides.value ?? '',
		preview: overrides.preview ?? 'No value added yet',
		assetId: overrides.assetId ?? null,
		multiline: overrides.multiline ?? false,
		source: overrides.source ?? 'MANUAL',
		sourceLabel: overrides.sourceLabel ?? 'Saved',
		saveState: overrides.saveState ?? 'idle',
		isAutoFilled: overrides.isAutoFilled ?? false,
		isDate: overrides.isDate ?? false,
		completionReason: overrides.completionReason ?? 'Required to finish this file',
		errorMessage: overrides.errorMessage ?? null,
		raw:
			overrides.raw ??
			({
				id: overrides.id ?? 'placeholder-1',
				key: overrides.name ?? 'company.name',
				kind: overrides.type === 'text' ? 'TEXT' : 'ASSET',
				required: overrides.required ?? true,
				occurrences: 1,
				meta: {},
				value_text: overrides.value ?? '',
				asset_id: overrides.assetId ?? null,
				source: 'MANUAL',
				resolved: overrides.status === 'filled',
				latest_audit: null,
				suggested_mode: undefined,
				suggested_output_class: undefined,
				supported_capabilities: [],
			}),
	};
}

describe('PlaceholderList', () => {
	it('filters placeholders by search and triggers row actions', async () => {
		const onEdit = vi.fn();
		const onAutofill = vi.fn();
		const onClear = vi.fn();
		const filters: PlaceholderListFilterState = {
			search: '',
			status: 'all',
			type: 'all',
		};
		const setFilters = vi.fn();
		const placeholders = [
			makePlaceholder({ id: '1', name: 'company.name', label: 'Company Name' }),
			makePlaceholder({
				id: '2',
				name: 'company.address',
				label: 'Company Address',
				status: 'filled',
				preview: 'Main Street 1',
			}),
		];

		const { rerender } = render(
			<PlaceholderList
				placeholders={placeholders}
				filters={filters}
				onFiltersChange={setFilters}
				onEdit={onEdit}
				onAutofill={onAutofill}
				onClear={onClear}
			/>,
		);

		fireEvent.change(screen.getByPlaceholderText(/search placeholders/i), {
			target: { value: 'address' },
		});
		expect(setFilters).toHaveBeenCalledWith({
			search: 'address',
			status: 'all',
			type: 'all',
		});

		rerender(
			<PlaceholderList
				placeholders={placeholders}
				filters={{ ...filters, search: 'address' }}
				onFiltersChange={setFilters}
				onEdit={onEdit}
				onAutofill={onAutofill}
				onClear={onClear}
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText('Company Address')).toBeInTheDocument();
		});
		expect(screen.queryByText('Company Name')).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
		expect(onEdit).toHaveBeenCalledWith(placeholders[1]);

		fireEvent.click(screen.getByRole('button', { name: /auto-fill/i }));
		expect(onAutofill).toHaveBeenCalledWith(placeholders[1]);

		fireEvent.click(screen.getByRole('button', { name: /clear/i }));
		expect(onClear).toHaveBeenCalledWith(placeholders[1]);
	});
});
