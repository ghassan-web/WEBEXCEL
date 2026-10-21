import { useState, useEffect, useCallback } from "react";
import { listJobs } from "../services/api";
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
  ClockIcon,
  LightBulbIcon,
  DocumentTextIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

/* ── quick actions ── */
const QUICK = [
  {
    key: "upload",
    icon: ArrowUpTrayIcon,
    label: "Upload Data",
    desc: "Upload file Excel OS Claim / Infopack ke Master",
    color: "bg-teal-50 text-teal-700 border-teal-200",
    step: "Mulai di sini",
  },
  {
    key: "mapping",
    icon: AdjustmentsHorizontalIcon,
    label: "Mapping Rules",
    desc: "Lihat profil pemetaan kolom per cedant & sheet",
    color: "bg-indigo-50 text-indigo-700 border-indigo-200",
    step: "Referensi",
  },
  {
    key: "master",
    icon: TableCellsIcon,
    label: "Master Data",
    desc: "Lihat semua data yang sudah di-append ke Master",
    color: "bg-cyan-50 text-cyan-700 border-cyan-200",
    step: "Setelah upload",
  },
  {
    key: "oscln",
    icon: ArrowsRightLeftIcon,
    label: "OSCLN Reconciliation",
    desc: "Rekonsiliasi dua arah Master vs data internal OSCLN",
    color: "bg-lime-50 text-lime-700 border-lime-200",
    step: "Lanjutan",
  },
];

/* ── how-to-use steps ── */
const HOW_TO = [
  {
    n: "1",
    title: "Buka Mapping Rules",
    desc: "Sebelum upload, cek halaman Mapping Rules untuk mengetahui nama kolom identifier (Primary Key) dari file cedant kamu.",
    icon: AdjustmentsHorizontalIcon,
    color: "bg-indigo-100 text-indigo-700",
  },
  {
    n: "2",
    title: "Upload File Excel",
    desc: "Buka halaman Upload. Pilih Jenis Data → Bulan Cut-Off → Cedant. Kolom identifier akan otomatis terisi. Drag & drop file lalu klik \"Upload ke Master\".",
    icon: ArrowUpTrayIcon,
    color: "bg-teal-100 text-teal-700",
  },
  {
    n: "3",
    title: "Cek Master Data",
    desc: "Setelah upload berhasil, buka halaman Master untuk melihat semua baris yang sudah tersimpan. Upload berikutnya otomatis append — data lama tidak terhapus.",
    icon: TableCellsIcon,
    color: "bg-cyan-100 text-cyan-700",
  },
  {
    n: "4",
    title: "Upload OSCLN & Rekonsiliasi",
    desc: "Di halaman OSCLN Reconciliation, upload snapshot CSV OSCLN terbaru lalu klik \"Run Two-Way Matching\" untuk melihat data mana yang matched, not found, atau invalid.",
    icon: ArrowsRightLeftIcon,
    color: "bg-lime-100 text-lime-700",
  },
  {
    n: "5",
    title: "Cek Activity Log",
    desc: "Semua aktivitas upload, append, dan rekonsiliasi tercatat otomatis di halaman Activity Log lengkap dengan waktu (WIB) dan status.",
    icon: ClockIcon,
    color: "bg-amber-100 text-amber-700",
  },
];

/* ── FAQ ── */
const FAQ = [
  {
    q: "Kenapa muncul error 'kolom tidak ditemukan'?",
    a: "Nama kolom di file tidak cocok dengan mapping. Buka Mapping Rules untuk cek kolom yang benar, lalu koreksi di field \"Koreksi Kolom Identifier\" saat upload.",
  },
  {
    q: "Apakah data lama terhapus saat upload ulang?",
    a: "Tidak. Setiap upload bersifat append — baris baru ditambahkan, baris yang sudah ada (berdasarkan Primary Key) dilewati otomatis.",
  },
  {
    q: "SOMPO punya beberapa pilihan, mana yang benar?",
    a: "Pilih sesuai sheet file kamu: FAC OUT → 'SOMPO — FAC OUT', sheet CLAIM/AEGS → 'SOMPO — CLAIM / AEGS', sheet OS D/I → 'SOMPO — OS, D/I'.",
  },
  {
    q: "Bagaimana cara lihat hasil upload?",
    a: "Setelah upload berhasil, buka halaman Master di sidebar. Data yang baru diupload akan muncul di bagian atas tabel.",
  },
  {
    q: "Apa itu OSCLN Reconciliation?",
    a: "Fitur untuk mencocokkan data Master OS Claim (dari upload) dengan data internal sistem OSCLN. Hasilnya menunjukkan mana yang matched, not found, atau invalid key.",
  },
];

