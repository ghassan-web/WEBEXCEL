// OSCLN Reconciliation Page — layout sesuai desain asli + handler aktif
import { useState, useEffect, useCallback, useRef } from "react";
import {
  listJobs, getResults, downloadReport,
  listOsclnSnapshots, uploadOsclnCsv, runReconciliation,
} from "../services/api";
import {
  ArrowsRightLeftIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ArrowDownTrayIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloudArrowUpIcon,
  ArrowTopRightOnSquareIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

const PAGE_SIZE = 50;

/* ── Tab config — sama persis dengan screenshot ── */
const TAB_KEYS   = ["", "matched", "changed", "only_in_a", "only_in_b"];
const TAB_LABELS = {
  "":        "Semua",
  matched:   "MATCHED_1_TO_1",
  changed:   "MATCHED_MULTIPLE",
  only_in_a: "NOT_FOUND",
  only_in_b: "INVALID_KEY",
};
const TAB_STYLE = {
  "":        { active: "bg-gray-700  text-white",    idle: "bg-gray-100  text-gray-600 hover:bg-gray-200"    },
  matched:   { active: "bg-teal-600  text-white",    idle: "bg-teal-50   text-teal-700 hover:bg-teal-100"    },
  changed:   { active: "bg-amber-500 text-white",    idle: "bg-amber-50  text-amber-700 hover:bg-amber-100"  },
  only_in_a: { active: "bg-red-500   text-white",    idle: "bg-red-50    text-red-700 hover:bg-red-100"      },
  only_in_b: { active: "bg-orange-500 text-white",   idle: "bg-orange-50 text-orange-700 hover:bg-orange-100"},
};

/* ── match status badge styles ── */
const MATCH_BADGE = {
  matched:   "bg-emerald-100 text-emerald-700 border border-emerald-200",
  changed:   "bg-amber-100   text-amber-700   border border-amber-200",
  only_in_a: "bg-red-100     text-red-700     border border-red-200",
  only_in_b: "bg-orange-100  text-orange-700  border border-orange-200",
};

/* ── tiny stat card ── */
function StatCard({ label, value, sub, color = "text-gray-800" }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex flex-col gap-1">
      <p className="text-xs text-gray-500 font-medium">{label}</p>
      <p className={`text-3xl font-extrabold leading-none tracking-tight ${color}`}>
        {value?.toLocaleString("id-ID") ?? "—"}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════ */
export default function OSCLNPage() {

  /* ── past reconciliation jobs ── */
  const [jobs,        setJobs]        = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [results,     setResults]     = useState(null);
  const [tab,         setTab]         = useState("");
  const [search,      setSearch]      = useState("");
  const [statusFilter,setStatusFilter]= useState("All statuses");
  const [direction,   setDirection]   = useState("master");
  const [page,        setPage]        = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error,       setError]       = useState(null);

  /* ── upload OSCLN CSV ── */
  const [osclnFile,    setOsclnFile]    = useState(null);
  const [uploading,    setUploading]    = useState(false);
  const [uploadPct,    setUploadPct]    = useState(0);
  const [uploadError,  setUploadError]  = useState(null);
  const [uploadOk,     setUploadOk]     = useState(null);   // { snapshot_id, file_name, total_rows }

  /* ── snapshots (for Reconciliation Setup) ── */
  const [snapshots,   setSnapshots]   = useState([]);
  const [activeSnap,  setActiveSnap]  = useState(null);

  /* ── reconcile ── */
  const [recTipeData, setRecTipeData] = useState("OS Cedant");
  const [recPk,       setRecPk]       = useState("primary_key_value");
  const [reconciling, setReconciling] = useState(false);
  const [recError,    setRecError]    = useState(null);

  const fileInputRef = useRef(null);

  /* ─── loaders ─────────────────────────────── */
  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await listJobs(0, 100);
      const done = (res.jobs || []).filter(j => j.status === "done");
      setJobs(done);
      if (done.length > 0) setSelected(prev => prev ?? done[0]);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const loadSnapshots = useCallback(async () => {
    try {
      const res   = await listOsclnSnapshots(0, 50);
      const snaps = res.snapshots || [];
      setSnapshots(snaps);
      if (snaps.length > 0) setActiveSnap(prev => prev ?? snaps[0]);
    } catch (_) {}
  }, []);

  const loadResults = useCallback(async () => {
    if (!selected) return;
    setLoadingData(true);
    setError(null);
    try {
      const res = await getResults(selected.id, {
        diffType: tab || undefined,
        skip:     page * PAGE_SIZE,
        limit:    PAGE_SIZE,
      });
      setResults(res);
    } catch (e) { setError(e.message); }
    finally { setLoadingData(false); }
  }, [selected, tab, page]);

  useEffect(() => { loadJobs(); loadSnapshots(); }, [loadJobs, loadSnapshots]);
  useEffect(() => { loadResults(); },               [loadResults]);
  useEffect(() => { setPage(0); },                  [tab, selected]);

  /* ── sync recPk when snapshot changes ── */
  useEffect(() => {
    if (activeSnap?.primary_key_col) setRecPk(activeSnap.primary_key_col);
  }, [activeSnap]);

  /* ─── handlers ────────────────────────────── */
  const handleUpload = async () => {
    if (!osclnFile) return setUploadError("Pilih file CSV terlebih dahulu.");
    setUploading(true);
    setUploadError(null);
    setUploadOk(null);
    setUploadPct(0);
    try {
      const now = new Date();
      const fd  = new FormData();
      fd.append("file",            osclnFile);
      fd.append("bulan",           String(now.getMonth() + 1).padStart(2, "0"));
      fd.append("tahun",           String(now.getFullYear()));
      fd.append("primary_key_col", recPk.trim() || "primary_key_value");
      const res = await uploadOsclnCsv(fd, setUploadPct);
      setUploadOk(res);
      setOsclnFile(null);
      // refresh snapshots and auto-select new one
      const snaps = await listOsclnSnapshots(0, 50);
      const list  = snaps.snapshots || [];
      setSnapshots(list);
      const fresh = list.find(s => s.id === res.snapshot_id) || list[0] || null;
      setActiveSnap(fresh);
      if (fresh?.primary_key_col) setRecPk(fresh.primary_key_col);
    } catch (e) { setUploadError(e.message); }
    finally { setUploading(false); }
  };

  const handleReconcile = async () => {
    if (!activeSnap)   return setRecError("Pilih snapshot OSCLN terlebih dahulu.");
    if (!recPk.trim()) return setRecError("Kolom Primary Key wajib diisi.");
    setReconciling(true);
    setRecError(null);
    try {
      const res = await runReconciliation({
        snapshotId:    activeSnap.id,
        tipeData:      recTipeData,
        primaryKeyCol: recPk.trim(),
      });
      const jobRes = await listJobs(0, 100);
      const done   = (jobRes.jobs || []).filter(j => j.status === "done");
      setJobs(done);
      const newJob = done.find(j => j.id === res.job_id) || done[0] || null;
      setSelected(newJob);
      setTab("");
      setPage(0);
    } catch (e) { setRecError(e.message); }
    finally { setReconciling(false); }
  };

  /* ─── derived ─────────────────────────────── */
  const masterTotal = selected
    ? (selected.total_matched   ?? 0) + (selected.total_changed   ?? 0)
    + (selected.total_only_in_a ?? 0) + (selected.total_only_in_b ?? 0)
    : 0;

  const coveragePct = masterTotal > 0 && (selected?.total_matched ?? 0) > 0
    ? ((selected.total_matched / masterTotal) * 100).toFixed(2)
    : "0.00";

  const tabCounts = {
    "":        masterTotal,
    matched:   selected?.total_matched   ?? 0,
    changed:   selected?.total_changed   ?? 0,
    only_in_a: selected?.total_only_in_a ?? 0,
    only_in_b: selected?.total_only_in_b ?? 0,
  };

  const totalPages = results ? Math.ceil(results.total / PAGE_SIZE) : 0;
  const totalRows  = results?.total ?? 0;

  const rows = (results?.results || []).filter(r => {
    const q = search.toLowerCase();
    return !q || r.primary_key_value?.toString().toLowerCase().includes(q);
  });

  /* ─── row mapper ───────────────────────────── */
  function mapRow(row, i) {
    const srcA = row.row_data_a || {};   // Master row data
    const srcB = row.row_data_b || {};   // OSCLN row data
    // For only_in_b rows, srcA is empty — use srcB as primary display source
    const src  = Object.keys(srcA).length ? srcA : srcB;
    const keysA = Object.keys(srcA);
    const keys  = Object.keys(src);

    const find = (re, pool, dataObj) => {
      const k = pool.find(k => re.test(k));
      if (!k) return "—";
      const v = dataObj[k];
      return (v !== null && v !== undefined && String(v).trim() !== "" && String(v) !== "nan") ? String(v) : "—";
    };

    const findA = (re) => find(re, keysA, srcA);
    const findB = (re) => find(re, Object.keys(srcB), srcB);

    // ── Cedant — utamakan kolom "cedant" yang sudah diinjeksi backend ──
    const cedant = (() => {
      // backend sekarang inject r.cedant ke dalam data dengan key "cedant"
      const v = findA(/^cedant$/i);
      if (v !== "—") return v;
      const v2 = findA(/^company$/i);
      if (v2 !== "—") return v2;
      // broader fallback
      return findA(/cedant/i) !== "—"
        ? findA(/cedant/i)
        : "—";
    })();

    // ── Sheet — kolom "sheet" diinjeksi backend saat ingest ──
    const sheet = (() => {
      const v = findA(/^sheet$/i);
      if (v !== "—") return v;
      // fallback ke sheet_a dari job metadata
      return selected?.sheet_a ?? "Sheet1";
    })();

    // ── Outstanding ──
    const outstanding = (() => {
      for (const re of [
        /^Orig Currency Amt$/,/^Amount_Net_OS$/i,/^outstanding$/i,/^net_outstanding$/i,
        /^OS$/,/^os_amount$/i,/^net_os$/i,/^R\/I Share Amount$/i,/^Remain OS/i,
        /^Outstanding Claim$/i,/^Sum of Outstanding$/i,/^TOTAL AMOUNT TSAI$/i,
        /^RENDO SHARE$/i,/^NET BALANCE$/i,/^NET_AMT$/i,/^Saldo Akhir Tagih$/i,/^AMOUNT$/i,
      ]) { const v = findA(re); if (v !== "—") return v; }
      return findA(/outstanding|balance/i);
    })();

    // ── Date of Loss ──
    const dol = (() => {
      for (const re of [
        /^Trans Desc\/DOL$/i,/^DOL$/i,/^DOL \(Date of Loss\)$/i,/^DATE OF LOSS$/i,
        /^Date of Loss$/i,/^date_of_loss$/i,/^loss_date$/i,/^Tgl\. DOL$/i,
        /^DOCL$/i,/^Loss Date$/i,/^D\.O\.L$/i,/^LossClaim$/i,/^tg_kejadian$/i,
      ]) { const v = findA(re); if (v !== "—") return v; }
      return findA(/date.*loss|loss.*date|\bdol\b/i);
    })();

    // ── Keterangan Loss Ref ──
    const ketLossRef = (() => {
      for (const re of [
        /^keterangan$/i,/^ket$/i,/^keterangan_loss_ref$/i,/^ket_loss_ref$/i,
        /^description$/i,/^desc$/i,/^remark$/i,/^note$/i,/^catatan$/i,
      ]) { const v = findA(re); if (v !== "—") return v; }
      return findA(/keter|remark|note/i);
    })();

    // ── Same-key rows = count how many rows in results share this PK ──
    // Untuk saat ini tampilkan "1" karena deduplikasi sudah dilakukan sebelum compare
    const sameKeyRows = "1";

    // ── OSCLN matched = "1" jika ada di OSCLN, "0" jika tidak ──
    const osclnMatched = (row.diff_type === "matched" || row.diff_type === "changed") ? "1" : "0";

    const idx = i + 1 + page * PAGE_SIZE;

    return {
      runId:        `REC-${String(selected?.id ?? 0).padStart(7,"0")}-${String(idx).padStart(5,"0")}`,
      lossRef:      row.primary_key_value ?? "—",
      diffType:     row.diff_type,
      cedant,
      sheet,
      outstanding,
      dol,
      ketLossRef,
      sameKeyRows,
      osclnMatched,
      // OSCLN-side columns (from srcB)
      osclnCedant:  (() => { const v = findB(/^cedant$/i); return v !== "—" ? v : findB(/cedant|company/i); })(),
      osclnDol:     (() => { for (const re of [/^DOL$/i,/^DATE OF LOSS$/i,/^Date of Loss$/i,/^date_of_loss$/i,/^loss_date$/i]) { const v = findB(re); if (v !== "—") return v; } return findB(/date.*loss|\bdol\b/i); })(),
      osclnLoss:    (() => { for (const re of [/^outstanding$/i,/^Orig Currency Amt$/,/^Amount_Net_OS$/i,/^NET BALANCE$/i]) { const v = findB(re); if (v !== "—") return v; } return findB(/outstanding|balance/i); })(),
      rowNum:       String(idx),
    };
  }

  /* ════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════ */
  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-auto">

      {/* ── Header ── */}
      <div className="page-header">
        <div className="h-8 w-8 rounded-xl bg-teal-600 flex items-center justify-center flex-shrink-0">
          <ArrowsRightLeftIcon className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600">TWO-WAY RECONCILIATION</p>
          <h1 className="text-base font-bold text-gray-800 leading-tight">OSCLN Reconciliation</h1>
        </div>
        <button onClick={() => { loadJobs(); loadSnapshots(); }} disabled={loading}
          className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 bg-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
          <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          ↺ Refresh Status
        </button>
      </div>

      <div className="px-6 py-6 flex flex-col gap-5 max-w-7xl w-full">

        {/* ── Section title ── */}
        <div>
          <h2 className="text-2xl font-extrabold text-gray-800">OSCLN Reconciliation</h2>
          <p className="text-xs text-gray-400 mt-1">
            Cocokkan Master OS Claim hasil append dengan data internal OSCLN. Lihat dua POV tanpa mengubah data master.
          </p>
        </div>

        {/* ── Two-panel setup ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* ══ LEFT: Internal Data Source · OSCLN ══ */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Internal Data Source · OSCLN</h3>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Import snapshot CSV OSCLN terbaru. Import berikutnya menggantikan snapshot OSCLN, bukan
                menambahi/menimpa Master OS Claim.
              </p>
            </div>

            {/* File upload — sama persis dengan screenshot (Choose File + button) */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">Upload OSCLN CSV (maks. 15 MB)</p>
              <div className="flex items-center gap-2">
                <input ref={fileInputRef} type="file" accept=".csv" className="hidden"
                  onChange={e => { setOsclnFile(e.target.files[0] || null); setUploadError(null); setUploadOk(null); e.target.value = ""; }}
                  disabled={uploading} />
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="text-xs border border-gray-300 bg-white hover:bg-gray-50 text-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0">
                  Choose File
                </button>
                <span className="text-xs text-gray-400 truncate max-w-[200px]">
                  {osclnFile ? osclnFile.name : "No file chosen"}
                </span>
              </div>

              {/* Progress */}
              {uploading && uploadPct > 0 && uploadPct < 100 && (
                <div className="mt-2 flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Mengunggah…</span>
                    <span className="font-semibold text-teal-700">{uploadPct}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-500 rounded-full transition-all duration-300"
                      style={{ width: `${uploadPct}%` }}
                      role="progressbar" aria-valuenow={uploadPct} aria-valuemin={0} aria-valuemax={100} />
                  </div>
                </div>
              )}
              {uploading && uploadPct >= 100 && (
                <div className="mt-2 flex items-center gap-2 text-xs text-teal-700 animate-pulse">
                  <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> Memproses data…
                </div>
              )}

              {/* Error / success */}
              {uploadError && (
                <div role="alert" className="mt-2 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-xs">
                  <ExclamationCircleIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}
              {uploadOk && (
                <div className="mt-2 flex items-start gap-2 bg-teal-50 border border-teal-200 text-teal-800 px-3 py-2 rounded-xl text-xs">
                  <CheckCircleIcon className="h-4 w-4 flex-shrink-0 mt-0.5 text-teal-600" />
                  <div>
                    <p className="font-semibold">Upload berhasil ✓</p>
                    <p className="mt-0.5 text-teal-700">
                      <strong>{uploadOk.total_rows?.toLocaleString("id-ID")}</strong> baris · Snapshot #{uploadOk.snapshot_id} · {uploadOk.file_name}
                    </p>
                    <p className="mt-0.5 text-teal-600">Snapshot otomatis dipilih. Klik <strong>Run Two-Way Matching</strong>.</p>
                  </div>
                </div>
              )}

              <button type="button" onClick={handleUpload} disabled={uploading || !osclnFile}
                className="mt-3 flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
                <CloudArrowUpIcon className="h-3.5 w-3.5" />
                {uploading ? "Mengunggah…" : "⊕ Upload OSCLN CSV"}
              </button>
            </div>

            {/* Google Drive import */}
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1.5">Atau import CSV yang sudah ada di Google Drive</p>
              <input type="url" placeholder="https://drive.google.com/file/d/…/view"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
              <button type="button"
                className="mt-2 flex items-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
                ⊞ Import from Drive
              </button>
            </div>
          </div>

          {/* ══ RIGHT: Reconciliation Setup ══ */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
            <h3 className="text-sm font-bold text-gray-800">Reconciliation Setup</h3>

            {/* Info box */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-2 text-xs text-blue-700">
              <InformationCircleIcon className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-500" />
              <span className="leading-relaxed">
                <strong>Matching key: Master[Loss Ref] ↔ OSCLN[loss_ref].</strong> Perbandingan bersifat
                key only. Kode cedant internal berbeda dari label cedant eksternal; nominal dan tanggal
                ditampilkan sebagai konteks,{" "}
                <span className="text-blue-500 font-semibold">belum menjadi aturan validasi.</span>
              </span>
            </div>

            {/* Active snapshot badge */}
            {activeSnap && (
              <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-start gap-2 text-xs text-teal-700">
                <CheckCircleIcon className="h-4 w-4 flex-shrink-0 mt-0.5 text-teal-500" />
                <div>
                  <p className="font-semibold text-teal-800">{activeSnap.file_name}</p>
                  <p className="text-teal-600 mt-0.5">
                    {activeSnap.total_rows?.toLocaleString("id-ID")} baris OSCLN ·{" "}
                    {activeSnap.tahun}-{activeSnap.bulan}{" "}
                    {activeSnap.created_at
                      ? new Date(activeSnap.created_at).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit",second:"2-digit"})
                      : ""}
                    {selected && (
                      <span> · Master OS Claim: {(selected.total_rows_a ?? 0).toLocaleString("id-ID")} baris</span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Snapshot picker */}
            {snapshots.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1.5">Snapshot aktif</p>
                <select value={activeSnap?.id ?? ""}
                  onChange={e => {
                    const s = snapshots.find(x => x.id === Number(e.target.value));
                    setActiveSnap(s || null);
                    if (s?.primary_key_col) setRecPk(s.primary_key_col);
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                  {snapshots.map(s => (
                    <option key={s.id} value={s.id}>
                      #{s.id} · {s.file_name} · {s.bulan}/{s.tahun} · {s.total_rows?.toLocaleString("id-ID")} baris
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Tipe Data + Primary Key */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1">Tipe Data</p>
                <select value={recTipeData} onChange={e => setRecTipeData(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                  <option value="OS Cedant">OS Claim Cedant</option>
                  <option value="Infopack">Infopack</option>
                </select>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1">Kolom Primary Key</p>
                <input type="text" value={recPk} onChange={e => setRecPk(e.target.value)}
                  placeholder="primary_key_value"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono" />
              </div>
            </div>

            {/* Past results picker */}
            {jobs.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-1.5">Dataset aktif (hasil sebelumnya)</p>
                <select value={selected?.id ?? ""}
                  onChange={e => { const j = jobs.find(x => x.id === Number(e.target.value)); if (j) setSelected(j); }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                  {jobs.map(j => (
                    <option key={j.id} value={j.id}>
                      #{j.id} · {j.file_b_name} · {j.bulan}/{j.tahun}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Reconcile error */}
            {recError && (
              <div role="alert" className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-xl text-xs">
                <ExclamationCircleIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{recError}</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 mt-auto pt-2">
              <button onClick={handleReconcile} disabled={reconciling || !activeSnap}
                className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
                {reconciling
                  ? <><ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> Memproses…</>
                  : <><ArrowsRightLeftIcon className="h-3.5 w-3.5" /> ▶ Run Two-Way Matching</>}
              </button>
              <button onClick={() => selected && downloadReport(selected.id)} disabled={!selected}
                className="flex items-center gap-2 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-gray-600 text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
                <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                ↗ Open Results Sheet
              </button>
            </div>
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Master OS Claim Rows"
            value={selected?.total_rows_a}
            sub="Jumlah baris dari POV aktif"
            color="text-gray-800"
          />
          <StatCard
            label="Found in Other Source"
            value={selected?.total_matched}
            sub={`Coverage ${coveragePct}%`}
            color="text-teal-600"
          />
          <StatCard
            label="Not Found"
            value={selected?.total_only_in_a}
            sub="Butuh tindak lanjut"
            color="text-red-600"
          />
          <StatCard
            label="Multiple / Invalid"
            value={(selected?.total_changed ?? 0) + (selected?.total_only_in_b ?? 0)}
            sub={`Invalid key: ${selected?.total_only_in_b ?? 0}`}
            color="text-orange-600"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
            <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ── Two-Way Matching Results ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          {/* Results header */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-sm font-bold text-gray-800">Two-Way Matching Results</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Setiap baris sumber tampil satu kali. Hasil multiple match diringkas, tanpa menggandakan nilai.
                </p>
              </div>
              {/* Direction toggle */}
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-bold flex-shrink-0">
                <button onClick={() => setDirection("master")}
                  className={`px-4 py-2 transition-colors ${direction === "master" ? "bg-teal-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  Master → OSCLN
                </button>
                <button onClick={() => setDirection("oscln")}
                  className={`px-4 py-2 transition-colors ${direction === "oscln" ? "bg-teal-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  OSCLN → Master
                </button>
              </div>
            </div>
          </div>

          {/* Filter bar */}
          <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search Loss Ref / Cedant / Status"
                className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white w-52" />
            </div>

            {/* Status dropdown */}
            <div className="relative">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="appearance-none pl-3 pr-8 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option>All statuses</option>
                <option>MATCHED_1_TO_1</option>
                <option>MATCHED_MULTIPLE</option>
                <option>NOT_FOUND</option>
                <option>INVALID_KEY</option>
              </select>
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▼</span>
            </div>

            <button className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
              Search / Filter
            </button>

            <button onClick={() => selected && downloadReport(selected.id)} disabled={!selected}
              className="flex items-center gap-1.5 text-teal-600 hover:text-teal-800 disabled:opacity-40 text-xs font-medium transition-colors ml-1">
              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
              ↗ View POV on Sheets
            </button>

            <div className="flex-1" />
            <span className="text-xs text-gray-400">{totalRows.toLocaleString("id-ID")} baris</span>
          </div>

          {/* Tab pills */}
          <div className="px-5 py-2.5 border-b border-gray-100 flex items-center gap-2 flex-wrap">
            {TAB_KEYS.map(key => {
              const isActive = tab === key;
              const style    = TAB_STYLE[key];
              const count    = tabCounts[key];
              return (
                <button key={key} onClick={() => setTab(key)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${isActive ? style.active : style.idle}`}>
                  {TAB_LABELS[key]}
                  {count > 0 && (
                    <span className={`ml-1.5 text-[10px] ${isActive ? "opacity-80" : "opacity-60"}`}>
                      {count.toLocaleString("id-ID")}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap sticky left-0 bg-gray-50 z-10">Run ID</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Match Status</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Cedant</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Sheet</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Loss Ref</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Outstanding</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Date of Loss</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Keterangan Loss Ref</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Master Same-Key Rows</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">OSCLN Matched Rows</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">OSCLN Cedant Code(s)</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">OSCLN Loss Date (first)</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">OSCLN Our Loss (first)</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">OSCLN Row Numbers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loadingData && (
                  <tr><td colSpan={14} className="text-center py-12 text-gray-400 animate-pulse">Memuat data…</td></tr>
                )}
                {!loadingData && !selected && (
                  <tr><td colSpan={14} className="text-center py-12 text-gray-400">
                    Belum ada data. Upload OSCLN CSV dan klik Run Two-Way Matching.
                  </td></tr>
                )}
                {!loadingData && rows.map((row, i) => {
                  const d = mapRow(row, i);
                  const outRaw = d.outstanding !== "—" ? String(d.outstanding).replace(/[^0-9.\-]/g, "") : null;
                  const outNum = outRaw ? Number(outRaw) : null;
                  const isNeg  = outNum !== null && outNum < 0;

                  return (
                    <tr key={row.id} className="hover:bg-teal-50/20 transition-colors">
                      <td className="px-3 py-1.5 font-mono text-xs text-gray-500 whitespace-nowrap sticky left-0 bg-white">{d.runId}</td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${MATCH_BADGE[d.diffType] ?? "bg-gray-100 text-gray-600"}`}>
                          {TAB_LABELS[d.diffType] ?? d.diffType?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-medium text-gray-700 whitespace-nowrap">{d.cedant}</td>
                      <td className="px-3 py-1.5 text-teal-600 whitespace-nowrap">{d.sheet}</td>
                      <td className="px-3 py-1.5 font-mono text-orange-700 whitespace-nowrap">{d.lossRef}</td>
                      <td className={`px-3 py-1.5 text-right font-medium whitespace-nowrap ${isNeg ? "text-red-600" : "text-gray-700"}`}>
                        {outNum !== null
                          ? isNeg
                            ? `(${Math.abs(outNum).toLocaleString("id-ID", { minimumFractionDigits: 2 })})`
                            : outNum.toLocaleString("id-ID", { minimumFractionDigits: 2 })
                          : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{d.dol}</td>
                      <td className="px-3 py-1.5 text-gray-500 max-w-[180px]">
                        <span className="truncate block" title={d.ketLossRef}>{d.ketLossRef}</span>
                      </td>
                      <td className="px-3 py-1.5 text-center text-gray-600">{d.sameKeyRows}</td>
                      <td className="px-3 py-1.5 text-center text-gray-600">{d.osclnMatched}</td>
                      <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{d.osclnCedant}</td>
                      <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">{d.osclnDol}</td>
                      <td className="px-3 py-1.5 text-right text-gray-700 font-medium whitespace-nowrap">
                        {d.osclnLoss !== "—" ? Number(String(d.osclnLoss).replace(/[^0-9.\-]/g,"")).toLocaleString("id-ID") : "0"}
                      </td>
                      <td className="px-3 py-1.5 text-right text-gray-500">{d.rowNum}</td>
                    </tr>
                  );
                })}
                {!loadingData && selected && rows.length === 0 && (
                  <tr><td colSpan={14} className="text-center py-12 text-gray-400">Tidak ada data untuk filter ini.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {totalRows > 0
                ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalRows)} / ${totalRows.toLocaleString("id-ID")} · Page ${page + 1} / ${Math.max(1, totalPages)}`
                : "Tidak ada data"}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0 || loadingData}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-teal-50 transition-colors text-gray-600">
                ← Previous
              </button>
              <span className="text-xs font-semibold text-gray-600 min-w-[70px] text-center">
                Page {page + 1} / {Math.max(1, totalPages)}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loadingData}
                className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-teal-50 transition-colors text-gray-600">
                Next →
              </button>
            </div>
          </div>

          {/* Footer note */}
          <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400">
            Hasil tersimpan dalam dua tab: MATCH_INBOUND_TO_OSCLN dan MATCH_OSCLN_TO_MASTER. Snapshot original CSV OSCLN tetap disimpan di Drive untuk audit.
          </div>
        </div>

      </div>
    </div>
  );
}
