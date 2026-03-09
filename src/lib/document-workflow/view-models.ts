import type {
	HandbookCompletion,
	HandbookCompletionFile,
	HandbookPlaceholder,
	HandbookTreeNode,
} from '@/types';
import {
	canonicalizePlaceholderKey,
	describePlaceholderSource,
	isDatePlaceholder,
} from '@/lib/document-workflow/placeholder-normalization';

export interface ProjectUploadSummary {
	filesScanned: number;
	filesWithPlaceholders: number;
	totalPlaceholders: number;
	unresolvedPlaceholders: number;
}

export type PlaceholderSaveState =
	| 'idle'
	| 'editing'
	| 'autosaving'
	| 'saved'
	| 'error';

export type FileDownloadState =
	| 'ready'
	| 'blocked'
	| 'processing'
	| 'attention';

export interface FileTreeFilterState {
	showAllFiles: boolean;
	search: string;
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
	requiredTotal: number;
	requiredResolved: number;
	missingRequiredCount: number;
	status: 'complete' | 'needs-input' | 'processing' | 'attention';
	downloadState: FileDownloadState;
	children: FileTreeItem[];
	isSelectable: boolean;
}

export interface EditablePlaceholder {
	id: string;
	name: string;
	normalizedKey: string;
	label: string;
	type: 'text' | 'image' | 'signature';
	status: 'filled' | 'empty';
	required: boolean;
	value: string;
	preview: string;
	assetId: string | null;
	multiline: boolean;
	source: string | null;
	sourceLabel: string;
	saveState: PlaceholderSaveState;
	isAutoFilled: boolean;
	isDate: boolean;
	completionReason: string;
	errorMessage: string | null;
	raw: HandbookPlaceholder;
}

export interface MissingPlaceholderItem {
	fileId: string;
	filePath: string;
	name: string;
	label: string;
}

export interface ExportFileState {
	fileId: string;
	filePath: string;
	requiredTotal: number;
	requiredResolved: number;
	missingRequiredCount: number;
	completionPercentage: number;
	downloadState: 'ready' | 'blocked';
	missingPlaceholders: string[];
}

interface PlaceholderDraftOptions {
	value?: string;
	saveState?: PlaceholderSaveState;
	errorMessage?: string | null;
}

interface PlaceholderMapOptions {
	draftsById?: Record<string, PlaceholderDraftOptions>;
	activeAssets?: {
		logo?: boolean;
		signature?: boolean;
	};
}

const DEFAULT_FILE_TREE_FILTERS: FileTreeFilterState = {
	showAllFiles: false,
	search: '',
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
	completion?: HandbookCompletion,
): FileTreeItem[] {
	const completionByFileId = new Map<string, HandbookCompletionFile>();
	for (const file of completion?.files ?? []) {
		completionByFileId.set(file.file_id, file);
	}

	return tree
		.map(node => mapTreeNode(node, filters, completionByFileId))
		.filter((item): item is FileTreeItem => item !== null)
		.sort(sortTreeItems);
}

