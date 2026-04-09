import path from "node:path";
import type Database from "better-sqlite3";
import type { VaultDiscovery } from "../vault/discovery.js";
import { writePage, toKebabCase } from "../vault/writer.js";
import { fileExists } from "../vault/reader.js";
import { indexPage } from "../search/fts.js";
import { createEdge } from "../vault/linker.js";
import { regenerateIndex } from "../wiki/index-manager.js";
import { logEntry } from "../wiki/log-manager.js";

export interface IngestInput {
  content: string;
  domain: string;
  category: string;
  title: string;
  page_type?: string;
  source?: string;
  tags?: string[];
  related_to?: Array<{
    domain: string;
    category: string;
    page: string;
    relation: string;
    note?: string;
  }>;
}

export function ingest(
  vaultPath: string,
  discovery: VaultDiscovery,
  db: Database.Database,
  input: IngestInput,
): string {
  if (!discovery.domainExists(input.domain)) {
    return `Error: dominio "${input.domain}" no existe. Usa create_domain primero.`;
  }
  if (!discovery.categoryExists(input.domain, input.category)) {
    return `Error: categoría "${input.category}" no existe en dominio "${input.domain}".`;
  }

  const filename = toKebabCase(input.title) + ".md";
  const filePath = path.join(vaultPath, input.domain, input.category, filename);
  const pageId = `${input.domain}/${input.category}/${toKebabCase(input.title)}`;
  const now = new Date().toISOString();

  // Build relations for frontmatter
  const relations: Array<{ type: string; target: string; note?: string }> = [];
  const references: string[] = [];

  if (input.related_to) {
    for (const rel of input.related_to) {
      const targetId = `${rel.domain}/${rel.category}/${rel.page}`;
      const targetPath = path.join(vaultPath, rel.domain, rel.category, `${rel.page}.md`);
      if (!fileExists(targetPath)) continue; // Skip non-existent targets

      relations.push({ type: rel.relation, target: targetId, note: rel.note });
      references.push(`[[${targetId}]]`);

      createEdge(db, {
        fromDomain: input.domain,
        fromCategory: input.category,
        fromPage: toKebabCase(input.title),
        relation: rel.relation,
        toDomain: rel.domain,
        toCategory: rel.category,
        toPage: rel.page,
        note: rel.note,
      });
    }
  }

  // Build content with references
  let fullContent = `\n# ${input.title}\n\n${input.content}`;
  if (references.length > 0) {
    fullContent += `\n\n## Referencias\n${references.map(r => `- ${r}`).join("\n")}`;
  }

  const frontmatter: Record<string, unknown> = {
    title: input.title,
    domain: input.domain,
    category: input.category,
    page_type: input.page_type ?? null,
    source: input.source ?? "claude-code-session",
    tags: input.tags ?? [],
    created: now,
    updated: now,
  };
  if (relations.length > 0) {
    frontmatter.relations = relations;
  }

  writePage(filePath, frontmatter, fullContent);

  // Index in SQLite
  indexPage(db, {
    id: pageId,
    domain: input.domain,
    category: input.category,
    title: input.title,
    filename,
    path: filePath,
    page_type: input.page_type ?? null,
    tags: input.tags ? JSON.stringify(input.tags) : null,
    source: input.source ?? "claude-code-session",
    created_at: now,
    updated_at: now,
    content: input.content,
  });

  regenerateIndex(vaultPath, discovery);
  logEntry(vaultPath, "ingest", `${pageId} — "${input.title}"`);

  return `Integrado en ${pageId}`;
}
