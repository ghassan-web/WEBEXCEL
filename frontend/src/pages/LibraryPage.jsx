import { useState, useEffect, useCallback } from "react";
import { getLibrary, deleteLibraryEntry, deleteLibraryEntries, getMasterData } from "../services/api";
import {
  BookOpenIcon,
  ArrowPathIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  FunnelIcon,
  ArrowDownTrayIcon,
  TableCellsIcon,
} from "@heroicons/react/24/outline";

const PAGE_SIZE = 20;

const STATUS_STYLE = {
  done:       "bg-emerald-100 text-emerald-700 border border-emerald-200",
  processing: "bg-amber-100   text-amber-700   border border-amber-200",
  error:      "bg-red-100     text-red-700     border border-red-200",
  pending:    "bg-gray-100    text-gray-500    border border-gray-200",
};
const STATUS_LABEL = { done:"SUCCESS", processing:"PROCESSING", error:"ERROR", pending:"PENDING" };
const STATUS_DOT   = { done:"bg-emerald-500", processing:"bg-amber-500 animate-pulse", error:"bg-red-500", pending:"bg-gray-400" };

/* ── tiny stat card ── */
function StatCard({ label, value, sub, color = "text-gray-800", bg = "bg-gray-50" }) {
  return (
    <div className={`${bg} rounded-2xl border border-gray-100 px-5 py-4 flex flex-col gap-1`}>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`text-3xl font-extrabold leading-none tracking-tight ${color}`}>
        {value?.toLocaleString("id-ID") ?? "—"}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ── confirm modal ── */
function ConfirmModal({ file, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 max-w-sm w-full mx-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-9 w-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <TrashIcon className="h-4 w-4 text-red-600" />
          </div>
          <div>
            <p className="font-bold text-gray-800 text-sm">Hapus dari Library?</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              File <strong className="text-gray-700">{file?.file_name}</strong> dan semua{" "}
              <strong>{file?.rows_appended?.toLocaleString("id-ID")}</strong> baris data-nya
              akan dihapus permanen dari Master.
            </p>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 mb-4">
          ⚠ Aksi ini tidak dapat dibatalkan.
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-40">
            Batal
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1.5">
            {loading ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> : <TrashIcon className="h-3.5 w-3.5" />}
            {loading ? "Menghapus…" : "Ya, Hapus"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── bulk confirm modal ── */
function BulkConfirmModal({ count, files, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-6 max-w-md w-full mx-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="h-9 w-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <TrashIcon className="h-4 w-4 text-red-600" />
          </div>
          <div>
            <p className="font-bold text-gray-800 text-sm">Hapus {count} file dari Library?</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              <strong className="text-gray-700">{count} file</strong> beserta semua baris
              datanya akan dihapus permanen dari Master.
            </p>
          </div>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 mb-4 max-h-36 overflow-y-auto">
          <ul className="space-y-1">
            {files.map(f => (
              <li key={f.id} className="flex items-center gap-2 text-xs text-gray-600">
                <DocumentIcon className="h-3.5 w-3.5 text-teal-500 flex-shrink-0" />
                <span className="truncate">{f.file_name}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 mb-4">
          ⚠ Aksi ini tidak dapat dibatalkan.
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-40">
            Batal
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-40 flex items-center gap-1.5">
            {loading ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> : <TrashIcon className="h-3.5 w-3.5" />}
            {loading ? "Menghapus…" : `Ya, Hapus ${count} File`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════ */
export default function LibraryPage({ initialTab }) {
  const [activeTab,   setActiveTab]   = useState(initialTab === "infopack" ? "Infopack" : "OS Cedant");
  const [files,       setFiles]       = useState([]);
  const [total,       setTotal]       = useState(0);
  const [masterTotal, setMasterTotal] = useState(0);
  const [page,        setPage]        = useState(0);
  const [search,      setSearch]      = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter,setStatusFilter]= useState("all");
  const [loading,     setLoading]     = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [confirmFile, setConfirmFile] = useState(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [selected,    setSelected]    = useState(new Set());
  const [toast,       setToast]       = useState(null);
  const [error,       setError]       = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [libRes, masterRes] = await Promise.all([
        getLibrary(activeTab, { skip: page * PAGE_SIZE, limit: PAGE_SIZE }),
        getMasterData(activeTab, { skip: 0, limit: 1 }),
      ]);
      setFiles(libRes.files || []);
      setTotal(libRes.total || 0);
      setMasterTotal(masterRes.total || 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activeTab, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); setSearch(""); setSearchInput(""); setSelected(new Set()); }, [activeTab]);
  useEffect(() => { setSelected(new Set()); }, [page]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleDelete = async () => {
    if (!confirmFile) return;
    setDeleting(true);
    try {
      await deleteLibraryEntry(confirmFile.id);
      setConfirmFile(null);
      showToast(`File "${confirmFile.file_name}" berhasil dihapus.`);
      load();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setDeleting(false);
    }
  };

  /* ── bulk delete ── */
  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      const ids = Array.from(selected);
      const res = await deleteLibraryEntries(ids);
      setConfirmBulk(false);
      setSelected(new Set());
      showToast(res.message || `${ids.length} file berhasil dihapus.`);
      load();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (id) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSelectAll = () => {
    if (filtered.length && selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(f => f.id)));
    }
  };

  const clearSelection = () => setSelected(new Set());

  /* client-side filter */
  const filtered = files.filter(f => {
    const q = search.toLowerCase();
    const matchSearch = !q
      || f.file_name?.toLowerCase().includes(q)
      || f.cedant?.toLowerCase().includes(q)
      || f.bulan?.includes(q)
      || f.tahun?.includes(q);
    const matchStatus = statusFilter === "all" || f.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  /* summary stats */
  const totalFiles    = total;
  const totalAppended = files.reduce((a, f) => a + (f.rows_appended || 0), 0);
  const totalSkipped  = files.reduce((a, f) => a + (f.rows_skipped  || 0), 0);
  const errorCount    = files.filter(f => f.status === "error").length;

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-auto">

      {/* ── Header ── */}
      <div className="page-header">
        <div className="h-8 w-8 rounded-xl bg-teal-600 flex items-center justify-center flex-shrink-0">
          <BookOpenIcon className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600">FILE MANAGEMENT</p>
          <h1 className="text-base font-bold text-gray-800 leading-tight">Library</h1>
        </div>
        <button onClick={load} disabled={loading}
          className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 bg-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
          <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          ↺ Refresh
        </button>
      </div>

      <div className="px-6 py-6 flex flex-col gap-5 max-w-7xl w-full">

        {/* ── Tabs ── */}
        <div className="flex gap-0 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm">
          {["OS Cedant", "Infopack"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={[
                "px-5 py-1.5 rounded-lg text-sm font-medium transition-all",
                activeTab === tab
                  ? "bg-white shadow text-teal-700 font-semibold border border-gray-200"
                  : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              {tab === "OS Cedant" ? "OS Claim Cedant" : "InfoPack"}
            </button>
          ))}
        </div>

        {/* ── Section title ── */}
        <div>
          <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-0.5">FILE MANAGEMENT</p>
          <h2 className="text-2xl font-extrabold text-gray-800">
            Library — {activeTab === "OS Cedant" ? "OS Claim Cedant" : "InfoPack"}
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            Semua file yang sudah diupload ke Master. Setiap baris mewakili satu file upload.
          </p>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total File Diupload" value={totalFiles}    sub="Semua upload job"           color="text-gray-800"    bg="bg-white" />
          <StatCard label="Total Baris di Master" value={masterTotal} sub="Akumulasi seluruh upload"   color="text-teal-700"    bg="bg-teal-50" />
          <StatCard label="Baris Ditambahkan"    value={totalAppended} sub="Dari halaman ini"          color="text-emerald-700" bg="bg-emerald-50" />
          <StatCard label="Error Upload"         value={errorCount}   sub={errorCount > 0 ? "Perlu diulang" : "Semua berhasil"} color={errorCount > 0 ? "text-red-600" : "text-gray-400"} bg={errorCount > 0 ? "bg-red-50" : "bg-white"} />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
        )}

        {/* ── Main card ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          {/* Toolbar */}
          <div className="px-5 py-3.5 border-b border-gray-100 flex flex-wrap items-center gap-3">

            {/* Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && setSearch(searchInput)}
                placeholder="Cari nama file, cedant, periode…"
                className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white w-56"
              />
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-1.5">
              <FunnelIcon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <div className="flex gap-1">
                {[
                  { key: "all",   label: "Semua" },
                  { key: "done",  label: "Success" },
                  { key: "error", label: "Error" },
                ].map(f => (
                  <button key={f.key} onClick={() => setStatusFilter(f.key)}
                    className={[
                      "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                      statusFilter === f.key ? "bg-teal-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                    ].join(" ")}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1" />

            {/* Bulk actions when selection active */}
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-teal-700">
                  {selected.size} dipilih
                </span>
                <button
                  onClick={clearSelection}
                  disabled={deleting}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-40"
                >
                  Batal pilih
                </button>
                <button
                  onClick={() => setConfirmBulk(true)}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-40"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Hapus {selected.size} file
                </button>
              </div>
            )}
            <span className="text-xs text-gray-400">{filtered.length} file</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-3 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onChange={toggleSelectAll}
                      disabled={loading || filtered.length === 0}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer disabled:opacity-40"
                      aria-label="Pilih semua"
                    />
                  </th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">File</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">Cedant</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">Periode</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">Sheet</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">Primary Key</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-teal-600 uppercase tracking-wide">Ditambahkan</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide">Dilewati</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide">Total Baris</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Waktu Upload</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading && (
                  <tr><td colSpan={12} className="text-center py-12 text-gray-400 animate-pulse">Memuat…</td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={12} className="text-center py-16">
                      <div className="flex flex-col items-center gap-2 text-gray-400">
                        <BookOpenIcon className="h-10 w-10 text-gray-200" />
                        <p className="font-medium">Library kosong</p>
                        <p className="text-xs">Upload file terlebih dahulu dari halaman Upload.</p>
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && filtered.map(f => (
                  <tr key={f.id} className={`hover:bg-teal-50/20 transition-colors group ${selected.has(f.id) ? "bg-teal-50/40" : ""}`}>
                    {/* Checkbox */}
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(f.id)}
                        onChange={() => toggleSelect(f.id)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                        aria-label={`Pilih ${f.file_name}`}
                      />
                    </td>
                    {/* File */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 max-w-[220px]">
                        <DocumentIcon className="h-4 w-4 text-teal-500 flex-shrink-0" />
                        <span className="truncate text-gray-800 font-medium text-xs" title={f.file_name}>
                          {f.file_name}
                        </span>
                      </div>
                    </td>
                    {/* Cedant */}
                    <td className="px-4 py-2.5 font-semibold text-gray-700 whitespace-nowrap">
                      {f.cedant || <span className="text-gray-300 font-normal italic">—</span>}
                    </td>
                    {/* Periode */}
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {f.bulan && f.tahun ? (
                        <span className="bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-lg text-[10px] font-semibold">
                          {f.bulan}/{f.tahun}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    {/* Sheet */}
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                      {f.sheet_name || <span className="text-gray-300 italic">Default</span>}
                    </td>
                    {/* Primary Key */}
                    <td className="px-4 py-2.5">
                      <code className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono whitespace-nowrap">
                        {f.primary_key_col}
                      </code>
                    </td>
                    {/* Ditambahkan */}
                    <td className="px-4 py-2.5 text-right font-semibold text-teal-700">
                      {f.rows_appended?.toLocaleString("id-ID") ?? "—"}
                    </td>
                    {/* Dilewati */}
                    <td className="px-4 py-2.5 text-right text-gray-400">
                      {f.rows_skipped?.toLocaleString("id-ID") ?? "—"}
                    </td>
                    {/* Total */}
                    <td className="px-4 py-2.5 text-right text-gray-600 font-medium">
                      {f.total_rows?.toLocaleString("id-ID") ?? "—"}
                    </td>
                    {/* Status */}
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[f.status] ?? "bg-gray-100 text-gray-500"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[f.status] ?? "bg-gray-400"}`} />
                        {STATUS_LABEL[f.status] ?? f.status?.toUpperCase()}
                      </span>
                    </td>
                    {/* Waktu */}
                    <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                      {f.created_at
                        ? <>
                            <span className="block">{new Date(f.created_at).toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"numeric" })}</span>
                            <span className="block text-[10px] text-gray-400">{new Date(f.created_at).toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit" })}</span>
                          </>
                        : "—"}
                    </td>
                    {/* Aksi */}
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
                        {f.status === "error" && (
                          <span className="text-[10px] text-red-400 italic max-w-[100px] truncate" title={f.error_message}>
                            {f.error_message?.slice(0, 30)}
                          </span>
                        )}
                        <button
                          onClick={() => setConfirmFile(f)}
                          className="text-gray-400 hover:text-red-500 transition-colors p-0.5"
                          title="Hapus dari Library"
                          aria-label={`Hapus ${f.file_name}`}
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                Halaman {page + 1} / {totalPages} · {total} total file
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0 || loading}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-teal-50 transition-colors">
                  <ChevronLeftIcon className="h-3.5 w-3.5 text-gray-600" />
                </button>
                <span className="text-xs font-semibold text-gray-600 min-w-[60px] text-center">{page+1} / {totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page >= totalPages-1 || loading}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-teal-50 transition-colors">
                  <ChevronRightIcon className="h-3.5 w-3.5 text-gray-600" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Info box ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3.5 flex items-center gap-3 text-xs text-gray-500">
          <TableCellsIcon className="h-4 w-4 text-teal-500 flex-shrink-0" />
          <span>
            Library menampilkan riwayat per-file upload. Untuk melihat semua baris data yang tersimpan, buka halaman{" "}
            <strong className="text-teal-600">Master</strong> di sidebar.
            Menghapus file dari Library juga menghapus baris datanya dari Master.
          </span>
        </div>

      </div>

      {/* ── Confirm delete modal ── */}
      {confirmFile && (
        <ConfirmModal
          file={confirmFile}
          onConfirm={handleDelete}
          onCancel={() => setConfirmFile(null)}
          loading={deleting}
        />
      )}

      {/* ── Bulk confirm modal ── */}
      {confirmBulk && (
        <BulkConfirmModal
          count={selected.size}
          files={filtered.filter(f => selected.has(f.id))}
          onConfirm={handleBulkDelete}
          onCancel={() => setConfirmBulk(false)}
          loading={deleting}
        />
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={[
          "fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-xs font-semibold border transition-all",
          toast.type === "error"
            ? "bg-red-50 border-red-200 text-red-700"
            : "bg-emerald-50 border-emerald-200 text-emerald-700",
        ].join(" ")}>
          {toast.type === "error"
            ? <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
            : <CheckCircleIcon className="h-4 w-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}

    </div>
  );
}
