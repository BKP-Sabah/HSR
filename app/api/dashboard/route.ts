import { ensureSchema } from "../_schema";
import { googleSheetsConfigured, googleSheetsRequest } from "../_google-sheets";
import { currentIdentity } from "../_shared";

const DEMO_TITLES = [
  "Oral Health Burden and Service Delivery in Sabah's PPKPS Programme",
  "Awareness and Management of Molar Incisor Hypomineralisation among GDPs and DNs",
  "Unmet Treatment Needs among Primary Schoolchildren in Sabah",
  "Evaluation of Domiciliary Oral Healthcare Delivery in Sabah",
  "Ujian fungsi sistem pemantauan penyelidikan",
];

async function prepareProductionData() {
  await ensureSchema();
  const { env } = await import("cloudflare:workers");
  const cleanup = await env.DB.prepare(
    "SELECT value FROM system_settings WHERE key = 'production_cleanup_v2'",
  ).first<{ value: string }>();

  if (!cleanup) {
    const placeholders = DEMO_TITLES.map(() => "?").join(", ");
    const projectIds = `SELECT id FROM projects WHERE title IN (${placeholders})`;
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM documents WHERE project_id IN (${projectIds})`).bind(...DEMO_TITLES),
      env.DB.prepare(`DELETE FROM milestones WHERE project_id IN (${projectIds})`).bind(...DEMO_TITLES),
      env.DB.prepare(`DELETE FROM approvals WHERE project_id IN (${projectIds})`).bind(...DEMO_TITLES),
      env.DB.prepare(`DELETE FROM actions WHERE project_id IN (${projectIds})`).bind(...DEMO_TITLES),
      env.DB.prepare(`DELETE FROM audit_log WHERE project_id IN (${projectIds})`).bind(...DEMO_TITLES),
      env.DB.prepare(`DELETE FROM projects WHERE id IN (${projectIds})`).bind(...DEMO_TITLES),
      env.DB.prepare(
        "INSERT INTO system_settings (key, value) VALUES ('production_cleanup_v2', 'completed')",
      ),
      env.DB.prepare(
        "INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('operating_mode', 'production', CURRENT_TIMESTAMP)",
      ),
    ]);
  }

  await env.DB.batch([
    env.DB.prepare(`UPDATE projects
      SET risk = 'Lewat'
      WHERE status != 'Ditutup' AND next_due IS NOT NULL AND date(next_due) < date('now')`),
    env.DB.prepare(`UPDATE projects
      SET risk = 'Perhatian'
      WHERE status != 'Ditutup' AND risk = 'Terkawal' AND next_due IS NOT NULL
        AND date(next_due) BETWEEN date('now') AND date('now', '+14 days')`),
    env.DB.prepare(`INSERT INTO actions (project_id, type, title, detail, due_date, status, external_target)
      SELECT p.id, 'Kelewatan automatik', 'Tindakan lewat: ' || p.next_action,
        'Tarikh sasaran projek telah berlalu. Semak punca kelewatan dan tetapkan tarikh baharu.',
        p.next_due, 'Menunggu semakan', 'Dalaman BKP Sabah'
      FROM projects p
      WHERE p.status != 'Ditutup' AND p.next_due IS NOT NULL AND date(p.next_due) < date('now')
        AND NOT EXISTS (
          SELECT 1 FROM actions a WHERE a.project_id = p.id
            AND a.type = 'Kelewatan automatik' AND a.status != 'Selesai'
        )`),
    env.DB.prepare(`INSERT INTO actions (project_id, type, title, detail, due_date, status, external_target)
      SELECT p.id, 'Pengesahan berkala', 'Sahkan kemajuan projek',
        'Rekod tidak dikemas kini selama 30 hari. Penyelidik boleh mengesahkan tiada perubahan.',
        date('now'), 'Menunggu semakan', 'Dalaman BKP Sabah'
      FROM projects p
      WHERE p.status != 'Ditutup' AND julianday('now') - julianday(p.last_updated_at) >= 30
        AND NOT EXISTS (
          SELECT 1 FROM actions a WHERE a.project_id = p.id
            AND a.type = 'Pengesahan berkala' AND a.status != 'Selesai'
        )`),
    env.DB.prepare(`INSERT INTO actions (project_id, type, title, detail, due_date, status, external_target)
      SELECT a.project_id, 'Kelulusan hampir tamat', 'Semak tempoh sah: ' || a.agency,
        'Kelulusan akan tamat dalam masa 30 hari. Sediakan tindakan pembaharuan jika berkenaan.',
        a.expiry_date, 'Menunggu semakan', a.agency
      FROM approvals a
      WHERE a.expiry_date IS NOT NULL
        AND date(a.expiry_date) BETWEEN date('now') AND date('now', '+30 days')
        AND NOT EXISTS (
          SELECT 1 FROM actions x WHERE x.project_id = a.project_id
            AND x.type = 'Kelulusan hampir tamat' AND x.title = 'Semak tempoh sah: ' || a.agency
            AND x.status != 'Selesai'
        )`),
  ]);
}

export async function GET(request: Request) {
  try {
    if (await googleSheetsConfigured()) {
      const identity = currentIdentity(request);
      const data = await googleSheetsRequest<Record<string, unknown>>("dashboard", {
        actorEmail: identity.email,
        actorName: identity.name,
      });
      return Response.json({
        ...data,
        operatingMode: "production",
        dataSource: "google-sheets",
        generatedAt: new Date().toISOString(),
      });
    }
    await prepareProductionData();
    const { env } = await import("cloudflare:workers");
    const [projects, approvals, milestones, documents, actions, audit] = await Promise.all([
      env.DB.prepare("SELECT * FROM projects ORDER BY created_at DESC, id DESC").all(),
      env.DB.prepare("SELECT * FROM approvals ORDER BY created_at DESC").all(),
      env.DB.prepare("SELECT * FROM milestones ORDER BY due_date ASC, id DESC").all(),
      env.DB.prepare("SELECT * FROM documents ORDER BY uploaded_at DESC").all(),
      env.DB.prepare("SELECT * FROM actions WHERE status != 'Selesai' ORDER BY due_date ASC, created_at DESC").all(),
      env.DB.prepare("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100").all(),
    ]);

    return Response.json({
      projects: projects.results,
      approvals: approvals.results,
      milestones: milestones.results,
      documents: documents.results,
      actions: actions.results,
      audit: audit.results,
      operatingMode: "production",
      dataSource: "d1-fallback",
      currentUser: { email: currentIdentity(request).email, name: currentIdentity(request).name, role: "Pentadbir" },
      permissions: { canManageUsers: true, canWrite: true, canApprove: true, canUpload: true, canExport: true },
      users: [],
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ralat tidak dijangka";
    return Response.json({ error: message }, { status: 500 });
  }
}
