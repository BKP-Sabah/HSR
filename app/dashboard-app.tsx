"use client";

import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Clock3,
  Database,
  Download,
  FileCheck2,
  FileText,
  FlaskConical,
  FolderKanban,
  History,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";

type Project = {
  id: number;
  research_id: string;
  title: string;
  principal_investigator: string;
  ptj: string;
  category: string;
  status: string;
  progress: number;
  risk: string;
  next_action: string;
  next_due: string | null;
  last_updated_at: string;
};

type Approval = {
  id: number;
  project_id: number;
  agency: string;
  status: string;
  reference_no: string | null;
  decision_date: string | null;
  expiry_date: string | null;
  verified: number;
};

type Milestone = {
  id: number;
  project_id: number;
  title: string;
  due_date: string | null;
  status: string;
};

type DocumentRecord = {
  id: number;
  project_id: number;
  type: string;
  file_name: string;
  status: string;
  version: number;
  uploaded_by: string;
  uploaded_at: string;
};

type ActionItem = {
  id: number;
  project_id: number | null;
  type: string;
  title: string;
  detail: string;
  due_date: string | null;
  status: string;
  external_target: string | null;
};

type AuditItem = {
  id: number;
  project_id: number | null;
  action: string;
  detail: string;
  actor: string;
  created_at: string;
};

type DashboardData = {
  projects: Project[];
  approvals: Approval[];
  milestones: Milestone[];
  documents: DocumentRecord[];
  actions: ActionItem[];
  audit: AuditItem[];
  operatingMode: "production";
  dataSource?: "google-sheets" | "d1-fallback";
  generatedAt: string;
};

type Tab = "dashboard" | "projects" | "approvals" | "documents" | "audit";

const STATUS_FLOW = [
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
];

const navItems: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Ringkasan", icon: LayoutDashboard },
  { id: "projects", label: "Portfolio projek", icon: FolderKanban },
  { id: "approvals", label: "Kelulusan & tindakan", icon: ShieldCheck },
  { id: "documents", label: "Dokumen", icon: FileText },
  { id: "audit", label: "Log audit", icon: History },
];

function formatDate(value?: string | null, short = false) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ms-MY", {
    day: "numeric",
    month: short ? "short" : "long",
    year: "numeric",
  }).format(date);
}

