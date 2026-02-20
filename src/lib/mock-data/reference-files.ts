import type { ReferenceFile } from "@/lib/schemas";

export const mockReferenceFiles: ReferenceFile[] = [
  {
    id: "rf-0001",
    code: "FB 4.1.0 / 4.2.0",
    title: "Kontext, Erfordernisse und Erwartungen",
    linkedChapters: ["4.1", "4.2"],
    manualId: "manual-0001",
    generatedAt: "2025-01-10T08:00:00.000Z",
    content: `# FB 4.1.0 / 4.2.0 – Kontext, Erfordernisse und Erwartungen

## Externe Themen
| Nr. | Thema | Relevanz | Maßnahme |
|-----|-------|----------|----------|
| 1 | Marktentwicklung | Hoch | Jährliche Marktanalyse |
| 2 | Regulatorische Anforderungen | Hoch | Laufende Überwachung |
| 3 | Technologischer Wandel | Mittel | Regelmäßige Bewertung |

## Interne Themen
| Nr. | Thema | Relevanz | Maßnahme |
|-----|-------|----------|----------|
| 1 | Mitarbeiterkompetenz | Hoch | Schulungsplan |
| 2 | Infrastruktur | Mittel | Wartungsplan |

## Interessierte Parteien
| Partei | Erwartungen | Häufigkeit der Bewertung |
|--------|-------------|--------------------------|
| Kunden | Qualität, Liefertreue | Quartalsweise |
| Mitarbeiter | Faire Vergütung, Entwicklung | Jährlich |
| Lieferanten | Faire Zusammenarbeit | Jährlich |`,
  },
  {
    id: "rf-0002",
    code: "FB 4.4.0",
    title: "Prozesslandschaft / Turtle-Diagramme",
    linkedChapters: ["4.4"],
    manualId: "manual-0001",
    generatedAt: "2025-01-10T08:00:00.000Z",
    content: `# FB 4.4.0 – Prozesslandschaft

## Führungsprozesse
- Strategieentwicklung
- Managementbewertung
- Qualitätspolitik

## Kernprozesse
- Auftragsabwicklung
- Produktentwicklung
- Produktion / Dienstleistungserbringung
- Kundensupport

## Unterstützungsprozesse
- Personalmanagement
- Beschaffung
- IT / Infrastruktur
- Dokumentenmanagement`,
  },
  {
    id: "rf-0003",
    code: "FB 6.1.0",
    title: "Risiko- und Chancenmatrix",
    linkedChapters: ["6.1"],
    manualId: "manual-0001",
    generatedAt: "2025-01-10T08:00:00.000Z",
    content: `# FB 6.1.0 – Risiko- und Chancenmatrix

| Nr. | Beschreibung | Eintrittswahrscheinlichkeit | Auswirkung | Risikostufe | Maßnahme | Verantwortlich |
|-----|--------------|---------------------------|------------|-------------|----------|----------------|
| R1 | Lieferantenausfall | Mittel | Hoch | Hoch | Alternativlieferanten | Einkauf |
| R2 | Reklamationsanstieg | Niedrig | Hoch | Mittel | Prozessverbesserung | QM |
| R3 | Mitarbeiterfluktuation | Mittel | Mittel | Mittel | Mitarbeiterbindung | HR |
| C1 | Neue Märkte | Mittel | Hoch | Hoch | Marktanalyse | GF |
| C2 | Digitalisierung | Hoch | Hoch | Hoch | Investitionsplanung | IT |`,
  },
  {
    id: "rf-0004",
    code: "FB 9.2.0",
    title: "Auditprogramm / Auditbericht",
    linkedChapters: ["9.2"],
    manualId: "manual-0001",
    generatedAt: "2025-01-10T08:00:00.000Z",
    content: `# FB 9.2.0 – Auditprogramm

## Jahresauditplan
| Monat | Bereich | Auditor | Norm-Kapitel |
|-------|---------|---------|--------------|
| März | Einkauf / Beschaffung | Intern | 8.4 |
| Juni | Produktion | Intern | 8.5 |
| September | Qualitätsmanagement | Extern | 4, 5, 6 |
| Dezember | Managementbewertung | Intern | 9.3 |

## Auditbericht-Vorlage
- Auditdatum:
- Auditbereich:
- Auditor:
- Feststellungen:
- Abweichungen:
- Korrekturmaßnahmen:`,
  },
  {
    id: "rf-0005",
    code: "FB 10.2.0",
    title: "Korrekturmaßnahmenblatt (CAPA)",
    linkedChapters: ["10.2"],
    manualId: "manual-0001",
    generatedAt: "2025-01-10T08:00:00.000Z",
    content: `# FB 10.2.0 – Korrekturmaßnahmenblatt (CAPA)

| Feld | Inhalt |
|------|--------|
| CAPA-Nr. | |
| Datum | |
| Beschreibung der Nichtkonformität | |
| Sofortmaßnahme | |
| Ursachenanalyse (5-Why / Ishikawa) | |
| Korrekturmaßnahme | |
| Verantwortlich | |
| Zieldatum | |
| Wirksamkeitsprüfung | |
| Status | Offen / In Bearbeitung / Abgeschlossen |`,
  },
];
