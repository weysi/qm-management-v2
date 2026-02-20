import type { Client } from "@/lib/schemas";

export const mockClients: Client[] = [
  {
    id: "550e8400-e29b-41d4-a716-446655440001",
    name: "Mustermann GmbH",
    address: "Musterstraße 42",
    zipCity: "80331 München",
    ceo: "Hans Mustermann",
    qmManager: "Maria Muster",
    employeeCount: 85,
    products: "Medizinische Messgeräte und Diagnosesysteme",
    services: "Beratung, Wartung und Kalibrierung medizintechnischer Geräte",
    industry: "Medizintechnik",
    createdAt: "2025-01-10T08:00:00.000Z",
    updatedAt: "2025-01-10T08:00:00.000Z",
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440002",
    name: "TechSolutions AG",
    address: "Innovationsweg 7",
    zipCity: "70173 Stuttgart",
    ceo: "Klaus Fischer",
    qmManager: "Anna Schneider",
    employeeCount: 230,
    products: "Industrielle Steuerungssysteme und Automatisierungssoftware",
    services: "IT-Consulting, Systemintegration und technischer Support",
    industry: "Maschinenbau & Automatisierung",
    createdAt: "2025-02-15T09:30:00.000Z",
    updatedAt: "2025-02-15T09:30:00.000Z",
  },
];
