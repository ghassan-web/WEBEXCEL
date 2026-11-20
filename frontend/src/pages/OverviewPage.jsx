import { useState, useEffect, useCallback } from "react";
import { listJobs } from "../services/api";
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
    desc: "Rekonsiliasi dua arah Master vs snapshot CSV OSCLN",
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
    desc: "Unggah workbook Excel untuk memindai seluruh header asli dan memvalidasi kolom target.",
  },
  {
    n: "03",
    title: "Confirm ke Master Data",
    desc: "Simpan hasil ekstraksi terstandarisasi dan seluruh kolom mentah ke PostgreSQL.",
  },
  {
    n: "04",
    title: "Rekonsiliasi OSCLN",
    desc: "Bandingkan Master Data terhadap snapshot CSV internal OSCLN secara dua arah.",
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listJobs(0, 5);
      const jobs = res.jobs || [];
      setRecent(jobs);
      setStats({
        total: res.total ?? 0,
        done: jobs.filter((j) => j.status === "done").length,
        matched: jobs.reduce((a, j) => a + (j.total_matched ?? 0), 0),
        notFound: jobs.reduce(
          (a, j) => a + (j.total_only_in_a ?? 0) + (j.total_only_in_b ?? 0),
          0
        ),
      });
    } catch {
      setStats({ total: 0, done: 0, matched: 0, notFound: 0 });
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
          value={loading ? "—" : (stats?.total ?? 0).toLocaleString("id-ID")}
          hint="Total seluruh job rekonsiliasi tercatat"
          icon={FolderOpenIcon}
          accent="brand"
          loading={loading}
        />
        <MetricTile
          label="Selesai"
          value={loading ? "—" : (stats?.done ?? 0).toLocaleString("id-ID")}
          hint="Dari 5 job terbaru yang diproses"
          icon={CheckCircleIcon}
          accent="valid"
          loading={loading}
        />
        <MetricTile
          label="Baris Matched"
          value={loading ? "—" : (stats?.matched ?? 0).toLocaleString("id-ID")}
          hint="Akumulasi baris cocok pada job terbaru"
          icon={ArrowTrendingUpIcon}
          accent="premi"
          loading={loading}
        />
        <MetricTile
          label="Tidak Ditemukan"
          value={loading ? "—" : (stats?.notFound ?? 0).toLocaleString("id-ID")}
          hint="Selisih only in A / only in B terbaru"
          icon={ExclamationTriangleIcon}
          accent="danger"
          loading={loading}
        />
      </div>

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
                <div key={job.id} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3">
                  <span
                    className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${
                      JOB_DOT[job.status] || "bg-[var(--color-ink-faint)]"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-[var(--color-ink)] truncate">
                        #{job.id} &middot; {job.tipe_data}
                      </p>
                      <span className="text-[11px] font-mono text-[var(--color-ink-muted)] shrink-0">
                        {job.bulan}/{job.tahun}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-ink-muted)] truncate mt-0.5">
                      {job.file_a_name || job.file_b_name || "—"}
                    </p>
                    {job.status === "done" && (
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
