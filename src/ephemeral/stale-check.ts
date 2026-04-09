import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const STALE_DAYS = 30;

export interface StaleMemory {
  title: string;
  filename: string;
  daysOld: number;
  expired: boolean;
}

export function checkStaleEphemeral(vaultPath: string): string | null {
  const ephemeralDir = path.join(vaultPath, "_ephemeral");
  if (!fs.existsSync(ephemeralDir)) return null;

  const files = fs.readdirSync(ephemeralDir).filter(f => f.endsWith(".md"));
  if (files.length === 0) return null;

  const now = new Date();
  const stale: StaleMemory[] = [];
  const expired: StaleMemory[] = [];

  for (const file of files) {
    const filePath = path.join(ephemeralDir, file);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const { data } = matter(raw);

      const updated = data.updated ?? data.created;
      if (!updated) continue;

      const updatedDate = new Date(updated as string);
      const daysOld = Math.floor((now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60 * 24));
      const title = (data.title as string) ?? file.replace(/\.md$/, "");

      // Check if expired
      if (data.expires) {
        const expiresDate = new Date(data.expires as string);
        if (expiresDate <= now) {
          expired.push({ title, filename: file, daysOld, expired: true });
          continue;
        }
      }

      // Check if stale (>30 days without update)
      if (daysOld >= STALE_DAYS) {
        stale.push({ title, filename: file, daysOld, expired: false });
      }
    } catch {
      // Skip unparseable files
    }
  }

  if (stale.length === 0 && expired.length === 0) return null;

  const lines: string[] = ["\n---\n📋 **Memorias efímeras pendientes de revisión:**"];

  if (expired.length > 0) {
    lines.push(`\n⏰ **${expired.length} expirada(s):**`);
    for (const m of expired) {
      lines.push(`  - "${m.title}" — usa \`forget\` con \`clear_expired: true\` para limpiar`);
    }
  }

  if (stale.length > 0) {
    lines.push(`\n🕸️ **${stale.length} con más de ${STALE_DAYS} días sin actualizar:**`);
    for (const m of stale) {
      lines.push(`  - "${m.title}" (${m.daysOld} días) — ¿borrar con \`forget\` o promover con \`promote\`?`);
    }
  }

  return lines.join("\n");
}