function formatTime(value: string) {
  const date = new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z"));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ms-MY", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function dueLabel(value?: string | null) {
  if (!value) return "Tiada tarikh";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${value}T00:00:00`);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days < 0) return `${Math.abs(days)} hari lewat`;
  if (days === 0) return "Hari ini";
  if (days === 1) return "Esok";
  return `${days} hari lagi`;
}

function riskTone(risk: string) {
  if (risk === "Lewat") return "red";
  if (risk === "Perhatian") return "amber";
  return "green";
}

function statusTone(status: string) {
  if (/lewat|major|ditolak/i.test(status)) return "red";
  if (/menunggu|pindaan|belum/i.test(status)) return "amber";
  if (/disokong|diluluskan|disahkan|selesai|ditutup/i.test(status)) return "green";
  return "blue";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((part) => !/^(bin|binti|bt|dr)$/i.test(part))
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function Modal({ title, subtitle, onClose, children, wide = false }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><X size={20} /></button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

function EmptyState({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{detail}</p></div>;
}

export default function DashboardApp({ displayName }: { displayName: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("Semua");
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [approvalOpen, setApprovalOpen] = useState<Approval | null>(null);
  const [actionOpen, setActionOpen] = useState<ActionItem | null>(null);

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const result = (await response.json()) as DashboardData & { error?: string };
      if (!response.ok) throw new Error(result.error || "Data gagal dimuatkan.");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Data gagal dimuatkan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as DashboardData & { error?: string };
        if (!response.ok) throw new Error(result.error || "Data gagal dimuatkan.");
        return result;
      })
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : "Data gagal dimuatkan."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const workflow = async (payload: Record<string, unknown>, successMessage: string) => {
    setBusy(true);
    try {
      const response = await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Tindakan gagal.");
      setToast(successMessage);
      await loadData(true);
      return true;
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Tindakan gagal.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const filteredProjects = useMemo(() => {
    if (!data) return [];
    const query = search.toLowerCase();
    return data.projects.filter((project) => {
      const matches = !query || `${project.research_id} ${project.title} ${project.principal_investigator} ${project.ptj}`.toLowerCase().includes(query);
      return matches && (riskFilter === "Semua" || project.risk === riskFilter);
    });
  }, [data, search, riskFilter]);

  const activeProjects = data?.projects.filter((project) => project.status !== "Ditutup").length ?? 0;
  const approvalPending = data?.approvals.filter((approval) => !approval.verified).length ?? 0;
  const attentionProjects = data?.projects.filter((project) => project.risk !== "Terkawal").length ?? 0;
  const pendingDocuments = data?.documents.filter((doc) => doc.status !== "Disahkan").length ?? 0;
  const firstName = displayName.split(" ")[0] || "Penyelaras";

  const projectApprovals = (id: number) => data?.approvals.filter((item) => item.project_id === id) ?? [];
  const projectMilestones = (id: number) => data?.milestones.filter((item) => item.project_id === id) ?? [];
  const projectDocuments = (id: number) => data?.documents.filter((item) => item.project_id === id) ?? [];
  const projectById = (id: number | null) => data?.projects.find((item) => item.id === id);

  const openProject = (project: Project) => {
    setSelectedProject(project);
    setStatusOpen(false);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><FlaskConical size={22} strokeWidth={2.3} /></div>
          <div><strong>ResearchFlow</strong><span>BKP Sabah</span></div>
          <button className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Tutup menu"><X size={20} /></button>
        </div>
        <div className="workspace-pill">
          <span className="workspace-icon"><Building2 size={16} /></span>
          <div><small>Ruang kerja</small><strong>BKP Sabah</strong></div>
          <ChevronDown size={15} />
        </div>
        <nav className="main-nav" aria-label="Navigasi utama">
          <p className="nav-label">PENGURUSAN</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const count = item.id === "approvals" ? approvalPending : item.id === "documents" ? pendingDocuments : 0;
            return (
              <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setMenuOpen(false); }}>
                <Icon size={18} /><span>{item.label}</span>{count > 0 && <em>{count}</em>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-safety">
          <div className="safety-icon"><LockKeyhole size={17} /></div>
          <div><strong>Kawalan selamat aktif</strong><span>Sistem luar tidak diubah secara automatik</span></div>
        </div>
        <div className="sidebar-user">
          <div className="avatar">{initials(displayName)}</div>
          <div><strong>{displayName}</strong><span>Penyelaras HSR Negeri</span></div>
        </div>
      </aside>

      {menuOpen && <button className="mobile-scrim" aria-label="Tutup menu" onClick={() => setMenuOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Buka menu"><Menu size={22} /></button>
          <div className="global-search">
            <Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari ID, tajuk, penyelidik atau PTJ…" aria-label="Cari projek" />
            <kbd>⌘ K</kbd>
          </div>
          <div className="topbar-actions">
            <span className="sync-state"><CircleDot size={12} /> {data?.dataSource === "google-sheets" ? "Google Sheets aktif" : "Mod operasi sebenar"}</span>
            <button className="icon-btn notification-btn" aria-label="Notifikasi"><Bell size={19} />{approvalPending > 0 && <i />}</button>
            <button className="primary-btn" onClick={() => setCreateOpen(true)}><Plus size={17} /> Projek baharu</button>
          </div>
        </header>

        <div className="page-wrap">
          {loading ? (
            <div className="loading-screen"><span className="loader" /><p>Menyusun portfolio penyelidikan…</p></div>
          ) : error ? (
            <div className="error-panel"><AlertTriangle size={28} /><h2>Data tidak dapat dimuatkan</h2><p>{error}</p><button className="secondary-btn" onClick={() => void loadData()}><RefreshCw size={16} /> Cuba semula</button></div>
          ) : data && (
            <>
              {tab === "dashboard" && (
                <>
                  <section className="page-heading">
                    <div><p className="eyebrow">SELAMAT DATANG, {firstName.toUpperCase()}</p><h1>Portfolio penyelidikan negeri</h1><p>Pantau kemajuan, keputusan dan dokumen penting dalam satu ruang kerja.</p></div>
                    <div className="heading-meta"><span><CalendarDays size={16} /> {formatDate(new Date().toISOString())}</span><button onClick={() => void loadData(true)}><RefreshCw size={15} /> Segar semula</button></div>
                  </section>

                  <section className="safety-banner">
                    <div className="safety-banner-icon"><ShieldCheck size={20} /></div>
                    <div><strong>Mod kelulusan manual diaktifkan</strong><p>Automasi hanya menyediakan rekod, peringatan dan draf. Tiada penghantaran atau perubahan dibuat pada NMRR, MREC atau sistem luar tanpa semakan anda.</p></div>
                    <span>DIKAWAL</span>
                  </section>

                  {data.projects.length === 0 ? (
                    <ProductionEmpty onCreate={() => setCreateOpen(true)} onImport={() => setImportOpen(true)} />
                  ) : <>
                  <section className="metric-grid">
                    <MetricCard icon={<FlaskConical size={20} />} label="Projek aktif" value={activeProjects} note="Portfolio semasa" tone="teal" />
                    <MetricCard icon={<ShieldCheck size={20} />} label="Menunggu pengesahan" value={approvalPending} note="Kelulusan & keputusan" tone="blue" />
                    <MetricCard icon={<AlertTriangle size={20} />} label="Perlu perhatian" value={attentionProjects} note="Lewat atau hampir tamat" tone="amber" />
                    <MetricCard icon={<FileCheck2 size={20} />} label="Dokumen belum disahkan" value={pendingDocuments} note="Semakan manusia diperlukan" tone="purple" />
                  </section>

                  <section className="dashboard-grid">
                    <div className="panel portfolio-panel">
                      <div className="panel-header"><div><p className="panel-kicker">PORTFOLIO</p><h2>Kemajuan projek</h2></div><button className="text-btn" onClick={() => setTab("projects")}>Lihat semua <ArrowRight size={15} /></button></div>
                      <div className="project-stack">
                        {data.projects.slice(0, 4).map((project) => (
                          <button className="project-row" key={project.id} onClick={() => openProject(project)}>
                            <div className={`project-sigil ${riskTone(project.risk)}`}>{project.research_id.slice(-3)}</div>
                            <div className="project-main">
                              <div className="project-title-line"><span className="mono-label">{project.research_id}</span><span className={`status-chip ${statusTone(project.status)}`}>{project.status}</span></div>
                              <h3>{project.title}</h3>
                              <div className="progress-line"><div><i style={{ width: `${project.progress}%` }} /></div><strong>{project.progress}%</strong></div>
                            </div>
                            <div className="project-next"><small>Tindakan seterusnya</small><strong>{project.next_action}</strong><span className={dueLabel(project.next_due).includes("lewat") ? "overdue" : ""}><Clock3 size={13} /> {dueLabel(project.next_due)}</span></div>
                            <ChevronRight size={18} className="row-chevron" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="panel action-panel">
                      <div className="panel-header"><div><p className="panel-kicker">PUSAT TINDAKAN</p><h2>Perlu semakan anda</h2></div><span className="count-pill">{data.actions.length}</span></div>
                      <div className="action-stack">
                        {data.actions.slice(0, 4).map((item) => {
                          const project = projectById(item.project_id);
                          return (
                            <button className="action-card" key={item.id} onClick={() => setActionOpen(item)}>
                              <span className="action-icon"><ClipboardCheck size={17} /></span>
                              <span className="action-copy"><small>{project?.research_id ?? "UMUM"} · {item.type}</small><strong>{item.title}</strong><em>{item.external_target || "Semakan dalaman"}</em></span>
                              <span className="action-due">{dueLabel(item.due_date)}<ChevronRight size={15} /></span>
                            </button>
                          );
                        })}
                        {data.actions.length === 0 && <EmptyState icon={<CheckCircle2 size={26} />} title="Tiada tindakan tertunggak" detail="Semua rekod telah disemak." />}
                      </div>
                      <button className="panel-footer-btn" onClick={() => setTab("approvals")}>Buka pusat kelulusan <ArrowRight size={15} /></button>
                    </div>
                  </section>

                  <section className="lower-grid">
                    <div className="panel pipeline-panel">
                      <div className="panel-header"><div><p className="panel-kicker">ALIRAN KERJA</p><h2>Taburan peringkat</h2></div><Database size={18} className="muted-icon" /></div>
                      <Pipeline projects={data.projects} />
                    </div>
                    <div className="panel activity-panel">
                      <div className="panel-header"><div><p className="panel-kicker">AKTIVITI TERKINI</p><h2>Jejak perubahan</h2></div><button className="text-btn" onClick={() => setTab("audit")}>Log penuh <ArrowRight size={15} /></button></div>
                      {data.audit.slice(0, 3).map((item) => <AuditRow key={item.id} item={item} project={projectById(item.project_id)} />)}
                    </div>
                  </section>
                  </>}
                </>
              )}

              {tab === "projects" && (
                <section>
                  <PageTitle eyebrow="PORTFOLIO NEGERI" title="Semua projek penyelidikan" description="Rekod induk bagi projek dari pendaftaran hingga penutupan." action={<div className="title-actions"><a className="secondary-btn" href="/api/export"><Download size={16} /> Eksport CSV</a><button className="secondary-btn" onClick={() => setImportOpen(true)}><UploadCloud size={16} /> Import CSV</button><button className="primary-btn" onClick={() => setCreateOpen(true)}><Plus size={17} /> Daftar projek</button></div>} />
                  <div className="filter-bar">
                    <div className="inline-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari portfolio…" /></div>
                    <div className="filter-select"><SlidersHorizontal size={16} /><select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}><option>Semua</option><option>Terkawal</option><option>Perhatian</option><option>Lewat</option></select></div>
                    <span className="result-count">{filteredProjects.length} projek</span>
                  </div>
                  <div className="table-card">
                    <table className="data-table">
                      <thead><tr><th>Projek</th><th>Penyelidik / PTJ</th><th>Peringkat semasa</th><th>Kemajuan</th><th>Tindakan seterusnya</th><th /></tr></thead>
                      <tbody>{filteredProjects.map((project) => (
                        <tr key={project.id} onClick={() => openProject(project)}>
                          <td><span className="mono-label">{project.research_id}</span><strong>{project.title}</strong><span className={`risk-label ${riskTone(project.risk)}`}>{project.risk}</span></td>
                          <td><strong>{project.principal_investigator}</strong><span>{project.ptj}</span></td>
                          <td><span className={`status-chip ${statusTone(project.status)}`}>{project.status}</span></td>
                          <td><div className="table-progress"><div><i style={{ width: `${project.progress}%` }} /></div><strong>{project.progress}%</strong></div></td>
                          <td><strong>{project.next_action}</strong><span className={dueLabel(project.next_due).includes("lewat") ? "overdue" : ""}>{dueLabel(project.next_due)}</span></td>
                          <td><ChevronRight size={18} /></td>
                        </tr>
                      ))}</tbody>
                    </table>
                    {filteredProjects.length === 0 && <EmptyState icon={<Search size={28} />} title="Tiada projek sepadan" detail="Cuba istilah carian atau penapis yang lain." />}
                  </div>
                </section>
              )}

              {tab === "approvals" && (
                <section>
                  <PageTitle eyebrow="KAWALAN MANUSIA" title="Kelulusan & tindakan" description="Semak keputusan dan draf sebelum sebarang tindakan luar dibuat." />
                  <div className="approval-summary">
                    <div><span className="summary-icon amber"><Clock3 size={20} /></span><div><small>Menunggu pengesahan</small><strong>{approvalPending}</strong></div></div>
                    <div><span className="summary-icon teal"><ClipboardCheck size={20} /></span><div><small>Draf untuk semakan</small><strong>{data.actions.length}</strong></div></div>
                    <div className="external-lock"><LockKeyhole size={18} /><div><strong>Tiada tindakan luar automatik</strong><span>Kelulusan dalaman tidak sama dengan penghantaran</span></div></div>
                  </div>
                  <div className="split-list">
                    <div className="panel">
                      <div className="panel-header"><div><p className="panel-kicker">REKOD KEPUTUSAN</p><h2>Menunggu pengesahan</h2></div></div>
                      <div className="approval-list">
                        {data.approvals.filter((item) => !item.verified).map((item) => {
                          const project = projectById(item.project_id);
                          return <button key={item.id} onClick={() => setApprovalOpen(item)}><span className="approval-logo">{item.agency.slice(0, 2).toUpperCase()}</span><span><small>{project?.research_id}</small><strong>{item.agency}</strong><em>{project?.title}</em></span><span className={`status-chip ${statusTone(item.status)}`}>{item.status}</span><ChevronRight size={17} /></button>;
                        })}
                        {approvalPending === 0 && <EmptyState icon={<CheckCircle2 size={28} />} title="Semua keputusan disahkan" detail="Tiada rekod kelulusan tertunggak." />}
                      </div>
                    </div>
                    <div className="panel">
                      <div className="panel-header"><div><p className="panel-kicker">DRAF & PERINGATAN</p><h2>Menunggu arahan</h2></div></div>
                      <div className="review-queue">
                        {data.actions.map((item) => <button key={item.id} onClick={() => setActionOpen(item)}><span className="review-icon"><FileCheck2 size={18} /></span><span><small>{projectById(item.project_id)?.research_id} · {item.type}</small><strong>{item.title}</strong><em>{item.status}</em></span><ChevronRight size={17} /></button>)}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {tab === "documents" && (
                <section>
                  <PageTitle eyebrow="REPOSITORI DALAMAN" title="Dokumen penyelidikan" description="Versi, status pengesahan dan rekod muat naik disimpan bersama projek." action={<button className="primary-btn" onClick={() => setUploadOpen(true)}><UploadCloud size={17} /> Muat naik</button>} />
                  <div className="table-card">
                    <table className="data-table document-table">
                      <thead><tr><th>Dokumen</th><th>Projek</th><th>Versi</th><th>Dimuat naik</th><th>Status</th><th>Tindakan</th></tr></thead>
                      <tbody>{data.documents.map((doc) => {
                        const project = projectById(doc.project_id);
                        return <tr key={doc.id}><td><div className="file-cell"><span><FileText size={19} /></span><div><strong>{doc.file_name}</strong><small>{doc.type}</small></div></div></td><td><strong>{project?.research_id}</strong><span>{project?.title}</span></td><td><span className="version-pill">v{doc.version}</span></td><td><strong>{formatDate(doc.uploaded_at, true)}</strong><span>{doc.uploaded_by}</span></td><td><span className={`status-chip ${statusTone(doc.status)}`}>{doc.status}</span></td><td><div className="table-actions"><a className="icon-btn" href={`/api/documents?id=${doc.id}`} target="_blank" aria-label="Buka dokumen"><Download size={17} /></a>{doc.status !== "Disahkan" && <button className="small-btn" disabled={busy} onClick={() => void workflow({ action: "verify_document", projectId: doc.project_id, documentId: doc.id, fileName: doc.file_name }, "Dokumen disahkan.")}>Sahkan</button>}</div></td></tr>;
                      })}</tbody>
                    </table>
                    {data.documents.length === 0 && <EmptyState icon={<UploadCloud size={30} />} title="Belum ada dokumen" detail="Muat naik proposal, surat kelulusan atau laporan untuk memulakan repositori." />}
                  </div>
                </section>
              )}

              {tab === "audit" && (
                <section>
                  <PageTitle eyebrow="KETELUSAN REKOD" title="Log audit" description="Setiap perubahan dalaman direkodkan bersama masa dan pengguna." action={<button className="secondary-btn" onClick={() => void loadData(true)}><RefreshCw size={16} /> Segar semula</button>} />
                  <div className="audit-card">
                    <div className="audit-head"><span>Aktiviti</span><span>Projek</span><span>Pengguna</span><span>Masa</span></div>
                    {data.audit.map((item) => <div className="audit-line" key={item.id}><span className="audit-dot"><Check size={14} /></span><span><strong>{item.action}</strong><small>{item.detail}</small></span><span><strong>{projectById(item.project_id)?.research_id ?? "Sistem"}</strong><small>{projectById(item.project_id)?.title ?? "Rekod umum"}</small></span><span><UserRound size={14} /> {item.actor}</span><time>{formatTime(item.created_at)}</time></div>)}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>

      {toast && <div className="toast"><CheckCircle2 size={18} />{toast}</div>}

      {createOpen && <CreateProjectModal busy={busy} onClose={() => setCreateOpen(false)} onSubmit={async (values) => {
        const ok = await workflow({ action: "create_project", ...values }, "Projek didaftarkan dan senarai semak dijana.");
        if (ok) setCreateOpen(false);
      }} />}

      {importOpen && <ImportModal busy={busy} onClose={() => setImportOpen(false)} onSubmit={async (rows) => {
        setBusy(true);
        try {
          const response = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
          const result = await response.json() as { error?: string; imported?: number; skipped?: number };
          if (!response.ok) throw new Error(result.error || "Import gagal.");
          setToast(`${result.imported ?? 0} projek diimport; ${result.skipped ?? 0} rekod pendua dilangkau.`);
          setImportOpen(false);
          await loadData(true);
        } catch (err) {
          setToast(err instanceof Error ? err.message : "Import gagal.");
        } finally { setBusy(false); }
      }} />}

      {selectedProject && !statusOpen && !editOpen && !milestoneOpen && <ProjectModal project={selectedProject} approvals={projectApprovals(selectedProject.id)} milestones={projectMilestones(selectedProject.id)} documents={projectDocuments(selectedProject.id)} busy={busy} onClose={() => setSelectedProject(null)} onStatus={() => setStatusOpen(true)} onEdit={() => setEditOpen(true)} onAddMilestone={() => setMilestoneOpen(true)} onUpload={() => setUploadOpen(true)} onNoChange={async () => {
        const ok = await workflow({ action: "confirm_no_change", projectId: selectedProject.id }, "Pengesahan ‘tiada perubahan’ direkodkan.");
        if (ok) setSelectedProject(null);
      }} onCompleteMilestone={(milestone) => workflow({ action: "complete_milestone", projectId: selectedProject.id, milestoneId: milestone.id, title: milestone.title }, "Milestone ditandakan selesai.")} />}

      {selectedProject && editOpen && <EditProjectModal project={selectedProject} busy={busy} onClose={() => setEditOpen(false)} onSubmit={async (values) => {
        const ok = await workflow({ action: "update_project_details", projectId: selectedProject.id, ...values }, "Maklumat projek dikemas kini.");
        if (ok) { setEditOpen(false); setSelectedProject(null); }
      }} />}

      {selectedProject && milestoneOpen && <MilestoneModal project={selectedProject} busy={busy} onClose={() => setMilestoneOpen(false)} onSubmit={async (values) => {
        const ok = await workflow({ action: "add_milestone", projectId: selectedProject.id, ...values }, "Milestone baharu ditambah.");
        if (ok) { setMilestoneOpen(false); setSelectedProject(null); }
      }} />}

      {selectedProject && statusOpen && <StatusModal project={selectedProject} busy={busy} onClose={() => setStatusOpen(false)} onSubmit={async (values) => {
        const ok = await workflow({ action: "update_status", projectId: selectedProject.id, ...values }, "Status projek dikemas kini. Tiada sistem luar diubah.");
        if (ok) { setStatusOpen(false); setSelectedProject(null); }
      }} />}

      {uploadOpen && data && <UploadModal projects={data.projects} initialProject={selectedProject?.id} busy={busy} onClose={() => setUploadOpen(false)} onSubmit={async ({ projectId, type, file }) => {
        setBusy(true);
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ""));
            reader.onerror = () => reject(new Error("Fail tidak dapat dibaca."));
            reader.readAsDataURL(file);
          });
          const response = await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: Number(projectId),
              type,
              fileName: file.name,
              mimeType: file.type || "application/octet-stream",
              data: dataUrl.split(",")[1] || "",
            }),
          });
          const result = await response.json() as { error?: string };
          if (!response.ok) throw new Error(result.error || "Muat naik gagal.");
          setToast("Dokumen dimuat naik dan menunggu pengesahan.");
          setUploadOpen(false);
          setSelectedProject(null);
          await loadData(true);
        } catch (err) {
          setToast(err instanceof Error ? err.message : "Muat naik gagal.");
        } finally { setBusy(false); }
      }} />}

      {approvalOpen && <ApprovalModal approval={approvalOpen} project={projectById(approvalOpen.project_id)} busy={busy} onClose={() => setApprovalOpen(null)} onSubmit={async (values) => {
        const ok = await workflow({ action: "verify_approval", projectId: approvalOpen.project_id, approvalId: approvalOpen.id, ...values }, "Rekod kelulusan disahkan secara dalaman.");
        if (ok) setApprovalOpen(null);
      }} />}

      {actionOpen && <ActionModal item={actionOpen} project={projectById(actionOpen.project_id)} busy={busy} onClose={() => setActionOpen(null)} onApprove={async () => {
        const ok = await workflow({ action: "approve_action", projectId: actionOpen.project_id, actionId: actionOpen.id }, "Draf diluluskan secara dalaman — belum dihantar.");
        if (ok) setActionOpen(null);
      }} onComplete={async () => {
        const ok = await workflow({ action: "complete_action", projectId: actionOpen.project_id, actionId: actionOpen.id, title: actionOpen.title }, "Tindakan ditandakan selesai.");
        if (ok) setActionOpen(null);
      }} />}
    </div>
  );
}

const CSV_TEMPLATE = "research_id,title,principal_investigator,ptj,category,status,progress,risk,next_action,next_due\r\n";

function parseCsv(input: string) {
  const firstLine = input.split(/\r?\n/, 1)[0] || "";
  const delimiter = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (char === '"' && quoted && next === '"') { value += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { row.push(value.trim()); value = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; value = ""; continue;
    }
    value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error("Fail CSV tidak mempunyai baris data.");
  const headers = rows[0].map((item) => item.replace(/^\uFEFF/, "").trim().toLowerCase());
  const required = ["research_id", "title", "principal_investigator", "ptj"];
  const missing = required.filter((key) => !headers.includes(key));
  if (missing.length) throw new Error(`Lajur diperlukan tiada: ${missing.join(", ")}.`);
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""])));
}

function ProductionEmpty({ onCreate, onImport }: { onCreate: () => void; onImport: () => void }) {
  return <section className="production-empty"><span className="production-empty-icon"><Database size={30} /></span><p className="eyebrow">SISTEM OPERASI SEDIA DIGUNAKAN</p><h2>Mulakan portfolio sebenar BKP Sabah</h2><p>Pangkalan data kini kosong dan tidak mengandungi rekod demonstrasi. Daftar projek pertama atau import pangkalan data sedia ada menggunakan templat CSV.</p><div><button className="primary-btn" onClick={onCreate}><Plus size={17} /> Daftar projek pertama</button><button className="secondary-btn" onClick={onImport}><UploadCloud size={17} /> Import rekod sedia ada</button></div><small><ShieldCheck size={14} /> Semua perubahan direkodkan; sistem luar kekal tidak disentuh.</small></section>;
}

function MetricCard({ icon, label, value, note, tone }: { icon: ReactNode; label: string; value: number; note: string; tone: string }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><div><p>{label}</p><strong>{value}</strong><span>{note}</span></div><ChevronRight size={17} /></article>;
}

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="section-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><span>{description}</span></div>{action}</div>;
}

function Pipeline({ projects }: { projects: Project[] }) {
  const groups = [
    { label: "Semakan", match: (s: string) => /Draf|semakan|HSRAC Negeri|Pindaan/i.test(s), color: "#68b7b0" },
    { label: "Kelulusan", match: (s: string) => /NMRR|MREC|Kebangsaan/i.test(s), color: "#5b86c4" },
    { label: "Pelaksanaan", match: (s: string) => /pelaksanaan|Pengumpulan/i.test(s), color: "#9a79c6" },
    { label: "Analisis & laporan", match: (s: string) => /Analisis|Penulisan|Selesai|Ditutup/i.test(s), color: "#e0a760" },
  ];
  const counts = groups.map((group) => projects.filter((project) => group.match(project.status)).length);
  const total = Math.max(projects.length, 1);
  return <div className="pipeline"><div className="pipeline-bar">{groups.map((group, index) => counts[index] > 0 && <i key={group.label} style={{ width: `${(counts[index] / total) * 100}%`, background: group.color }} />)}</div><div className="pipeline-legend">{groups.map((group, index) => <div key={group.label}><span style={{ background: group.color }} /><p>{group.label}</p><strong>{counts[index]}</strong></div>)}</div></div>;
}

function AuditRow({ item, project }: { item: AuditItem; project?: Project }) {
  return <div className="mini-audit"><span className="mini-audit-icon"><Check size={14} /></span><div><strong>{item.action}</strong><p>{item.detail}</p><small>{project?.research_id ?? "Sistem"} · {item.actor} · {formatTime(item.created_at)}</small></div></div>;
}

function CreateProjectModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (values: Record<string, string>) => void }) {
  const [values, setValues] = useState({ title: "", principalInvestigator: "", ptj: "", category: "Health Systems" });
  const submit = (event: FormEvent) => { event.preventDefault(); onSubmit(values); };
  return <Modal title="Daftar projek penyelidikan" subtitle="ID projek dan senarai semak akan dijana secara automatik." onClose={onClose}><form className="form-stack" onSubmit={submit}><label className="field full"><span>Tajuk kajian</span><textarea required rows={3} value={values.title} onChange={(e) => setValues({ ...values, title: e.target.value })} placeholder="Masukkan tajuk penuh kajian" /></label><div className="form-grid"><label className="field"><span>Penyelidik utama</span><input required value={values.principalInvestigator} onChange={(e) => setValues({ ...values, principalInvestigator: e.target.value })} placeholder="Nama penuh" /></label><label className="field"><span>PTJ</span><input required value={values.ptj} onChange={(e) => setValues({ ...values, ptj: e.target.value })} placeholder="Klinik / pejabat" /></label><label className="field full"><span>Kategori</span><select value={values.category} onChange={(e) => setValues({ ...values, category: e.target.value })}><option>Health Systems</option><option>Epidemiologi</option><option>Promosi Kesihatan</option><option>Kesihatan Digital</option><option>Pencegahan Klinikal</option><option>Pendidikan Pergigian</option></select></label></div><div className="automation-note"><Database size={18} /><div><strong>Automasi selepas pendaftaran</strong><span>Jana ID, tiga rekod kelulusan, milestone semakan dan log audit.</span></div></div><div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Batal</button><button className="primary-btn" disabled={busy}>{busy ? <RefreshCw className="spin" size={17} /> : <Plus size={17} />} Daftar projek</button></div></form></Modal>;
}

function ImportModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (rows: Record<string, string>[]) => void }) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState("");
  const readFile = (file: File | null) => {
    if (!file) return;
    setFileName(file.name); setParseError("");
    const reader = new FileReader();
    reader.onload = () => {
      try { setRows(parseCsv(String(reader.result || ""))); }
      catch (error) { setRows([]); setParseError(error instanceof Error ? error.message : "Fail tidak sah."); }
    };
    reader.onerror = () => setParseError("Fail tidak dapat dibaca.");
    reader.readAsText(file);
  };
  return <Modal title="Import portfolio penyelidikan" subtitle="Masukkan rekod sedia ada tanpa menaip semula satu per satu." onClose={onClose}><form className="form-stack" onSubmit={(event) => { event.preventDefault(); if (rows.length) onSubmit(rows); }}><div className="import-guide"><div><strong>1. Gunakan templat standard</strong><span>Pastikan nama lajur dikekalkan.</span></div><a className="secondary-btn" download="Templat-Import-HSR-BKP-Sabah.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`}><Download size={16} /> Muat turun templat</a></div><label className={`upload-zone ${rows.length ? "has-file" : ""}`}><input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => readFile(event.target.files?.[0] ?? null)} /><UploadCloud size={30} /><strong>{fileName || "Pilih fail CSV atau TSV"}</strong><span>{rows.length ? `${rows.length} rekod sah untuk diimport` : "Maksimum 300 projek setiap import"}</span></label>{parseError && <div className="import-error"><AlertTriangle size={17} />{parseError}</div>}<div className="automation-note"><ShieldCheck size={18} /><div><strong>Import selamat</strong><span>ID projek yang telah wujud akan dilangkau. Rekod kelulusan asas dan log audit dijana bagi projek baharu.</span></div></div><div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Batal</button><button className="primary-btn" disabled={busy || rows.length === 0}>{busy ? <RefreshCw className="spin" size={17} /> : <UploadCloud size={17} />} Import {rows.length || ""} projek</button></div></form></Modal>;
}

