import { isoManualSections } from "./manual-template";
import type { Manual } from "@/lib/schemas";

function buildSections(manualId: string) {
  return isoManualSections.map((s, i) => ({
    ...s,
    id: `${manualId}-section-${i}`,
  }));
}

export const mockManuals: Manual[] = [
  {
    id: "manual-0001",
    clientId: "550e8400-e29b-41d4-a716-446655440001",
    title: "Qualitätsmanagementhandbuch – Mustermann GmbH",
    version: "1.0",
    status: "draft",
    sections: buildSections("manual-0001"),
    createdAt: "2025-01-10T08:00:00.000Z",
    updatedAt: "2025-01-10T08:00:00.000Z",
  },
];
