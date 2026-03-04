'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Point {
  x: number;
  y: number;
}

interface SignatureCanvasInputProps {
  value?: string;
  disabled?: boolean;
  onChange: (value?: string) => void;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) {
          reject(new Error('Signatur konnte nicht exportiert werden.'));
          return;
        }
        resolve(blob);
      },
      'image/png',
      1,
    );
  });
}

export function SignatureCanvasInput({ value, disabled, onChange }: SignatureCanvasInputProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const currentStrokeRef = useRef<Point[]>([]);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [preview, setPreview] = useState<string | undefined>(value);
  const [canvasReady, setCanvasReady] = useState(false);

  const drawBackground = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, 900, 220);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 900, 220);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const redraw = useCallback(
    (allStrokes: Point[][]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      drawBackground(ctx);
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
    [drawBackground],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.floor(900 * dpr);
    canvas.height = Math.floor(220 * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    redraw([]);
    setCanvasReady(true);
  }, [redraw]);

  useEffect(() => {
    if (!canvasReady) return;
    redraw(strokes);
  }, [canvasReady, redraw, strokes]);

  useEffect(() => {
    setPreview(value);
  }, [value]);

  function toPoint(event: ReactPointerEvent<HTMLCanvasElement>): Point | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const xScale = 900 / rect.width;
    const yScale = 220 / rect.height;
    return {
      x: Math.max(0, Math.min(900, (event.clientX - rect.left) * xScale)),
      y: Math.max(0, Math.min(220, (event.clientY - rect.top) * yScale)),
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const point = toPoint(event);
    if (!point) return;
    drawingRef.current = true;
    currentStrokeRef.current = [point];
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || disabled) return;
    const point = toPoint(event);
    if (!point) return;
    const stroke = currentStrokeRef.current;
    stroke.push(point);

    const canvas = canvasRef.current;
    if (!canvas || stroke.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const prev = stroke[stroke.length - 2];
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  function handlePointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (currentStrokeRef.current.length === 0) return;
    const finished = currentStrokeRef.current;
    currentStrokeRef.current = [];
    setStrokes(prev => [...prev, finished]);
  }

  function clearSignature() {
    if (disabled) return;
    currentStrokeRef.current = [];
    setStrokes([]);
    setPreview(undefined);
    onChange(undefined);
    redraw([]);
  }

  function undoLastStroke() {
    if (disabled || strokes.length === 0) return;
    setStrokes(prev => prev.slice(0, -1));
  }

  async function applySignature() {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0) return;
    const dataUrl = canvas.toDataURL('image/png');
    await toBlob(canvas);
    setPreview(dataUrl);
    onChange(dataUrl);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 p-2">
        <canvas
          ref={canvasRef}
          className="h-36 w-full rounded bg-white touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={undoLastStroke}
          disabled={disabled || strokes.length === 0}
        >
          Undo
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={clearSignature}
          disabled={disabled}
        >
          Clear
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void applySignature()}
          disabled={disabled || strokes.length === 0}
        >
          <PencilLine className="mr-1 h-4 w-4" />
          Signatur übernehmen
        </Button>
      </div>

      <div className="min-h-10 text-xs text-gray-600">
        {preview ? (
          <div className="overflow-hidden rounded border border-gray-200 bg-white p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Signatur Vorschau" className="h-16 w-full object-contain" />
          </div>
        ) : (
          <p className="text-gray-500">Noch keine Signatur übernommen.</p>
        )}
      </div>
    </div>
  );
}
