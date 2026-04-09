import type Database from "better-sqlite3";
import type { VaultDiscovery } from "../vault/discovery.js";
import { ingest } from "./ingest.js";
import { logEntry } from "../wiki/log-manager.js";

export interface PromoteInput {
  session_summary: string;
  learnings: Array<{
    title: string;
    content: string;
    domain: string;
    category: string;
    page_type: string;
    tags?: string[];
    related_to?: Array<{
      domain: string;
      category: string;
      page: string;
      relation: string;
    }>;
  }>;
}

export function promote(
  vaultPath: string,
  discovery: VaultDiscovery,
  db: Database.Database,
  input: PromoteInput,
): string {
  if (input.learnings.length === 0) {
    return "No hay aprendizajes para promover.";
  }

  const results: string[] = [];
  for (const learning of input.learnings) {
    const result = ingest(vaultPath, discovery, db, {
      content: learning.content,
      domain: learning.domain,
      category: learning.category,
      title: learning.title,
      page_type: learning.page_type,
      source: "claude-code-session",
      tags: learning.tags,
      related_to: learning.related_to,
    });
    results.push(result);
  }

  logEntry(vaultPath, "promote", `Sesión: ${input.session_summary} — ${input.learnings.length} aprendizajes`);

  return `${results.length} aprendizajes integrados:\n${results.map(r => `- ${r}`).join("\n")}`;
}
