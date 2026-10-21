/**
 * Activity Log table — matching screenshot design.
 * Columns: Waktu (WIB), Activity, Data Type, Cut-off, File, Status, Details, Actor
 */
import { useState, useEffect, useCallback } from "react";
import { listJobs, downloadReport } from "../services/api";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";

const PAGE_SIZE = 20;

/* map a job to an "activity log" row */
function jobToActivity(job) {
  const tipe = (job.tipe_data ?? "").toUpperCase().replace(" ", "_");
  const activity =
    job.status === "done"    ? `${tipe}_SCAN` :
    job.status === "error"   ? `${tipe}_ERROR` :
    job.status === "processing" ? `${tipe}_PROCESSING` :
                               `${tipe}_PENDING`;

  const details =
    job.status === "done"
      ? `${job.total_rows_a ?? 0} file; ${job.total_rows_b ?? 0} sheet; ${job.total_matched ?? 0} matched`
      : job.status === "error"
      ? (job.error_message ?? "Error")
      : "—";

  const cutoff = job.bulan && job.tahun ? `${job.bulan}/${job.tahun}` : "ALL";

  const fileName = job.file_a_name ?? "—";

  const waktu = job.created_at
    ? new Date(job.created_at).toLocaleString("id-ID", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      }).replace(",", ",")
    : "—";

  return { activity, details, cutoff, fileName, waktu, tipe };
}

const STATUS_STYLE = {
  done:       "bg-emerald-100 text-emerald-800 border border-emerald-200",
  processing: "bg-amber-100   text-amber-800   border border-amber-200",
  error:      "bg-red-100     text-red-700     border border-red-200",
  pending:    "bg-gray-100    text-gray-600    border border-gray-200",
};
const STATUS_LABEL = {
  done:       "SUCCESS",
  processing: "PROCESSING",
  error:      "ERROR",
  pending:    "PENDING",
};

const JENIS_OPTIONS  = ["Semua", "OS Cedant", "Infopack"];
const AKTIVITAS_OPTIONS = ["Semua aktivitas", "SCAN", "APPEND", "REPLACE", "ERROR"];

