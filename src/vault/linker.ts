import type Database from "better-sqlite3";

export interface EdgeInput {
  fromDomain: string;
  fromCategory: string;
  fromPage: string;
  relation: string;
  toDomain: string;
  toCategory: string;
  toPage: string;
  note?: string;
}

export function createEdge(db: Database.Database, edge: EdgeInput): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO edges (from_domain, from_category, from_page, relation, to_domain, to_category, to_page, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    edge.fromDomain, edge.fromCategory, edge.fromPage,
    edge.relation,
    edge.toDomain, edge.toCategory, edge.toPage,
    edge.note ?? null, now,
  );
}

export function getEdgesFrom(db: Database.Database, pageId: string): EdgeInput[] {
  const [domain, category, page] = pageId.split("/");
  return db.prepare(
    "SELECT * FROM edges WHERE from_domain = ? AND from_category = ? AND from_page = ?",
  ).all(domain, category, page) as EdgeInput[];
}

export function getEdgesTo(db: Database.Database, pageId: string): EdgeInput[] {
  const [domain, category, page] = pageId.split("/");
  return db.prepare(
    "SELECT * FROM edges WHERE to_domain = ? AND to_category = ? AND to_page = ?",
  ).all(domain, category, page) as EdgeInput[];
}

export function removeEdgesForPage(db: Database.Database, pageId: string): void {
  const [domain, category, page] = pageId.split("/");
  db.prepare(
    "DELETE FROM edges WHERE (from_domain = ? AND from_category = ? AND from_page = ?) OR (to_domain = ? AND to_category = ? AND to_page = ?)",
  ).run(domain, category, page, domain, category, page);
}
