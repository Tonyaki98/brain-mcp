import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface SessionEntry {
  timestamp: string;
  tool: string;
  detail: string;
}

export class SessionManager {
  private sessionId: string | null = null;
  private filePath: string | null = null;
  private entries: SessionEntry[] = [];
  private started: string | null = null;
  private project: string;
  private toolsUsed = new Set<string>();
  private pagesCreated: string[] = [];
  private pagesQueried: string[] = [];

  constructor(
    private vaultPath: string,
  ) {
    this.project = process.env.PROJECT_PATH ?? process.cwd();

    // Try to close session gracefully on exit
    const cleanup = () => this.close();
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
    process.on("beforeExit", cleanup);
  }

  private ensureSession(): void {
    if (this.sessionId) return;

    const now = new Date();
    this.started = now.toISOString();
    this.sessionId = now.toISOString().replace(/[:.]/g, "-");
    const sessionsDir = path.join(this.vaultPath, "_sessions");
    if (!fs.existsSync(sessionsDir)) {
      fs.mkdirSync(sessionsDir, { recursive: true });
    }
    this.filePath = path.join(sessionsDir, `${this.sessionId}.md`);
    this.writeFile();
  }

  log(tool: string, detail: string): void {
    this.ensureSession();
    this.toolsUsed.add(tool);
    const entry: SessionEntry = {
      timestamp: new Date().toISOString(),
      tool,
      detail,
    };
    this.entries.push(entry);
    this.writeFile();
  }

  trackPageCreated(pageId: string): void {
    this.pagesCreated.push(pageId);
  }

  trackPageQueried(pageId: string): void {
    this.pagesQueried.push(pageId);
  }

  private writeFile(): void {
    if (!this.filePath) return;

    const frontmatter: Record<string, unknown> = {
      type: "session",
      started: this.started,
      project: this.project,
      tools_called: Array.from(this.toolsUsed),
    };

    if (this.pagesCreated.length > 0) {
      frontmatter.pages_created = this.pagesCreated;
    }
    if (this.pagesQueried.length > 0) {
      frontmatter.pages_queried = this.pagesQueried;
    }

    let content = `\n# Sesión ${this.started?.split("T")[0]}\n\n## Operaciones\n`;
    for (const entry of this.entries) {
      const time = entry.timestamp.split("T")[1]?.replace("Z", "").substring(0, 8);
      content += `- \`${time}\` **${entry.tool}** — ${entry.detail}\n`;
    }

    const output = matter.stringify(content, frontmatter);
    fs.writeFileSync(this.filePath, output, "utf-8");
  }

  close(): void {
    if (!this.filePath || !this.sessionId) return;

    // Re-read and add ended timestamp
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      const parsed = matter(raw);
      parsed.data.ended = new Date().toISOString();
      const output = matter.stringify(parsed.content, parsed.data);
      fs.writeFileSync(this.filePath, output, "utf-8");
    } catch {
      // Best effort
    }
  }
}
