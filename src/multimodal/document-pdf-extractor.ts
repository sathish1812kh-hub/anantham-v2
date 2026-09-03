/**
 * Document & PDF Understanding Extractor
 * PRD-MM-005: Document & PDF Understanding
 */

import type { DocumentSection } from "./types.js";

export class DocumentPdfExtractor {
  public parseDocumentText(content: string): DocumentSection[] {
    const pages = content.split(/(?:\f|<!--\s*page\s*-->)/);
    const sections: DocumentSection[] = [];

    pages.forEach((pageText, pageIdx) => {
      const pageNumber = pageIdx + 1;
      const lines = pageText.split(/\r?\n/);
      let currentHeading: string | undefined;
      const textLines: string[] = [];
      const tables: Array<string[][]> = [];
      let currentTable: string[][] | null = null;

      for (const line of lines) {
        const trimmed = line.trim();

        // Check heading
        const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch && headingMatch[2]) {
          currentHeading = headingMatch[2];
          continue;
        }

        // Check markdown/plain table row
        if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
          const cells = trimmed
            .slice(1, -1)
            .split("|")
            .map((c) => c.trim());
          if (!currentTable) {
            currentTable = [];
          }
          // Filter separator rows like |---|---|
          if (!cells.every((c) => /^[-:]+$/.test(c))) {
            currentTable.push(cells);
          }
          continue;
        } else if (currentTable) {
          tables.push(currentTable);
          currentTable = null;
        }

        if (trimmed.length > 0) {
          textLines.push(trimmed);
        }
      }

      if (currentTable) {
        tables.push(currentTable);
      }

      sections.push({
        pageNumber,
        heading: currentHeading,
        text: textLines.join("\n"),
        tables: tables.length > 0 ? tables : undefined,
      });
    });

    return sections;
  }
}
