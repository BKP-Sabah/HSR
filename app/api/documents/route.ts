import { currentActor, currentIdentity, jsonError, writeAudit } from "../_shared";
import { ensureSchema } from "../_schema";
import { googleSheetsConfigured, googleSheetsRequest } from "../_google-sheets";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      projectId?: number;
      type?: string;
      fileName?: string;
      mimeType?: string;
      data?: string;
    };
    const projectId = Number(payload.projectId);
    const type = payload.type?.trim() || "Dokumen sokongan";
    const fileName = payload.fileName?.trim() || "";
    const mimeType = payload.mimeType?.trim() || "application/octet-stream";
    const bytes = Uint8Array.from(atob(payload.data || ""), (char) => char.charCodeAt(0));
    if (!fileName || !Number.isInteger(projectId) || projectId < 1) {
      return jsonError("Pilih projek dan fail yang sah.");
    }
    if (bytes.byteLength === 0) return jsonError("Fail kosong atau tidak sah.");
    if (bytes.byteLength > 10 * 1024 * 1024) return jsonError("Saiz fail melebihi had 10 MB.");

    if (await googleSheetsConfigured()) {
      await googleSheetsRequest("upload_document", {
        ...payload,
        projectId,
        type,
        fileName,
        mimeType,
        actor: currentActor(request),
        actorEmail: currentIdentity(request).email,
      });
      return Response.json({ ok: true });
    }

    await ensureSchema();
    const { env } = await import("cloudflare:workers");

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-100);
    const storageKey = `research/${projectId}/${Date.now()}-${safeName}`;
    await env.BUCKET.put(storageKey, bytes.buffer, {
      httpMetadata: { contentType: mimeType },
    });

    const versionRow = await env.DB.prepare(
      "SELECT COALESCE(MAX(version), 0) + 1 AS version FROM documents WHERE project_id = ? AND type = ?",
    )
      .bind(projectId, type)
      .first<{ version: number }>();
    const actor = currentActor(request);
    await env.DB.prepare(
      `INSERT INTO documents
      (project_id, type, file_name, storage_key, mime_type, status, version, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(projectId, type, fileName, storageKey, mimeType, "Menunggu pengesahan", versionRow?.version ?? 1, actor)
      .run();
    await writeAudit(projectId, "Dokumen dimuat naik", `${type}: ${fileName}`, actor);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Muat naik gagal";
    return jsonError(message, 500);
  }
}

export async function GET(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id < 1) return jsonError("Dokumen tidak sah.");
    if (await googleSheetsConfigured()) {
      const identity = currentIdentity(request);
      const document = await googleSheetsRequest<{ drive_url?: string }>("get_document", { id, actorEmail: identity.email, actorName: identity.name });
      if (!document.drive_url) return jsonError("Pautan dokumen tidak ditemui.", 404);
      return Response.redirect(document.drive_url, 302);
    }
    await ensureSchema();
    const { env } = await import("cloudflare:workers");
    const metadata = await env.DB.prepare(
      "SELECT storage_key, file_name, mime_type FROM documents WHERE id = ?",
    )
      .bind(id)
      .first<{ storage_key: string; file_name: string; mime_type: string }>();
    if (!metadata) return jsonError("Dokumen tidak ditemui.", 404);
    const object = await env.BUCKET.get(metadata.storage_key);
    if (!object) return jsonError("Fail dokumen tidak ditemui.", 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": metadata.mime_type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${metadata.file_name.replace(/\"/g, "")}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dokumen gagal dibuka";
    return jsonError(message, 500);
  }
}
