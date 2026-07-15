type GoogleSheetsEnv = {
  GOOGLE_APPS_SCRIPT_URL?: string;
  GOOGLE_APPS_SCRIPT_API_KEY?: string;
};

export async function googleSheetsConfigured() {
  const { env } = await import("cloudflare:workers");
  const config = env as unknown as GoogleSheetsEnv;
  return Boolean(config.GOOGLE_APPS_SCRIPT_URL && config.GOOGLE_APPS_SCRIPT_API_KEY);
}

export async function googleSheetsRequest<T>(action: string, payload: Record<string, unknown> = {}) {
  const { env } = await import("cloudflare:workers");
  const config = env as unknown as GoogleSheetsEnv;
  if (!config.GOOGLE_APPS_SCRIPT_URL || !config.GOOGLE_APPS_SCRIPT_API_KEY) {
    throw new Error("Sambungan Google Sheets belum dikonfigurasi.");
  }

  const response = await fetch(config.GOOGLE_APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      apiKey: config.GOOGLE_APPS_SCRIPT_API_KEY,
      action,
      payload,
    }),
    redirect: "follow",
  });
  const text = await response.text();
  let result: { ok?: boolean; data?: T; error?: string };
  try {
    result = JSON.parse(text) as typeof result;
  } catch {
    throw new Error("Google Apps Script memulangkan respons yang tidak sah.");
  }
  if (!response.ok || !result.ok) throw new Error(result.error || "Permintaan Google Sheets gagal.");
  return result.data as T;
}
