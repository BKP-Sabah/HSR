const TABLES = {
  projects: "Projects",
  approvals: "Approvals",
  milestones: "Milestones",
  documents: "Documents",
  actions: "Actions",
  audit: "Audit_Log",
  users: "Users",
};

function doPost(e) {
  try {
    const request = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const expected = PropertiesService.getScriptProperties().getProperty("API_KEY");
    if (!expected || request.apiKey !== expected) return json_({ ok: false, error: "Akses tidak dibenarkan." });

    const action = String(request.action || "");
    const payload = request.payload || {};
    if (action === "dashboard") {
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try { runAutomations_(); } finally { lock.releaseLock(); }
      return json_({ ok: true, data: dashboard_(payload) });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (action === "workflow") return json_({ ok: true, data: workflow_(payload) });
      if (action === "import_projects") return json_({ ok: true, data: importProjects_(payload) });
      if (action === "upload_document") return json_({ ok: true, data: uploadDocument_(payload) });
      if (action === "get_document") return json_({ ok: true, data: getDocument_(payload) });
      throw new Error("Tindakan tidak dikenali.");
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return json_({ ok: false, error: error && error.message ? error.message : String(error) });
  }
}

function dashboard_(payload) {
  const user = authorizedUser_(payload);
  return {
    projects: records_(TABLES.projects),
    approvals: records_(TABLES.approvals),
    milestones: records_(TABLES.milestones),
    documents: records_(TABLES.documents),
    actions: records_(TABLES.actions).filter(function (item) { return item.status !== "Selesai"; }),
    audit: records_(TABLES.audit).slice(-100).reverse(),
    currentUser: { email: user.email, name: user.name, role: user.role },
    permissions: permissions_(user.role),
    users: user.role === "Pentadbir" ? records_(TABLES.users) : [],
  };
}

function workflow_(payload) {
  const user = authorizedUser_(payload);
  const action = text_(payload.action);
  const actor = text_(payload.actor) || "Penyelaras HSR Negeri";
  const projectId = number_(payload.projectId);

  if (action === "manage_user") {
    requireRole_(user, ["Pentadbir"]);
    const email = text_(payload.userEmail).toLowerCase();
    const name = text_(payload.userName);
    const role = text_(payload.userRole);
    const active = payload.userActive !== false;
    if (!/^\S+@\S+\.\S+$/.test(email) || !name || ["Pentadbir", "Penyelaras", "Pembaca"].indexOf(role) < 0) throw new Error("Maklumat pengguna tidak sah.");
    const existing = records_(TABLES.users).find(function (item) { return String(item.email).toLowerCase() === email; });
    if (existing) {
      if (String(existing.role) === "Pentadbir" && (role !== "Pentadbir" || !active) && activeAdminCount_() <= 1) throw new Error("Sekurang-kurangnya seorang Pentadbir aktif mesti dikekalkan.");
      updateByField_(TABLES.users, "email", email, { name: name, role: role, active: active, updated_at: now_() });
      audit_(0, "Akses pengguna dikemas kini", email + " · " + role + " · " + (active ? "Aktif" : "Tidak aktif"), actor);
    } else {
      append_(TABLES.users, { email: email, name: name, role: role, active: active, created_at: now_(), updated_at: now_() });
      audit_(0, "Pengguna ditambah", email + " ditambah sebagai " + role + ".", actor);
    }
    return {};
  }

  requireRole_(user, ["Pentadbir", "Penyelaras"]);

  if (action === "create_project") {
    required_(payload, ["title", "principalInvestigator", "ptj", "category"]);
    const year = new Date().getFullYear();
    const prefix = "HSR-" + year + "-";
    const sequence = records_(TABLES.projects).reduce(function (max, item) {
      const id = String(item.research_id || "");
      return id.indexOf(prefix) === 0 ? Math.max(max, Number(id.slice(-3)) || 0) : max;
    }, 0) + 1;
    const researchId = prefix + String(sequence).padStart(3, "0");
    const id = nextId_(TABLES.projects);
    const due = dateOffset_(14);
    append_(TABLES.projects, {
      id: id, research_id: researchId, title: text_(payload.title),
      principal_investigator: text_(payload.principalInvestigator), ptj: text_(payload.ptj),
      category: text_(payload.category), status: "Menunggu semakan kelengkapan",
      progress: 8, risk: "Terkawal", next_action: "Semak kelengkapan proposal",
      next_due: due, last_updated_at: now_(), created_at: now_(), version: 1,
    });
    [
      ["HSRAC Negeri", "Belum diputuskan"],
      ["NMRR / MREC", "Belum dimohon"],
      ["HSRAC Kebangsaan", "Belum dimohon"],
    ].forEach(function (entry) {
      append_(TABLES.approvals, { id: nextId_(TABLES.approvals), project_id: id, agency: entry[0], status: entry[1], reference_no: "", decision_date: "", expiry_date: "", verified: 0, created_at: now_() });
    });
    append_(TABLES.milestones, { id: nextId_(TABLES.milestones), project_id: id, title: "Semakan kelengkapan proposal", due_date: due, status: "Belum bermula", created_at: now_() });
    audit_(id, "Projek didaftarkan", researchId + " diwujudkan dan senarai semak asas dijana.", actor);
    return { researchId: researchId };
  }

  if (action === "update_project_details") {
    requireId_(projectId); required_(payload, ["title", "principalInvestigator", "ptj", "category"]);
    updateById_(TABLES.projects, projectId, { title: text_(payload.title), principal_investigator: text_(payload.principalInvestigator), ptj: text_(payload.ptj), category: text_(payload.category), last_updated_at: now_() });
    audit_(projectId, "Maklumat projek dikemas kini", "Metadata utama projek telah disemak semula.", actor);
    return {};
  }

  if (action === "update_status") {
    requireId_(projectId);
    const status = text_(payload.status);
    updateById_(TABLES.projects, projectId, {
      status: status, progress: Math.max(0, Math.min(100, Number(payload.progress) || 0)),
      risk: text_(payload.risk) || "Terkawal", next_action: text_(payload.nextAction) || "Semak tindakan seterusnya",
      next_due: text_(payload.nextDue), last_updated_at: now_(),
    });
    audit_(projectId, "Status dikemas kini", "Status ditukar kepada “" + status + "”. Tiada sistem luar diubah.", actor);
    if (/NMRR|MREC|HSRAC Kebangsaan/.test(status) && !hasOpenAction_(projectId, "Semak tindakan bagi " + status)) {
      append_(TABLES.actions, { id: nextId_(TABLES.actions), project_id: projectId, type: "Tindakan luar", title: "Semak tindakan bagi " + status, detail: "Pelaksanaan pada sistem luar memerlukan kelulusan manual.", due_date: text_(payload.nextDue), status: "Menunggu semakan", external_target: status, created_at: now_() });
    }
    return {};
  }

  if (action === "add_milestone") {
    requireId_(projectId); if (!text_(payload.title)) throw new Error("Tajuk milestone diperlukan.");
    append_(TABLES.milestones, { id: nextId_(TABLES.milestones), project_id: projectId, title: text_(payload.title), due_date: text_(payload.dueDate), status: "Belum bermula", created_at: now_() });
    audit_(projectId, "Milestone ditambah", text_(payload.title), actor); return {};
  }
  if (action === "complete_milestone") {
    updateById_(TABLES.milestones, number_(payload.milestoneId), { status: "Selesai" });
    audit_(projectId, "Milestone diselesaikan", text_(payload.title) || "Milestone ditandakan selesai.", actor); return {};
  }
  if (action === "confirm_no_change") {
    requireId_(projectId); updateById_(TABLES.projects, projectId, { last_updated_at: now_() });
    updateMatching_(TABLES.actions, function (item) { return Number(item.project_id) === projectId && item.type === "Pengesahan berkala" && item.status !== "Selesai"; }, { status: "Selesai" });
    audit_(projectId, "Pengesahan berkala", "Penyelidik mengesahkan tiada perubahan pada tempoh ini.", actor); return {};
  }
  if (action === "verify_approval") {
    updateById_(TABLES.approvals, number_(payload.approvalId), { status: text_(payload.status) || "Diluluskan", reference_no: text_(payload.referenceNo), decision_date: text_(payload.decisionDate) || dateOffset_(0), expiry_date: text_(payload.expiryDate), verified: 1 });
    audit_(projectId, "Kelulusan disahkan", "Rekod kelulusan dalaman disahkan sebagai “" + (text_(payload.status) || "Diluluskan") + "”.", actor); return {};
  }
  if (action === "approve_action" || action === "complete_action") {
    updateById_(TABLES.actions, number_(payload.actionId), { status: action === "approve_action" ? "Diluluskan dalaman — belum dihantar" : "Selesai" });
    audit_(projectId, action === "approve_action" ? "Tindakan diluluskan secara dalaman" : "Tindakan ditutup", action === "approve_action" ? "Belum dihantar atau dilaksanakan pada sistem luar." : (text_(payload.title) || "Tindakan telah diselesaikan."), actor); return {};
  }
  if (action === "verify_document") {
    updateById_(TABLES.documents, number_(payload.documentId), { status: "Disahkan" });
    audit_(projectId, "Dokumen disahkan", text_(payload.fileName) || "Dokumen telah disemak dan disahkan.", actor); return {};
  }
  throw new Error("Tindakan tidak dikenali.");
}

function importProjects_(payload) {
  requireRole_(authorizedUser_(payload), ["Pentadbir", "Penyelaras"]);
  const rows = payload.rows || [];
  if (!Array.isArray(rows) || !rows.length) throw new Error("Fail import tidak mempunyai rekod.");
  if (rows.length > 300) throw new Error("Maksimum 300 projek bagi setiap import.");
  const existing = {};
  records_(TABLES.projects).forEach(function (item) { existing[String(item.research_id)] = true; });
  let imported = 0;
  rows.forEach(function (source, index) {
    const researchId = text_(source.research_id);
    if (!researchId || !text_(source.title) || !text_(source.principal_investigator) || !text_(source.ptj)) throw new Error("Baris " + (index + 2) + ": medan wajib tidak lengkap.");
    if (existing[researchId]) return;
    const id = nextId_(TABLES.projects);
    append_(TABLES.projects, { id: id, research_id: researchId, title: text_(source.title), principal_investigator: text_(source.principal_investigator), ptj: text_(source.ptj), category: text_(source.category) || "Health Systems", status: text_(source.status) || "Draf pendaftaran", progress: Math.max(0, Math.min(100, Number(source.progress) || 0)), risk: text_(source.risk) || "Terkawal", next_action: text_(source.next_action) || "Semak tindakan seterusnya", next_due: text_(source.next_due), last_updated_at: now_(), created_at: now_(), version: 1 });
    [["HSRAC Negeri","Belum diputuskan"],["NMRR / MREC","Belum dimohon"],["HSRAC Kebangsaan","Belum dimohon"]].forEach(function (entry) { append_(TABLES.approvals, { id: nextId_(TABLES.approvals), project_id: id, agency: entry[0], status: entry[1], reference_no: "", decision_date: "", expiry_date: "", verified: 0, created_at: now_() }); });
    audit_(id, "Projek diimport", "Rekod dimasukkan melalui import CSV.", text_(payload.actor) || "Penyelaras HSR Negeri");
    existing[researchId] = true; imported += 1;
  });
  return { imported: imported, skipped: rows.length - imported };
}

function uploadDocument_(payload) {
  requireRole_(authorizedUser_(payload), ["Pentadbir", "Penyelaras"]);
  const projectId = number_(payload.projectId); requireId_(projectId);
  if (!text_(payload.fileName) || !text_(payload.data)) throw new Error("Fail tidak sah.");
  const folder = documentFolder_();
  const bytes = Utilities.base64Decode(text_(payload.data));
  if (bytes.length > 10 * 1024 * 1024) throw new Error("Saiz fail melebihi had 10 MB.");
  const blob = Utilities.newBlob(bytes, text_(payload.mimeType) || "application/octet-stream", text_(payload.fileName));
  const file = folder.createFile(blob);
  const sameType = records_(TABLES.documents).filter(function (item) { return Number(item.project_id) === projectId && item.type === (text_(payload.type) || "Dokumen sokongan"); });
  const id = nextId_(TABLES.documents);
  append_(TABLES.documents, { id: id, project_id: projectId, type: text_(payload.type) || "Dokumen sokongan", file_name: text_(payload.fileName), drive_file_id: file.getId(), drive_url: file.getUrl(), mime_type: text_(payload.mimeType), status: "Menunggu pengesahan", version: sameType.length + 1, uploaded_by: text_(payload.actor) || "Penyelaras HSR Negeri", uploaded_at: now_() });
  audit_(projectId, "Dokumen dimuat naik", (text_(payload.type) || "Dokumen sokongan") + ": " + text_(payload.fileName), text_(payload.actor) || "Penyelaras HSR Negeri");
  return { id: id, drive_url: file.getUrl() };
}

function getDocument_(payload) {
  authorizedUser_(payload);
  const item = records_(TABLES.documents).find(function (row) { return Number(row.id) === number_(payload.id); });
  if (!item) throw new Error("Dokumen tidak ditemui.");
  return { drive_url: item.drive_url };
}

function runAutomations_() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  records_(TABLES.projects).forEach(function (project) {
    if (project.status === "Ditutup") return;
    const due = parseDate_(project.next_due);
    if (due && due < today) {
      updateById_(TABLES.projects, Number(project.id), { risk: "Lewat" });
      const title = "Tindakan lewat: " + (project.next_action || "Semak tindakan seterusnya");
      if (!hasOpenAction_(Number(project.id), title)) append_(TABLES.actions, { id: nextId_(TABLES.actions), project_id: Number(project.id), type: "Kelewatan automatik", title: title, detail: "Tarikh sasaran projek telah berlalu. Semak punca kelewatan dan tetapkan tarikh baharu.", due_date: project.next_due, status: "Menunggu semakan", external_target: "Dalaman BKP Sabah", created_at: now_() });
    } else if (due && (due - today) / 86400000 <= 14 && project.risk === "Terkawal") updateById_(TABLES.projects, Number(project.id), { risk: "Perhatian" });
    const updated = parseDate_(project.last_updated_at);
    if (updated && (today - updated) / 86400000 >= 30 && !hasOpenAction_(Number(project.id), "Sahkan kemajuan projek")) append_(TABLES.actions, { id: nextId_(TABLES.actions), project_id: Number(project.id), type: "Pengesahan berkala", title: "Sahkan kemajuan projek", detail: "Rekod tidak dikemas kini selama 30 hari.", due_date: dateOffset_(0), status: "Menunggu semakan", external_target: "Dalaman BKP Sabah", created_at: now_() });
  });
  records_(TABLES.approvals).forEach(function (approval) {
    const expiry = parseDate_(approval.expiry_date);
    const days = expiry ? (expiry - today) / 86400000 : 9999;
    const title = "Semak tempoh sah: " + approval.agency;
    if (days >= 0 && days <= 30 && !hasOpenAction_(Number(approval.project_id), title)) append_(TABLES.actions, { id: nextId_(TABLES.actions), project_id: Number(approval.project_id), type: "Kelulusan hampir tamat", title: title, detail: "Kelulusan akan tamat dalam masa 30 hari.", due_date: approval.expiry_date, status: "Menunggu semakan", external_target: approval.agency, created_at: now_() });
  });
}

