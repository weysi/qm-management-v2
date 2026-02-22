"use client";

import type { DocumentObject, PlacementZone, WrapMode } from "@/lib/schemas/canvas-model.schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Trash2, Lock, Unlock } from "lucide-react";

interface ObjectPropertiesPanelProps {
  object: DocumentObject;
  onUpdate: (id: string, updates: Partial<DocumentObject>) => void;
  onDelete: (id: string) => void;
}

const ZONES: { value: PlacementZone; label: string }[] = [
  { value: "header-left", label: "Kopf Links" },
  { value: "header-center", label: "Kopf Mitte" },
  { value: "header-right", label: "Kopf Rechts" },
  { value: "body", label: "Inhalt" },
  { value: "footer-left", label: "Fuß Links" },
  { value: "footer-center", label: "Fuß Mitte" },
  { value: "footer-right", label: "Fuß Rechts" },
];

const WRAP_MODES: { value: WrapMode; label: string }[] = [
  { value: "inline", label: "Im Text" },
  { value: "square", label: "Umfluss Quadrat" },
  { value: "tight", label: "Eng" },
  { value: "through", label: "Durchfluss" },
  { value: "topBottom", label: "Oben & Unten" },
  { value: "behindText", label: "Hinter Text" },
  { value: "inFrontOfText", label: "Vor Text" },
];

const OBJECT_TYPE_LABELS: Record<DocumentObject["objectType"], string> = {
  logo: "Logo",
  signature: "Unterschrift",
  stamp: "Stempel",
  image: "Bild",
  shape: "Form",
  textbox: "Textfeld",
};

export function ObjectPropertiesPanel({
  object,
  onUpdate,
  onDelete,
}: ObjectPropertiesPanelProps) {
  const rule = object.placementRule ?? {};
  const isLocked = rule.lockPosition ?? false;

  const updateRule = (updates: Partial<typeof rule>) => {
    onUpdate(object.id, {
      placementRule: { ...rule, ...updates },
    });
  };

  return (
    <div className="p-3 space-y-4 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {OBJECT_TYPE_LABELS[object.objectType]}
          </Badge>
          {object.classificationConfidence != null &&
            object.classificationConfidence < 0.6 && (
              <Badge variant="outline" className="text-orange-600 border-orange-300">
                ? Unsicher
              </Badge>
            )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(object.id)}
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Separator />

      {/* Position & Size */}
      <div>
        <p className="font-medium mb-2 text-xs text-muted-foreground uppercase tracking-wide">
          Position &amp; Größe
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">X (px)</Label>
            <Input
              type="number"
              value={Math.round(object.x)}
              onChange={(e) =>
                onUpdate(object.id, { x: parseInt(e.target.value, 10) || 0 })
              }
              className="h-7 text-xs"
              disabled={isLocked}
            />
          </div>
          <div>
            <Label className="text-xs">Y (px)</Label>
            <Input
              type="number"
              value={Math.round(object.y)}
              onChange={(e) =>
                onUpdate(object.id, { y: parseInt(e.target.value, 10) || 0 })
              }
              className="h-7 text-xs"
              disabled={isLocked}
            />
          </div>
          <div>
            <Label className="text-xs">Breite (px)</Label>
            <Input
              type="number"
              value={Math.round(object.w)}
              onChange={(e) =>
                onUpdate(object.id, { w: parseInt(e.target.value, 10) || 0 })
              }
              className="h-7 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Höhe (px)</Label>
            <Input
              type="number"
              value={Math.round(object.h)}
              onChange={(e) =>
                onUpdate(object.id, { h: parseInt(e.target.value, 10) || 0 })
              }
              className="h-7 text-xs"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Wrap Mode */}
      <div>
        <p className="font-medium mb-2 text-xs text-muted-foreground uppercase tracking-wide">
          Textumfluss
        </p>
        <div className="flex flex-wrap gap-1">
          {WRAP_MODES.map((mode) => (
            <Button
              key={mode.value}
              variant={object.wrapMode === mode.value ? "default" : "outline"}
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => onUpdate(object.id, { wrapMode: mode.value })}
            >
              {mode.label}
            </Button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Placement Rule */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">
            Platzierungsregel
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => updateRule({ lockPosition: !isLocked })}
            title={isLocked ? "Position entsperren" : "Position sperren"}
          >
            {isLocked ? (
              <Lock className="h-3 w-3 text-orange-500" />
            ) : (
              <Unlock className="h-3 w-3" />
            )}
          </Button>
        </div>

        {/* Zone selector */}
        <div className="flex flex-wrap gap-1 mb-2">
          {ZONES.map((zone) => (
            <Button
              key={zone.value}
              variant={rule.zone === zone.value ? "default" : "outline"}
              size="sm"
              className="h-6 text-xs px-1.5"
              onClick={() => updateRule({ zone: zone.value })}
            >
              {zone.label}
            </Button>
          ))}
        </div>

        {/* Margin inputs */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Rand oben (mm)</Label>
            <Input
              type="number"
              value={rule.marginTopMm ?? ""}
              placeholder="z.B. 12"
              onChange={(e) =>
                updateRule({
                  marginTopMm:
                    e.target.value ? parseFloat(e.target.value) : undefined,
                })
              }
              className="h-7 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Rand rechts (mm)</Label>
            <Input
              type="number"
              value={rule.marginRightMm ?? ""}
              placeholder="z.B. 15"
              onChange={(e) =>
                updateRule({
                  marginRightMm:
                    e.target.value ? parseFloat(e.target.value) : undefined,
                })
              }
              className="h-7 text-xs"
            />
          </div>
        </div>

        {isLocked && (
          <p className="text-[10px] text-orange-600 mt-1">
            Position gesperrt — wird beim Export aus Regel berechnet.
          </p>
        )}
      </div>
    </div>
  );
}
