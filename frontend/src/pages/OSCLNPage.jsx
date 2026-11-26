import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  getOsclnSources,
  previewCustomMatching,
  saveCustomMatching,
  listCustomMatchingHistory,
  getResults,
  downloadReport,
} from "../services/api";
import { PageHeader, MetricTile, Card, Button, Badge } from "../components/ui";
import {
  ArrowsRightLeftIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  TableCellsIcon,
  ArrowDownTrayIcon,
  ChevronDownIcon,
  CircleStackIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";

const PAGE_SIZE = 50;

const WORKSPACE_TABS = [
  { id: "customize", label: "Customize Matching", short: "Validasi OS Claim" },
  { id: "summary", label: "1. Summary OS Internal", short: "Summary" },
  { id: "internal_vs_cedant", label: "2. OS Claim Indore - Cedant", short: "Indore → Cedant" },
  { id: "cedant_vs_internal", label: "3. OS Claim Cedant - Indore", short: "Cedant → Indore" },
  { id: "internal_vs_infopack", label: "4. OS Claim Indore - Infopack", short: "Indore → Infopack" },
  { id: "infopack_vs_internal", label: "5. OS Claim Infopack - Indore", short: "Infopack → Indore" },
];

const POV_LIST = [
  { value: "internal_vs_cedant", label: "POV Internal → OS Cedant", datasetType: "OS Cedant" },
  { value: "cedant_vs_internal", label: "POV OS Cedant → Internal", datasetType: "OS Cedant" },
  { value: "internal_vs_infopack", label: "POV Internal → Infopack", datasetType: "Infopack" },
  { value: "infopack_vs_internal", label: "POV Infopack → Internal", datasetType: "Infopack" },
];

function fmtCurrency(val) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return "—";
  const num = Number(val);
  const abs = Math.abs(num).toLocaleString("id-ID", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return num < 0 ? `(${abs})` : abs;
}

function guessDefaultCol(columns, patterns) {
  for (const pat of patterns) {
    const found = columns.find((c) => pat.test(c.name));
    if (found) return found.name;
  }
  return "";
}

export default function OSCLNPage() {
  const [activeTab, setActiveTab] = useState("customize");

  /* ── Introspected DB Sources ── */
  const [sources, setSources] = useState(null);
  const [loadingSources, setLoadingSources] = useState(true);
  const [sourcesError, setSourcesError] = useState("");

  /* ── Customize Matching Config ── */
  const [pov, setPov] = useState("internal_vs_cedant");
  const [selectedTable, setSelectedTable] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [tableDropdownOpen, setTableDropdownOpen] = useState(false);
  const tableDropdownRef = useRef(null);

  const [reportingMonth, setReportingMonth] = useState("");
  const [reportingYear, setReportingYear] = useState("");
  const [cedantFilter, setCedantFilter] = useState("");
  const [aggregateInternal, setAggregateInternal] = useState(true);

  const [matchPairs, setMatchPairs] = useState([{ master_col: "", cedant_col: "" }]);
  const [masterOutstandingCol, setMasterOutstandingCol] = useState("");
  const [cedantOutstandingCol, setCedantOutstandingCol] = useState("");

  /* ── Preview & Save State ── */
  const [comparing, setComparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(null); // { job_id, message }
  const [previewData, setPreviewData] = useState(null); // { summary, base_columns, total_rows, rows }
  const [statusFilter, setStatusFilter] = useState("ALL"); // 'ALL' | 'matched_exact' | 'matched_diff' | 'not_matched'
  const [rowSearch, setRowSearch] = useState("");
  const [page, setPage] = useState(0);

  /* ── Saved History (for Summary & 4 POV tabs) ── */
  const [historyItems, setHistoryItems] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedHistoryJob, setSelectedHistoryJob] = useState(null);
  const [historyJobRows, setHistoryJobRows] = useState(null);
  const [loadingJobRows, setLoadingJobRows] = useState(false);

  /* ── Load DB Sources ── */
  const loadSources = useCallback(async () => {
    setLoadingSources(true);
    setSourcesError("");
    try {
      const res = await getOsclnSources();
      setSources(res);
    } catch (err) {
      setSourcesError(err.message || "Gagal memuat daftar tabel database.");
    } finally {
      setLoadingSources(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await listCustomMatchingHistory("", 100);
      setHistoryItems(res.items || []);
    } catch (_) {
      setHistoryItems([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
    loadHistory();
  }, [loadSources, loadHistory]);

  useEffect(() => {
    const handleOutside = (e) => {
      if (tableDropdownRef.current && !tableDropdownRef.current.contains(e.target)) {
        setTableDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  /* ── Derived Columns & Filtered Result Tables ── */
  const fsiColumns = sources?.fsi_columns || [];
  const allResultTables = sources?.result_tables || [];
  const activePovMeta = POV_LIST.find((p) => p.value === pov) || POV_LIST[0];

  const tablesForPov = useMemo(() => {
    const matchingType = allResultTables.filter(
      (t) => t.dataset_type === activePovMeta.datasetType
    );
    return matchingType.length > 0 ? matchingType : allResultTables;
  }, [allResultTables, activePovMeta.datasetType]);

  const filteredTables = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return tablesForPov;
    return tablesForPov.filter(
      (t) =>
        t.table_name.toLowerCase().includes(q) ||
        t.cedant_label.toLowerCase().includes(q)
    );
  }, [tablesForPov, tableSearch]);

  const activeTableMeta = useMemo(
    () => allResultTables.find((t) => t.table_name === selectedTable) || null,
    [allResultTables, selectedTable]
  );

  const cedantColumns = activeTableMeta?.columns || [];

  /* Auto-select first table & smart default columns when sources load or table changes */
  useEffect(() => {
    if (!selectedTable && tablesForPov.length > 0) {
      setSelectedTable(tablesForPov[0].table_name);
    }
  }, [tablesForPov, selectedTable]);

  useEffect(() => {
    if (fsiColumns.length === 0 || cedantColumns.length === 0) return;

    const defaultMasterKey = guessDefaultCol(fsiColumns, [
      /^loss_?ref$/i,
      /^doc_?no$/i,
      /loss.*ref/i,
      /claim.*no/i,
    ]);
    const defaultCedantKey = guessDefaultCol(cedantColumns, [
      /^doc_?no$/i,
      /loss.*ref/i,
      /claim.*no/i,
      /^no$/i,
    ]);
    const defaultMasterOut = guessDefaultCol(fsiColumns, [
      /^outstanding_?idr$/i,
      /^net_?idr$/i,
      /^our_?share$/i,
      /outstanding/i,
      /net/i,
    ]);
    const defaultCedantOut = guessDefaultCol(cedantColumns, [
      /outstanding/i,
      /net.*os/i,
      /amount/i,
      /gross/i,
      /balance/i,
    ]);

    setMatchPairs((prev) => {
      if (prev.length === 1 && !prev[0].master_col && !prev[0].cedant_col) {
        return [{ master_col: defaultMasterKey, cedant_col: defaultCedantKey }];
      }
      return prev.map((p) => ({
        master_col: fsiColumns.some((c) => c.name === p.master_col)
          ? p.master_col
          : defaultMasterKey,
        cedant_col: cedantColumns.some((c) => c.name === p.cedant_col)
          ? p.cedant_col
          : defaultCedantKey,
      }));
    });

    setMasterOutstandingCol((prev) =>
      fsiColumns.some((c) => c.name === prev) ? prev : defaultMasterOut
    );
    setCedantOutstandingCol((prev) =>
      cedantColumns.some((c) => c.name === prev) ? prev : defaultCedantOut
    );
  }, [selectedTable, fsiColumns, cedantColumns]);

  /* ── Pair Builder Handlers ── */
  const handleAddPair = () => {
    setMatchPairs((prev) => [...prev, { master_col: "", cedant_col: "" }]);
  };

  const handleRemovePair = (index) => {
    setMatchPairs((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const handlePairChange = (index, side, value) => {
    setMatchPairs((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [side]: value } : item))
    );
  };

  const handleResetComparison = () => {
    setMatchPairs([{ master_col: "", cedant_col: "" }]);
    setMasterOutstandingCol("");
    setCedantOutstandingCol("");
    setReportingMonth("");
    setReportingYear("");
    setCedantFilter("");
    setPreviewData(null);
    setSaveSuccess(null);
    setActionError("");
    setStatusFilter("ALL");
    setRowSearch("");
    setPage(0);
  };

  const buildPayload = () => ({
    pov,
    result_table: selectedTable,
    reporting_month: reportingMonth ? Number(reportingMonth) : null,
    reporting_year: reportingYear ? Number(reportingYear) : null,
    cedant_filter: cedantFilter.trim() || null,
    match_pairs: matchPairs.filter((p) => p.master_col && p.cedant_col),
    master_outstanding_col: masterOutstandingCol || null,
    cedant_outstanding_col: cedantOutstandingCol || null,
    aggregate_internal: aggregateInternal,
    limit: 1000,
  });

  const handleCompare = async () => {
    const payload = buildPayload();
    if (!payload.result_table) {
      setActionError("Pilih tabel database cedant terlebih dahulu.");
      return;
    }
    if (payload.match_pairs.length === 0) {
      setActionError("Pilih minimal satu pasangan Kolom Master = Kolom Cedant.");
      return;
    }
    setComparing(true);
    setActionError("");
    setSaveSuccess(null);
    setPage(0);
    try {
      const res = await previewCustomMatching(payload);
      setPreviewData(res);
    } catch (err) {
      setActionError(err.message || "Gagal membandingkan data.");
      setPreviewData(null);
    } finally {
      setComparing(false);
    }
  };

  const handleSaveMatching = async () => {
    const payload = buildPayload();
    if (!payload.result_table || payload.match_pairs.length === 0) {
      setActionError("Jalankan atau lengkapi konfigurasi pencocokkan terlebih dahulu.");
      return;
    }
    setSaving(true);
    setActionError("");
    setSaveSuccess(null);
    try {
      const res = await saveCustomMatching(payload);
      setSaveSuccess({ job_id: res.job_id, message: res.message });
      await loadHistory();
    } catch (err) {
      setActionError(err.message || "Gagal menyimpan data matching.");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenHistoryJob = async (jobItem) => {
    setSelectedHistoryJob(jobItem);
    setLoadingJobRows(true);
    try {
      const res = await getResults(jobItem.job_id, { skip: 0, limit: 100 });
      setHistoryJobRows(res);
    } catch (_) {
      setHistoryJobRows(null);
    } finally {
      setLoadingJobRows(false);
    }
  };

  /* ── Filtered Preview Rows ── */
  const filteredPreviewRows = useMemo(() => {
    const rows = previewData?.rows || [];
    const q = rowSearch.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === "matched_exact" && r.match_status !== "matched_exact") return false;
      if (statusFilter === "matched_diff" && r.match_status !== "matched_diff") return false;
      if (statusFilter === "not_matched" && r.ketersediaan !== "TIDAK ADA") return false;
      if (!q) return true;
      if (String(r.match_key || "").toLowerCase().includes(q)) return true;
      return Object.values(r.base_row || {}).some((v) =>
        String(v ?? "").toLowerCase().includes(q)
      );
    });
  }, [previewData, statusFilter, rowSearch]);

  const totalPreviewPages = Math.ceil(filteredPreviewRows.length / PAGE_SIZE);
  const pagedPreviewRows = filteredPreviewRows.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE
  );

  const visibleBaseCols = useMemo(
    () => (previewData?.base_columns || []).slice(0, 12),
    [previewData]
  );

  /* ── Filtered History for Summary & 4 POV tabs ── */
  const povHistoryItems = useMemo(() => {
    if (activeTab === "summary") return historyItems;
    return historyItems.filter((item) => item.pov === activeTab);
  }, [historyItems, activeTab]);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 py-6 space-y-5 font-sans text-[var(--color-ink)] saas-page-enter">
      <PageHeader
        title="OSCLN Reconciliation & Matching"
        description="Bandingkan data OSCLN Internal (fsi_db.clickhouse.oscln) terhadap tabel hasil per-cedant (hasil_rekonsiliasi) dengan pilihan field & POV bebas."
        actions={
          <div className="flex items-center gap-2.5 flex-wrap">
            <Badge
              tone={sources?.fsi_connected ? "valid" : "warning"}
              dot
              icon={CircleStackIcon}
            >
              {sources?.fsi_connected
                ? `fsi_db Connected (${(sources.fsi_total_rows || 0).toLocaleString("id-ID")} rows)`
                : "fsi_db Belum Terhubung"}
            </Badge>
            <Button
              variant="secondary"
              size="sm"
              icon={ArrowPathIcon}
              loading={loadingSources}
              onClick={() => {
                loadSources();
                loadHistory();
              }}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* ── Top 6-Tab Workspace Bar (mengikuti 5 POV + Customize Matching) ── */}
      <div className="flex bg-[var(--color-surface)] p-1 rounded-[var(--radius-control)] border border-[var(--color-line)] shadow-2xs overflow-x-auto gap-1 w-full lg:w-fit">
        {WORKSPACE_TABS.map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setActiveTab(t.id);
                setSelectedHistoryJob(null);
                setHistoryJobRows(null);
              }}
              className={`px-3.5 py-1.5 rounded-[calc(var(--radius-control)-2px)] text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? "bg-[var(--color-brand)] text-white shadow-2xs"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]/60"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Warning jika fsi_db belum terkonfigurasi/terhubung ── */}
      {!loadingSources && (sourcesError || sources?.fsi_error) && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
          <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Koneksi `fsi_db` (clickhouse.oscln) belum aktif</p>
            <p className="text-amber-800">{sourcesError || sources?.fsi_error}</p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 0: CUSTOMIZE MATCHING (DATA MAPPING OS)
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "customize" && (
        <div className="flex flex-col gap-5">
          <Card className="p-5 space-y-5">
            {/* Header Bar: Title + Searchable Pilih Tabel Database */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-[var(--color-line)]">
              <div>
                <div className="flex items-center gap-2">
                  <ArrowsRightLeftIcon className="h-5 w-5 text-[var(--color-brand)]" />
                  <h2 className="text-base font-bold text-[var(--color-ink)]">
                    Data Mapping OS{" "}
                    {selectedTable && (
                      <span className="text-[var(--color-brand)] font-mono">
                        : {selectedTable}
                      </span>
                    )}
                  </h2>
                </div>
                <p className="text-xs text-[var(--color-ink-muted)] mt-1">
                  Pilih POV, tabel hasil cedant di <code className="font-mono">hasil_rekonsiliasi</code>, lalu pasangkan kolom bebas untuk pencocokkan &amp; hitung selisih Outstanding.
                </p>
              </div>

              {/* Searchable Dropdown: Pilih Tabel Database */}
              <div className="w-full lg:w-80 relative" ref={tableDropdownRef}>
                <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-ink-muted)] mb-1 block">
                  Pilih Tabel Database (hasil_rekonsiliasi)
                </label>
                <button
                  type="button"
                  onClick={() => setTableDropdownOpen((o) => !o)}
                  className="w-full h-10 px-3 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-white flex items-center justify-between text-xs font-mono text-[var(--color-ink)] hover:border-[var(--color-brand)] transition-colors"
                >
                  <span className="truncate">
                    {selectedTable || "Pilih tabel cedant..."}
                  </span>
                  <ChevronDownIcon className="h-4 w-4 text-[var(--color-ink-muted)] shrink-0" />
                </button>

                {tableDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 z-40 w-full rounded-xl border border-[var(--color-line)] bg-white shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-[var(--color-line)]">
                      <div className="relative">
                        <MagnifyingGlassIcon className="h-3.5 w-3.5 text-[var(--color-ink-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={tableSearch}
                          onChange={(e) => setTableSearch(e.target.value)}
                          placeholder="Cari tabel..."
                          autoFocus
                          className="w-full h-8 pl-8 pr-2.5 text-xs rounded-lg border border-[var(--color-line)] focus:outline-none focus:border-[var(--color-brand)]"
                        />
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto divide-y divide-[var(--color-line)]/50">
                      {filteredTables.length === 0 ? (
                        <div className="px-3 py-4 text-center text-xs text-[var(--color-ink-muted)]">
                          Tidak ada tabel ditemukan di schema hasil_rekonsiliasi.
                        </div>
                      ) : (
                        filteredTables.map((t) => {
                          const isSel = t.table_name === selectedTable;
                          return (
                            <button
                              key={t.table_name}
                              type="button"
                              onClick={() => {
                                setSelectedTable(t.table_name);
                                setReportingMonth("");
                                setReportingYear("");
                                setTableDropdownOpen(false);
                                setTableSearch("");
                                setPreviewData(null);
                              }}
                              className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 text-xs transition-colors ${
                                isSel
                                  ? "bg-[var(--color-brand)] text-white"
                                  : "hover:bg-[var(--color-surface-sunken)] text-[var(--color-ink)]"
                              }`}
                            >
                              <span className="font-mono truncate">{t.table_name}</span>
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                                  isSel
                                    ? "bg-white/20 text-white"
                                    : "bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)]"
                                }`}
                              >
                                {t.total_rows.toLocaleString("id-ID")} rows
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Row 1: POV Selector + Period Filter + Reset Button */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-4">
                <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-ink-muted)] mb-1 block">
                  Point of View (POV)
                </label>
                <select
                  value={pov}
                  onChange={(e) => {
                    setPov(e.target.value);
                    setPreviewData(null);
                  }}
                  className="w-full h-9 px-3 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-white text-xs font-medium text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-brand)]"
                >
                  {POV_LIST.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-ink-muted)] mb-1 block">
                  Periode Tabel Cedant (Opsional)
                </label>
                <select
                  value={reportingYear && reportingMonth ? `${reportingYear}-${reportingMonth}` : ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      setReportingYear("");
                      setReportingMonth("");
                    } else {
                      const [y, m] = val.split("-");
                      setReportingYear(y);
                      setReportingMonth(m);
                    }
                  }}
                  className="w-full h-9 px-3 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-white text-xs text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-brand)]"
                >
                  <option value="">Semua Periode</option>
                  {(activeTableMeta?.periods || []).map((p) => (
                    <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>
                      {String(p.month).padStart(2, "0")}/{p.year}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-ink-muted)] mb-1 block">
                  Filter Cedant OSCLN (Opsional)
                </label>
                <input
                  type="text"
                  value={cedantFilter}
                  onChange={(e) => setCedantFilter(e.target.value)}
                  placeholder="cth: ACA, MAXIMUS..."
                  className="w-full h-9 px-3 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-white text-xs text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none focus:border-[var(--color-brand)]"
                />
              </div>

              <div className="md:col-span-2 flex justify-end">
                <Button variant="secondary" size="sm" onClick={handleResetComparison}>
                  Reset Perbandingan
                </Button>
              </div>
            </div>

            {/* Row 2: Dynamic Field Matching Pairs (Pilih Kolom Master = Pilih Kolom Cedant) */}
            <div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-sunken)]/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--color-ink)]">
                  Pasangan Kolom Pencocokkan (Key Matching)
                </span>
                <span className="text-[11px] text-[var(--color-ink-muted)]">
                  Bebas pilih 1 atau beberapa kolom (Loss Ref, COB, DOL, dll.)
                </span>
              </div>

              <div className="space-y-2.5">
                {matchPairs.map((pair, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 md:grid-cols-11 gap-2 items-center"
                  >
                    <div className="md:col-span-5">
                      {idx === 0 && (
                        <label className="text-[11px] font-semibold text-[var(--color-ink-muted)] mb-1 block">
                          Pilih Kolom Master ({sources?.fsi_source || "clickhouse.oscln"})
                        </label>
                      )}
                      <select
                        value={pair.master_col}
                        onChange={(e) => handlePairChange(idx, "master_col", e.target.value)}
                        className="w-full h-9 px-3 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-white text-xs font-mono text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-brand)]"
                      >
                        <option value="">-- Pilih kolom Master OSCLN --</option>
                        {fsiColumns.map((col) => (
                          <option key={col.name} value={col.name}>
                            {col.name} ({col.data_type})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-1 text-center font-bold text-[var(--color-ink-muted)] pt-0 md:pt-4">
                      =
                    </div>

                    <div className="md:col-span-5 flex items-end gap-2">
                      <div className="flex-1">
                        {idx === 0 && (
                          <label className="text-[11px] font-semibold text-[var(--color-ink-muted)] mb-1 block">
                            Pilih Kolom Cedant ({selectedTable || "belum dipilih"})
                          </label>
                        )}
                        <select
                          value={pair.cedant_col}
                          onChange={(e) => handlePairChange(idx, "cedant_col", e.target.value)}
                          className="w-full h-9 px-3 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-white text-xs font-mono text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-brand)]"
                        >
                          <option value="">-- Pilih kolom Cedant --</option>
                          {cedantColumns.map((col) => (
                            <option key={col.name} value={col.name}>
                              {col.name} ({col.data_type})
                            </option>
                          ))}
                        </select>
                      </div>
                      {matchPairs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemovePair(idx)}
                          className="h-9 w-9 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-white flex items-center justify-center text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] transition-colors shrink-0"
                          title="Hapus pasangan kolom"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-center pt-1">
                <Button
                  variant="secondary"
                  size="xs"
                  icon={PlusIcon}
                  onClick={handleAddPair}
                >
                  Tambah Pencocokkan
                </Button>
              </div>
            </div>

            {/* Row 3: Outstanding Value Comparison (Master Outstanding = Pilih Cedant Outstanding) */}
            <div className="rounded-xl border border-[var(--color-line)] bg-white p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-11 gap-2 items-end">
                <div className="md:col-span-5">
                  <label className="text-[11px] font-semibold text-[var(--color-ink-muted)] mb-1 block">
                    Master Outstanding (Kolom Nilai Internal)
                  </label>
                  <select
                    value={masterOutstandingCol}
                    onChange={(e) => setMasterOutstandingCol(e.target.value)}
                    className="w-full h-9 px-3 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-white text-xs font-mono text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-brand)]"
                  >
                    <option value="">-- Tidak membandingkan nominal --</option>
                    {fsiColumns.map((col) => (
                      <option key={col.name} value={col.name}>
                        {col.name} ({col.data_type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-1 text-center font-bold text-[var(--color-ink-muted)] pb-2">
                  =
                </div>

                <div className="md:col-span-5">
                  <label className="text-[11px] font-semibold text-[var(--color-ink-muted)] mb-1 block">
                    Pilih Cedant Outstanding (Kolom Nilai Pembanding)
                  </label>
                  <select
                    value={cedantOutstandingCol}
                    onChange={(e) => setCedantOutstandingCol(e.target.value)}
                    className="w-full h-9 px-3 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-white text-xs font-mono text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-brand)]"
                  >
                    <option value="">-- Tidak membandingkan nominal --</option>
                    {cedantColumns.map((col) => (
                      <option key={col.name} value={col.name}>
                        {col.name} ({col.data_type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs text-[var(--color-ink-body)] cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={aggregateInternal}
                  onChange={(e) => setAggregateInternal(e.target.checked)}
                  className="rounded border-[var(--color-line)] text-[var(--color-brand)] focus:ring-[var(--color-brand)]"
                />
                <span>
                  Akumulasi (SUM) nilai Net Internal per key jika terdapat beberapa baris dengan key sama
                </span>
              </label>
            </div>

            {/* Error / Success Messages */}
            {actionError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/25 text-xs text-[var(--color-danger)]">
                <ExclamationCircleIcon className="h-4 w-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}
            {saveSuccess && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--color-valid-soft)] border border-[var(--color-valid)]/25 text-xs text-[var(--color-valid)]">
                <div className="flex items-center gap-2">
                  <CheckCircleIcon className="h-4 w-4 shrink-0" />
                  <span>{saveSuccess.message}</span>
                </div>
                <Button
                  variant="secondary"
                  size="xs"
                  icon={ArrowDownTrayIcon}
                  onClick={() => downloadReport(saveSuccess.job_id)}
                >
                  Export Excel
                </Button>
              </div>
            )}

            {/* Action Buttons: Bandingkan Data & Update Data Matching */}
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <Button
                variant="primary"
                onClick={handleCompare}
                disabled={comparing || !sources?.fsi_connected || !selectedTable}
              >
                {comparing ? "Membandingkan..." : "Bandingkan Data"}
              </Button>
              <Button
                variant="secondary"
                onClick={handleSaveMatching}
                disabled={saving || !previewData}
                className="!border-emerald-600 !bg-emerald-600 !text-white hover:!bg-emerald-700 disabled:opacity-40"
              >
                {saving ? "Menyimpan..." : "Update Data Matching"}
              </Button>
            </div>
          </Card>

          {/* ── KPI Summary & Result Table (after Bandingkan Data) ── */}
          {previewData && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <MetricTile
                  label="Total Matched (ADA)"
                  value={(previewData.summary.total_matched || 0).toLocaleString("id-ID")}
                  hint={`Match Rate ${previewData.summary.match_rate_pct}%`}
                  accent="valid"
                />
                <MetricTile
                  label="Matched dgn Selisih"
                  value={(previewData.summary.matched_diff || 0).toLocaleString("id-ID")}
                  hint={`Exact: ${(previewData.summary.matched_exact || 0).toLocaleString("id-ID")}`}
                  accent="warning"
                />
                <MetricTile
                  label="Tidak Cocok (TIDAK ADA)"
                  value={(previewData.summary.not_matched || 0).toLocaleString("id-ID")}
                  hint={`Total Base: ${(previewData.summary.total_base_keys || 0).toLocaleString("id-ID")}`}
                  accent="danger"
                />
                <MetricTile
                  label="Total Master OS"
                  value={fmtCurrency(previewData.summary.total_master_outstanding)}
                  hint={previewData.summary.master_outstanding_col || "—"}
                />
                <MetricTile
                  label="Total Selisih (Variance)"
                  value={fmtCurrency(previewData.summary.total_variance)}
                  hint={`Cedant OS: ${fmtCurrency(previewData.summary.total_cedant_outstanding)}`}
                  accent={previewData.summary.total_variance === 0 ? "valid" : "danger"}
                />
              </div>

              <Card className="overflow-hidden">
                <div className="p-4 border-b border-[var(--color-line)] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <TableCellsIcon className="h-4 w-4 text-[var(--color-brand)]" />
                    <h3 className="text-sm font-bold text-[var(--color-ink)]">
                      {previewData.summary.pov_label} ({previewData.summary.total_matched} Matched)
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { id: "ALL", label: `Semua (${previewData.rows.length})` },
                      { id: "matched_exact", label: `ADA - Exact (${previewData.summary.matched_exact})` },
                      { id: "matched_diff", label: `ADA - Selisih (${previewData.summary.matched_diff})` },
                      { id: "not_matched", label: `TIDAK ADA (${previewData.summary.not_matched})` },
                    ].map((pill) => (
                      <button
                        key={pill.id}
                        type="button"
                        onClick={() => {
                          setStatusFilter(pill.id);
                          setPage(0);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                          statusFilter === pill.id
                            ? "bg-[var(--color-brand)] text-white"
                            : "bg-[var(--color-surface-sunken)] text-[var(--color-ink-body)] hover:bg-[var(--color-line)]/60"
                        }`}
                      >
                        {pill.label}
                      </button>
                    ))}

                    <div className="relative">
                      <MagnifyingGlassIcon className="h-3.5 w-3.5 text-[var(--color-ink-muted)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={rowSearch}
                        onChange={(e) => {
                          setRowSearch(e.target.value);
                          setPage(0);
                        }}
                        placeholder="Cari key / isi baris..."
                        className="h-8 pl-8 pr-3 rounded-lg border border-[var(--color-line)] text-xs bg-white focus:outline-none focus:border-[var(--color-brand)]"
                      />
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto table-scroll">
                  <table className="min-w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-[var(--color-surface-sunken)] border-b border-[var(--color-line)] text-[11px] uppercase font-bold text-[var(--color-ink-muted)]">
                        <th className="px-3 py-2.5 text-left whitespace-nowrap">No</th>
                        <th className="px-3 py-2.5 text-left whitespace-nowrap">Ketersediaan</th>
                        <th className="px-3 py-2.5 text-left whitespace-nowrap">Match Key</th>
                        <th className="px-3 py-2.5 text-right whitespace-nowrap">Master OS</th>
                        <th className="px-3 py-2.5 text-right whitespace-nowrap">Cedant OS</th>
                        <th className="px-3 py-2.5 text-right whitespace-nowrap">Selisih (Variance)</th>
                        {visibleBaseCols.map((col) => (
                          <th key={col} className="px-3 py-2.5 text-left whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-line)]/60">
                      {pagedPreviewRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6 + visibleBaseCols.length}
                            className="py-10 text-center text-[var(--color-ink-muted)]"
                          >
                            Tidak ada baris yang cocok dengan filter.
                          </td>
                        </tr>
                      ) : (
                        pagedPreviewRows.map((row, i) => {
                          const hasDiff = row.match_status === "matched_diff";
                          const isAda = row.ketersediaan === "ADA";
                          return (
                            <tr
                              key={`${row.match_key}-${i}`}
                              className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors"
                            >
                              <td className="px-3 py-2 font-mono text-[var(--color-ink-muted)]">
                                {page * PAGE_SIZE + i + 1}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    isAda
                                      ? hasDiff
                                        ? "bg-amber-50 text-amber-700 border-amber-200"
                                        : "bg-[var(--color-valid-soft)] text-[var(--color-valid)] border-[var(--color-valid)]/25"
                                      : "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border-[var(--color-danger)]/25"
                                  }`}
                                >
                                  {isAda ? (hasDiff ? "ADA (SELISIH)" : "ADA") : "TIDAK ADA"}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-mono font-semibold text-[var(--color-ink)] whitespace-nowrap">
                                {row.match_key}
                              </td>
                              <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                                {fmtCurrency(row.master_outstanding)}
                              </td>
                              <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                                {fmtCurrency(row.cedant_outstanding)}
                              </td>
                              <td
                                className={`px-3 py-2 text-right font-mono font-bold whitespace-nowrap ${
                                  row.variance !== 0
                                    ? "text-[var(--color-danger)]"
                                    : "text-[var(--color-valid)]"
                                }`}
                              >
                                {fmtCurrency(row.variance)}
                              </td>
                              {visibleBaseCols.map((col) => (
                                <td
                                  key={col}
                                  className="px-3 py-2 text-[var(--color-ink-body)] max-w-[200px] truncate"
                                  title={String(row.base_row?.[col] ?? "")}
                                >
                                  {row.base_row?.[col] ?? "—"}
                                </td>
                              ))}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {totalPreviewPages > 1 && (
                  <div className="px-4 py-3 border-t border-[var(--color-line)] flex items-center justify-between text-xs text-[var(--color-ink-muted)]">
                    <span>
                      Halaman {page + 1} dari {totalPreviewPages} ({filteredPreviewRows.length.toLocaleString("id-ID")} baris)
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="xs"
                        disabled={page === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                      >
                        Sebelumnya
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        disabled={page + 1 >= totalPreviewPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Berikutnya
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TABS 1–5: SUMMARY & 4 POV VIEWS (HASIL MATCHING TERSIMPAN)
         ══════════════════════════════════════════════════════════════════ */}
      {activeTab !== "customize" && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--color-ink)]">
                {WORKSPACE_TABS.find((t) => t.id === activeTab)?.label}
              </h2>
              <p className="text-xs text-[var(--color-ink-muted)]">
                Menampilkan riwayat hasil matching tersimpan. Klik <strong>Update Data Matching</strong> pada tab Customize Matching untuk menambah atau memperbarui data.
              </p>
            </div>
            <Button
              variant="primary"
              size="xs"
              icon={PlusIcon}
              onClick={() => {
                if (activeTab !== "summary") setPov(activeTab);
                setActiveTab("customize");
              }}
            >
              Jalankan Matching Baru
            </Button>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[var(--color-surface-sunken)] border-b border-[var(--color-line)] text-[11px] uppercase font-bold text-[var(--color-ink-muted)]">
                    <th className="px-4 py-3 text-left">POV</th>
                    <th className="px-4 py-3 text-left">Tabel Cedant</th>
                    <th className="px-4 py-3 text-left">Aturan Matching</th>
                    <th className="px-4 py-3 text-left">Periode</th>
                    <th className="px-4 py-3 text-right">Matched Exact</th>
                    <th className="px-4 py-3 text-right">Matched Selisih</th>
                    <th className="px-4 py-3 text-right">Only Internal</th>
                    <th className="px-4 py-3 text-right">Only Cedant</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-line)]/60">
                  {loadingHistory ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-[var(--color-ink-muted)]">
                        Memuat riwayat matching...
                      </td>
                    </tr>
                  ) : povHistoryItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-[var(--color-ink-muted)]">
                        <FunnelIcon className="h-6 w-6 mx-auto mb-2 opacity-40" />
                        Belum ada hasil matching tersimpan untuk POV ini.
                      </td>
                    </tr>
                  ) : (
                    povHistoryItems.map((item) => (
                      <tr
                        key={item.job_id}
                        className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors"
                      >
                        <td className="px-4 py-2.5 font-semibold text-[var(--color-ink)] whitespace-nowrap">
                          {item.pov_label}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[var(--color-brand)] whitespace-nowrap">
                          {item.result_table}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[var(--color-ink-body)]">
                          {item.match_expression}
                        </td>
                        <td className="px-4 py-2.5 font-mono whitespace-nowrap">
                          {item.bulan}/{item.tahun}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-[var(--color-valid)]">
                          {item.matched_exact.toLocaleString("id-ID")}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-amber-600">
                          {item.matched_diff.toLocaleString("id-ID")}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[var(--color-danger)]">
                          {item.only_in_internal.toLocaleString("id-ID")}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-orange-600">
                          {item.only_in_cedant.toLocaleString("id-ID")}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap space-x-1.5">
                          <Button
                            variant="secondary"
                            size="xs"
                            onClick={() => handleOpenHistoryJob(item)}
                          >
                            Detail
                          </Button>
                          <Button
                            variant="secondary"
                            size="xs"
                            icon={ArrowDownTrayIcon}
                            onClick={() => downloadReport(item.job_id)}
                          >
                            Excel
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Detail Saved Job Drawer/Card */}
          {selectedHistoryJob && (
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-[var(--color-line)] flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-ink)]">
                    Detail Matching #{selectedHistoryJob.job_id} — {selectedHistoryJob.result_table}
                  </h3>
                  <p className="text-xs text-[var(--color-ink-muted)] font-mono">
                    {selectedHistoryJob.pov_label} | {selectedHistoryJob.match_expression}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="xs"
                  icon={ArrowDownTrayIcon}
                  onClick={() => downloadReport(selectedHistoryJob.job_id)}
                >
                  Download Excel
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[var(--color-surface-sunken)] border-b border-[var(--color-line)] text-[11px] uppercase font-bold text-[var(--color-ink-muted)]">
                      <th className="px-3 py-2.5 text-left">Match Key</th>
                      <th className="px-3 py-2.5 text-left">Ketersediaan</th>
                      <th className="px-3 py-2.5 text-right">Master OS</th>
                      <th className="px-3 py-2.5 text-right">Cedant OS</th>
                      <th className="px-3 py-2.5 text-right">Selisih (Variance)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-line)]/60">
                    {loadingJobRows ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-[var(--color-ink-muted)]">
                          Memuat detail baris...
                        </td>
                      </tr>
                    ) : (
                      (historyJobRows?.results || []).map((row) => {
                        const a = row.row_data_a || {};
                        const ketersediaan = a.__ketersediaan || (row.diff_type === "matched" || row.diff_type === "changed" ? "ADA" : "TIDAK ADA");
                        const variance = a.__variance ?? 0;
                        return (
                          <tr key={row.id} className="hover:bg-[var(--color-surface-sunken)]/40">
                            <td className="px-3 py-2 font-mono font-semibold">
                              {row.primary_key_value}
                            </td>
                            <td className="px-3 py-2">
                              <Badge tone={ketersediaan === "ADA" ? "valid" : "danger"}>
                                {ketersediaan}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-right font-mono">
                              {fmtCurrency(a.__master_outstanding)}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">
                              {fmtCurrency(a.__cedant_outstanding)}
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-mono font-bold ${
                                variance !== 0 ? "text-[var(--color-danger)]" : "text-[var(--color-valid)]"
                              }`}
                            >
                              {fmtCurrency(variance)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
