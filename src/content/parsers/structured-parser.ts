import { createHash } from "node:crypto";
import type { ContentRepresentation } from "../../domain/content.js";

export interface StructuredParseResult {
  representations: ContentRepresentation[];
  metadata: {
    format: "json" | "csv" | "tsv";
    rowCount?: number;
    columnCount?: number;
    columns?: string[];
    keysCount?: number;
    estimatedTokens: number;
  };
}

export class StructuredDataParser {
  /**
   * Ingests JSON or CSV buffers and generates structured table and object representations.
   * PRD Part 1 Section 11 & Section 12.
   */
  public static parse(buffer: Buffer, format: "json" | "csv" | "tsv"): StructuredParseResult {
    const rawText = buffer.toString("utf8");
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const representations: ContentRepresentation[] = [];

    if (format === "json") {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(rawText);
      } catch (err) {
        throw new Error(`Failed to parse JSON content: ${(err as Error).message}`);
      }

      let keysCount = 0;
      let rowCount = 0;
      let columns: string[] = [];

      if (Array.isArray(parsedJson)) {
        rowCount = parsedJson.length;
        if (rowCount > 0 && typeof parsedJson[0] === "object" && parsedJson[0] !== null) {
          columns = Object.keys(parsedJson[0]);
        }
      } else if (typeof parsedJson === "object" && parsedJson !== null) {
        keysCount = Object.keys(parsedJson).length;
      }

      // JSON Representation
      representations.push({
        id: `rep_json_${sha256.slice(0, 12)}`,
        type: "json",
        mimeType: "application/json",
        sizeBytes: buffer.length,
        sha256,
        data: JSON.stringify(parsedJson, null, 2),
        metadata: { keysCount, rowCount, columns },
      });

      // Text Representation
      representations.push({
        id: `rep_txt_${sha256.slice(0, 12)}`,
        type: "text",
        mimeType: "text/plain",
        sizeBytes: buffer.length,
        sha256,
        data: rawText,
        metadata: { format: "json" },
      });

      return {
        representations,
        metadata: {
          format: "json",
          keysCount,
          rowCount,
          columns,
          estimatedTokens: Math.ceil(rawText.length / 4),
        },
      };
    } else {
      // CSV or TSV parsing
      const delimiter = format === "tsv" ? "\t" : ",";
      const lines = rawText.split(/\r?\n/).filter((line) => line.trim().length > 0);
      const rowCount = lines.length;

      let columns: string[] = [];
      const firstLine = lines[0];
      if (firstLine) {
        columns = firstLine.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""));
      }

      // CSV representation
      representations.push({
        id: `rep_csv_${sha256.slice(0, 12)}`,
        type: "csv",
        mimeType: format === "tsv" ? "text/tab-separated-values" : "text/csv",
        sizeBytes: buffer.length,
        sha256,
        data: rawText,
        metadata: { rowCount, columnCount: columns.length, columns },
      });

      // Table representation (JSON array of row objects for first 100 rows preview)
      const previewRows = lines.slice(1, 101).map((line) => {
        const values = line.split(delimiter).map((v) => v.trim().replace(/^["']|["']$/g, ""));
        const rowObj: Record<string, string> = {};
        for (let i = 0; i < columns.length; i++) {
          rowObj[columns[i] || `col_${i}`] = values[i] ?? "";
        }
        return rowObj;
      });

      const tableData = JSON.stringify(previewRows, null, 2);
      representations.push({
        id: `rep_tbl_${sha256.slice(0, 12)}`,
        type: "table",
        mimeType: "application/json",
        sizeBytes: Buffer.byteLength(tableData, "utf8"),
        sha256: createHash("sha256").update(tableData).digest("hex"),
        data: tableData,
        metadata: { totalRows: rowCount, previewRowsCount: previewRows.length, columns },
      });

      return {
        representations,
        metadata: {
          format,
          rowCount,
          columnCount: columns.length,
          columns,
          estimatedTokens: Math.ceil(rawText.length / 4),
        },
      };
    }
  }
}
