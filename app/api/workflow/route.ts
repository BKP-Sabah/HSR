import { currentActor, currentIdentity, jsonError, STATUS_FLOW, writeAudit } from "../_shared";
import { ensureSchema } from "../_schema";
import { googleSheetsConfigured, googleSheetsRequest } from "../_google-sheets";

type Payload = Record<string, unknown>;

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(request: Request) {
  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return jsonError("Data permintaan tidak sah.");
  }

  const action = asText(payload.action);
  const actor = currentActor(request);

  if (await googleSheetsConfigured()) {
    try {
      const identity = currentIdentity(request);
      const data = await googleSheetsRequest<Record<string, unknown>>("workflow", { ...payload, actor, actorEmail: identity.email });
      return Response.json({ ok: true, ...data });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Google Sheets gagal dikemas kini.", 500);
    }
  }

  try {
    await ensureSchema();
    const { env } = await import("cloudflare:workers");
    if (action === "create_project") {
      const title = asText(payload.title);
      const principalInvestigator = asText(payload.principalInvestigator);
      const ptj = asText(payload.ptj);
      const category = asText(payload.category);
      if (!title || !principalInvestigator || !ptj || !category) {
        return jsonError("Lengkapkan tajuk, penyelidik utama, PTJ dan kategori.");
      }

      const year = new Date().getFullYear();
      const sequence = await env.DB.prepare(
        "SELECT COALESCE(MAX(CAST(SUBSTR(research_id, -3) AS INTEGER)), 0) AS last_number FROM projects WHERE research_id LIKE ?",
      )
        .bind(`HSR-${year}-%`)
        .first<{ last_number: number }>();
      const researchId = `HSR-${year}-${String((sequence?.last_number ?? 0) + 1).padStart(3, "0")}`;
      const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      const result = await env.DB.prepare(
        `INSERT INTO projects
        (research_id, title, principal_investigator, ptj, category, status, progress, risk, next_action, next_due)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      )
        .bind(researchId, title, principalInvestigator, ptj, category, "Menunggu semakan kelengkapan", 8, "Terkawal", "Semak kelengkapan proposal", due)
        .first<{ id: number }>();
      if (!result?.id) throw new Error("Rekod projek gagal diwujudkan.");

      await env.DB.batch([
        env.DB.prepare("INSERT INTO approvals (project_id, agency, status) VALUES (?, ?, ?)").bind(result.id, "HSRAC Negeri", "Belum diputuskan"),
        env.DB.prepare("INSERT INTO approvals (project_id, agency, status) VALUES (?, ?, ?)").bind(result.id, "NMRR / MREC", "Belum dimohon"),
        env.DB.prepare("INSERT INTO approvals (project_id, agency, status) VALUES (?, ?, ?)").bind(result.id, "HSRAC Kebangsaan", "Belum dimohon"),
        env.DB.prepare("INSERT INTO milestones (project_id, title, due_date, status) VALUES (?, ?, ?, ?)").bind(result.id, "Semakan kelengkapan proposal", due, "Belum bermula"),
      ]);
      await writeAudit(result.id, "Projek didaftarkan", `${researchId} diwujudkan dan senarai semak asas dijana.`, actor);
      return Response.json({ ok: true, researchId });
    }

    const projectId = asId(payload.projectId);

    if (action === "update_project_details") {
      if (!projectId) return jsonError("Projek tidak sah.");
      const title = asText(payload.title);
      const principalInvestigator = asText(payload.principalInvestigator);
      const ptj = asText(payload.ptj);
      const category = asText(payload.category);
      if (!title || !principalInvestigator || !ptj || !category) {
        return jsonError("Lengkapkan tajuk, penyelidik utama, PTJ dan kategori.");
      }
      await env.DB.prepare(
        "UPDATE projects SET title = ?, principal_investigator = ?, ptj = ?, category = ?, last_updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).bind(title, principalInvestigator, ptj, category, projectId).run();
      await writeAudit(projectId, "Maklumat projek dikemas kini", "Metadata utama projek telah disemak semula.", actor);
      return Response.json({ ok: true });
    }

    if (action === "update_status") {
      if (!projectId) return jsonError("Projek tidak sah.");
      const status = asText(payload.status);
      if (!STATUS_FLOW.includes(status as (typeof STATUS_FLOW)[number])) return jsonError("Status tidak dibenarkan.");
      const progress = Math.max(0, Math.min(100, Number(payload.progress) || 0));
      const nextAction = asText(payload.nextAction) || "Semak tindakan seterusnya";
      const nextDue = asText(payload.nextDue) || null;
      const risk = asText(payload.risk) || "Terkawal";
      await env.DB.prepare(
        "UPDATE projects SET status = ?, progress = ?, risk = ?, next_action = ?, next_due = ?, last_updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      )
        .bind(status, progress, risk, nextAction, nextDue, projectId)
        .run();
      await writeAudit(projectId, "Status dikemas kini", `Status ditukar kepada “${status}”. Tiada sistem luar diubah.`, actor);

      if (status.includes("NMRR") || status.includes("MREC") || status.includes("HSRAC Kebangsaan")) {
        await env.DB.prepare(
          `INSERT INTO actions (project_id, type, title, detail, due_date, status, external_target)
          SELECT ?, ?, ?, ?, ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1 FROM actions WHERE project_id = ? AND title = ? AND status != 'Selesai'
          )`,
        )
          .bind(projectId, "Tindakan luar", `Semak tindakan bagi ${status}`, "Sistem hanya menyediakan rekod dan draf. Pelaksanaan pada sistem luar memerlukan kelulusan manual.", nextDue, "Menunggu semakan", status, projectId, `Semak tindakan bagi ${status}`)
          .run();
      }
      return Response.json({ ok: true });
    }

    if (action === "add_milestone") {
      if (!projectId) return jsonError("Projek tidak sah.");
      const title = asText(payload.title);
      const dueDate = asText(payload.dueDate) || null;
      if (!title) return jsonError("Tajuk milestone diperlukan.");
      await env.DB.prepare(
        "INSERT INTO milestones (project_id, title, due_date, status) VALUES (?, ?, ?, 'Belum bermula')",
      ).bind(projectId, title, dueDate).run();
      await writeAudit(projectId, "Milestone ditambah", title, actor);
      return Response.json({ ok: true });
    }

    if (action === "complete_milestone") {
      const milestoneId = asId(payload.milestoneId);
      if (!milestoneId) return jsonError("Milestone tidak sah.");
      await env.DB.prepare("UPDATE milestones SET status = 'Selesai' WHERE id = ?").bind(milestoneId).run();
      await writeAudit(projectId, "Milestone diselesaikan", asText(payload.title) || "Milestone ditandakan selesai.", actor);
      return Response.json({ ok: true });
    }

    if (action === "confirm_no_change") {
      if (!projectId) return jsonError("Projek tidak sah.");
      await env.DB.prepare("UPDATE projects SET last_updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(projectId).run();
      await env.DB.prepare(
        "UPDATE actions SET status = 'Selesai' WHERE project_id = ? AND type = 'Pengesahan berkala' AND status != 'Selesai'",
      ).bind(projectId).run();
      await writeAudit(projectId, "Pengesahan berkala", "Penyelidik mengesahkan tiada perubahan pada tempoh ini.", actor);
      return Response.json({ ok: true });
    }

    if (action === "verify_approval") {
      const approvalId = asId(payload.approvalId);
      if (!approvalId || !projectId) return jsonError("Rekod kelulusan tidak sah.");
      const status = asText(payload.status) || "Diluluskan";
      const referenceNo = asText(payload.referenceNo) || null;
      const decisionDate = asText(payload.decisionDate) || new Date().toISOString().slice(0, 10);
      const expiryDate = asText(payload.expiryDate) || null;
      await env.DB.prepare(
        "UPDATE approvals SET status = ?, reference_no = ?, decision_date = ?, expiry_date = ?, verified = 1 WHERE id = ?",
      )
        .bind(status, referenceNo, decisionDate, expiryDate, approvalId)
        .run();
      await writeAudit(projectId, "Kelulusan disahkan", `Rekod kelulusan dalaman disahkan sebagai “${status}”.`, actor);
      return Response.json({ ok: true });
    }

    if (action === "approve_action") {
      const actionId = asId(payload.actionId);
      if (!actionId) return jsonError("Tindakan tidak sah.");
      await env.DB.prepare("UPDATE actions SET status = 'Diluluskan dalaman — belum dihantar' WHERE id = ?").bind(actionId).run();
      await writeAudit(projectId, "Tindakan diluluskan secara dalaman", "Draf telah diluluskan, tetapi belum dihantar atau dilaksanakan pada mana-mana sistem luar.", actor);
      return Response.json({ ok: true });
    }

    if (action === "complete_action") {
      const actionId = asId(payload.actionId);
      if (!actionId) return jsonError("Tindakan tidak sah.");
      await env.DB.prepare("UPDATE actions SET status = 'Selesai' WHERE id = ?").bind(actionId).run();
      await writeAudit(projectId, "Tindakan ditutup", asText(payload.title) || "Tindakan telah diselesaikan.", actor);
      return Response.json({ ok: true });
    }

    if (action === "verify_document") {
      const documentId = asId(payload.documentId);
      if (!documentId || !projectId) return jsonError("Dokumen tidak sah.");
      await env.DB.prepare("UPDATE documents SET status = 'Disahkan' WHERE id = ?").bind(documentId).run();
      await writeAudit(projectId, "Dokumen disahkan", asText(payload.fileName) || "Dokumen telah disemak dan disahkan.", actor);
      return Response.json({ ok: true });
    }

    return jsonError("Tindakan tidak dikenali.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ralat tidak dijangka";
    return jsonError(message, 500);
  }
}
