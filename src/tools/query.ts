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

export interface QueryResult {
  text: string;
  logDetail: string;
}

export async function query(
  vaultPath: string,
  db: Database.Database,
  input: QueryInput,
): Promise<QueryResult> {
  const { results, meta } = await searchPages(db, input.question, {
    domain: input.domain,
    category: input.category,
    maxResults: input.max_results ?? 5,
  });

  const logDetail = `"${input.question}" → ${meta.mode} fts:${meta.ftsHits} semantic:${meta.semanticHits} returned:${meta.totalReturned}${meta.topResult ? ` top:${meta.topResult}` : ""}`;

  if (results.length === 0) {
    return { text: "No se encontraron resultados para esa consulta.", logDetail };
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

  return { text: output.join("\n\n"), logDetail };
}