function EditProjectModal({ project, busy, onClose, onSubmit }: { project: Project; busy: boolean; onClose: () => void; onSubmit: (values: Record<string, string>) => void }) {
  const [values, setValues] = useState({ title: project.title, principalInvestigator: project.principal_investigator, ptj: project.ptj, category: project.category });
  return <Modal title="Edit maklumat projek" subtitle={`${project.research_id} · Perubahan akan direkodkan.`} onClose={onClose}><form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSubmit(values); }}><label className="field full"><span>Tajuk kajian</span><textarea required rows={3} value={values.title} onChange={(event) => setValues({ ...values, title: event.target.value })} /></label><div className="form-grid"><label className="field"><span>Penyelidik utama</span><input required value={values.principalInvestigator} onChange={(event) => setValues({ ...values, principalInvestigator: event.target.value })} /></label><label className="field"><span>PTJ</span><input required value={values.ptj} onChange={(event) => setValues({ ...values, ptj: event.target.value })} /></label><label className="field full"><span>Kategori</span><select value={values.category} onChange={(event) => setValues({ ...values, category: event.target.value })}><option>Health Systems</option><option>Epidemiologi</option><option>Promosi Kesihatan</option><option>Kesihatan Digital</option><option>Pencegahan Klinikal</option><option>Pendidikan Pergigian</option></select></label></div><div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Batal</button><button className="primary-btn" disabled={busy}>{busy ? <RefreshCw className="spin" size={17} /> : <Check size={17} />} Simpan perubahan</button></div></form></Modal>;
}

