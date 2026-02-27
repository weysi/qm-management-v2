'use client';

import { useState, useMemo, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { RagAssetItem } from '@/hooks/useRagTraining';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TreeNode {
	name: string;
	path: string;
	children: TreeNode[];
	asset?: RagAssetItem;
}

interface FileTreeProps {
	assets: RagAssetItem[];
	selectedIds?: Set<string>;
	onSelect?: (assetId: string, selected: boolean) => void;
	onSelectAll?: (selected: boolean) => void;
}

/* ------------------------------------------------------------------ */
/*  Build tree from flat asset list                                    */
/* ------------------------------------------------------------------ */

function buildTree(assets: RagAssetItem[]): TreeNode {
	const root: TreeNode = { name: '', path: '', children: [] };

	for (const asset of assets) {
		const parts = asset.path.split('/').filter(Boolean);
		let current = root;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const isFile = i === parts.length - 1;
			const pathSoFar = parts.slice(0, i + 1).join('/');

			let child = current.children.find(c => c.name === part);
			if (!child) {
				child = {
					name: part,
					path: pathSoFar,
					children: [],
					asset: isFile ? asset : undefined,
				};
				current.children.push(child);
			}
			if (isFile && !child.asset) {
				child.asset = asset;
			}
			current = child;
		}
	}

	// Sort: folders first, then alphabetical
	function sortTree(node: TreeNode) {
		node.children.sort((a, b) => {
			const aIsDir = a.children.length > 0 && !a.asset;
			const bIsDir = b.children.length > 0 && !b.asset;
			if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
			return a.name.localeCompare(b.name, 'de');
		});
		node.children.forEach(sortTree);
	}
	sortTree(root);

	return root;
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function FolderIcon({ open }: { open: boolean }) {
	return (
		<svg
			className={cn(
				'w-4 h-4 shrink-0',
				open ? 'text-blue-500' : 'text-blue-400',
			)}
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			{open ? (
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
				/>
			) : (
				<path
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth={2}
					d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
				/>
			)}
		</svg>
	);
}

function FileIcon({ ext }: { ext: string }) {
	let color = 'text-gray-400';
	if (ext === 'docx' || ext === 'doc') color = 'text-blue-500';
	else if (ext === 'pptx') color = 'text-orange-500';
	else if (ext === 'xlsx') color = 'text-green-500';
	else if (ext === 'pdf') color = 'text-red-500';

	return (
		<svg
			className={cn('w-4 h-4 shrink-0', color)}
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
			/>
		</svg>
	);
}

function ChevronIcon({ open }: { open: boolean }) {
	return (
		<svg
			className={cn(
				'w-3 h-3 text-gray-400 transition-transform shrink-0',
				open && 'rotate-90',
			)}
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={2}
				d="M9 5l7 7-7 7"
			/>
		</svg>
	);
}

/* ------------------------------------------------------------------ */
/*  Role badge helpers                                                 */
/* ------------------------------------------------------------------ */

function roleBadge(role: string) {
	switch (role) {
		case 'TEMPLATE':
			return <Badge variant="blue">Vorlage</Badge>;
		case 'REFERENCE':
			return <Badge variant="green">Referenz</Badge>;
		case 'CUSTOMER_REFERENCE':
			return <Badge variant="orange">Kundenref.</Badge>;
		case 'GENERATED_OUTPUT':
			return <Badge variant="gray">Generiert</Badge>;
		default:
			return null;
	}
}

/* ------------------------------------------------------------------ */
/*  TreeNodeComponent                                                  */
/* ------------------------------------------------------------------ */

function TreeNodeComponent({
	node,
	depth,
	expanded,
	toggleExpand,
	selectedIds,
	onSelect,
}: {
	node: TreeNode;
	depth: number;
	expanded: Set<string>;
	toggleExpand: (path: string) => void;
	selectedIds?: Set<string>;
	onSelect?: (assetId: string, selected: boolean) => void;
}) {
	const isDir = node.children.length > 0 || !node.asset;
	const isOpen = expanded.has(node.path);
	const hasAsset = !!node.asset;

	// Count children (for folder badge)
	const fileCount = useMemo(() => {
		function count(n: TreeNode): number {
			if (n.asset) return 1;
			return n.children.reduce((sum, c) => sum + count(c), 0);
		}
		return count(node);
	}, [node]);

	return (
		<div>
			<div
				className={cn(
					'flex items-center gap-1.5 py-1 px-2 rounded-md text-sm cursor-pointer hover:bg-gray-50 transition-colors group',
					hasAsset && selectedIds?.has(node.asset!.id) && 'bg-primary/5',
				)}
				style={{ paddingLeft: `${depth * 16 + 8}px` }}
				onClick={() => {
					if (isDir) {
						toggleExpand(node.path);
					} else if (hasAsset && onSelect) {
						onSelect(node.asset!.id, !selectedIds?.has(node.asset!.id));
					}
				}}
			>
				{/* Checkbox for files */}
				{hasAsset && onSelect && (
					<input
						type="checkbox"
						className="w-3.5 h-3.5 rounded border-gray-300 text-primary shrink-0"
						checked={selectedIds?.has(node.asset!.id) ?? false}
						onChange={e => {
							e.stopPropagation();
							onSelect(node.asset!.id, e.target.checked);
						}}
						onClick={e => e.stopPropagation()}
					/>
				)}

				{/* Chevron + icon */}
				{isDir ? (
					<>
						<ChevronIcon open={isOpen} />
						<FolderIcon open={isOpen} />
					</>
				) : (
					<FileIcon ext={node.asset?.ext ?? ''} />
				)}

				{/* Name */}
				<span
					className={cn(
						'truncate flex-1',
						isDir ? 'font-medium text-gray-800' : 'text-gray-700',
					)}
				>
					{node.name}
				</span>

				{/* Metadata badges */}
				<div className="flex items-center gap-1 shrink-0 opacity-70 group-hover:opacity-100">
					{isDir && <span className="text-xs text-gray-400">{fileCount}</span>}
					{hasAsset && roleBadge(node.asset!.role)}
					{hasAsset && node.asset!.placeholders.length > 0 && (
						<Badge
							variant={
								node.asset!.unresolved_placeholders.length > 0
									? 'orange'
									: 'green'
							}
						>
							{node.asset!.placeholders.length}
						</Badge>
					)}
					{hasAsset && node.asset!.has_generated_version && (
						<Badge variant="green">✓</Badge>
					)}
				</div>
			</div>

			{/* Children */}
			{isDir && isOpen && (
				<div>
					{node.children.map(child => (
						<TreeNodeComponent
							key={child.path}
							node={child}
							depth={depth + 1}
							expanded={expanded}
							toggleExpand={toggleExpand}
							selectedIds={selectedIds}
							onSelect={onSelect}
						/>
					))}
				</div>
			)}
		</div>
	);
}

/* ------------------------------------------------------------------ */
/*  FileTree (main export)                                              */
/* ------------------------------------------------------------------ */

export function FileTree({
	assets,
	selectedIds,
	onSelect,
	onSelectAll,
}: FileTreeProps) {
	const [expanded, setExpanded] = useState<Set<string>>(() => {
		// Expand top-level folders by default
		const initial = new Set<string>();
		const tree = buildTree(assets);
		tree.children.forEach(child => {
			if (child.children.length > 0 || !child.asset) {
				initial.add(child.path);
			}
		});
		return initial;
	});

	const tree = useMemo(() => buildTree(assets), [assets]);

	const toggleExpand = useCallback((path: string) => {
		setExpanded(prev => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	}, []);

	const expandAll = useCallback(() => {
		const all = new Set<string>();
		function collect(node: TreeNode) {
			if (node.children.length > 0) {
				all.add(node.path);
				node.children.forEach(collect);
			}
		}
		collect(tree);
		setExpanded(all);
	}, [tree]);

	const collapseAll = useCallback(() => {
		setExpanded(new Set());
	}, []);

	const totalFiles = assets.length;
	const allSelected = selectedIds ? selectedIds.size === totalFiles : false;

	return (
		<div className="border rounded-lg bg-white">
			{/* Toolbar */}
			<div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50/50">
				<div className="flex items-center gap-2">
					{onSelectAll && (
						<input
							type="checkbox"
							className="w-3.5 h-3.5 rounded border-gray-300 text-primary"
							checked={allSelected}
							onChange={e => onSelectAll(e.target.checked)}
						/>
					)}
					<span className="text-xs text-gray-500">
						{totalFiles} Datei{totalFiles !== 1 ? 'en' : ''}
						{selectedIds && selectedIds.size > 0 && (
							<> · {selectedIds.size} ausgewählt</>
						)}
					</span>
				</div>
				<div className="flex items-center gap-1">
					<button
						className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
						onClick={expandAll}
					>
						Alle öffnen
					</button>
					<button
						className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
						onClick={collapseAll}
					>
						Alle schließen
					</button>
				</div>
			</div>

			{/* Tree */}
			<div className="py-1 max-h-[500px] overflow-y-auto">
				{tree.children.length === 0 ? (
					<div className="text-center py-8 text-gray-400">
						<p className="text-sm">Keine Dateien vorhanden.</p>
					</div>
				) : (
					tree.children.map(child => (
						<TreeNodeComponent
							key={child.path}
							node={child}
							depth={0}
							expanded={expanded}
							toggleExpand={toggleExpand}
							selectedIds={selectedIds}
							onSelect={onSelect}
						/>
					))
				)}
			</div>
		</div>
	);
}
