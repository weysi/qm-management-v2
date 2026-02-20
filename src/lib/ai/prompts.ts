import type { Client, ManualSection } from "@/lib/schemas";
import { buildPlaceholderMap, resolvePlaceholders } from "@/lib/placeholders";

export function buildSectionPrompt(
  section: ManualSection,
  client: Client
): { system: string; user: string } {
  const map = buildPlaceholderMap(client);
  const resolvedContent = resolvePlaceholders(section.content, map);

  const system = `Du bist ein Experte für Qualitätsmanagement und ISO 9001:2015.
Du erstellst professionelle, normkonforme Qualitätsmanagementsystem-Dokumentationen auf Deutsch.
Deine Texte sind präzise, fachlich korrekt und auf den Unternehmenskontext zugeschnitten.
Schreibe immer in einem formellen, professionellen Ton.
Verwende keine Platzhalter mehr – alle Informationen sind bereits eingearbeitet.`;

  const user = `Erstelle den vollständigen Inhalt für Kapitel ${section.chapterNumber} "${section.title}"
des Qualitätsmanagementsystemhandbuchs der Firma ${client.name}.

Unternehmensdetails:
- Firma: ${client.name}
- Branche: ${client.industry}
- Produkte: ${client.products}
- Dienstleistungen: ${client.services}
- Mitarbeiteranzahl: ${client.employeeCount}
- Geschäftsführung: ${client.ceo}
- QM-Manager/-in: ${client.qmManager}

Aktueller Kapitelinhalt (mit bereits aufgelösten Platzhaltern):
${resolvedContent}

Aufgabe: Erweitere und vervollständige diesen Kapitelinhalt mit unternehmensrelevanten,
fachlich fundierten Inhalten gemäß ISO 9001:2015.
Behalte die vorhandene Struktur bei und füge passende Beispiele, Prozesse und
unternehmensspezifische Details hinzu.
Formatiere den Text als Markdown.`;

  return { system, user };
}