function MilestoneModal({ project, busy, onClose, onSubmit }: { project: Project; busy: boolean; onClose: () => void; onSubmit: (values: Record<string, string>) => void }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  return <Modal title="Tambah milestone" subtitle={`${project.research_id} · Tetapkan hasil kerja dan tarikh sasaran.`} onClose={onClose}><form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSubmit({ title, dueDate }); }}><label className="field full"><span>Milestone / hasil kerja</span><input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Contoh: Serahan proposal pindaan" /></label><label className="field full"><span>Tarikh sasaran</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label><div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Batal</button><button className="primary-btn" disabled={busy}>{busy ? <RefreshCw className="spin" size={17} /> : <Plus size={17} />} Tambah milestone</button></div></form></Modal>;
}

function ProjectModal({ project, approvals, milestones, documents, busy, onClose, onStatus, onEdit, onAddMilestone, onUpload, onNoChange, onCompleteMilestone }: { project: Project; approvals: Approval[]; milestones: Milestone[]; documents: DocumentRecord[]; busy: boolean; onClose: () => void; onStatus: () => void; onEdit: () => void; onAddMilestone: () => void; onUpload: () => void; onNoChange: () => void; onCompleteMilestone: (milestone: Milestone) => void }) {
  return <Modal title={project.research_id} subtitle={project.title} onClose={onClose} wide><div className="project-detail-top"><div><span className={`status-chip ${statusTone(project.status)}`}>{project.status}</span><h3>{project.progress}% siap</h3><div className="detail-progress"><i style={{ width: `${project.progress}%` }} /></div></div><div className="detail-meta"><span><UserRound size={15} />{project.principal_investigator}</span><span><Building2 size={15} />{project.ptj}</span><span><CalendarDays size={15} />Dikemas kini {formatDate(project.last_updated_at, true)}</span></div></div><div className="detail-actions"><button className="primary-btn" onClick={onStatus}>Kemas kini status</button><button className="secondary-btn" onClick={onEdit}>Edit maklumat</button><button className="secondary-btn" onClick={onUpload}><UploadCloud size={16} /> Dokumen</button><button className="secondary-btn" disabled={busy} onClick={onNoChange}><Check size={16} /> Tiada perubahan</button></div><div className="detail-grid"><section><h3>Kelulusan</h3><div className="mini-list">{approvals.map((item) => <div key={item.id}><span className={`mini-status ${item.verified ? "done" : "pending"}`}>{item.verified ? <Check size={13} /> : <Clock3 size={13} />}</span><div><strong>{item.agency}</strong><small>{item.reference_no || item.status}</small></div><span className={`status-chip ${statusTone(item.status)}`}>{item.status}</span></div>)}</div></section><section><div className="subsection-heading"><h3>Milestone</h3><button onClick={onAddMilestone}><Plus size={13} /> Tambah</button></div><div className="mini-list">{milestones.map((item) => <div key={item.id}><span className={`mini-status ${item.status === "Selesai" ? "done" : "pending"}`}>{item.status === "Selesai" ? <Check size={13} /> : <Clock3 size={13} />}</span><div><strong>{item.title}</strong><small>{dueLabel(item.due_date)} · {formatDate(item.due_date, true)}</small></div>{item.status !== "Selesai" && <button className="mini-complete" disabled={busy} onClick={() => onCompleteMilestone(item)}>Selesai</button>}</div>)}</div></section></div><section className="document-summary"><div><h3>Dokumen projek</h3><span>{documents.length} fail direkodkan</span></div>{documents.length > 0 ? documents.slice(0, 3).map((doc) => <a key={doc.id} href={`/api/documents?id=${doc.id}`} target="_blank"><FileText size={17} /><span><strong>{doc.file_name}</strong><small>{doc.type} · v{doc.version}</small></span><Download size={16} /></a>) : <p>Belum ada dokumen dimuat naik.</p>}</section></Modal>;
}

