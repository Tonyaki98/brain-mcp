import type Database from "better-sqlite3";

export interface PageRecord {
  id: string;
  domain: string;
  category: string;
  title: string;
  filename: string;
  path: string;
  page_type: string | null;
  tags: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
  content: string;
}

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  tags: string | null;
  rank: number;
}

export function indexPage(db: Database.Database, page: PageRecord): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO pages (id, domain, category, title, filename, path, page_type, tags, source, created_at, updated_at, content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    page.id, page.domain, page.category, page.title, page.filename,
    page.path, page.page_type, page.tags, page.source,
    page.created_at, page.updated_at, page.content,
  );
}

export function searchPages(
  db: Database.Database,
  query: string,
  options?: { domain?: string; category?: string; maxResults?: number },
): SearchResult[] {
  const max = options?.maxResults ?? 5;
  let sql = `
    SELECT pages_fts.id, pages_fts.title, pages_fts.content, pages_fts.tags, rank
    FROM pages_fts
    JOIN pages ON pages.id = pages_fts.id
    WHERE pages_fts MATCH ?
  `;
  const params: unknown[] = [query];

  if (options?.domain) {
    sql += " AND pages.domain = ?";
    params.push(options.domain);
  }
  if (options?.category) {
    sql += " AND pages.category = ?";
    params.push(options.category);
  }
  sql += " ORDER BY rank LIMIT ?";
  params.push(max);

  return db.prepare(sql).all(...params) as SearchResult[];
}

export function removePage(db: Database.Database, pageId: string): void {
  db.prepare("DELETE FROM pages WHERE id = ?").run(pageId);
}

export function getPage(db: Database.Database, pageId: string): PageRecord | undefined {
  return db.prepare("SELECT * FROM pages WHERE id = ?").get(pageId) as PageRecord | undefined;
}