export default function HistoryTable({ onViewResult }) {
  const [data,       setData]      = useState(null);
  const [page,       setPage]      = useState(0);
  const [loading,    setLoad]      = useState(false);
  const [error,      setError]     = useState(null);
  /* filter state */
  const [jenis,      setJenis]     = useState("Semua");
  const [aktivitas,  setAktivitas] = useState("Semua aktivitas");
  const [cari,       setCari]      = useState("");
  const [applied,    setApplied]   = useState({ jenis:"Semua", aktivitas:"Semua aktivitas", cari:"" });

  const load = useCallback(async () => {
    setLoad(true);
    setError(null);
    try {
      const res = await listJobs(page * PAGE_SIZE, PAGE_SIZE);
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoad(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const allJobs = data?.jobs ?? [];
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  /* apply filters */
  const filtered = allJobs.filter(job => {
    const row = jobToActivity(job);
    if (applied.jenis !== "Semua" && !job.tipe_data?.toLowerCase().includes(applied.jenis.toLowerCase())) return false;
    if (applied.aktivitas !== "Semua aktivitas" && !row.activity.toUpperCase().includes(applied.aktivitas)) return false;
    const q = applied.cari.toLowerCase();
    if (q && !row.fileName.toLowerCase().includes(q) && !row.details.toLowerCase().includes(q) && !row.activity.toLowerCase().includes(q)) return false;
    return true;
  });

  const handleApply = () => setApplied({ jenis, aktivitas, cari });

  const SEL = "border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 appearance-none cursor-pointer";

  return (
    <div className="flex flex-col">

      {/* ── Filter bar ── */}
      <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-end gap-4">
        {/* Jenis data */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">Jenis data</label>
          <div className="relative">
            <select value={jenis} onChange={e => setJenis(e.target.value)} className={SEL + " pr-8 min-w-[110px]"}>
              {JENIS_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▼</span>
          </div>
        </div>

        {/* Aktivitas */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-gray-500">Aktivitas</label>
          <div className="relative">
            <select value={aktivitas} onChange={e => setAktivitas(e.target.value)} className={SEL + " pr-8 min-w-[140px]"}>
              {AKTIVITAS_OPTIONS.map(o => <option key={o}>{o}</option>)}
            </select>
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▼</span>
          </div>
        </div>

        {/* Cari */}
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label className="text-xs font-semibold text-gray-500">Cari nama file / detail</label>
          <input
            type="text"
            value={cari}
            onChange={e => setCari(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleApply()}
            placeholder="Ketik untuk mencari"
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 w-full"
          />
        </div>

        {/* Apply button */}
        <button
          onClick={handleApply}
          className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors self-end"
        >
          Apply Filters
        </button>

        {/* Refresh (right-aligned) */}
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto self-end flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 bg-white px-3 py-2 rounded-lg transition-colors disabled:opacity-40"
          aria-label="Refresh log"
        >
          <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          ↺ Refresh Log
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="mx-5 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-xs">
          {error}
        </div>
      )}

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 bg-white">
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 whitespace-nowrap">Waktu (WIB)</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 whitespace-nowrap">Activity</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 whitespace-nowrap">Data Type</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 whitespace-nowrap">Cut-off</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 whitespace-nowrap">File</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 whitespace-nowrap">Status</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 whitespace-nowrap">Details</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 whitespace-nowrap">Actor</th>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-700 whitespace-nowrap">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={9} className="text-center py-12 text-gray-400 animate-pulse">Memuat…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-400">
                  {allJobs.length === 0 ? "Belum ada riwayat aktivitas." : "Tidak ada aktivitas yang cocok."}
                </td>
              </tr>
            )}
            {!loading && filtered.map(job => {
              const row = jobToActivity(job);
              return (
                <tr key={job.id} className="hover:bg-gray-50/60 transition-colors group">
                  {/* Waktu */}
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{row.waktu}</td>
                  {/* Activity */}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="font-bold text-gray-800">{row.activity}</span>
                  </td>
                  {/* Data Type */}
                  <td className="px-4 py-2.5 whitespace-nowrap text-gray-700">{row.tipe}</td>
                  {/* Cut-off */}
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{row.cutoff}</td>
                  {/* File */}
                  <td className="px-4 py-2.5 text-gray-500">
                    {row.fileName === "—" ? "—" : (
                      <span className="truncate block max-w-[120px]" title={row.fileName}>
                        {row.fileName}
                      </span>
                    )}
                  </td>
                  {/* Status */}
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center text-[10px] font-bold px-2.5 py-0.5 rounded ${STATUS_STYLE[job.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {STATUS_LABEL[job.status] ?? job.status?.toUpperCase()}
                    </span>
                  </td>
                  {/* Details */}
                  <td className="px-4 py-2.5 text-gray-500 max-w-[200px]">
                    <span className="truncate block" title={row.details}>{row.details}</span>
                  </td>
                  {/* Actor */}
                  <td className="px-4 py-2.5 text-teal-600 whitespace-nowrap">
                    {/* placeholder — real auth user would go here */}
                    {job.created_at ? "system@osclaim" : "—"}
                  </td>
                  {/* Aksi */}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                      {job.status === "done" && (
                        <>
                          <button
                            onClick={() => onViewResult?.(job)}
                            className="text-teal-600 hover:text-teal-800 transition-colors"
                            title="Lihat hasil"
                            aria-label={`Lihat hasil job #${job.id}`}
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => downloadReport(job.id)}
                            className="text-gray-500 hover:text-teal-700 transition-colors"
                            title="Download laporan"
                            aria-label={`Download job #${job.id}`}
                          >
                            <ArrowDownTrayIcon className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {job.status === "error" && (
                        <span className="text-[10px] text-red-400 italic" title={job.error_message}>
                          {job.error_message?.slice(0, 24) ?? "Error"}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            Page {page + 1} / {totalPages} · {data?.total?.toLocaleString("id-ID")} total aktivitas
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p-1))}
              disabled={page === 0 || loading}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 disabled:opacity-40 hover:bg-teal-50 transition-colors"
            >
              ← Previous
            </button>
            <span className="text-xs font-semibold text-gray-600 min-w-[60px] text-center">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages-1, p+1))}
              disabled={page >= totalPages-1 || loading}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 disabled:opacity-40 hover:bg-teal-50 transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
