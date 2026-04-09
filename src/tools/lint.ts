import type Database from "better-sqlite3";
import type { VaultDiscovery } from "../vault/discovery.js";
import { lintVault } from "../wiki/linter.js";

export function lint(
  vaultPath: string,
  discovery: VaultDiscovery,
  db: Database.Database,
): string {
  const issues = lintVault(vaultPath, discovery, db);

  if (issues.length === 0) {
    const domains = discovery.getDomains();
    const pageCount = db.prepare("SELECT COUNT(*) as cnt FROM pages").get() as { cnt: number };
    return `✅ Vault saludable. ${domains.length} dominio(s), ${pageCount.cnt} página(s), 0 issues.`;
  }

  const grouped: Record<string, typeof issues> = {};
  for (const issue of issues) {
    (grouped[issue.type] ??= []).push(issue);
  }

  const lines: string[] = [`⚠️ ${issues.length} issue(s) encontrado(s):\n`];
  for (const [type, typeIssues] of Object.entries(grouped)) {
    lines.push(`### ${type} (${typeIssues.length})`);
    for (const issue of typeIssues) {
      lines.push(`- ${issue.detail}`);
      lines.push(`  → ${issue.suggestion}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
