import type {
	HandbookCompletion,
	HandbookPlaceholder,
	HandbookTreeNode,
} from '@/types';

export interface ProjectUploadSummary {
	filesScanned: number;
	filesWithPlaceholders: number;
	totalPlaceholders: number;
	unresolvedPlaceholders: number;
}

export interface FileTreeFilterState {
	showAllFiles: boolean;
}

export interface PlaceholderListFilterState {
	search: string;
	status: 'all' | 'filled' | 'empty';
	type: 'all' | 'text' | 'image' | 'signature';
}

export interface FileTreeItem {
	id: string | null;
	path: string;
	name: string;
	kind: 'folder' | 'file';
	fileType: 'DOCX' | 'PPTX' | 'XLSX' | 'OTHER' | null;
	parseStatus: 'PENDING' | 'PARSED' | 'FAILED' | null;
	placeholderCount: number;
	filledCount: number;
	status: 'complete' | 'needs-input' | 'processing' | 'attention';
	children: FileTreeItem[];
	isSelectable: boolean;
}

export interface EditablePlaceholder {
	id: string;
	name: string;
	label: string;
	type: 'text' | 'image' | 'signature';
	status: 'filled' | 'empty';
	required: boolean;
	value: string;
	preview: string;
	assetId: string | null;
	multiline: boolean;
	raw: HandbookPlaceholder;
}

export interface MissingPlaceholderItem {
	fileId: string;
	filePath: string;
	name: string;
	label: string;
}

const DEFAULT_FILE_TREE_FILTERS: FileTreeFilterState = {
	showAllFiles: false,
};

const DEFAULT_PLACEHOLDER_FILTERS: PlaceholderListFilterState = {
	search: '',
	status: 'all',
	type: 'all',
};

export function buildProjectUploadSummary(
	tree: HandbookTreeNode[],
	_completion?: HandbookCompletion,
): ProjectUploadSummary {
	const files = collectFileNodes(tree);
	const filesWithPlaceholders = files.filter(
		file => (file.placeholder_total ?? 0) > 0,
	).length;
	const totalPlaceholders = files.reduce(
		(sum, file) => sum + (file.placeholder_total ?? 0),
		0,
	);

	return {
		filesScanned: files.length,
		filesWithPlaceholders,
		totalPlaceholders,
		unresolvedPlaceholders: files.reduce((sum, file) => {
			const total = file.placeholder_total ?? 0;
			const filled = file.placeholder_resolved ?? 0;
			return sum + Math.max(total - filled, 0);
		}, 0),
	};
}

export function buildFileTreeItems(
	tree: HandbookTreeNode[],
	filters: FileTreeFilterState = DEFAULT_FILE_TREE_FILTERS,
): FileTreeItem[] {
	return tree
		.map(node => mapTreeNode(node, filters.showAllFiles))
		.filter((item): item is FileTreeItem => item !== null)
		.sort(sortTreeItems);
}

export function findFirstActionableFile(tree: HandbookTreeNode[]): FileTreeItem | null {
	const visibleItems = buildFileTreeItems(tree, { showAllFiles: true });
	const files = flattenTreeItems(visibleItems).filter(item => item.kind === 'file');

	return (
		files.find(
			file =>
				file.parseStatus === 'PARSED' &&
				file.placeholderCount > 0 &&
				file.isSelectable,
		) ??
		files.find(file => file.parseStatus === 'PARSED' && file.isSelectable) ??
		files.find(file => file.isSelectable) ??
		null
	);
}

export function findFileTreeItem(
	items: FileTreeItem[],
	fileId: string | null,
): FileTreeItem | null {
	if (!fileId) return null;
	return flattenTreeItems(items).find(item => item.id === fileId) ?? null;
}

export function mapPlaceholdersToEditable(
	placeholders: HandbookPlaceholder[],
): EditablePlaceholder[] {
	return placeholders.map(placeholder => {
		const type = mapPlaceholderType(placeholder);
		const value =
			type === 'text'
				? (placeholder.value_text ?? '')
				: placeholder.asset_id ?? '';

		return {
			id: placeholder.id,
			name: placeholder.key,
			label: humanizePlaceholderLabel(placeholder.key),
			type,
			status: placeholder.resolved ? 'filled' : 'empty',
			required: placeholder.required,
			value,
			preview: buildPlaceholderPreview(placeholder, type),
			assetId: placeholder.asset_id ?? null,
			multiline:
				placeholder.suggested_output_class === 'long' ||
				(placeholder.value_text?.length ?? 0) > 140,
			raw: placeholder,
		};
	});
}