function records_(name) {
  const sheet = sheet_(name); const lastRow = sheet.getLastRow(); const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];
  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues(); const headers = values.shift();
  return values.filter(function (row) { return row.some(function (value) { return value !== ""; }); }).map(function (row) {
    const item = {}; headers.forEach(function (header, index) { if (header) item[String(header)] = normalize_(row[index]); }); return item;
  });
}
function append_(name, item) { const sheet = sheet_(name); const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]; sheet.appendRow(headers.map(function (header) { return item[header] === undefined ? "" : item[header]; })); }
function updateById_(name, id, patch) { if (!id) throw new Error("Rekod tidak sah."); const sheet = sheet_(name); const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]; const idColumn = headers.indexOf("id") + 1; const finder = sheet.getRange(2, idColumn, Math.max(1, sheet.getLastRow() - 1), 1).createTextFinder(String(id)).matchEntireCell(true).findNext(); if (!finder) throw new Error("Rekod tidak ditemui."); const row = finder.getRow(); Object.keys(patch).forEach(function (key) { const column = headers.indexOf(key) + 1; if (column > 0) sheet.getRange(row, column).setValue(patch[key]); }); }
function updateMatching_(name, predicate, patch) { records_(name).forEach(function (item) { if (predicate(item)) updateById_(name, Number(item.id), patch); }); }
function updateByField_(name, field, value, patch) { const sheet = sheet_(name); const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]; const columnIndex = headers.indexOf(field) + 1; if (columnIndex < 1) throw new Error("Medan tidak ditemui."); const finder = sheet.getRange(2, columnIndex, Math.max(1, sheet.getLastRow() - 1), 1).createTextFinder(String(value)).matchCase(false).matchEntireCell(true).findNext(); if (!finder) throw new Error("Rekod tidak ditemui."); const row = finder.getRow(); Object.keys(patch).forEach(function (key) { const column = headers.indexOf(key) + 1; if (column > 0) sheet.getRange(row, column).setValue(patch[key]); }); }
function nextId_(name) { return records_(name).reduce(function (max, item) { return Math.max(max, Number(item.id) || 0); }, 0) + 1; }
function sheet_(name) { const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); if (!sheet) throw new Error("Tab " + name + " tidak ditemui."); return sheet; }
function audit_(projectId, action, detail, actor) { append_(TABLES.audit, { id: nextId_(TABLES.audit), project_id: projectId || "", action: action, detail: detail, actor: actor, created_at: now_(), before_json: "", after_json: "" }); }
function hasOpenAction_(projectId, title) { return records_(TABLES.actions).some(function (item) { return Number(item.project_id) === projectId && item.title === title && item.status !== "Selesai"; }); }
function documentFolder_() { const properties = PropertiesService.getScriptProperties(); const id = properties.getProperty("DRIVE_FOLDER_ID"); if (id) return DriveApp.getFolderById(id); const folder = DriveApp.createFolder("Dokumen Penyelidikan BKP Sabah"); properties.setProperty("DRIVE_FOLDER_ID", folder.getId()); return folder; }
function authorizedUser_(payload) { const email = text_(payload && payload.actorEmail).toLowerCase(); if (!email) throw new Error("Identiti pengguna tidak diterima daripada hos aplikasi."); const user = records_(TABLES.users).find(function (item) { return String(item.email).toLowerCase() === email; }); if (!user || !truthy_(user.active)) throw new Error("Akaun anda belum diberikan akses kepada sistem BKP Sabah."); return user; }
function requireRole_(user, roles) { if (roles.indexOf(String(user.role)) < 0) throw new Error("Peranan " + user.role + " tidak dibenarkan melakukan tindakan ini."); }
function permissions_(role) { return { canManageUsers: role === "Pentadbir", canWrite: role === "Pentadbir" || role === "Penyelaras", canApprove: role === "Pentadbir" || role === "Penyelaras", canUpload: role === "Pentadbir" || role === "Penyelaras", canExport: true }; }
function activeAdminCount_() { return records_(TABLES.users).filter(function (item) { return item.role === "Pentadbir" && truthy_(item.active); }).length; }
function truthy_(value) { return value === true || String(value).toLowerCase() === "true" || Number(value) === 1; }
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function text_(value) { return value === null || value === undefined ? "" : String(value).trim(); }
function number_(value) { const number = Number(value); return Number.isInteger(number) && number > 0 ? number : 0; }
function requireId_(id) { if (!id) throw new Error("Projek tidak sah."); }
function required_(payload, keys) { keys.forEach(function (key) { if (!text_(payload[key])) throw new Error("Lengkapkan semua medan wajib."); }); }
function now_() { return Utilities.formatDate(new Date(), "Asia/Kuala_Lumpur", "yyyy-MM-dd'T'HH:mm:ssXXX"); }
function dateOffset_(days) { const date = new Date(); date.setDate(date.getDate() + days); return Utilities.formatDate(date, "Asia/Kuala_Lumpur", "yyyy-MM-dd"); }
function parseDate_(value) { if (!value) return null; const date = value instanceof Date ? value : new Date(String(value)); return isNaN(date.getTime()) ? null : date; }
function normalize_(value) { return value instanceof Date ? Utilities.formatDate(value, "Asia/Kuala_Lumpur", "yyyy-MM-dd'T'HH:mm:ssXXX") : value; }
