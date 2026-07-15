import { ensureSchema } from "../_schema";
import { googleSheetsConfigured, googleSheetsRequest } from "../_google-sheets";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET() {
  try {
    let projectRows: Record<string, unknown>[];
    let approvalRows: Record<string, unknown>[];
    if (await googleSheetsConfigured()) {
      const dashboard = await googleSheetsRequest<{ projects: Record<string, unknown>[]; approvals: Record<string, unknown>[] }>("dashboard");
      projectRows = dashboard.projects;
      approvalRows = dashboard.approvals;
    } else {
      await ensureSchema();
      const { env } = await import("cloudflare:workers");
      const [projects, approvals] = await Promise.all([
        env.DB.prepare("SELECT * FROM projects ORDER BY research_id ASC").all<Record<string, unknown>>(),
        env.DB.prepare("SELECT * FROM approvals ORDER BY project_id, id").all<Record<string, unknown>>(),
      ]);
      projectRows = projects.results;
      approvalRows = approvals.results;
    }
    const approvalMap = new Map<number, Map<string, Record<string, unknown>>>();
    for (const approval of approvalRows) {
      const projectId = Number(approval.project_id);
      if (!approvalMap.has(projectId)) approvalMap.set(projectId, new Map());
      approvalMap.get(projectId)!.set(String(approval.agency), approval);
    }

    const headers = [
      "research_id", "title", "principal_investigator", "ptj", "category", "status", "progress", "risk",
      "next_action", "next_due", "hsrac_negeri_status", "hsrac_negeri_reference", "nmrr_mrec_status",
      "nmrr_mrec_reference", "hsrac_kebangsaan_status", "hsrac_kebangsaan_reference", "last_updated_at",
    ];
    const lines = [headers.map(csvCell).join(",")];
    for (const project of projectRows.sort((a, b) => String(a.research_id).localeCompare(String(b.research_id)))) {
      const map = approvalMap.get(Number(project.id));
      const negeri = map?.get("HSRAC Negeri");
      const nmrr = map?.get("NMRR / MREC");
      const kebangsaan = map?.get("HSRAC Kebangsaan");
      lines.push([
        project.research_id, project.title, project.principal_investigator, project.ptj, project.category,
        project.status, project.progress, project.risk, project.next_action, project.next_due,
        negeri?.status, negeri?.reference_no, nmrr?.status, nmrr?.reference_no,
        kebangsaan?.status, kebangsaan?.reference_no, project.last_updated_at,
      ].map(csvCell).join(","));
    }

    return new Response(`\uFEFF${lines.join("\r\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="BKP-Sabah-HSR-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Eksport gagal";
    return Response.json({ error: message }, { status: 500 });
  }
}
