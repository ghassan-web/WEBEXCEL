// OSCLN Reconciliation Page — layout sesuai desain asli + handler aktif
import { useState, useEffect, useCallback, useRef } from "react";
import {
  listJobs, getResults, downloadReport,
  listOsclnSnapshots, uploadOsclnCsv, runReconciliation,
} from "../services/api";
import { PageHeader, MetricTile, Card, Button } from "../components/ui";
import {
  ArrowsRightLeftIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CloudArrowUpIcon,
  ArrowTopRightOnSquareIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

const PAGE_SIZE = 50;

/* ── Tab config ── */
const TAB_KEYS   = ["", "matched", "changed", "only_in_a", "only_in_b"];
const TAB_LABELS = {
  "":        "Semua",
  matched:   "MATCHED_1_TO_1",
  changed:   "MATCHED_MULTIPLE",
  only_in_a: "NOT_FOUND",
  only_in_b: "INVALID_KEY",
};
const TAB_STYLE = {
  "":        { active: "bg-[var(--color-ink-solid)] text-white", idle: "bg-[var(--color-surface-sunken)] text-[var(--color-ink-body)] hover:bg-[var(--color-line)]/60" },
  matched:   { active: "bg-[var(--color-brand)] text-white",     idle: "bg-[var(--color-brand-soft)] text-[var(--color-brand)] hover:opacity-90" },
  changed:   { active: "bg-[var(--color-warning)] text-white",   idle: "bg-[var(--color-warning-soft)] text-[var(--color-warning)] hover:opacity-90" },
  only_in_a: { active: "bg-[var(--color-danger)] text-white",    idle: "bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:opacity-90" },
  only_in_b: { active: "bg-orange-600 text-white",               idle: "bg-orange-50 text-orange-700 hover:bg-orange-100" },
};

/* ── match status badge styles ── */
const MATCH_BADGE = {
  matched:   "bg-[var(--color-valid-soft)] text-[var(--color-valid)] border border-[var(--color-valid)]/25",
  changed:   "bg-[var(--color-warning-soft)] text-[var(--color-warning)] border border-[var(--color-warning)]/25",
  only_in_a: "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border border-[var(--color-danger)]/25",
  only_in_b: "bg-orange-100 text-orange-700 border border-orange-200",
};

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

  const loadResults = useCallback(async (jobId, diffType, pageNum) => {
    if (!jobId) return;
    setLoadingData(true);
    setError(null);
    try {
      const res = await getResults(jobId, {
        diffType: diffType || undefined,
        skip:     pageNum * PAGE_SIZE,
        limit:    PAGE_SIZE,
      });
      setResults(res);
    } catch (e) { setError(e.message); }
    finally { setLoadingData(false); }
  }, []);

  useEffect(() => { loadJobs(); loadSnapshots(); }, [loadJobs, loadSnapshots]);
  useEffect(() => {
    if (selected?.id) loadResults(selected.id, tab, page);
  }, [selected?.id, tab, page, loadResults]);
  useEffect(() => { setPage(0); }, [tab, selected?.id]);

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
    setResults(null);
    setPage(0);
    setTab("");
    try {
      const res = await runReconciliation({
        snapshotId:    activeSnap.id,
        tipeData:      recTipeData,
        primaryKeyCol: recPk.trim(),
      });
      // Muat ulang job list dan langsung select job baru berdasarkan job_id
      const jobRes = await listJobs(0, 100);
      const done   = (jobRes.jobs || []).filter(j => j.status === "done");
      setJobs(done);
      const newJob = done.find(j => j.id === res.job_id);
      if (newJob) {
        setSelected({ ...newJob }); // spread agar React deteksi perubahan referensi
      } else {
        // fallback: buat object dari response reconcile langsung
        setSelected({
          id:             res.job_id,
          total_rows_a:   res.total_rows_a,
          total_rows_b:   res.total_rows_b,
          total_matched:  res.summary?.matched   ?? 0,
          total_changed:  res.summary?.changed   ?? 0,
          total_only_in_a:res.summary?.only_in_a ?? 0,
          total_only_in_b:res.summary?.only_in_b ?? 0,
          bulan:          activeSnap.bulan,
          tahun:          activeSnap.tahun,
          file_b_name:    activeSnap.file_name,
          sheet_a:        "Master",
          sheet_b:        `OSCLN-${activeSnap.file_name}`,
          status:         "done",
        });
      }
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
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 py-6 space-y-5 font-sans text-[var(--color-ink)] saas-page-enter">
      <PageHeader
        title="OSCLN Reconciliation"
        description="Cocokkan Master OS Claim hasil append dengan snapshot CSV internal OSCLN secara dua arah tanpa mengubah data master."
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={ArrowPathIcon}
            loading={loading}
            onClick={() => {
              loadJobs();
              loadSnapshots();
            }}
          >
            Refresh Status
          </Button>
        }
      />

      {/* ── Two-panel setup ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ══ LEFT: Internal Data Source · OSCLN ══ */}
        <Card
          title="Internal Data Source · OSCLN"
          description="Import snapshot CSV OSCLN terbaru. Import berikutnya menggantikan snapshot OSCLN, bukan menambahi/menimpa Master OS Claim."
        >
          <div className="flex flex-col gap-4 h-full">
            <div>
              <p className="text-xs font-semibold text-[var(--color-ink-body)] mb-2">
                Upload OSCLN CSV (maks. 15 MB)
              </p>
              <div className="flex items-center gap-2.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    setOsclnFile(e.target.files[0] || null);
                    setUploadError(null);
                    setUploadOk(null);
                    e.target.value = "";
                  }}
                  disabled={uploading}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  Choose File
                </Button>
                <span className="text-xs text-[var(--color-ink-muted)] truncate max-w-[240px]">
                  {osclnFile ? osclnFile.name : "No file chosen"}
                </span>
              </div>

              {/* Progress */}
              {uploading && uploadPct > 0 && uploadPct < 100 && (
                <div className="mt-3 flex flex-col gap-1">
                  <div className="flex justify-between text-xs text-[var(--color-ink-muted)]">
                    <span>Mengunggah…</span>
                    <span className="font-semibold font-mono text-[var(--color-brand)]">
                      {uploadPct}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--color-brand)] rounded-full transition-all duration-300"
                      style={{ width: `${uploadPct}%` }}
                      role="progressbar"
                      aria-valuenow={uploadPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                </div>
              )}
              {uploading && uploadPct >= 100 && (
                <div className="mt-3 flex items-center gap-2 text-xs text-[var(--color-brand)] animate-pulse">
                  <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> Memproses data…
                </div>
              )}

              {/* Error / success */}
              {uploadError && (
                <div
                  role="alert"
                  className="mt-3 flex items-start gap-2 bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 text-[var(--color-danger)] px-3 py-2.5 rounded-[var(--radius-control)] text-xs"
                >
                  <ExclamationCircleIcon className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{uploadError}</span>
                </div>
              )}
              {uploadOk && (
                <div className="mt-3 flex items-start gap-2 bg-[var(--color-brand-soft)] border border-[var(--color-brand-line)] text-[var(--color-brand)] px-3 py-2.5 rounded-[var(--radius-control)] text-xs">
                  <CheckCircleIcon className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Upload berhasil</p>
                    <p className="mt-0.5 text-[var(--color-ink-body)]">
                      <strong>{uploadOk.total_rows?.toLocaleString("id-ID")}</strong> baris &middot; Snapshot #{uploadOk.snapshot_id} &middot; {uploadOk.file_name}
                    </p>
                    <p className="mt-0.5 text-[var(--color-ink-muted)]">
                      Snapshot otomatis dipilih. Klik <strong>Run Two-Way Matching</strong>.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-auto pt-2">
              <Button
                variant="primary"
                size="sm"
                icon={CloudArrowUpIcon}
                loading={uploading}
                disabled={!osclnFile}
                onClick={handleUpload}
              >
                {uploading ? "Mengunggah…" : "Upload OSCLN CSV"}
              </Button>
            </div>
          </div>
        </Card>

        {/* ══ RIGHT: Reconciliation Setup ══ */}
        <Card
          title="Reconciliation Setup"
          description="Konfigurasi snapshot OSCLN aktif, tipe data Master, dan kunci pencocokan"
        >
          <div className="flex flex-col gap-4 h-full">
            {/* Info box */}
            <div className="bg-[var(--color-brand-soft)] border border-[var(--color-brand-line)] rounded-[var(--radius-control)] px-4 py-3 flex items-start gap-2 text-xs text-[var(--color-ink-body)]">
              <InformationCircleIcon className="h-4 w-4 shrink-0 mt-0.5 text-[var(--color-brand)]" />
              <span className="leading-relaxed">
                <strong className="text-[var(--color-brand)]">
                  Matching key: Master[Loss Ref] &harr; OSCLN[loss_ref].
                </strong>{" "}
                Perbandingan bersifat key only. Kode cedant internal berbeda dari label cedant eksternal; nominal dan tanggal ditampilkan sebagai konteks,{" "}
                <span className="text-[var(--color-brand)] font-semibold">
                  belum menjadi aturan validasi.
                </span>
              </span>
            </div>

            {/* Active snapshot badge */}
            {activeSnap && (
              <div className="bg-[var(--color-valid-soft)] border border-[var(--color-valid)]/25 rounded-[var(--radius-control)] px-4 py-3 flex items-start gap-2 text-xs text-[var(--color-valid)]">
                <CheckCircleIcon className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-[var(--color-ink)]">{activeSnap.file_name}</p>
                  <p className="text-[var(--color-ink-muted)] mt-0.5">
                    {activeSnap.total_rows?.toLocaleString("id-ID")} baris OSCLN &middot;{" "}
                    {activeSnap.tahun}-{activeSnap.bulan}{" "}
                    {activeSnap.created_at
                      ? new Date(activeSnap.created_at).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })
                      : ""}
                    {selected && (
                      <span>
                        {" "}
                        &middot; Master OS Claim: {(selected.total_rows_a ?? 0).toLocaleString("id-ID")} baris
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Snapshot picker */}
            {snapshots.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[var(--color-ink-body)] mb-1.5">
                  Snapshot aktif
                </p>
                <select
                  value={activeSnap?.id ?? ""}
                  onChange={(e) => {
                    const s = snapshots.find((x) => x.id === Number(e.target.value));
                    setActiveSnap(s || null);
                    if (s?.primary_key_col) setRecPk(s.primary_key_col);
                  }}
                  className="w-full border border-[var(--color-line)] rounded-[var(--radius-control)] px-3 py-2 text-xs bg-[var(--color-surface)] text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:border-[var(--color-brand)]"
                >
                  {snapshots.map((s) => (
                    <option key={s.id} value={s.id}>
                      #{s.id} &middot; {s.file_name} &middot; {s.bulan}/{s.tahun} &middot; {s.total_rows?.toLocaleString("id-ID")} baris
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Tipe Data + Primary Key */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-semibold text-[var(--color-ink-body)] mb-1">
                  Tipe Data
                </p>
                <select
                  value={recTipeData}
                  onChange={(e) => setRecTipeData(e.target.value)}
                  className="w-full border border-[var(--color-line)] rounded-[var(--radius-control)] px-3 py-2 text-xs bg-[var(--color-surface)] text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:border-[var(--color-brand)]"
                >
                  <option value="OS Cedant">OS Claim Cedant</option>
                  <option value="Infopack">Infopack</option>
                </select>
              </div>
              <div>
                <p className="text-xs font-semibold text-[var(--color-ink-body)] mb-1">
                  Kolom Primary Key
                </p>
                <input
                  type="text"
                  value={recPk}
                  onChange={(e) => setRecPk(e.target.value)}
                  placeholder="primary_key_value"
                  className="w-full border border-[var(--color-line)] rounded-[var(--radius-control)] px-3 py-2 text-xs bg-[var(--color-surface)] text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:border-[var(--color-brand)] font-mono"
                />
              </div>
            </div>

            {/* Past results picker */}
            {jobs.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-[var(--color-ink-body)] mb-1.5">
                  Dataset aktif (hasil sebelumnya)
                </p>
                <select
                  value={selected?.id ?? ""}
                  onChange={(e) => {
                    const j = jobs.find((x) => x.id === Number(e.target.value));
                    if (j) setSelected(j);
                  }}
                  className="w-full border border-[var(--color-line)] rounded-[var(--radius-control)] px-3 py-2 text-xs bg-[var(--color-surface)] text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:border-[var(--color-brand)]"
                >
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      #{j.id} &middot; {j.file_b_name} &middot; {j.bulan}/{j.tahun}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Reconcile error */}
            {recError && (
              <div
                role="alert"
                className="flex items-start gap-2 bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 text-[var(--color-danger)] px-3 py-2 rounded-[var(--radius-control)] text-xs"
              >
                <ExclamationCircleIcon className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{recError}</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 mt-auto pt-2">
              <Button
                variant="primary"
                size="sm"
                icon={ArrowsRightLeftIcon}
                loading={reconciling}
                disabled={!activeSnap}
                onClick={handleReconcile}
              >
                {reconciling ? "Memproses…" : "Run Two-Way Matching"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={ArrowTopRightOnSquareIcon}
                disabled={!selected}
                onClick={() => selected && downloadReport(selected.id)}
              >
                Open Results Sheet
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile
          label="Master OS Claim Rows"
          value={selected?.total_rows_a?.toLocaleString("id-ID") ?? "—"}
          hint="Jumlah baris dari POV aktif"
          icon={DocumentTextIcon}
          accent="brand"
        />
        <MetricTile
          label="Found in Other Source"
          value={selected?.total_matched?.toLocaleString("id-ID") ?? "—"}
          hint={`Coverage ${coveragePct}%`}
          icon={CheckCircleIcon}
          accent="valid"
          type={selected ? "progress" : "none"}
          progressValue={Number(coveragePct)}
          progressLabel="Coverage"
          progressColor="var(--color-valid)"
        />
        <MetricTile
          label="Not Found"
          value={selected?.total_only_in_a?.toLocaleString("id-ID") ?? "—"}
          hint="Butuh tindak lanjut"
          icon={ExclamationCircleIcon}
          accent="danger"
        />
        <MetricTile
          label="Multiple / Invalid"
          value={((selected?.total_changed ?? 0) + (selected?.total_only_in_b ?? 0)).toLocaleString("id-ID")}
          hint={`Invalid key: ${selected?.total_only_in_b ?? 0}`}
          icon={ExclamationTriangleIcon}
          accent="warning"
        />
      </div>

      {error && (
        <div className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 text-[var(--color-danger)] px-4 py-3 rounded-[var(--radius-control)] text-xs font-medium flex items-center gap-2">
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Two-Way Matching Results ── */}
      <Card
        title="Two-Way Matching Results"
        description="Setiap baris sumber tampil satu kali. Hasil multiple match diringkas, tanpa menggandakan nilai."
        actions={
          <div className="flex rounded-[var(--radius-control)] border border-[var(--color-line)] overflow-hidden text-xs font-bold shrink-0">
            <button
              type="button"
              onClick={() => setDirection("master")}
              className={`px-3.5 py-1.5 transition-colors cursor-pointer ${
                direction === "master"
                  ? "bg-[var(--color-brand)] text-white"
                  : "bg-[var(--color-surface)] text-[var(--color-ink-body)] hover:bg-[var(--color-surface-sunken)]"
              }`}
            >
              Master &rarr; OSCLN
            </button>
            <button
              type="button"
              onClick={() => setDirection("oscln")}
              className={`px-3.5 py-1.5 transition-colors cursor-pointer ${
                direction === "oscln"
                  ? "bg-[var(--color-brand)] text-white"
                  : "bg-[var(--color-surface)] text-[var(--color-ink-body)] hover:bg-[var(--color-surface-sunken)]"
              }`}
            >
              OSCLN &rarr; Master
            </button>
          </div>
        }
        padding="none"
      >
        {/* Filter bar */}
        <div className="px-5 py-3 border-b border-[var(--color-line)] flex flex-wrap items-center gap-2.5 bg-[var(--color-surface)]">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-ink-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Loss Ref / Cedant / Status"
              className="pl-8 pr-3 h-9 text-xs border border-[var(--color-line)] rounded-[var(--radius-control)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:border-[var(--color-brand)] bg-[var(--color-surface-sunken)] text-[var(--color-ink)] w-56"
            />
          </div>

          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 h-9 text-xs border border-[var(--color-line)] rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:border-[var(--color-brand)]"
            >
              <option>All statuses</option>
              <option>MATCHED_1_TO_1</option>
              <option>MATCHED_MULTIPLE</option>
              <option>NOT_FOUND</option>
              <option>INVALID_KEY</option>
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)] text-[10px]">
              ▼
            </span>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => selected && downloadReport(selected.id)}
            disabled={!selected}
            icon={ArrowTopRightOnSquareIcon}
          >
            View POV on Sheets
          </Button>

          <div className="flex-1" />
          <span className="text-xs font-mono text-[var(--color-ink-muted)]">
            {totalRows.toLocaleString("id-ID")} baris
          </span>
        </div>

        {/* Tab pills */}
        <div className="px-5 py-2.5 border-b border-[var(--color-line)] flex items-center gap-2 flex-wrap bg-[var(--color-surface)]">
          {TAB_KEYS.map((key) => {
            const isActive = tab === key;
            const style = TAB_STYLE[key];
            const count = tabCounts[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors cursor-pointer ${
                  isActive ? style.active : style.idle
                }`}
              >
                {TAB_LABELS[key]}
                {count > 0 && (
                  <span className={`ml-1.5 text-[10px] ${isActive ? "opacity-85" : "opacity-75"}`}>
                    {count.toLocaleString("id-ID")}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="overflow-x-auto table-scroll">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface-sunken)]">
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider whitespace-nowrap sticky left-0 bg-[var(--color-surface-sunken)] z-10">Run ID</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider whitespace-nowrap">Match Status</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider whitespace-nowrap">Cedant</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider whitespace-nowrap">Sheet</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider whitespace-nowrap">Loss Ref</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider whitespace-nowrap">Outstanding</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider whitespace-nowrap">Date of Loss</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider whitespace-nowrap">Keterangan Loss Ref</th>
                <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider whitespace-nowrap">Master Same-Key Rows</th>
                <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider whitespace-nowrap">OSCLN Matched Rows</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider whitespace-nowrap">OSCLN Cedant Code(s)</th>
                <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider whitespace-nowrap">OSCLN Loss Date (first)</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider whitespace-nowrap">OSCLN Our Loss (first)</th>
                <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider whitespace-nowrap">OSCLN Row Numbers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]/60">
              {loadingData && (
                <tr><td colSpan={14} className="text-center py-12 text-[var(--color-ink-muted)] animate-pulse">Memuat data…</td></tr>
              )}
              {!loadingData && !selected && (
                <tr><td colSpan={14} className="text-center py-12 text-[var(--color-ink-muted)]">
                  Belum ada data. Upload OSCLN CSV dan klik Run Two-Way Matching.
                </td></tr>
              )}
              {!loadingData && rows.map((row, i) => {
                const d = mapRow(row, i);
                const outRaw = d.outstanding !== "—" ? String(d.outstanding).replace(/[^0-9.\-]/g, "") : null;
                const outNum = outRaw ? Number(outRaw) : null;
                const isNeg  = outNum !== null && outNum < 0;

                return (
                  <tr key={row.id} className="hover:bg-[var(--color-surface-sunken)]/60 transition-colors">
                    <td className="px-3 py-1.5 font-mono text-xs text-[var(--color-ink-muted)] whitespace-nowrap sticky left-0 bg-[var(--color-surface)]">{d.runId}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${MATCH_BADGE[d.diffType] ?? "bg-[var(--color-surface-sunken)] text-[var(--color-ink-body)]"}`}>
                        {TAB_LABELS[d.diffType] ?? d.diffType?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 font-medium text-[var(--color-ink)] whitespace-nowrap">{d.cedant}</td>
                    <td className="px-3 py-1.5 text-[var(--color-brand)] whitespace-nowrap">{d.sheet}</td>
                    <td className="px-3 py-1.5 font-mono text-orange-700 whitespace-nowrap">{d.lossRef}</td>
                    <td className={`px-3 py-1.5 text-right font-medium font-mono whitespace-nowrap ${isNeg ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]"}`}>
                      {outNum !== null
                        ? isNeg
                          ? `(${Math.abs(outNum).toLocaleString("id-ID", { minimumFractionDigits: 2 })})`
                          : outNum.toLocaleString("id-ID", { minimumFractionDigits: 2 })
                        : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-[var(--color-ink-muted)] whitespace-nowrap">{d.dol}</td>
                    <td className="px-3 py-1.5 text-[var(--color-ink-muted)] max-w-[180px]">
                      <span className="truncate block" title={d.ketLossRef}>{d.ketLossRef}</span>
                    </td>
                    <td className="px-3 py-1.5 text-center font-mono text-[var(--color-ink-body)]">{d.sameKeyRows}</td>
                    <td className="px-3 py-1.5 text-center font-mono text-[var(--color-ink-body)]">{d.osclnMatched}</td>
                    <td className="px-3 py-1.5 text-[var(--color-ink-body)] whitespace-nowrap">{d.osclnCedant}</td>
                    <td className="px-3 py-1.5 text-[var(--color-ink-muted)] whitespace-nowrap">{d.osclnDol}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-[var(--color-ink)] font-medium whitespace-nowrap">
                      {d.osclnLoss !== "—" ? Number(String(d.osclnLoss).replace(/[^0-9.\-]/g, "")).toLocaleString("id-ID") : "0"}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-[var(--color-ink-muted)]">{d.rowNum}</td>
                  </tr>
                );
              })}
              {!loadingData && selected && rows.length === 0 && (
                <tr><td colSpan={14} className="text-center py-12 text-[var(--color-ink-muted)]">Tidak ada data untuk filter ini.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-5 py-3 bg-[var(--color-surface-sunken)] border-t border-[var(--color-line)] flex items-center justify-between">
          <span className="text-xs text-[var(--color-ink-muted)]">
            {totalRows > 0
              ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, totalRows)} / ${totalRows.toLocaleString("id-ID")} · Page ${page + 1} / ${Math.max(1, totalPages)}`
              : "Tidak ada data"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loadingData}
              className="px-3 py-1.5 text-xs border border-[var(--color-line)] bg-[var(--color-surface)] rounded-[var(--radius-control)] disabled:opacity-40 hover:bg-[var(--color-brand-soft)] transition-colors text-[var(--color-ink-body)] cursor-pointer"
            >
              &larr; Previous
            </button>
            <span className="text-xs font-semibold font-mono text-[var(--color-ink)] min-w-[70px] text-center">
              Page {page + 1} / {Math.max(1, totalPages)}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loadingData}
              className="px-3 py-1.5 text-xs border border-[var(--color-line)] bg-[var(--color-surface)] rounded-[var(--radius-control)] disabled:opacity-40 hover:bg-[var(--color-brand-soft)] transition-colors text-[var(--color-ink-body)] cursor-pointer"
            >
              Next &rarr;
            </button>
          </div>
        </div>

        {/* Footer note */}
        <div className="px-5 py-3 bg-[var(--color-surface-sunken)] border-t border-[var(--color-line)] text-[11px] text-[var(--color-ink-muted)]">
          Hasil tersimpan dalam dua tab: MATCH_INBOUND_TO_OSCLN dan MATCH_OSCLN_TO_MASTER. Snapshot original CSV OSCLN tetap disimpan di Drive untuk audit.
        </div>
      </Card>
    </div>
  );
}
