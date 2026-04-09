import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { fileExists, readPage } from "../vault/reader.js";
import { createEdge } from "../vault/linker.js";
import { logEntry } from "../wiki/log-manager.js";
import matter from "gray-matter";

export interface LinkInput {
  from: { domain: string; category: string; page: string };
  relation: string;
  to: { domain: string; category: string; page: string };
  note?: string;
}

export function link(
  vaultPath: string,
  db: Database.Database,
  input: LinkInput,
): string {
  const fromPath = path.join(vaultPath, input.from.domain, input.from.category, `${input.from.page}.md`);
  const toPath = path.join(vaultPath, input.to.domain, input.to.category, `${input.to.page}.md`);
  const fromId = `${input.from.domain}/${input.from.category}/${input.from.page}`;
  const toId = `${input.to.domain}/${input.to.category}/${input.to.page}`;

  if (!fileExists(fromPath)) return `Error: página "${fromId}" no existe.`;
  if (!fileExists(toPath)) return `Error: página "${toId}" no existe.`;

  // Create edge in SQLite
  createEdge(db, {
    fromDomain: input.from.domain,
    fromCategory: input.from.category,
    fromPage: input.from.page,
    relation: input.relation,
    toDomain: input.to.domain,
    toCategory: input.to.category,
    toPage: input.to.page,
    note: input.note,
  });

  // Update frontmatter relations on the "from" page
  const raw = fs.readFileSync(fromPath, "utf-8");
  const parsed = matter(raw);
  const relations = (parsed.data.relations as Array<Record<string, unknown>>) ?? [];
  relations.push({
    type: input.relation,
    target: toId,
    ...(input.note ? { note: input.note } : {}),
  });
  parsed.data.relations = relations;

  // Add wikilink if not present
  const wikilink = `[[${toId}]]`;
  if (!parsed.content.includes(wikilink)) {
    parsed.content = parsed.content.trimEnd() + `\n- ${wikilink}\n`;
  }

  const output = matter.stringify(parsed.content, parsed.data);
  fs.writeFileSync(fromPath, output, "utf-8");

  logEntry(vaultPath, "link", `${fromId} —[${input.relation}]→ ${toId}`);

  return `Link creado: ${fromId} —[${input.relation}]→ ${toId}`;
}