function StatusModal({ project, busy, onClose, onSubmit }: { project: Project; busy: boolean; onClose: () => void; onSubmit: (values: Record<string, unknown>) => void }) {
  const [status, setStatus] = useState(project.status);
  const [progress, setProgress] = useState(project.progress);
  const [risk, setRisk] = useState(project.risk);
  const [nextAction, setNextAction] = useState(project.next_action);
  const [nextDue, setNextDue] = useState(project.next_due ?? "");
  return <Modal title="Kemas kini status projek" subtitle={`${project.research_id} · Perubahan direkodkan dalam log audit.`} onClose={onClose}><form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSubmit({ status, progress, risk, nextAction, nextDue }); }}><label className="field full"><span>Peringkat semasa</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{STATUS_FLOW.map((item) => <option key={item}>{item}</option>)}</select></label><label className="field full"><span>Kemajuan keseluruhan: <strong>{progress}%</strong></span><input className="range" type="range" min="0" max="100" step="1" value={progress} onChange={(event) => setProgress(Number(event.target.value))} /></label><div className="form-grid"><label className="field"><span>Tahap perhatian</span><select value={risk} onChange={(event) => setRisk(event.target.value)}><option>Terkawal</option><option>Perhatian</option><option>Lewat</option></select></label><label className="field"><span>Tarikh sasaran</span><input type="date" value={nextDue} onChange={(event) => setNextDue(event.target.value)} /></label><label className="field full"><span>Tindakan seterusnya</span><input required value={nextAction} onChange={(event) => setNextAction(event.target.value)} /></label></div><div className="external-warning"><LockKeyhole size={18} /><div><strong>Kemas kini dalaman sahaja</strong><span>Jika peringkat melibatkan NMRR, MREC atau HSRAC Kebangsaan, sistem hanya akan menjana item semakan. Portal luar tidak disentuh.</span></div></div><div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Kembali</button><button className="primary-btn" disabled={busy}>{busy ? <RefreshCw className="spin" size={17} /> : <Check size={17} />} Simpan status</button></div></form></Modal>;
}

