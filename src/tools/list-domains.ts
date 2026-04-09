import path from "node:path";
import type Database from "better-sqlite3";
import type { VaultDiscovery } from "../vault/discovery.js";
import { readAllPages } from "../vault/reader.js";

export function listDomains(
  vaultPath: string,
  discovery: VaultDiscovery,
  db: Database.Database,
): string {
  const domains = discovery.getDomains();
  if (domains.length === 0) {
    return "No hay dominios aún. Usa create_domain para empezar.";
  }

  const lines: string[] = [];
  for (const domain of domains) {
    const catStats: string[] = [];
    let total = 0;
    for (const [catName] of domain.categories) {
      const catPath = path.join(vaultPath, domain.name, catName);
      const count = readAllPages(catPath).length;
      total += count;
      if (count > 0) catStats.push(`${catName}: ${count}`);
    }
    const emoji = domain.emoji ? `${domain.emoji} ` : "";
    const stats = catStats.length > 0 ? ` (${catStats.join(", ")})` : "";
    lines.push(`${emoji}${domain.name} — ${total} páginas${stats}`);
  }

  // Cross-links
  const crossLinks = db.prepare(`
    SELECT from_domain, to_domain, COUNT(*) as cnt
    FROM edges
    WHERE from_domain != to_domain
    GROUP BY from_domain, to_domain
    ORDER BY cnt DESC
    LIMIT 10
  `).all() as { from_domain: string; to_domain: string; cnt: number }[];

  if (crossLinks.length > 0) {
    lines.push("\nCross-links entre dominios:");
    for (const cl of crossLinks) {
      lines.push(`- ${cl.from_domain} → ${cl.to_domain}: ${cl.cnt} links`);
    }
  }

  return lines.join("\n");
}
