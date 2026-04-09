import fs from "node:fs";
import path from "node:path";
import type { VaultDiscovery } from "../vault/discovery.js";
import { readAllPages } from "../vault/reader.js";

export function regenerateIndex(vaultPath: string, discovery: VaultDiscovery): void {
  const domains = discovery.getDomains();
  let md = "---\ntitle: Index\ntype: index\n---\n\n# Brain Index\n\n";

  if (domains.length === 0) {
    md += "_No hay dominios aún. Usa `create_domain` para empezar._\n";
  }

  for (const domain of domains) {
    const emoji = domain.emoji ? `${domain.emoji} ` : "";
    md += `## ${emoji}${domain.name}\n\n`;
    md += `${domain.description}\n\n`;

    for (const [catName] of domain.categories) {
      const catPath = path.join(vaultPath, domain.name, catName);
      const pages = readAllPages(catPath);
      md += `### ${catName} (${pages.length})\n\n`;
      for (const page of pages) {
        const title = (page.frontmatter.title as string) ?? path.basename(page.path, ".md");
        const pageId = `${domain.name}/${catName}/${path.basename(page.path, ".md")}`;
        md += `- [[${pageId}|${title}]]\n`;
      }
      md += "\n";
    }
  }

  fs.writeFileSync(path.join(vaultPath, "index.md"), md, "utf-8");
}