function UploadModal({ projects, initialProject, busy, onClose, onSubmit }: { projects: Project[]; initialProject?: number; busy: boolean; onClose: () => void; onSubmit: (payload: { projectId: string; type: string; file: File }) => void }) {
  const [projectId, setProjectId] = useState(String(initialProject ?? projects[0]?.id ?? ""));
  const [type, setType] = useState("Proposal penyelidikan");
  const [file, setFile] = useState<File | null>(null);
  return <Modal title="Muat naik dokumen" subtitle="Fail disimpan bersama versi dan jejak audit projek." onClose={onClose}><form className="form-stack" onSubmit={(event) => { event.preventDefault(); if (!file) return; onSubmit({ projectId, type, file }); }}><label className="field full"><span>Projek</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}>{projects.map((project) => <option value={project.id} key={project.id}>{project.research_id} — {project.title}</option>)}</select></label><label className="field full"><span>Jenis dokumen</span><select value={type} onChange={(event) => setType(event.target.value)}><option>Proposal penyelidikan</option><option>Matriks pindaan</option><option>Surat HSRAC Negeri</option><option>Surat NMRR / MREC</option><option>Surat HSRAC Kebangsaan</option><option>Laporan kemajuan</option><option>Laporan akhir</option><option>Dokumen sokongan</option></select></label><label className={`upload-zone ${file ? "has-file" : ""}`}><input type="file" required onChange={(event) => setFile(event.target.files?.[0] ?? null)} accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" /><UploadCloud size={30} /><strong>{file ? file.name : "Pilih atau lepaskan fail di sini"}</strong><span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "PDF, Word, Excel atau imej · maksimum 10 MB"}</span></label><div className="automation-note"><FileCheck2 size={18} /><div><strong>Kawalan versi automatik</strong><span>Versi baharu dijana mengikut projek dan jenis dokumen. Status bermula sebagai “Menunggu pengesahan”.</span></div></div><div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Batal</button><button className="primary-btn" disabled={busy || !file}>{busy ? <RefreshCw className="spin" size={17} /> : <UploadCloud size={17} />} Muat naik</button></div></form></Modal>;
}

