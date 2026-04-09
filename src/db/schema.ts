import Database from "better-sqlite3";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS pages (
  id          TEXT PRIMARY KEY,
  domain      TEXT NOT NULL,
  category    TEXT NOT NULL,
  title       TEXT NOT NULL,
  filename    TEXT NOT NULL,
  path        TEXT NOT NULL,
  page_type   TEXT,
  tags        TEXT,
  source      TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  content     TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
  id,
  title,
  content,
  tags,
  content='pages',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
  INSERT INTO pages_fts(rowid, id, title, content, tags)
  VALUES (new.rowid, new.id, new.title, new.content, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
  INSERT INTO pages_fts(pages_fts, rowid, id, title, content, tags)
  VALUES ('delete', old.rowid, old.id, old.title, old.content, old.tags);
END;

CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
  INSERT INTO pages_fts(pages_fts, rowid, id, title, content, tags)
  VALUES ('delete', old.rowid, old.id, old.title, old.content, old.tags);
  INSERT INTO pages_fts(rowid, id, title, content, tags)
  VALUES (new.rowid, new.id, new.title, new.content, new.tags);
END;

CREATE TABLE IF NOT EXISTS edges (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  from_domain   TEXT NOT NULL,
  from_category TEXT NOT NULL,
  from_page     TEXT NOT NULL,
  relation      TEXT NOT NULL,
  to_domain     TEXT NOT NULL,
  to_category   TEXT NOT NULL,
  to_page       TEXT NOT NULL,
  note          TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS domains (
  name        TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  emoji       TEXT,
  categories  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
`;

export function initDB(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}