const DOT = { done: "bg-emerald-400", processing: "bg-amber-400 animate-pulse", error: "bg-red-400", pending: "bg-gray-300" };

export default function OverviewPage({ onNavigate }) {
  const [stats,      setStats]   = useState(null);
  const [recent,     setRecent]  = useState([]);
  const [loading,    setLoading] = useState(true);
  const [openFaq,    setOpenFaq] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await listJobs(0, 5);
      const jobs = res.jobs || [];
      setRecent(jobs);
      setStats({
        total:    res.total ?? 0,
        done:     jobs.filter(j => j.status === "done").length,
        matched:  jobs.reduce((a, j) => a + (j.total_matched   ?? 0), 0),
        notFound: jobs.reduce((a, j) => a + (j.total_only_in_a ?? 0) + (j.total_only_in_b ?? 0), 0),
      });
    } catch {
      setStats({ total: 0, done: 0, matched: 0, notFound: 0 });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const STAT_CARDS = [
    { label: "Total Jobs",      value: stats?.total,    icon: FolderOpenIcon,          bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700" },
    { label: "Selesai",         value: stats?.done,     icon: CheckCircleIcon,         bg: "bg-teal-50",    border: "border-teal-200",    text: "text-teal-700"    },
    { label: "Baris Matched",   value: stats?.matched,  icon: ArrowTrendingUpIcon,     bg: "bg-cyan-50",    border: "border-cyan-200",    text: "text-cyan-700"    },
    { label: "Tidak Ditemukan", value: stats?.notFound, icon: ExclamationTriangleIcon, bg: "bg-red-50",     border: "border-red-200",     text: "text-red-600"     },
  ];

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-auto">

      {/* ── Header ── */}
      <div className="page-header">
        <div className="h-8 w-8 rounded-xl bg-teal-600 flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-white"><path d="M3 3h8v8H3V3zm0 10h8v8H3v-8zm10-10h8v8h-8V3zm0 10h8v8h-8v-8z"/></svg>
        </div>
        <div>
          <h1 className="text-base font-bold text-gray-800">Overview</h1>
          <p className="text-xs text-gray-400">Selamat datang di OS Claim Hub</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={load} disabled={loading}
            className="text-teal-600 hover:text-teal-800 disabled:opacity-40 p-1" title="Refresh">
            <ArrowPathIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <span className="text-xs bg-teal-50 text-teal-700 border border-teal-200 px-3 py-1 rounded-full font-medium">
            {new Date().toLocaleDateString("id-ID", { day:"numeric", month:"long", year:"numeric" })}
          </span>
        </div>
      </div>

      <div className="px-6 py-6 flex flex-col gap-6">

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STAT_CARDS.map(c => (
            <div key={c.label} className={`bg-white rounded-2xl border ${c.border} ${c.bg} px-5 py-4 flex flex-col gap-2 shadow-sm`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500">{c.label}</span>
                <c.icon className={`h-4 w-4 ${c.text}`} />
              </div>
              <span className={`text-3xl font-bold tracking-tight ${c.text}`}>
                {loading ? "—" : (c.value ?? 0).toLocaleString("id-ID")}
              </span>
            </div>
          ))}
        </div>

        {/* ── How to Use ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100 bg-teal-50">
            <LightBulbIcon className="h-4 w-4 text-teal-600 flex-shrink-0" />
            <h2 className="text-sm font-bold text-teal-800">Cara Menggunakan OS Claim Hub</h2>
          </div>
          <div className="px-5 py-5">
            <div className="flex flex-col gap-0">
              {HOW_TO.map((step, i) => (
                <div key={step.n} className="flex gap-4">
                  {/* Timeline line */}
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${step.color}`}>
                      {step.n}
                    </div>
                    {i < HOW_TO.length - 1 && (
                      <div className="w-px flex-1 bg-gray-100 my-1" style={{ minHeight: "20px" }} />
                    )}
                  </div>
                  {/* Content */}
                  <div className="pb-4 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <step.icon className={`h-3.5 w-3.5 flex-shrink-0 ${step.color.replace("bg-","text-").split(" ")[1]}`} />
                      <p className="text-sm font-semibold text-gray-800">{step.title}</p>
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">{step.desc}</p>
                    {i === 0 && (
                      <button onClick={() => onNavigate("mapping")}
                        className="mt-1.5 text-xs text-teal-600 hover:underline font-medium flex items-center gap-0.5">
                        Buka Mapping Rules <ChevronRightIcon className="h-3 w-3" />
                      </button>
                    )}
                    {i === 1 && (
                      <button onClick={() => onNavigate("upload")}
                        className="mt-1.5 text-xs text-teal-600 hover:underline font-medium flex items-center gap-0.5">
                        Buka Upload <ChevronRightIcon className="h-3 w-3" />
                      </button>
                    )}
                    {i === 2 && (
                      <button onClick={() => onNavigate("master")}
                        className="mt-1.5 text-xs text-teal-600 hover:underline font-medium flex items-center gap-0.5">
                        Buka Master Data <ChevronRightIcon className="h-3 w-3" />
                      </button>
                    )}
                    {i === 3 && (
                      <button onClick={() => onNavigate("oscln")}
                        className="mt-1.5 text-xs text-teal-600 hover:underline font-medium flex items-center gap-0.5">
                        Buka OSCLN Reconciliation <ChevronRightIcon className="h-3 w-3" />
                      </button>
                    )}
                    {i === 4 && (
                      <button onClick={() => onNavigate("history")}
                        className="mt-1.5 text-xs text-teal-600 hover:underline font-medium flex items-center gap-0.5">
                        Buka Activity Log <ChevronRightIcon className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Quick actions + recent jobs ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* Quick actions */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
            <h2 className="text-sm font-bold text-gray-800">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {QUICK.map(a => (
                <button key={a.key} onClick={() => onNavigate(a.key)}
                  className={`flex items-start gap-3 p-4 rounded-xl border text-left hover:shadow-md transition-all ${a.color}`}>
                  <a.icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold leading-tight">{a.label}</p>
                      <span className="text-[10px] bg-white bg-opacity-60 px-1.5 py-0.5 rounded-full font-medium opacity-70">{a.step}</span>
                    </div>
                    <p className="text-xs opacity-70 mt-0.5 leading-snug">{a.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Recent jobs */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-800">Jobs Terbaru</h2>
              <button onClick={() => onNavigate("history")}
                className="text-xs text-teal-600 font-medium hover:underline flex items-center gap-0.5">
                Semua <ChevronRightIcon className="h-3 w-3" />
              </button>
            </div>

            {loading && <p className="text-sm text-gray-400 animate-pulse py-4 text-center">Memuat…</p>}

            {!loading && recent.length === 0 && (
              <div className="text-center py-6 flex flex-col gap-2">
                <FolderOpenIcon className="h-8 w-8 text-gray-300 mx-auto" />
                <p className="text-sm text-gray-400">Belum ada job.</p>
                <button onClick={() => onNavigate("upload")} className="text-teal-600 text-xs font-medium hover:underline">
                  Upload sekarang →
                </button>
              </div>
            )}

            {!loading && recent.length > 0 && (
              <div className="flex flex-col divide-y divide-gray-50">
                {recent.map(job => (
                  <div key={job.id} className="py-3 flex items-start gap-3">
                    <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${DOT[job.status] || "bg-gray-300"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-700 truncate">#{job.id} · {job.tipe_data}</p>
                        <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">{job.bulan}/{job.tahun}</span>
                      </div>
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {job.file_a_name || job.file_b_name || "—"}
                      </p>
                      {job.status === "done" && (
                        <div className="flex gap-2 mt-1 flex-wrap">
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                            {(job.total_matched ?? 0).toLocaleString("id-ID")} matched
                          </span>
                          {(job.total_changed ?? 0) > 0 && (
                            <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                              {job.total_changed.toLocaleString("id-ID")} changed
                            </span>
                          )}
                        </div>
                      )}
                      {job.status === "error" && (
                        <p className="text-[10px] text-red-500 mt-0.5 truncate" title={job.error_message}>
                          ✕ {job.error_message?.slice(0, 50)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── FAQ ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-100">
            <DocumentTextIcon className="h-4 w-4 text-gray-500 flex-shrink-0" />
            <h2 className="text-sm font-bold text-gray-800">Pertanyaan Umum (FAQ)</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {FAQ.map((item, i) => (
              <div key={i}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-medium text-gray-800 pr-4">{item.q}</span>
                  <ChevronRightIcon className={`h-4 w-4 text-gray-400 flex-shrink-0 transition-transform ${openFaq === i ? "rotate-90" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4">
                    <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-xl px-4 py-3">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
