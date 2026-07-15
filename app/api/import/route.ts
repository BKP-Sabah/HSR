import { currentActor, jsonError, STATUS_FLOW } from "../_shared";
import { ensureSchema } from "../_schema";
import { googleSheetsConfigured, googleSheetsRequest } from "../_google-sheets";

type ImportRow = {
  research_id?: string;
  title?: string;
  principal_investigator?: string;
  ptj?: string;
  category?: string;
  status?: string;
  progress?: string | number;
  risk?: string;
  next_action?: string;
  next_due?: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function chunks<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { rows?: ImportRow[] };
    if (!Array.isArray(payload.rows) || payload.rows.length === 0) return jsonError("Fail import tidak mempunyai rekod.");
    if (payload.rows.length > 300) return jsonError("Maksimum 300 projek bagi setiap import.");

    if (await googleSheetsConfigured()) {
      const data = await googleSheetsRequest<{ imported: number; skipped: number }>("import_projects", {
        rows: payload.rows,
        actor: currentActor(request),
      });
      return Response.json({ ok: true, ...data });
    }

    await ensureSchema();

    const rows = payload.rows.map((row, index) => {
      const researchId = clean(row.research_id);
      const title = clean(row.title);
      const principalInvestigator = clean(row.principal_investigator);
      const ptj = clean(row.ptj);
      const category = clean(row.category) || "Health Systems";
      if (!researchId || !title || !principalInvestigator || !ptj) {
        throw new Error(`Baris ${index + 2}: research_id, title, principal_investigator dan ptj diperlukan.`);
      }
      if (!/^[A-Za-z0-9./_-]{3,40}$/.test(researchId)) throw new Error(`Baris ${index + 2}: format research_id tidak sah.`);
      const requestedStatus = clean(row.status);
      const status = STATUS_FLOW.includes(requestedStatus as (typeof STATUS_FLOW)[number]) ? requestedStatus : "Draf pendaftaran";
      const progress = Math.max(0, Math.min(100, Number(row.progress) || 0));
      const requestedRisk = clean(row.risk);
      const risk = ["Terkawal", "Perhatian", "Lewat"].includes(requestedRisk) ? requestedRisk : "Terkawal";
      return {
        researchId,
        title,
        principalInvestigator,
        ptj,
        category,
        status,
        progress,
        risk,
        nextAction: clean(row.next_action) || "Semak tindakan seterusnya",
        nextDue: clean(row.next_due) || null,
      };
    });

    const { env } = await import("cloudflare:workers");
    const actor = currentActor(request);
    const before = await env.DB.prepare("SELECT COUNT(*) AS total FROM projects").first<{ total: number }>();

    for (const group of chunks(rows, 25)) {
      await env.DB.batch(group.map((row) => env.DB.prepare(
        `INSERT OR IGNORE INTO projects
        (research_id, title, principal_investigator, ptj, category, status, progress, risk, next_action, next_due)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(row.researchId, row.title, row.principalInvestigator, row.ptj, row.category, row.status, row.progress, row.risk, row.nextAction, row.nextDue)));

      await env.DB.batch(group.flatMap((row) => [
        env.DB.prepare(`INSERT INTO approvals (project_id, agency, status)
          SELECT id, 'HSRAC Negeri', 'Belum diputuskan' FROM projects p
          WHERE p.research_id = ? AND NOT EXISTS (SELECT 1 FROM approvals a WHERE a.project_id = p.id AND a.agency = 'HSRAC Negeri')`).bind(row.researchId),
        env.DB.prepare(`INSERT INTO approvals (project_id, agency, status)
          SELECT id, 'NMRR / MREC', 'Belum dimohon' FROM projects p
          WHERE p.research_id = ? AND NOT EXISTS (SELECT 1 FROM approvals a WHERE a.project_id = p.id AND a.agency = 'NMRR / MREC')`).bind(row.researchId),
        env.DB.prepare(`INSERT INTO approvals (project_id, agency, status)
          SELECT id, 'HSRAC Kebangsaan', 'Belum dimohon' FROM projects p
          WHERE p.research_id = ? AND NOT EXISTS (SELECT 1 FROM approvals a WHERE a.project_id = p.id AND a.agency = 'HSRAC Kebangsaan')`).bind(row.researchId),
        env.DB.prepare(`INSERT INTO audit_log (project_id, action, detail, actor)
          SELECT id, 'Projek diimport', 'Rekod dimasukkan melalui import CSV.', ? FROM projects p
          WHERE p.research_id = ? AND NOT EXISTS (
            SELECT 1 FROM audit_log x WHERE x.project_id = p.id AND x.action = 'Projek diimport'
          )`).bind(actor, row.researchId),
      ]));
    }

    const after = await env.DB.prepare("SELECT COUNT(*) AS total FROM projects").first<{ total: number }>();
    const imported = Math.max(0, (after?.total ?? 0) - (before?.total ?? 0));
    return Response.json({ ok: true, imported, skipped: rows.length - imported });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import gagal";
    return jsonError(message, 400);
  }
}
