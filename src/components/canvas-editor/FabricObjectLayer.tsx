"use client";

/**
 * Fabric.js canvas layer for floating document objects (logos, signatures, stamps, images).
 * Renders on top of the WYSIWYG page preview.
 * Fabric.js is imported dynamically to avoid SSR issues.
 */

import { useEffect, useRef, useCallback } from "react";
import type { DocumentObject } from "@/lib/schemas/canvas-model.schema";

interface FabricObjectLayerProps {
  pageWidth: number;
  pageHeight: number;
  objects: DocumentObject[];
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
  onMoveObject: (id: string, x: number, y: number) => void;
  onResizeObject: (id: string, w: number, h: number) => void;
  getAssetUrl: (assetId: string) => string;
}

export function FabricObjectLayer({
  pageWidth,
  pageHeight,
  objects,
  selectedObjectId,
  onSelectObject,
  onMoveObject,
  onResizeObject,
  getAssetUrl,
}: FabricObjectLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabricRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fabricCanvasRef = useRef<any>(null);

  // Initialize Fabric.js canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    let cancelled = false;

    (async () => {
      const { Canvas, FabricImage } = await import("fabric");
      if (cancelled || !canvasRef.current) return;

      fabricRef.current = { Canvas, FabricImage };

      const fc = new Canvas(canvasRef.current, {
        width: pageWidth,
        height: pageHeight,
        selection: true,
        renderOnAddRemove: true,
      });

      fabricCanvasRef.current = fc;

      // ── Event handlers ──────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fc.on("selection:created", (e: any) => {
        const obj = e.selected?.[0];
        onSelectObject((obj?.data as { id?: string } | undefined)?.id ?? null);
      });

      fc.on("selection:cleared", () => {
        onSelectObject(null);
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fc.on("object:modified", (e: any) => {
        const target = e.target;
        if (!(target?.data as { id?: string } | undefined)?.id) return;
        const id = (target.data as { id: string }).id;
        const x = Math.round((target.left as number) ?? 0);
        const y = Math.round((target.top as number) ?? 0);
        const w = Math.round((target.getScaledWidth() as number) ?? 0);
        const h = Math.round((target.getScaledHeight() as number) ?? 0);
        onMoveObject(id, x, y);
        onResizeObject(id, w, h);
      });

      return () => {
        cancelled = true;
        fc.dispose();
        fabricCanvasRef.current = null;
      };
    })();

    return () => {
      cancelled = true;
    };
  }, [pageWidth, pageHeight, onSelectObject, onMoveObject, onResizeObject]);

  // Sync objects from model to Fabric canvas
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    const fabric = fabricRef.current;
    if (!fc || !fabric) return;

    // Remove all current objects
    fc.clear();

    // Add each DocumentObject
    for (const obj of objects) {
      if (obj.assetId) {
        const url = getAssetUrl(obj.assetId);

        fabric.FabricImage.fromURL(url, { crossOrigin: "anonymous" })
          .then((img: { set: (opts: Record<string, unknown>) => void; scaleToWidth: (w: number) => void; scaleToHeight: (h: number) => void }) => {
            if (!fabricCanvasRef.current) return;

            img.set({
              left: obj.x,
              top: obj.y,
              angle: obj.rotation,
              selectable: true,
              hasControls: true,
              data: { id: obj.id },
            });

            // Scale to fit the stored dimensions
            img.scaleToWidth(obj.w);

            fc.add(img);

            // Select if this is the selected object
            if (obj.id === selectedObjectId) {
              fc.setActiveObject(img);
            }

            fc.renderAll();
          })
          .catch(() => {
            // Asset load failed — show placeholder rectangle
            const { Rect } = require("fabric");
            const rect = new Rect({
              left: obj.x,
              top: obj.y,
              width: obj.w,
              height: obj.h,
              fill: "rgba(148,163,184,0.3)",
              stroke: "#94a3b8",
              strokeWidth: 1,
              strokeDashArray: [4, 4],
              selectable: true,
              data: { id: obj.id },
            });
            fc.add(rect);
            fc.renderAll();
          });
      }
    }

    fc.renderAll();
  }, [objects, selectedObjectId, getAssetUrl]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        pointerEvents: "auto",
        zIndex: 30,
      }}
    />
  );
}
