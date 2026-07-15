export async function ensureSchema() {
  const { env } = await import("cloudflare:workers");
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      research_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      principal_investigator TEXT NOT NULL,
      ptj TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Draf pendaftaran',
      progress INTEGER NOT NULL DEFAULT 5,
      risk TEXT NOT NULL DEFAULT 'Terkawal',
      next_action TEXT NOT NULL DEFAULT 'Lengkapkan pendaftaran',
      next_due TEXT,
      last_updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      agency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Belum dimohon',
      reference_no TEXT,
      decision_date TEXT,
      expiry_date TEXT,
      verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS milestones (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      title TEXT NOT NULL,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'Belum bermula',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      project_id INTEGER NOT NULL REFERENCES projects(id),
      type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      mime_type TEXT,
      status TEXT NOT NULL DEFAULT 'Menunggu pengesahan',
      version INTEGER NOT NULL DEFAULT 1,
      uploaded_by TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      project_id INTEGER REFERENCES projects(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'Menunggu semakan',
      external_target TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      project_id INTEGER REFERENCES projects(id),
      action TEXT NOT NULL,
      detail TEXT NOT NULL,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
  ]);
}
