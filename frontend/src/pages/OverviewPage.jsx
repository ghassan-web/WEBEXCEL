import { useState, useEffect, useCallback } from "react";
import { listJobs, listUploadJobs } from "../services/api";
import { PageHeader, MetricTile, Card, Badge, Button, EmptyState } from "../components/ui";
import {
  ArrowUpTrayIcon,
  AdjustmentsHorizontalIcon,
  TableCellsIcon,
  ArrowsRightLeftIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  FolderOpenIcon,
  ChevronRightIcon,
  QuestionMarkCircleIcon,
  ArrowPathIcon,
  CalendarDaysIcon,
  BookOpenIcon,
} from "@heroicons/react/24/outline";

const QUICK_ACTIONS = [
  {
    key: "upload",
    icon: ArrowUpTrayIcon,
    label: "Upload Data",
    desc: "Upload file Excel OS Claim / InfoPack ke Master Data",
    tag: "Step 01",
  },
  {
    key: "mapping",
    icon: AdjustmentsHorizontalIcon,
    label: "Mapping Rules",
    desc: "Lihat profil pemetaan kolom per cedant & sheet",
    tag: "Referensi",
  },
  {
    key: "master",
    icon: TableCellsIcon,
    label: "Master Data",
    desc: "Telusuri data konsolidasi & seluruh kolom hasil scan",
    tag: "Output",
  },
  {
    key: "oscln",
    icon: ArrowsRightLeftIcon,
    label: "OSCLN Reconciliation",
    desc: "Customize Matching OSCLN (fsi_db) vs tabel hasil cedant & selisih Outstanding",
    tag: "Matching",
  },
];

const WORKFLOW_SUMMARY = [
  {
    n: "01",
    title: "Cek Profil Mapping",
    desc: "Pastikan kolom identifier cedant sesuai dengan profil di Mapping Rules.",
  },
  {
    n: "02",
    title: "Upload & Prepare",
    desc: "Unggah workbook Excel (termasuk file ber-password) untuk memindai header asli & validasi kolom target.",
  },
  {
    n: "03",
    title: "Confirm ke Master & Hasil",
    desc: "Simpan data terstandarisasi ke Master dan tabel per-cedant di schema hasil_rekonsiliasi.",
  },
  {
    n: "04",
    title: "Customize Matching OSCLN",
    desc: "Cocokkan fsi_db.clickhouse.oscln vs tabel cedant dengan field bebas, 5 POV, dan hitung selisih Outstanding.",
  },
];

const JOB_DOT = {
  done: "bg-[var(--color-valid)]",
  processing: "bg-[var(--color-warning)] animate-pulse",
  error: "bg-[var(--color-danger)]",
  pending: "bg-[var(--color-ink-faint)]",
};

