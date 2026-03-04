'use client';

import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
} from 'react';
import { PencilLine } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { WorkspaceAsset } from '@/lib/schemas';

interface Point {
	x: number;
	y: number;
}

interface SignatureCanvasCardProps {
	asset?: WorkspaceAsset;
	busy?: boolean;
	onSave: (file: File) => Promise<void> | void;
	onRemove?: () => Promise<void> | void;
}

function statusVariant(status: WorkspaceAsset['status']) {
	if (status === 'READY') return 'green';
	if (status === 'PROCESSING') return 'orange';
	return 'red';
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			blob => {
				if (!blob) {
					reject(new Error('Signatur konnte nicht exportiert werden'));
					return;
				}
				resolve(blob);
			},
			'image/png',
			1,
		);
	});
}

function drawImageContained(
	ctx: CanvasRenderingContext2D,
	image: HTMLImageElement,
	canvasWidth: number,
	canvasHeight: number,
) {
	const imageWidth = image.naturalWidth || image.width;
	const imageHeight = image.naturalHeight || image.height;
	if (!imageWidth || !imageHeight) return;

	const scale = Math.min(canvasWidth / imageWidth, canvasHeight / imageHeight);
	const width = imageWidth * scale;
	const height = imageHeight * scale;
	const x = (canvasWidth - width) / 2;
	const y = (canvasHeight - height) / 2;
	ctx.drawImage(image, x, y, width, height);
}

