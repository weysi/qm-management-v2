import type { ManualSection } from '@/lib/schemas';

export const isoManualSections: Omit<ManualSection, 'id'>[] = [
	{
		chapterNumber: '1',
		title: 'Anwendungsbereich',
		order: 0,
		aiGenerated: false,
		placeholders: [
			'FIRMA_NAME',
			'FIRMA_STRASSE',
			'FIRMA_PLZ_ORT',
			'GESCHAEFTSFUEHRER_NAME',
			'QM_MANAGER_NAME',
			'MITARBEITER_ANZAHL',
			'PRODUKT_BESCHREIBUNG',
			'DIENSTLEISTUNG_BESCHREIBUNG',
		],
		content: `## 1 Anwendungsbereich

**Unternehmensbezeichnung:** {{FIRMA_NAME}}
**Straße:** {{FIRMA_STRASSE}}
**PLZ, Ort:** {{FIRMA_PLZ_ORT}}
dsfdahsfjahjfas

**GF:** {{GESCHAEFTSFUEHRER_NAME}}, MSc. in QM
**QM-Manager/-in:** {{QM_MANAGER_NAME}}

**Anzahl Mitarbeiter/-innen:** {{MITARBEITER_ANZAHL}}

**Produkt:** {{PRODUKT_BESCHREIBUNG}}.
**Dienstleistung:** {{DIENSTLEISTUNG_BESCHREIBUNG}}.`,
	},
	{
		chapterNumber: '2',
		title: 'Normative Verweisungen',
		order: 1,
		aiGenerated: false,
		placeholders: [],
		content: `## 2 Normative Verweisungen

Im Rahmen unseres Managementsystems beachten wir folgende normative Vorgaben:

- DIN EN ISO 9001:2015
- DIN EN ISO 9000:2015
- DIN EN ISO 13485:2012
- DIN EN ISO 14971:2013
- DIN EN ISO 50001:2010
- DIN EN ISO 10000ff Guidelines`,
	},
	{
		chapterNumber: '3',
		title: 'Begriffe',
		order: 2,
		aiGenerated: false,
		placeholders: [],
		content: `## 3 Begriffe

Siehe Punkt 11 (Glossar).

Die im Qualitätsmanagementsystem verwendeten Begriffe und Definitionen richten sich nach DIN EN ISO 9000:2015.`,
	},
	{
		chapterNumber: '4',
		title: 'Kontext der Organisation',
		order: 3,
		aiGenerated: false,
		placeholders: [
			'FIRMA_NAME',
			'PRODUKT_BESCHREIBUNG',
			'DIENSTLEISTUNG_BESCHREIBUNG',
			'FB_4_0',
			'FB_PREFIX',
		],
		content: `## 4 Kontext der Organisation

### 4.1 Verstehen der Organisation und ihres Kontextes

Unsere wirtschaftlichen Rahmenbedingungen sind für die strategische Ausrichtung relevant. Die Themen zur Erreichung der beabsichtigten Ergebnisse sind in externe und interne Zusammenhänge unterteilt. Die Themen werden laufend, formell aber jährlich geprüft und überwacht. Werden zwischen den Überwachungen neue Themen erkannt, werden diese umgehend umgesetzt.

**Nachweis(e)**
{{FB_4_0}}
{{FB_PREFIX}} 4.1.0 / 4.2.0 Kontext, Erfordernisse und Erwartungen

---

### 4.2 Verstehen der Erfordernisse und Erwartungen interessierter Parteien

Wir haben die Erfordernisse und Erwartungen in einem Formblatt gelistet und kommunizieren diese im Unternehmen. Die Erfordernisse und Erwartungen werden laufend, formell aber jährlich geprüft und überwacht. Werden zwischen den Überwachungen neue Erfordernisse und Erwartungen erkannt, werden diese umgehend umgesetzt.

**Nachweis(e)**
{{FSADFD}} 4.1.0 / 4.2.0 Kontext, Erfordernisse und Erwartungen

---

### 4.3 Festlegung des Anwendungsbereichs des Qualitätsmanagementsystems

**Anwendungsbereich des Qualitätsmanagementsystems:**

- {{PRODUKT_BESCHREIBUNG}},
- Beratungsdienstleistungen,
- Auditbegleitung,
- Dokumentationsprüfung und
- Dokumentationserstellung.

---

### 4.4 Qualitätsmanagementsystem und seine Prozesse

{{FIRMA_NAME}} hat ein prozessorientiertes Qualitätsmanagementsystem eingeführt, das alle relevanten Prozesse umfasst. Die Prozesse und ihre Wechselwirkungen sind in der Prozesslandschaft dokumentiert.

**Nachweis(e)**
{{FB_PREFIX}} 4.4.0 Prozesslandschaft / Turtle-Diagramme`,
	},
	{
		chapterNumber: '5',
		title: 'Führung',
		order: 4,
		aiGenerated: false,
		placeholders: [
			'FIRMA_NAME',
			'GESCHAEFTSFUEHRER_NAME',
			'QM_MANAGER_NAME',
			'FB_PREFIX',
		],
		content: `## 5 Führung

### 5.1 Führung und Verpflichtung

Die Unternehmensleitung von {{FIRMA_NAME}} demonstriert Führung und Verpflichtung in Bezug auf das Qualitätsmanagementsystem, indem sie:

- die Rechenschaftspflicht für die Wirksamkeit des QMS übernimmt,
- die Qualitätspolitik und Qualitätsziele festlegt,
- die Integration der QMS-Anforderungen in die Geschäftsprozesse sicherstellt,
- die Nutzung des prozessorientierten Ansatzes und risikobasierten Denkens fördert.

**Geschäftsführung:** {{GESCHAEFTSFUEHRER_NAME}}

---

### 5.2 Politik

#### 5.2.1 Festlegung der Qualitätspolitik

Die Qualitätspolitik ist auf den Kontext und die strategische Ausrichtung des Unternehmens abgestimmt und schafft einen Rahmen für die Festlegung von Qualitätszielen.

#### 5.2.2 Bekanntmachung der Qualitätspolitik

Die Qualitätspolitik ist dokumentiert, kommuniziert und für relevante interessierte Parteien zugänglich.

**Nachweis(e)**
{{FB_PREFIX}} 5.2.0 Qualitätspolitik

---

### 5.3 Rollen, Verantwortlichkeiten und Befugnisse

**QM-Manager/-in:** {{QM_MANAGER_NAME}} ist verantwortlich für:

- die Sicherstellung der Konformität des QMS mit den Anforderungen der ISO 9001:2015,
- die Berichterstattung über die Leistung des QMS an die oberste Leitung,
- die Förderung des Bewusstseins für Kundenanforderungen im gesamten Unternehmen.

**Nachweis(e)**
{{FB_PREFIX}} 5.3.0 Organigramm / Stellenbeschreibungen`,
	},
	{
		chapterNumber: '6',
		title: 'Planung',
		order: 5,
		aiGenerated: false,
		placeholders: ['FB_PREFIX'],
		content: `## 6 Planung

### 6.1 Maßnahmen zum Umgang mit Risiken und Chancen

Wir ermitteln die Risiken und Chancen, die berücksichtigt werden müssen, um:

- sicherzustellen, dass das QMS die beabsichtigten Ergebnisse erzielen kann,
- erwünschte Auswirkungen zu verstärken,
- unerwünschte Auswirkungen zu verhindern oder zu verringern,
- Verbesserungen zu erzielen.

**Nachweis(e)**
{{FB_PREFIX}} 6.1.0 Risiko- und Chancenmatrix

---

### 6.2 Qualitätsziele und Planung zu deren Erreichung

Die Qualitätsziele werden in Übereinstimmung mit der Qualitätspolitik festgelegt, messbar gemacht und regelmäßig überwacht.

**Nachweis(e)**
{{FB_PREFIX}} 6.2.0 Qualitätsziele

---

### 6.3 Planung von Änderungen

Wenn Änderungen am QMS erforderlich sind, werden diese geplant und systematisch durchgeführt.`,
	},
	{
		chapterNumber: '7',
		title: 'Unterstützung',
		order: 6,
		aiGenerated: false,
		placeholders: ['FIRMA_NAME', 'MITARBEITER_ANZAHL', 'FB_PREFIX'],
		content: `## 7 Unterstützung

### 7.1 Ressourcen

{{FIRMA_NAME}} stellt die notwendigen Ressourcen für die Einführung, Aufrechterhaltung und kontinuierliche Verbesserung des QMS bereit. Das Unternehmen beschäftigt {{MITARBEITER_ANZAHL}} Mitarbeiter/-innen.

**Nachweis(e)**
{{FB_PREFIX}} 7.1.0 Ressourcenplanung

---

### 7.2 Kompetenz

Das Unternehmen bestimmt die notwendige Kompetenz der Personen, die unter seiner Aufsicht Tätigkeiten ausführen, die die Qualitätsleistung beeinflussen.

**Nachweis(e)**
{{FB_PREFIX}} 7.2.0 Kompetenzmatrix / Schulungsplan

---

### 7.3 Bewusstsein

Alle Personen, die unter der Kontrolle des Unternehmens Tätigkeiten verrichten, sind sich der Qualitätspolitik, der relevanten Qualitätsziele und ihres Beitrags zur Wirksamkeit des QMS bewusst.

---

### 7.4 Kommunikation

Das Unternehmen legt die interne und externe Kommunikation fest, die für das QMS relevant ist.

**Nachweis(e)**
{{FB_PREFIX}} 7.4.0 Kommunikationsplan

---

### 7.5 Dokumentierte Information

Das Unternehmen pflegt und bewahrt dokumentierte Informationen auf, die zur Unterstützung des QMS und als Nachweis der Konformität erforderlich sind.

**Nachweis(e)**
{{FB_PREFIX}} 7.5.0 Dokumentenlenkung / Lenkung von Aufzeichnungen`,
	},
	{
		chapterNumber: '8',
		title: 'Betrieb',
		order: 7,
		aiGenerated: false,
		placeholders: [
			'PRODUKT_BESCHREIBUNG',
			'DIENSTLEISTUNG_BESCHREIBUNG',
			'FB_PREFIX',
		],
		content: `## 8 Betrieb

### 8.1 Betriebliche Planung und Steuerung

Das Unternehmen plant, implementiert, steuert, überwacht und überprüft die Prozesse, die für die Bereitstellung von {{PRODUKT_BESCHREIBUNG}} und {{DIENSTLEISTUNG_BESCHREIBUNG}} erforderlich sind.

**Nachweis(e)**
{{FB_PREFIX}} 8.1.0 Prozessplanung

---

### 8.2 Anforderungen an Produkte und Dienstleistungen

#### 8.2.1 Kundenkommunikation
Das Unternehmen kommuniziert mit Kunden über Informationen zu Produkten und Dienstleistungen, Anfragen, Bestellungen und Verträge.

#### 8.2.2 Bestimmung von Anforderungen
Anforderungen werden vor der Zusage ermittelt und dokumentiert.

#### 8.2.3 Überprüfung der Anforderungen
Anforderungen werden überprüft, bevor Zusagen an den Kunden gemacht werden.

**Nachweis(e)**
{{FB_PREFIX}} 8.2.0 Auftragserfassung / Vertragsüberprüfung

---

### 8.3 Entwicklung von Produkten und Dienstleistungen

Soweit anwendbar, verfügt das Unternehmen über einen strukturierten Entwicklungsprozess.

**Nachweis(e)**
{{FB_PREFIX}} 8.3.0 Entwicklungsplan

---

### 8.4 Steuerung von extern bereitgestellten Prozessen, Produkten und Dienstleistungen

Das Unternehmen stellt sicher, dass extern bereitgestellte Prozesse, Produkte und Dienstleistungen den Anforderungen entsprechen.

**Nachweis(e)**
{{FB_PREFIX}} 8.4.0 Lieferantenbewertung / Beschaffung

---

### 8.5 Produktion und Dienstleistungserbringung

Die Produktion und Dienstleistungserbringung erfolgt unter kontrollierten Bedingungen.

**Nachweis(e)**
{{FB_PREFIX}} 8.5.0 Produktions-/Dienstleistungssteuerung

---

### 8.6 Freigabe von Produkten und Dienstleistungen

Das Unternehmen implementiert geplante Tätigkeiten zur Überprüfung der Konformität von Produkten und Dienstleistungen.

**Nachweis(e)**
{{FB_PREFIX}} 8.6.0 Prüfplanung / Freigabeprotokoll

---

### 8.7 Steuerung nichtkonformer Ausgaben

Ausgaben, die nicht den Anforderungen entsprechen, werden identifiziert und gesteuert.

**Nachweis(e)**
{{FB_PREFIX}} 8.7.0 Fehler- und Abweichungsbericht`,
	},
	{
		chapterNumber: '9',
		title: 'Bewertung der Leistung',
		order: 8,
		aiGenerated: false,
		placeholders: ['FIRMA_NAME', 'FB_PREFIX'],
		content: `## 9 Bewertung der Leistung

### 9.1 Überwachung, Messung, Analyse und Bewertung

{{FIRMA_NAME}} überwacht und misst die Merkmale der Prozesse, Produkte und Dienstleistungen, um die Einhaltung der Anforderungen sicherzustellen.

**Nachweis(e)**
{{FB_PREFIX}} 9.1.0 Kennzahlen / KPI-Übersicht

---

### 9.2 Internes Audit

Das Unternehmen führt in geplanten Abständen interne Audits durch, um Informationen darüber zu erhalten, ob das QMS konform und wirksam implementiert ist.

**Nachweis(e)**
{{FB_PREFIX}} 9.2.0 Auditprogramm / Auditbericht

---

### 9.3 Managementbewertung

Die oberste Leitung bewertet das QMS des Unternehmens in geplanten Abständen, um seine fortlaufende Eignung, Angemessenheit, Wirksamkeit und Ausrichtung sicherzustellen.

**Nachweis(e)**
{{FB_PREFIX}} 9.3.0 Managementbewertungsprotokoll`,
	},
	{
		chapterNumber: '10',
		title: 'Verbesserung',
		order: 9,
		aiGenerated: false,
		placeholders: ['FIRMA_NAME', 'FB_PREFIX'],
		content: `## 10 Verbesserung

### 10.1 Allgemeines

{{FIRMA_NAME}} ermittelt und wählt Verbesserungsmöglichkeiten aus und implementiert alle notwendigen Maßnahmen, um die Anforderungen der Kunden zu erfüllen und deren Zufriedenheit zu erhöhen.

---

### 10.2 Nichtkonformität und Korrekturmaßnahmen

Bei Auftreten einer Nichtkonformität reagiert das Unternehmen, indem es Maßnahmen zur Steuerung und Korrektur ergreift und mit den Auswirkungen umgeht.

**Nachweis(e)**
{{FB_PREFIX}} 10.2.0 Korrekturmaßnahmenblatt (CAPA)

---

### 10.3 Fortlaufende Verbesserung

Das Unternehmen verbessert die Eignung, Angemessenheit und Wirksamkeit des QMS fortlaufend. Die Ergebnisse der Analyse und Bewertung sowie die Ergebnisse der Managementbewertung dienen zur Bestimmung von Verbesserungsmöglichkeiten.

**Nachweis(e)**
{{FB_PREFIX}} 10.3.0 Verbesserungsregister`,
	},
	{
		chapterNumber: '11',
		title: 'Glossar',
		order: 10,
		aiGenerated: false,
		placeholders: [],
		content: `## 11 Glossar

| Begriff | Definition |
|---------|------------|
| QMS | Qualitätsmanagementsystem |
| KVP | Kontinuierlicher Verbesserungsprozess |
| CAPA | Corrective and Preventive Action (Korrektur- und Vorbeugemaßnahmen) |
| NCR | Non-Conformance Report (Nichtkonformitätsbericht) |
| KPI | Key Performance Indicator (Leistungskennzahl) |
| FB | Formblatt |
| GF | Geschäftsführer/-in |
| QM | Qualitätsmanagement |
| Audit | Systematische, unabhängige Untersuchung zur Bewertung der Konformität |
| Prozess | Satz zusammenhängender Tätigkeiten, der Eingaben in Ergebnisse umwandelt |`,
	},
];
