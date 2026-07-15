export const STATUS_FLOW = [
  "Draf pendaftaran",
  "Menunggu semakan kelengkapan",
  "Sedia untuk HSRAC Negeri",
  "Menunggu mesyuarat HSRAC Negeri",
  "Pindaan minor",
  "Pindaan major",
  "Disokong HSRAC Negeri",
  "Menunggu pendaftaran NMRR",
  "Menunggu kelulusan MREC",
  "Menunggu keputusan HSRAC Kebangsaan",
  "Diluluskan untuk pelaksanaan",
  "Pengumpulan data",
  "Analisis data",
  "Penulisan laporan",
  "Selesai — menunggu laporan akhir",
  "Ditutup",
] as const;

export function currentIdentity(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email");
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  if (encodedName && encoding === "percent-encoded-utf-8") {
    try {
      return { email: email ?? "", name: decodeURIComponent(encodedName) };
    } catch {
      // Fall through to the verified email identity.
    }
  }
  return { email: email ?? "", name: email ?? "Penyelaras HSR Negeri" };
}

export function currentActor(request: Request) {
  return currentIdentity(request).name;
}

export async function writeAudit(
  projectId: number | null,
  action: string,
  detail: string,
  actor: string,
) {
  const { env } = await import("cloudflare:workers");
  await env.DB.prepare(
    "INSERT INTO audit_log (project_id, action, detail, actor) VALUES (?, ?, ?, ?)",
  )
    .bind(projectId, action, detail, actor)
    .run();
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
