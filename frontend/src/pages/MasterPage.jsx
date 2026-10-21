// Master OS Claim Page — reads from master_data via /api/master/data
import { useState, useEffect, useCallback } from "react";
import { getMasterData, exportMasterCsv } from "../services/api";
import {
  TableCellsIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";

const PAGE_SIZE = 50;

export default function MasterPage() {
  const [data,        setData]        = useState(null);   // { total, rows }
  const [page,        setPage]        = useState(0);
  const [search,      setSearch]      = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [activeTab,   setActiveTab]   = useState("os");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [exporting,   setExporting]   = useState(false);

  const tipeData = activeTab === "os" ? "OS Cedant" : "Infopack";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMasterData(tipeData, { skip: page * PAGE_SIZE, limit: PAGE_SIZE });
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tipeData, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [activeTab]);

  const totalRows  = data?.total ?? 0;
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);

  /* client-side search over loaded page */
  const rows = (data?.rows || []).filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.primary_key_value?.toLowerCase().includes(q) ||
      r.cedant?.toLowerCase().includes(q) ||
      Object.values(r.row_data || {}).some(v => v?.toString().toLowerCase().includes(q))
    );
  });

  /* Extract display fields from the stored row_data JSON */
  function mapRow(r) {
    const d    = r.row_data || {};
    const keys = Object.keys(d);

    // Helper: cari nilai dari kolom yang namanya cocok regex
    const find = (re) => {
      const k = keys.find(k => re.test(k));
      if (!k) return "—";
      const val = d[k];
      return (val !== null && val !== undefined && String(val).trim() !== "") ? String(val) : "—";
    };

    // ── Cedant ──────────────────────────────────────────────────────────
    const cedantFromData = (() => {
      const exactKey = keys.find(k => /^cedant$/i.test(k));
      if (exactKey) {
        const val = String(d[exactKey] ?? "").trim();
        if (val && val !== r.tipe_data) return val;
      }
      return null;
    })();

    // ── Sheet — pakai sheet_name dari upload job (paling akurat) ────────
    const sheet = r.sheet_name || find(/^sheet$/i) || "—";

    // ── Outstanding — per-cedant mapping dari MappingRules ──────────────
    // Nama kolom bervariasi: "Orig Currency Amt", "Amount_Net_OS", "OUTSTANDING", dst.
    const outstanding = (() => {
      // Coba nama kolom yang umum dulu (exact)
      for (const re of [
        /^Orig Currency Amt$/,
        /^Amount_Net_OS$/i,
        /^outstanding$/i,
        /^net_outstanding$/i,
        /^OS$/,
        /^os_amount$/i,
        /^net_os$/i,
        /^R\/I Share Amount$/i,
        /^Remain OS/i,
        /^Outstanding Claim$/i,
        /^Sum of Outstanding$/i,
        /^TOTAL AMOUNT TSAI$/i,
        /^RENDO SHARE$/i,
        /^NET BALANCE$/i,
        /^NET_AMT$/i,
        /^Saldo Akhir Tagih$/i,
        /^AMOUNT$/i,
      ]) {
        const v = find(re);
        if (v !== "—") return v;
      }
      // broad fallback
      return find(/outstanding|net.*os|os.*amount|balance/i);
    })();

    // ── Date of Loss — nama kolom variatif, tampilkan apa adanya ────────
    const dol = (() => {
      for (const re of [
        /^Trans Desc\/DOL$/i,
        /^DOL$/i,
        /^DOL \(Date of Loss\)$/i,
        /^DATE OF LOSS$/i,
        /^Date of Loss$/i,
        /^date_of_loss$/i,
        /^loss_date$/i,
        /^Tgl\. DOL$/i,
        /^DOCL$/i,
        /^Loss Date$/i,
        /^D\.O\.L$/i,
        /^LossClaim$/i,
        /^tg_kejadian$/i,
      ]) {
        const v = find(re);
        if (v !== "—") return v;
      }
      return find(/date.*loss|loss.*date|\bdol\b/i);
    })();

    // ── Keterangan Loss Ref ───────────────────────────────────────────────
    const ket = (() => {
      for (const re of [
        /^keterangan$/i,
        /^ket$/i,
        /^keterangan_loss_ref$/i,
        /^ket_loss_ref$/i,
        /^description$/i,
        /^desc$/i,
        /^remark$/i,
        /^note$/i,
        /^catatan$/i,
      ]) {
        const v = find(re);
        if (v !== "—") return v;
      }
      return find(/keter|remark|note/i);
    })();

    return {
      cedant:      r.cedant || cedantFromData || "—",
      sheet,
      lossRef:     r.primary_key_value ?? "—",
      outstanding,
      dol,
      ket,
    };
  }

  const handleSearch = () => setSearch(searchInput);

  const handleExport = () => {
    setExporting(true);
    exportMasterCsv(tipeData);
    // Beri jeda singkat agar browser sempat mulai download sebelum reset state
    setTimeout(() => setExporting(false), 1500);
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-auto">

      {/* ── Header ── */}
      <div className="page-header">
        <div className="h-8 w-8 rounded-xl bg-teal-600 flex items-center justify-center flex-shrink-0">
          <TableCellsIcon className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600">CONSOLIDATED OUTPUT</p>
          <h1 className="text-base font-bold text-gray-800 leading-tight">Master OS Claim Cedant</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="text-teal-600 hover:text-teal-800 disabled:opacity-40 p-1" title="Refresh">
            <ArrowPathIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="px-6 py-6 flex flex-col gap-5 max-w-7xl w-full">

        {/* ── Tabs ── */}
        <div className="flex gap-0 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm">
          {[["os","OS Claim Cedant"],["infopack","InfoPack"]].map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={[
                "px-5 py-1.5 rounded-lg text-sm font-medium transition-all",
                activeTab === key
                  ? "bg-white shadow text-teal-700 font-semibold border border-gray-200"
                  : "text-gray-500 hover:text-gray-700",
              ].join(" ")}>{label}</button>
          ))}
        </div>

        {/* ── Section heading ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-0.5">CONSOLIDATED OUTPUT</p>
            <h2 className="text-2xl font-extrabold text-gray-800">
              Master {activeTab === "os" ? "OS Claim Cedant" : "InfoPack"}
            </h2>
            <p className="text-xs text-gray-400 mt-1 max-w-lg">
              Master tersimpan permanen. Upload berikutnya menambahkan baris baru (append), tanpa menghapus data sebelumnya. Data yang sudah diproses dilewati otomatis.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleExport}
              disabled={exporting || totalRows === 0}
              className="flex items-center gap-1.5 text-xs text-white bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 px-3 py-2 rounded-lg transition-colors font-semibold">
              <ArrowDownTrayIcon className={`h-3.5 w-3.5 ${exporting ? "animate-bounce" : ""}`} />
              {exporting ? "Mengunduh…" : "Export CSV"}
            </button>
            <button
              className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-2 rounded-lg transition-colors"
              onClick={() => window.open("https://sheets.google.com","_blank")}>
              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
              Open Google Sheets
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">{error}</div>
        )}

        {/* ── Main card ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          {/* Toolbar */}
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-bold text-gray-800">Master Data Preview</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {totalRows.toLocaleString("id-ID")} total rows
                {search && ` · ${rows.length.toLocaleString("id-ID")} rows sesuai filter`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                  placeholder="Cari loss ref / cedant..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white w-52"
                />
              </div>
              <button onClick={handleSearch}
                className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-xs font-medium px-4 py-1.5 rounded-lg transition-colors">
                Search
              </button>
              {search && (
                <button onClick={() => { setSearch(""); setSearchInput(""); }}
                  className="text-xs text-gray-400 hover:text-gray-600">✕</button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-white">
                  <th className="px-4 py-3 text-left text-xs font-bold text-teal-700 whitespace-nowrap">Cedant</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-teal-700 whitespace-nowrap">Sheet</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-teal-700 whitespace-nowrap">Loss Ref</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-teal-700 whitespace-nowrap">Outstanding</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-teal-700 whitespace-nowrap">Date of Loss</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-teal-700 whitespace-nowrap">Keterangan Loss Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400 animate-pulse">Memuat data…</td></tr>
                )}
                {!loading && totalRows === 0 && (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400">
                    Belum ada data. Upload file terlebih dahulu dari halaman Upload.
                  </td></tr>
                )}
                {!loading && rows.map((r) => {
                  const d      = mapRow(r);
                  const outRaw = d.outstanding !== "—" ? String(d.outstanding).replace(/[^0-9.\-]/g, "") : null;
                  const outNum = outRaw ? Number(outRaw) : null;
                  const isNeg  = outNum !== null && outNum < 0;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-2 font-semibold text-gray-800 whitespace-nowrap">{d.cedant}</td>
                      <td className="px-4 py-2 text-teal-600 font-medium whitespace-nowrap">{d.sheet}</td>
                      <td className="px-4 py-2 font-mono text-gray-700 whitespace-nowrap">{d.lossRef}</td>
                      <td className={`px-4 py-2 text-right font-medium whitespace-nowrap ${isNeg ? "text-red-600" : "text-gray-700"}`}>
                        {outNum !== null
                          ? isNeg
                            ? `(${Math.abs(outNum).toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
                            : outNum.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : "—"}
                      </td>
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{d.dol}</td>
                      <td className="px-4 py-2 text-teal-600 max-w-[220px]">
                        <span className="truncate block" title={d.ket}>{d.ket}</span>
                      </td>
                    </tr>
                  );
                })}
                {!loading && totalRows > 0 && rows.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-12 text-gray-400">
                    Tidak ada data yang cocok dengan pencarian.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {page * PAGE_SIZE + 1}–{Math.min((page+1)*PAGE_SIZE, totalRows)} dari {totalRows.toLocaleString("id-ID")} baris
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(p => Math.max(0, p-1))}
                  disabled={page === 0 || loading}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-teal-50 transition-colors">
                  <ChevronLeftIcon className="h-3.5 w-3.5 text-gray-600" />
                </button>
                <span className="text-xs font-semibold text-gray-600 min-w-[70px] text-center">
                  {page+1} / {totalPages}
                </span>
                <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))}
                  disabled={page >= totalPages-1 || loading}
                  className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-teal-50 transition-colors">
                  <ChevronRightIcon className="h-3.5 w-3.5 text-gray-600" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