export function SignatureCanvasCard({
	asset,
	busy,
	onSave,
	onRemove,
}: SignatureCanvasCardProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const drawingRef = useRef(false);
	const currentStrokeRef = useRef<Point[]>([]);
	const hasUserInteractedRef = useRef(false);
	const hasHydratedInitialAssetRef = useRef(false);
	const baseImageRef = useRef<HTMLImageElement | null>(null);

	const [strokes, setStrokes] = useState<Point[][]>([]);
	const [isDirty, setIsDirty] = useState(false);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [canvasReady, setCanvasReady] = useState(false);
	const [hasBaseImage, setHasBaseImage] = useState(false);

	const hasStoredAsset = Boolean(asset?.id);
	const hasCanvasContent = hasBaseImage || strokes.length > 0;

	const getContext = useCallback((): CanvasRenderingContext2D | null => {
		const canvas = canvasRef.current;
		if (!canvas) return null;
		return canvas.getContext('2d');
	}, []);

	const drawBackground = useCallback((ctx: CanvasRenderingContext2D) => {
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		ctx.fillStyle = 'rgba(0, 0, 0, 0)';
		ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
		ctx.strokeStyle = '#111827';
		ctx.lineWidth = 2.2;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
	}, []);

	const redraw = useCallback(
		(allStrokes: Point[][]) => {
			const ctx = getContext();
			if (!ctx) return;
			drawBackground(ctx);
			if (baseImageRef.current) {
				drawImageContained(ctx, baseImageRef.current, 900, 240);
			}
			for (const stroke of allStrokes) {
				if (stroke.length === 0) continue;
				ctx.beginPath();
				ctx.moveTo(stroke[0].x, stroke[0].y);
				for (let i = 1; i < stroke.length; i += 1) {
					ctx.lineTo(stroke[i].x, stroke[i].y);
				}
				ctx.stroke();
			}
		},
		[drawBackground, getContext],
	);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const dpr =
			typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
		const width = 900;
		const height = 240;
		canvas.width = Math.floor(width * dpr);
		canvas.height = Math.floor(height * dpr);

		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.scale(dpr, dpr);
		setCanvasReady(true);
		redraw([]);
	}, [redraw]);

	useEffect(() => {
		if (!canvasReady) return;
		redraw(strokes);
	}, [canvasReady, redraw, strokes, hasBaseImage]);

	useEffect(() => {
		const url = asset?.preview_url ?? asset?.download_url ?? null;
		if (!url) {
			// Asset was removed — clear the preview and canvas base image
			setPreviewUrl(null);
			baseImageRef.current = null;
			setHasBaseImage(false);
			return;
		}
		setPreviewUrl(url);
	}, [asset?.id, asset?.preview_url, asset?.download_url, asset?.updated_at]);

	useEffect(() => {
		if (!canvasReady) return;
		if (hasHydratedInitialAssetRef.current) return;
		const url = asset?.preview_url ?? asset?.download_url;
		if (!url) return;

		if (hasUserInteractedRef.current) {
			hasHydratedInitialAssetRef.current = true;
			return;
		}

		hasHydratedInitialAssetRef.current = true;
		const image = new Image();
		image.onload = () => {
			baseImageRef.current = image;
			setHasBaseImage(true);
		};
		image.onerror = () => {
			baseImageRef.current = null;
			setHasBaseImage(false);
		};
		image.src = url;
	}, [asset?.preview_url, asset?.download_url, canvasReady]);

	function toPoint(event: ReactPointerEvent<HTMLCanvasElement>): Point | null {
		const canvas = canvasRef.current;
		if (!canvas) return null;
		const rect = canvas.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return null;

		const xScale = 900 / rect.width;
		const yScale = 240 / rect.height;

		return {
			x: Math.max(0, Math.min(900, (event.clientX - rect.left) * xScale)),
			y: Math.max(0, Math.min(240, (event.clientY - rect.top) * yScale)),
		};
	}

	function startDraw(event: ReactPointerEvent<HTMLCanvasElement>) {
		const point = toPoint(event);
		if (!point) return;
		hasUserInteractedRef.current = true;
		drawingRef.current = true;
		currentStrokeRef.current = [point];
	}

	function moveDraw(event: ReactPointerEvent<HTMLCanvasElement>) {
		if (!drawingRef.current) return;
		const point = toPoint(event);
		if (!point) return;

		const stroke = currentStrokeRef.current;
		stroke.push(point);

		const ctx = getContext();
		if (!ctx || stroke.length < 2) return;

		const previous = stroke[stroke.length - 2];
		ctx.beginPath();
		ctx.moveTo(previous.x, previous.y);
		ctx.lineTo(point.x, point.y);
		ctx.stroke();
	}

	function endDraw() {
		if (!drawingRef.current) return;
		drawingRef.current = false;
		if (currentStrokeRef.current.length === 0) return;
		const finishedStroke = currentStrokeRef.current;
		currentStrokeRef.current = [];
		setStrokes(prev => [...prev, finishedStroke]);
		setIsDirty(true);
	}

	async function saveSignature() {
		const canvas = canvasRef.current;
		if (!canvas) return;
		if (!hasCanvasContent || !isDirty) {
			toast.error('Bitte zuerst eine Signatur zeichnen.');
			return;
		}

		try {
			const dataUrl = canvas.toDataURL('image/png');
			const blob = await canvasToBlob(canvas);
			const file = new File([blob], 'signature-canvas.png', {
				type: 'image/png',
			});
			await onSave(file);

			setPreviewUrl(dataUrl);
			const savedImage = new Image();
			savedImage.onload = () => {
				baseImageRef.current = savedImage;
				setHasBaseImage(true);
				setStrokes([]);
			};
			savedImage.src = dataUrl;
			setIsDirty(false);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: 'Signatur speichern fehlgeschlagen',
			);
		}
	}

	function clearCanvas() {
		hasUserInteractedRef.current = true;
		baseImageRef.current = null;
		setHasBaseImage(false);
		setStrokes([]);
		currentStrokeRef.current = [];
		setIsDirty(true);
		redraw([]);
	}

	function undoStroke() {
		if (strokes.length === 0) return;
		hasUserInteractedRef.current = true;
		setStrokes(prev => prev.slice(0, -1));
		setIsDirty(true);
	}

	return (
		<div className="rounded-lg border border-gray-200 bg-white p-3">
			<div className="flex items-start justify-between">
				<div>
					<p className="text-sm font-semibold text-gray-900">
						Signatur (Canvas)
					</p>
					<p className="text-xs text-gray-500">
						Zeichnen, speichern und als `assets.signature` verwenden.
					</p>
				</div>
				{asset ? (
					<Badge variant={statusVariant(asset.status)}>{asset.status}</Badge>
				) : (
					<Badge variant="gray">EMPTY</Badge>
				)}
			</div>

			<div className="mt-3 rounded-md border border-dashed border-gray-200 bg-gray-50 p-2">
				<canvas
					ref={canvasRef}
					className="h-40 w-full rounded bg-white touch-none"
					onPointerDown={startDraw}
					onPointerMove={moveDraw}
					onPointerUp={endDraw}
					onPointerLeave={endDraw}
				/>
			</div>

			<div className="mt-3 flex flex-wrap gap-2">
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={undoStroke}
					disabled={strokes.length === 0 || busy}
				>
					Undo
				</Button>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={clearCanvas}
					disabled={!hasCanvasContent || busy}
				>
					Clear
				</Button>
				<Button
					type="button"
					size="sm"
					onClick={() => void saveSignature()}
					loading={busy}
					disabled={!hasCanvasContent || !isDirty}
				>
					<PencilLine className="mr-1 h-4 w-4" />
					Signatur speichern
				</Button>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					disabled={!asset?.download_url}
					onClick={() => {
						if (!asset?.download_url) return;
						window.location.href = asset.download_url;
					}}
				>
					Download
				</Button>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					disabled={!hasStoredAsset || busy}
					onClick={() => void onRemove?.()}
				>
					Entfernen
				</Button>
			</div>

			<div className="mt-3 min-h-10 text-xs text-gray-600">
				{previewUrl ? (
					<div className="overflow-hidden rounded border border-gray-200 bg-white p-1">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={previewUrl}
							alt="Signatur Vorschau"
							className="h-16 w-full object-contain"
						/>
					</div>
				) : (
					<p className="text-gray-500">
						Noch keine gespeicherte Signatur vorhanden.
					</p>
				)}
			</div>
		</div>
	);
}
