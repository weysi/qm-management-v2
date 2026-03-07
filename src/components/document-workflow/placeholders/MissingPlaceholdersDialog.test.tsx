import { fireEvent, render, screen } from '@testing-library/react';
import { MissingPlaceholdersDialog } from './MissingPlaceholdersDialog';

describe('MissingPlaceholdersDialog', () => {
	it('groups missing placeholders by file and routes users back to review them', () => {
		const onFillNow = vi.fn();
		const onOpenChange = vi.fn();

		render(
			<MissingPlaceholdersDialog
				open
				onOpenChange={onOpenChange}
				onFillNow={onFillNow}
				items={[
					{
						fileId: 'file-1',
						filePath: 'handbook/quality-manual.docx',
						name: 'company.address',
						label: 'Company Address',
					},
					{
						fileId: 'file-1',
						filePath: 'handbook/quality-manual.docx',
						name: 'assets.signature',
						label: 'Signature',
					},
				]}
			/>,
		);

		expect(screen.getByText('handbook/quality-manual.docx')).toBeInTheDocument();
		expect(screen.getByText('Company Address')).toBeInTheDocument();
		expect(screen.getByText('Signature')).toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: /review missing fields/i }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
		expect(onFillNow).toHaveBeenCalled();
	});
});
