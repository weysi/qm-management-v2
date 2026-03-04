import { render } from '@testing-library/react';
import { FileTree } from './FileTree';

describe('FileTree unresolved highlighting', () => {
  it('marks unresolved file and ancestor folder as unresolved', () => {
    const { container } = render(
      <FileTree
        nodes={[
          {
            name: 'docs',
            path: 'docs',
            kind: 'folder',
            children: [
              {
                name: 'template.docx',
                path: 'docs/template.docx',
                kind: 'file',
                placeholder_total: 5,
                placeholder_resolved: 3,
              },
            ],
          },
          {
            name: 'complete.docx',
            path: 'complete.docx',
            kind: 'file',
            placeholder_total: 2,
            placeholder_resolved: 2,
          },
        ]}
      />,
    );

    const unresolvedFolder = container.querySelector('[data-node-path="docs"]');
    const unresolvedFile = container.querySelector('[data-node-path="docs/template.docx"]');
    const completeFile = container.querySelector('[data-node-path="complete.docx"]');

    expect(unresolvedFolder).toHaveAttribute('data-unresolved', 'true');
    expect(unresolvedFile).toHaveAttribute('data-unresolved', 'true');
    expect(completeFile).toHaveAttribute('data-unresolved', 'false');
  });
});