function ApprovalModal({ approval, project, busy, onClose, onSubmit }: { approval: Approval; project?: Project; busy: boolean; onClose: () => void; onSubmit: (values: Record<string, string>) => void }) {
  const [status, setStatus] = useState(approval.status === "Menunggu keputusan" ? "Diluluskan" : approval.status);
  const [referenceNo, setReferenceNo] = useState(approval.reference_no ?? "");
  const [decisionDate, setDecisionDate] = useState(approval.decision_date ?? new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState(approval.expiry_date ?? "");
  return <Modal title={`Sahkan keputusan ${approval.agency}`} subtitle={`${project?.research_id ?? ""} · Semak berdasarkan surat rasmi.`} onClose={onClose}><form className="form-stack" onSubmit={(event) => { event.preventDefault(); onSubmit({ status, referenceNo, decisionDate, expiryDate }); }}><div className="verification-card"><ShieldCheck size={21} /><div><small>PROJEK</small><strong>{project?.title}</strong><span>{project?.principal_investigator}</span></div></div><div className="form-grid"><label className="field"><span>Keputusan</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Diluluskan</option><option>Disokong</option><option>Pindaan minor</option><option>Pindaan major</option><option>Ditolak</option></select></label><label className="field"><span>Tarikh keputusan</span><input type="date" required value={decisionDate} onChange={(event) => setDecisionDate(event.target.value)} /></label><label className="field"><span>Nombor rujukan surat</span><input value={referenceNo} onChange={(event) => setReferenceNo(event.target.value)} placeholder="KKM.600-34/2026/…" /></label><label className="field"><span>Tarikh tamat kelulusan</span><input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} /></label></div><div className="external-warning"><AlertTriangle size={18} /><div><strong>Pengesahan ini hanya mengemas kini rekod BKP Sabah</strong><span>Ia tidak mengubah keputusan atau maklumat pada portal {approval.agency}.</span></div></div><div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Batal</button><button className="primary-btn" disabled={busy}>{busy ? <RefreshCw className="spin" size={17} /> : <ShieldCheck size={17} />} Sahkan rekod</button></div></form></Modal>;
}