export function filterEditablePlaceholders(
	placeholders: EditablePlaceholder[],
	filters: PlaceholderListFilterState = DEFAULT_PLACEHOLDER_FILTERS,
): EditablePlaceholder[] {
	const normalized = filters.search.trim().toLowerCase();

	return placeholders.filter(placeholder => {
		if (
			normalized &&
			!placeholder.name.toLowerCase().includes(normalized) &&
			!placeholder.label.toLowerCase().includes(normalized)
		) {
			return false;
		}

		if (filters.status !== 'all' && placeholder.status !== filters.status) {
			return false;
		}

		if (filters.type !== 'all' && placeholder.type !== filters.type) {
			return false;
		}

		return true;
	});
}

export function collectIncompleteFiles(
	completion: HandbookCompletion | undefined,
): Array<{ fileId: string; filePath: string }> {
	if (!completion) return [];

	return completion.files
		.filter(item => !item.is_complete_required)
		.map(item => ({
			fileId: item.file_id,
			filePath: item.path,
		}));
}

export function mapPlaceholderType(
	placeholder: HandbookPlaceholder,
): EditablePlaceholder['type'] {
	if (placeholder.kind !== 'ASSET') return 'text';
	if (placeholder.key === 'assets.signature') return 'signature';
	return 'image';
}

export function humanizePlaceholderLabel(key: string): string {
	return key
		.replace(/^assets\./, '')
		.replace(/[._-]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map(segment => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
		.join(' ');
}

function buildPlaceholderPreview(
	placeholder: HandbookPlaceholder,
	type: EditablePlaceholder['type'],
): string {
	if (type === 'text') {
		const value = (placeholder.value_text ?? '').trim();
		if (!value) return 'No value added yet';
		return value.length > 100 ? `${value.slice(0, 97)}...` : value;
	}

	if (type === 'signature') {
		return placeholder.asset_id ? 'Signature added' : 'No signature yet';
	}

	return placeholder.asset_id ? 'Image uploaded' : 'No image uploaded';
}

function mapTreeNode(
	node: HandbookTreeNode,
	showAllFiles: boolean,
): FileTreeItem | null {
	if (node.kind === 'folder') {
		const children = (node.children ?? [])
			.map(child => mapTreeNode(child, showAllFiles))
			.filter((item): item is FileTreeItem => item !== null)
			.sort(sortTreeItems);

		if (children.length === 0) return null;

		const placeholderCount = children.reduce(
			(sum, child) => sum + child.placeholderCount,
			0,
		);
		const filledCount = children.reduce((sum, child) => sum + child.filledCount, 0);

		return {
			id: null,
			path: node.path,
			name: node.name,
			kind: 'folder',
			fileType: null,
			parseStatus: null,
			placeholderCount,
			filledCount,
			status: deriveFolderStatus(children),
			children,
			isSelectable: false,
		};
	}

	const placeholderCount = node.placeholder_total ?? 0;
	const filledCount = node.placeholder_resolved ?? 0;
	const parseStatus = node.parse_status ?? 'PENDING';
	const isRelevantFile =
		showAllFiles ||
		placeholderCount > 0 ||
		parseStatus === 'FAILED' ||
		parseStatus === 'PENDING';

	if (!isRelevantFile) return null;

	return {
		id: node.id ?? null,
		path: node.path,
		name: node.name,
		kind: 'file',
		fileType: node.file_type ?? 'OTHER',
		parseStatus,
		placeholderCount,
		filledCount,
		status: deriveFileStatus(parseStatus, placeholderCount, filledCount),
		children: [],
		isSelectable: Boolean(node.id),
	};
}

function deriveFolderStatus(
	children: FileTreeItem[],
): FileTreeItem['status'] {
	if (children.some(child => child.status === 'attention')) return 'attention';
	if (children.some(child => child.status === 'processing')) return 'processing';
	if (children.some(child => child.status === 'needs-input')) return 'needs-input';
	return 'complete';
}

function deriveFileStatus(
	parseStatus: 'PENDING' | 'PARSED' | 'FAILED',
	placeholderCount: number,
	filledCount: number,
): FileTreeItem['status'] {
	if (parseStatus === 'FAILED') return 'attention';
	if (parseStatus === 'PENDING') return 'processing';
	if (placeholderCount === 0 || filledCount >= placeholderCount) return 'complete';
	return 'needs-input';
}

function collectFileNodes(tree: HandbookTreeNode[]): HandbookTreeNode[] {
	const files: HandbookTreeNode[] = [];

	for (const node of tree) {
		if (node.kind === 'file') {
			files.push(node);
			continue;
		}

		if (Array.isArray(node.children)) {
			files.push(...collectFileNodes(node.children));
		}
	}

	return files;
}

function flattenTreeItems(tree: FileTreeItem[]): FileTreeItem[] {
	return tree.flatMap(item => [item, ...flattenTreeItems(item.children)]);
}

function sortTreeItems(left: FileTreeItem, right: FileTreeItem): number {
	if (left.kind !== right.kind) {
		return left.kind === 'folder' ? -1 : 1;
	}
	return left.name.localeCompare(right.name);
}
