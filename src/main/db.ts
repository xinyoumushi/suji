import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { logLine } from './logger'

logLine('db 模块已加载（node:sqlite 可用）')

export type SqlParam = string | number | null | Uint8Array

/** 建库脚本：version 1 */
const V1 = `
CREATE TABLE IF NOT EXISTS cards (
  id         TEXT PRIMARY KEY,
  front      TEXT NOT NULL,
  back       TEXT NOT NULL DEFAULT '',
  source     TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name ON tags(name);

CREATE TABLE IF NOT EXISTS card_tags (
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (card_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_card_tags_tag ON card_tags(tag_id);

CREATE TABLE IF NOT EXISTS tree_nodes (
  id         TEXT PRIMARY KEY,
  parent_id  TEXT REFERENCES tree_nodes(id) ON DELETE CASCADE,
  node_type  TEXT NOT NULL CHECK (node_type IN ('folder','card')),
  name       TEXT,
  note       TEXT NOT NULL DEFAULT '',
  card_id    TEXT REFERENCES cards(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (node_type = 'folder' AND name IS NOT NULL AND card_id IS NULL)
    OR
    (node_type = 'card' AND card_id IS NOT NULL AND name IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_tree_parent ON tree_nodes(parent_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_tree_card ON tree_nodes(card_id);

CREATE TRIGGER IF NOT EXISTS trg_no_child_of_card_ins
BEFORE INSERT ON tree_nodes
WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, '卡片引用节点不能添加子节点')
  WHERE (SELECT node_type FROM tree_nodes WHERE id = NEW.parent_id) = 'card';
END;

CREATE TRIGGER IF NOT EXISTS trg_no_child_of_card_upd
BEFORE UPDATE OF parent_id ON tree_nodes
WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, '卡片引用节点不能添加子节点')
  WHERE (SELECT node_type FROM tree_nodes WHERE id = NEW.parent_id) = 'card';
END;

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

/** 内容历史：每次保存前把旧内容留一份，误删后可回退 */
const V2 = `
CREATE TABLE IF NOT EXISTS content_history (
  id          TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  field       TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_entity
  ON content_history(entity_type, entity_id, field, created_at DESC);
`

const MIGRATIONS: string[] = [V1, V2]

export class Db {
  private db: DatabaseSync
  private depth = 0
  readonly file: string

  constructor(file: string) {
    this.file = file
    fs.mkdirSync(path.dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.db.exec('PRAGMA busy_timeout = 5000')
    this.migrate()
  }

  private migrate(): void {
    const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number }
    let version = Number(row?.user_version ?? 0)
    while (version < MIGRATIONS.length) {
      this.db.exec('BEGIN IMMEDIATE')
      try {
        this.db.exec(MIGRATIONS[version])
        version += 1
        this.db.exec(`PRAGMA user_version = ${version}`)
        this.db.exec('COMMIT')
      } catch (err) {
        this.db.exec('ROLLBACK')
        throw err
      }
    }
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  all<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): T[] {
    return this.db.prepare(sql).all(...params) as unknown as T[]
  }

  get<T = Record<string, unknown>>(sql: string, params: SqlParam[] = []): T | undefined {
    const row = this.db.prepare(sql).get(...params)
    return row as unknown as T | undefined
  }

  run(sql: string, params: SqlParam[] = []): { changes: number } {
    const info = this.db.prepare(sql).run(...params)
    return { changes: Number(info.changes) }
  }

  tx<T>(fn: () => T): T {
    const outer = this.depth === 0
    if (outer) this.db.exec('BEGIN IMMEDIATE')
    this.depth += 1
    try {
      const result = fn()
      this.depth -= 1
      if (outer) this.db.exec('COMMIT')
      return result
    } catch (err) {
      this.depth -= 1
      if (outer) this.db.exec('ROLLBACK')
      throw err
    }
  }

  /** 使用 VACUUM INTO 生成一致性快照（WAL 模式下安全） */
  backupTo(target: string): string {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    if (fs.existsSync(target)) fs.rmSync(target, { force: true })
    const escaped = target.replace(/'/g, "''")
    this.db.exec(`VACUUM INTO '${escaped}'`)
    return target
  }

  close(): void {
    this.db.close()
  }
}

let instance: Db | null = null

export function initDb(file: string): Db {
  if (!instance) instance = new Db(file)
  return instance
}

export function getDb(): Db {
  if (!instance) throw new Error('数据库尚未初始化')
  return instance
}

export function closeDb(): void {
  if (instance) {
    instance.close()
    instance = null
  }
}

export function nowIso(): string {
  return new Date().toISOString()
}