export default function OverviewPage({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [comparisonResult, uploadResult] = await Promise.all([
        listJobs(0, 5),
        listUploadJobs(0, 5),
      ]);
      const comparisonJobs = (comparisonResult.jobs || []).map((job) => ({
        ...job,
        activity_kind: "comparison",
      }));
      const uploadJobs = (uploadResult.jobs || []).map((job) => ({
        ...job,
        activity_kind: "upload",
      }));
      const jobs = [...comparisonJobs, ...uploadJobs]
        .sort(
          (a, b) =>
            new Date(b.created_at || 0).getTime() -
            new Date(a.created_at || 0).getTime()
        )
        .slice(0, 5);
      setRecent(jobs);
      setStats({
        total: (comparisonResult.total ?? 0) + (uploadResult.total ?? 0),
        done: jobs.filter((j) => j.status === "done").length,
        matched: jobs.reduce(
          (a, j) => a + (j.activity_kind === "comparison" ? j.total_matched ?? 0 : 0),
          0
        ),
        notFound: jobs.reduce(
          (a, j) =>
            a +
            (j.activity_kind === "comparison"
              ? (j.total_only_in_a ?? 0) + (j.total_only_in_b ?? 0)
              : 0),
          0
        ),
      });
    } catch (loadError) {
      setStats(null);
      setRecent([]);
      setError(loadError.message || "Gagal memuat data dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const todayLabel = new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 py-6 space-y-5 font-sans text-[var(--color-ink)] saas-page-enter">
      <PageHeader
        title="Dashboard Overview"
        description="Ringkasan aktivitas workspace OS Claims Hub, aksi cepat, dan status job terbaru."
        actions={
          <div className="flex items-center gap-2.5">
            <Badge tone="brand" icon={CalendarDaysIcon}>
              {todayLabel}
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              icon={ArrowPathIcon}
              loading={loading}
              onClick={load}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile
          label="Total Jobs"
          value={loading || !stats ? "—" : stats.total.toLocaleString("id-ID")}
          hint="Total upload dan rekonsiliasi tercatat"
          icon={FolderOpenIcon}
          accent="brand"
          loading={loading}
        />
        <MetricTile
          label="Selesai"
          value={loading || !stats ? "—" : stats.done.toLocaleString("id-ID")}
          hint="Dari 5 aktivitas terbaru"
          icon={CheckCircleIcon}
          accent="valid"
          loading={loading}
        />
        <MetricTile
          label="Baris Matched"
          value={loading || !stats ? "—" : stats.matched.toLocaleString("id-ID")}
          hint="Dari rekonsiliasi terbaru"
          icon={ArrowTrendingUpIcon}
          accent="premi"
          loading={loading}
        />
        <MetricTile
          label="Tidak Ditemukan"
          value={loading || !stats ? "—" : stats.notFound.toLocaleString("id-ID")}
          hint="Selisih pada rekonsiliasi terbaru"
          icon={ExclamationTriangleIcon}
          accent="danger"
          loading={loading}
        />
      </div>

      {error && (
        <div
          role="alert"
          className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 text-[var(--color-danger)] px-4 py-3 rounded-[var(--radius-control)] text-xs font-medium"
        >
          Gagal memuat aktivitas dashboard: {error}
        </div>
      )}

      {/* Quick Actions + Recent Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Card
          title="Quick Actions"
          description="Pintasan modul utama untuk memulai alur kerja OS Claims Hub"
          actions={
            <button
              type="button"
              onClick={() => onNavigate("guide")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-brand)] hover:text-[var(--color-brand-hover)] cursor-pointer"
            >
              <QuestionMarkCircleIcon className="w-4 h-4" />
              User Guide
            </button>
          }
          className="lg:col-span-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {QUICK_ACTIONS.map((action) => {
              const IconComp = action.icon;
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => onNavigate(action.key)}
                  className="group flex items-start gap-3.5 p-4 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface-sunken)]/60 hover:bg-[var(--color-brand-soft)]/50 hover:border-[var(--color-brand-line)] text-left transition-all cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-[var(--radius-control)] bg-[var(--color-brand-soft)] border border-[var(--color-brand-line)] text-[var(--color-brand)] flex items-center justify-center shrink-0">
                    <IconComp className="w-[18px] h-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-[var(--color-ink)] group-hover:text-[var(--color-brand)] transition-colors truncate">
                        {action.label}
                      </p>
                      <span className="text-[10px] font-semibold font-mono uppercase px-2 py-0.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-line)] text-[var(--color-ink-muted)] shrink-0">
                        {action.tag}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-ink-muted)] mt-1 leading-snug">
                      {action.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card
          title="Jobs Terbaru"
          description="Aktivitas pencocokan & upload terbaru"
          actions={
            <button
              type="button"
              onClick={() => onNavigate("history")}
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--color-brand)] hover:text-[var(--color-brand-hover)] cursor-pointer"
            >
              <span>Semua</span>
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </button>
          }
          className="lg:col-span-2"
        >
          {loading ? (
            <div className="py-10 text-center text-xs text-[var(--color-ink-muted)] animate-pulse">
              Memuat aktivitas terbaru…
            </div>
          ) : error ? (
            <div className="py-10 text-center text-xs text-[var(--color-danger)]">
              Aktivitas tidak dapat dimuat.
            </div>
          ) : recent.length === 0 ? (
            <EmptyState
              icon={FolderOpenIcon}
              title="Belum ada job"
              description="Unggah workbook Excel cedant pertama Anda untuk memulai pencatatan."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={ArrowUpTrayIcon}
                  onClick={() => onNavigate("upload")}
                >
                  Upload Sekarang
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-[var(--color-line)]/70">
              {recent.map((job) => (
                <div
                  key={`${job.activity_kind}-${job.id}`}
                  className="py-3 first:pt-0 last:pb-0 flex items-start gap-3"
                >
                  <span
                    className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                      JOB_DOT[job.status] || "bg-[var(--color-ink-faint)]"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-[var(--color-ink)] truncate">
                        #{job.id} &middot; {job.activity_kind === "upload"
                          ? job.cedant || job.tipe_data
                          : job.tipe_data}
                      </p>
                      <span className="text-[11px] font-mono text-[var(--color-ink-muted)] shrink-0">
                        {job.bulan}/{job.tahun}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-ink-muted)] truncate mt-0.5">
                      {job.file_name || job.file_a_name || job.file_b_name || "—"}
                    </p>
                    {job.activity_kind === "comparison" && job.status === "done" && (
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        <Badge tone="valid">
                          {(job.total_matched ?? 0).toLocaleString("id-ID")} matched
                        </Badge>
                        {(job.total_changed ?? 0) > 0 && (
                          <Badge tone="warning">
                            {job.total_changed.toLocaleString("id-ID")} changed
                          </Badge>
                        )}
                      </div>
                    )}
                    {job.activity_kind === "upload" && (
                      <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        <Badge tone={job.status === "done" ? "valid" : job.status === "error" ? "danger" : "warning"}>
                          {job.status === "done"
                            ? `${(job.rows_appended ?? 0).toLocaleString("id-ID")} baris ditambahkan`
                            : job.status === "error"
                              ? "Upload gagal"
                              : "Perlu ditinjau"}
                        </Badge>
                      </div>
                    )}
                    {job.status === "error" && (
                      <p
                        className="text-[11px] text-[var(--color-danger)] mt-1 truncate"
                        title={job.error_message}
                      >
                        ✕ {job.error_message?.slice(0, 60)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Concise 4-Step Pipeline Summary + CTA to User Guide */}
      <Card
        title="Ringkasan Alur Operasional OS Claims Hub"
        description="Urutan kerja standar mulai dari validasi profil mapping hingga rekonsiliasi dua arah OSCLN."
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={BookOpenIcon}
            onClick={() => onNavigate("guide")}
          >
            Buka Panduan Lengkap (User Guide)
          </Button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {WORKFLOW_SUMMARY.map((step) => (
            <div
              key={step.n}
              className="p-4 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface-sunken)]/70 space-y-1.5"
            >
              <span className="inline-block font-mono text-[11px] font-bold text-[var(--color-brand)] bg-[var(--color-brand-soft)] border border-[var(--color-brand-line)] px-2 py-0.5 rounded-full">
                Step {step.n}
              </span>
              <h4 className="text-[13px] font-semibold text-[var(--color-ink)]">
                {step.title}
              </h4>
              <p className="text-xs text-[var(--color-ink-muted)] leading-relaxed">
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