export function findFirstActionableFile(tree: HandbookTreeNode[]): FileTreeItem | null {
  const visibleItems = buildFileTreeItems(tree, {
		showAllFiles: true,
		search: '',
	});
	const files = flattenTreeItems(visibleItems).filter(
		item => item.kind === 'file',
	);

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
	options: PlaceholderMapOptions = {},
): EditablePlaceholder[] {
	return placeholders.map(placeholder => {
		const normalizedKey = canonicalizePlaceholderKey(placeholder.key);
		const type = mapPlaceholderType(placeholder);
		const persistedValue =
			type === 'text'
				? (placeholder.value_text ?? '')
				: (placeholder.asset_id ?? '');
		const draft = options.draftsById?.[placeholder.id];
		const value =
			type === 'text' ? (draft?.value ?? persistedValue) : persistedValue;
		const assetResolved =
			type === 'signature'
				? Boolean(placeholder.asset_id || options.activeAssets?.signature)
				: type === 'image'
					? Boolean(placeholder.asset_id || options.activeAssets?.logo)
					: false;
		const persistedResolved =
			type === 'text' ? persistedValue.trim() !== '' : assetResolved;
		const resolved =
			type === 'text'
				? draft?.saveState === 'editing'
					? persistedResolved
					: value.trim() !== ''
				: assetResolved;
		const source = placeholder.source ?? null;
		const saveState = draft?.saveState ?? (resolved ? 'saved' : 'idle');

		return {
			id: placeholder.id,
			name: placeholder.key,
			normalizedKey,
			label: humanizePlaceholderLabel(placeholder.key),
			type,
			status: resolved ? 'filled' : 'empty',
			required: placeholder.required,
			value,
			preview: buildPlaceholderPreview(
				{
					...placeholder,
					value_text: type === 'text' ? value : placeholder.value_text,
					asset_id:
						type === 'text'
							? placeholder.asset_id
							: assetResolved
								? (placeholder.asset_id ?? 'active-asset')
								: null,
				},
				type,
			),
			assetId:
				type === 'text'
					? (placeholder.asset_id ?? null)
					: assetResolved
						? (placeholder.asset_id ?? 'active-asset')
						: null,
			multiline:
				placeholder.suggested_output_class === 'long' ||
				(value.length ?? 0) > 140,
			source,
			sourceLabel: describePlaceholderSource(source),
			saveState,
			isAutoFilled: source === 'IMPORTED',
			isDate: isDatePlaceholder(placeholder.key),
			completionReason: buildCompletionReason({
				placeholder,
				type,
				resolved,
			}),
			errorMessage: draft?.errorMessage ?? null,
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
			!placeholder.label.toLowerCase().includes(normalized) &&
			!placeholder.preview.toLowerCase().includes(normalized)
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

export function buildExportFileStates(
	completion: HandbookCompletion | undefined,
	missingPlaceholdersByFile: Record<string, string[]> = {},
): ExportFileState[] {
	if (!completion) return [];

	return completion.files
		.map(file => {
			const missingRequiredCount = Math.max(
				file.required_total - file.required_resolved,
				0,
			);
			return {
				fileId: file.file_id,
				filePath: file.path,
				requiredTotal: file.required_total,
				requiredResolved: file.required_resolved,
				missingRequiredCount,
				completionPercentage:
					file.required_total === 0
						? 100
						: Math.round((file.required_resolved / file.required_total) * 100),
				downloadState: (missingRequiredCount === 0 ? 'ready' : 'blocked') as
					| 'ready'
					| 'blocked',
				missingPlaceholders: missingPlaceholdersByFile[file.file_id] ?? [],
			};
		})
		.sort((left, right) => {
			if (left.downloadState !== right.downloadState) {
				return left.downloadState === 'ready' ? -1 : 1;
			}
			return left.filePath.localeCompare(right.filePath);
		});
}

export function mapPlaceholderType(
	placeholder: HandbookPlaceholder,
): EditablePlaceholder['type'] {
	if (placeholder.kind !== 'ASSET') return 'text';
	if (canonicalizePlaceholderKey(placeholder.key) === 'assets.signature') {
		return 'signature';
	}
	return 'image';
}

export function humanizePlaceholderLabel(key: string): string {
  const normalized = canonicalizePlaceholderKey(key) || key;

	return normalized
		.replace(/^assets\./, '')
		.replace(/[._-]+/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map(
			segment =>
				segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase(),
		)
		.join(' ');
}

function buildPlaceholderPreview(
	placeholder: Pick<HandbookPlaceholder, 'value_text' | 'asset_id'>,
	type: EditablePlaceholder['type'],
): string {
	if (type === 'text') {
		const value = (placeholder.value_text ?? '').trim();
		if (!value) return 'No value added yet';
		return value.length > 100 ? `${value.slice(0, 97)}...` : value;
	}

	if (type === 'signature') {
		return placeholder.asset_id ? 'Signature ready' : 'Signature missing';
	}

	return placeholder.asset_id ? 'Logo ready' : 'Logo missing';
}

function buildCompletionReason({
	placeholder,
	type,
	resolved,
}: {
	placeholder: HandbookPlaceholder;
	type: EditablePlaceholder['type'];
	resolved: boolean;
}): string {
	if (!resolved) {
		return placeholder.required ? 'Required to finish this file' : 'Optional';
	}

	if (type !== 'text') {
		return type === 'signature'
			? 'Filled from the global signature asset'
			: 'Filled from the global logo asset';
	}

	if (placeholder.source === 'IMPORTED') {
		return isDatePlaceholder(placeholder.key)
			? "Auto-filled with today's date"
			: 'Auto-filled from workspace defaults';
	}

	if (placeholder.source === 'AI' || placeholder.source === 'COMPOSED') {
		return 'Saved after AI assistance';
	}

	return 'Saved';
}

function mapTreeNode(
	node: HandbookTreeNode,
	filters: FileTreeFilterState,
	completionByFileId: Map<string, HandbookCompletionFile>,
): FileTreeItem | null {
	const normalizedSearch = filters.search.trim().toLowerCase();

	if (node.kind === 'folder') {
		const children = (node.children ?? [])
			.map(child => mapTreeNode(child, filters, completionByFileId))
			.filter((item): item is FileTreeItem => item !== null)
			.sort(sortTreeItems);

		const folderMatchesSearch =
			normalizedSearch.length === 0 ||
			node.name.toLowerCase().includes(normalizedSearch) ||
			node.path.toLowerCase().includes(normalizedSearch);

		if (children.length === 0 && !folderMatchesSearch) {
			return null;
		}

		const placeholderCount = children.reduce(
			(sum, child) => sum + child.placeholderCount,
			0,
		);
		const filledCount = children.reduce(
			(sum, child) => sum + child.filledCount,
			0,
		);
		const requiredTotal = children.reduce(
			(sum, child) => sum + child.requiredTotal,
			0,
		);
		const requiredResolved = children.reduce(
			(sum, child) => sum + child.requiredResolved,
			0,
		);

		return {
			id: null,
			path: node.path,
			name: node.name,
			kind: 'folder',
			fileType: null,
			parseStatus: null,
			placeholderCount,
			filledCount,
			requiredTotal,
			requiredResolved,
			missingRequiredCount: Math.max(requiredTotal - requiredResolved, 0),
			status: deriveFolderStatus(children),
			downloadState: deriveFolderDownloadState(children),
			children,
			isSelectable: false,
		};
	}

	const placeholderCount = node.placeholder_total ?? 0;
	const filledCount = node.placeholder_resolved ?? 0;
	const parseStatus = node.parse_status ?? 'PENDING';
	const completion = node.id ? completionByFileId.get(node.id) : undefined;
	const requiredTotal = completion?.required_total ?? placeholderCount;
	const requiredResolved = completion?.required_resolved ?? filledCount;
	const missingRequiredCount = Math.max(requiredTotal - requiredResolved, 0);
	const isRelevantFile =
		filters.showAllFiles ||
		placeholderCount > 0 ||
		parseStatus === 'FAILED' ||
		parseStatus === 'PENDING';

	const matchesSearch =
		normalizedSearch.length === 0 ||
		node.name.toLowerCase().includes(normalizedSearch) ||
		node.path.toLowerCase().includes(normalizedSearch);

	if (!isRelevantFile || !matchesSearch) return null;

	return {
		id: node.id ?? null,
		path: node.path,
		name: node.name,
		kind: 'file',
		fileType: node.file_type ?? 'OTHER',
		parseStatus,
		placeholderCount,
		filledCount,
		requiredTotal,
		requiredResolved,
		missingRequiredCount,
		status: deriveFileStatus(parseStatus, missingRequiredCount),
		downloadState: deriveFileDownloadState(parseStatus, missingRequiredCount),
		children: [],
		isSelectable: Boolean(node.id),
	};
}

function deriveFolderStatus(children: FileTreeItem[]): FileTreeItem['status'] {
	if (children.some(child => child.status === 'attention')) return 'attention';
	if (children.some(child => child.status === 'processing'))
		return 'processing';
	if (children.some(child => child.status === 'needs-input'))
		return 'needs-input';
	return 'complete';
}

function deriveFolderDownloadState(
	children: FileTreeItem[],
): FileTreeItem['downloadState'] {
	if (children.some(child => child.downloadState === 'attention'))
		return 'attention';
	if (children.some(child => child.downloadState === 'processing'))
		return 'processing';
	if (children.some(child => child.downloadState === 'blocked'))
		return 'blocked';
	return 'ready';
}

function deriveFileStatus(
	parseStatus: 'PENDING' | 'PARSED' | 'FAILED',
	missingRequiredCount: number,
): FileTreeItem['status'] {
	if (parseStatus === 'FAILED') return 'attention';
	if (parseStatus === 'PENDING') return 'processing';
	if (missingRequiredCount === 0) return 'complete';
	return 'needs-input';
}

function deriveFileDownloadState(
	parseStatus: 'PENDING' | 'PARSED' | 'FAILED',
	missingRequiredCount: number,
): FileTreeItem['downloadState'] {
	if (parseStatus === 'FAILED') return 'attention';
	if (parseStatus === 'PENDING') return 'processing';
	if (missingRequiredCount === 0) return 'ready';
	return 'blocked';
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
	if (left.downloadState !== right.downloadState) {
		const order = ['attention', 'processing', 'blocked', 'ready'];
		return (
			order.indexOf(left.downloadState) - order.indexOf(right.downloadState)
		);
	}
	return left.name.localeCompare(right.name);
}