function ActionModal({ item, project, busy, onClose, onApprove, onComplete }: { item: ActionItem; project?: Project; busy: boolean; onClose: () => void; onApprove: () => void; onComplete: () => void }) {
  return <Modal title="Semakan tindakan" subtitle={`${project?.research_id ?? "Tindakan umum"} · ${item.type}`} onClose={onClose}><div className="action-review"><div className="review-heading"><span className="review-big-icon"><ClipboardCheck size={24} /></span><div><h3>{item.title}</h3><p>{item.detail}</p></div></div><dl><div><dt>Projek</dt><dd>{project?.title ?? "Rekod umum"}</dd></div><div><dt>Sasaran luar</dt><dd>{item.external_target ?? "Tiada"}</dd></div><div><dt>Tarikh sasaran</dt><dd>{formatDate(item.due_date)} · {dueLabel(item.due_date)}</dd></div><div><dt>Status</dt><dd><span className={`status-chip ${statusTone(item.status)}`}>{item.status}</span></dd></div></dl><div className="approval-boundary"><BanIcon /><div><strong>Sempadan tindakan</strong><span>Kelulusan dalaman tidak menghantar e-mel, memuat naik ke portal atau mengubah sistem luar.</span></div></div><div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Tutup</button><button className="secondary-btn" disabled={busy} onClick={onComplete}><CheckCircle2 size={16} /> Tandakan selesai</button>{item.external_target !== "Dalaman BKP Sabah" && <button className="primary-btn" disabled={busy || item.status.includes("Diluluskan dalaman")} onClick={onApprove}>{busy ? <RefreshCw className="spin" size={17} /> : <Check size={17} />} Luluskan draf dalaman</button>}</div></div></Modal>;
}

function BanIcon() { return <span className="ban-icon"><LockKeyhole size={18} /></span>; }
