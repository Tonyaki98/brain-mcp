import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import type { VaultDiscovery } from "../vault/discovery.js";
import { readAllPages } from "../vault/reader.js";

export interface LintIssue {
  type: "orphan" | "broken_link" | "empty_domain" | "duplicate" | "no_schema";
  detail: string;
  suggestion: string;
}

export function lintVault(
  vaultPath: string,
  discovery: VaultDiscovery,
  db: Database.Database,
): LintIssue[] {
  const issues: LintIssue[] = [];
  const domains = discovery.getDomains();
  const allPageIds = new Set<string>();
  const allLinks = new Map<string, string[]>(); // pageId -> linked pageIds

  // Collect all pages and their wikilinks
  for (const domain of domains) {
    let domainPageCount = 0;
    for (const [catName] of domain.categories) {
      const catPath = path.join(vaultPath, domain.name, catName);
      const pages = readAllPages(catPath);
      domainPageCount += pages.length;

      for (const page of pages) {
        const pageId = `${domain.name}/${catName}/${path.basename(page.path, ".md")}`;
        allPageIds.add(pageId);

        // Extract wikilinks
        const linkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
        let match;
        const links: string[] = [];
        while ((match = linkRegex.exec(page.content)) !== null) {
          links.push(match[1]);
        }
        allLinks.set(pageId, links);
      }
    }

    if (domainPageCount === 0) {
      issues.push({
        type: "empty_domain",
        detail: `Dominio "${domain.name}" no tiene páginas`,
        suggestion: `Usa ingest() para añadir conocimiento a ${domain.name}`,
      });
    }
  }

  // Check broken links
  for (const [pageId, links] of allLinks) {
    for (const link of links) {
      if (!allPageIds.has(link)) {
        issues.push({
          type: "broken_link",
          detail: `[[${link}]] en ${pageId} no existe`,
          suggestion: `Crea la página o corrige el link`,
        });
      }
    }
  }

  // Check orphans (pages with no incoming links)
  const referenced = new Set<string>();
  for (const links of allLinks.values()) {
    for (const link of links) referenced.add(link);
  }
  // Also check edges
  const edgeTargets = db.prepare("SELECT DISTINCT to_domain || '/' || to_category || '/' || to_page AS id FROM edges").all() as { id: string }[];
  for (const row of edgeTargets) referenced.add(row.id);
  const edgeSources = db.prepare("SELECT DISTINCT from_domain || '/' || from_category || '/' || from_page AS id FROM edges").all() as { id: string }[];
  for (const row of edgeSources) referenced.add(row.id);

  for (const pageId of allPageIds) {
    if (!referenced.has(pageId)) {
      issues.push({
        type: "orphan",
        detail: `${pageId} no tiene links entrantes`,
        suggestion: `Usa link() para conectarla con otras páginas`,
      });
    }
  }

  // Check directories without _schema.md
  const entries = fs.readdirSync(vaultPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const domainPath = path.join(vaultPath, entry.name);
    if (!fs.existsSync(path.join(domainPath, "_schema.md"))) {
      issues.push({
        type: "no_schema",
        detail: `Directorio "${entry.name}" no tiene _schema.md`,
        suggestion: `Añade un _schema.md o usa create_domain()`,
      });
    }
  }

  return issues;
}
