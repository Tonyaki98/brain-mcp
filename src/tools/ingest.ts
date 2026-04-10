import path from "node:path";
import type Database from "better-sqlite3";
import type { VaultDiscovery } from "../vault/discovery.js";
import { writePage, toKebabCase } from "../vault/writer.js";
import { fileExists } from "../vault/reader.js";
import { indexPageWithEmbedding } from "../search/fts.js";
import { createEdge } from "../vault/linker.js";
import { regenerateIndex } from "../wiki/index-manager.js";
import { logEntry } from "../wiki/log-manager.js";
import { generateEmbedding, semanticSearch } from "../search/embeddings.js";

const AUTO_LINK_THRESHOLD = 0.45;
const AUTO_LINK_MAX = 3;

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

/** Build a compact domain guide for Claude to know where things go */
export function buildDomainGuide(discovery: VaultDiscovery): string {
  const domains = discovery.getDomains();
  if (domains.length === 0) return "";
  const lines = domains.map(d => {
    const cats = Array.from(d.categories.values())
      .map(c => `${c.name}(${c.pageTypes.join(",")})`)
      .join(" | ");
    return `  ${d.emoji} ${d.name}: ${d.description} → [${cats}]`;
  });
  return `\n\n📂 Dominios disponibles:\n${lines.join("\n")}\nSi ninguno encaja, usa create_domain.`;
}

export async function ingest(
  vaultPath: string,
  discovery: VaultDiscovery,
  db: Database.Database,
  input: IngestInput,
): Promise<string> {
  if (!discovery.domainExists(input.domain)) {
    const guide = buildDomainGuide(discovery);
    return `Error: dominio "${input.domain}" no existe. Usa create_domain primero.${guide}`;
  }
  if (!discovery.categoryExists(input.domain, input.category)) {
    const domain = discovery.getDomain(input.domain);
    const cats = domain ? Array.from(domain.categories.keys()).join(", ") : "?";
    return `Error: categoría "${input.category}" no existe en dominio "${input.domain}". Categorías disponibles: ${cats}`;
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
  let fullContent = `\n${input.content}`;
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

  // Index in SQLite + generate embedding
  await indexPageWithEmbedding(db, {
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

  // Auto-link: find semantically similar pages and create edges
  const autoLinked: string[] = [];
  try {
    const textForEmbedding = `${input.title} ${input.tags?.join(" ") ?? ""} ${input.content}`.slice(0, 1000);
    const embedding = await generateEmbedding(textForEmbedding);
    const similar = semanticSearch(db, embedding, { maxResults: AUTO_LINK_MAX + 1 });

    // Track manually linked targets to avoid duplicates
    const manualTargets = new Set(relations.map(r => r.target));

    for (const match of similar) {
      if (match.id === pageId) continue; // Skip self
      if (match.score < AUTO_LINK_THRESHOLD) continue;
      if (manualTargets.has(match.id)) continue; // Already linked manually

      const [toDomain, toCategory, toPage] = match.id.split("/");
      createEdge(db, {
        fromDomain: input.domain,
        fromCategory: input.category,
        fromPage: toKebabCase(input.title),
        relation: "related_to",
        toDomain,
        toCategory,
        toPage,
        note: `auto-linked (score: ${match.score.toFixed(2)})`,
      });

      // Also add reverse reference in frontmatter content
      references.push(`[[${match.id}]]`);
      autoLinked.push(`${match.id} (${match.score.toFixed(2)})`);
    }
  } catch {
    // Embedding model not ready, skip auto-linking silently
  }

  // Rewrite page if auto-links added new references
  if (autoLinked.length > 0) {
    let updatedContent = `\n${input.content}`;
    if (references.length > 0) {
      updatedContent += `\n\n## Referencias\n${references.map(r => `- ${r}`).join("\n")}`;
    }
    writePage(filePath, frontmatter, updatedContent);
  }

  regenerateIndex(vaultPath, discovery);
  logEntry(vaultPath, "ingest", `${pageId} — "${input.title}"`);

  let result = `Integrado en ${pageId}`;
  if (autoLinked.length > 0) {
    result += `\n🔗 Auto-linked: ${autoLinked.join(", ")}`;
  }
  result += buildDomainGuide(discovery);
  return result;
}
