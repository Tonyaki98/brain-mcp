import path from "node:path";
import type Database from "better-sqlite3";
import { searchPages } from "../search/fts.js";
import { readPage } from "../vault/reader.js";

export interface QueryInput {
  question: string;
  domain?: string;
  category?: string;
  max_results?: number;
}

export function query(
  vaultPath: string,
  db: Database.Database,
  input: QueryInput,
): string {
  const results = searchPages(db, input.question, {
    domain: input.domain,
    category: input.category,
    maxResults: input.max_results ?? 5,
  });

  if (results.length === 0) {
    return "No se encontraron resultados para esa consulta.";
  }

  const output: string[] = [];
  for (const result of results) {
    const parts = result.id.split("/");
    const filePath = path.join(vaultPath, ...parts) + ".md";
    try {
      const page = readPage(filePath);
      const tags = result.tags ? JSON.parse(result.tags).join(", ") : "";
      output.push(
        `## ${result.title}\n` +
        `**Path:** ${result.id}\n` +
        (tags ? `**Tags:** ${tags}\n` : "") +
        `\n${page.content}\n` +
        `---`,
      );
    } catch {
      output.push(`## ${result.title}\n**Path:** ${result.id}\n\n${result.content}\n---`);
    }
  }

  return output.join("\n\n");
}
