import { useState, useEffect, useCallback } from "react";
import {
  getHeaderLibrary,
  getLibrary,
  getMasterUploadTableMapping,
  confirmMasterUploadMapping,
  skipMasterUploadSheet,
  deleteLibraryEntry,
  getMasterData,
} from "../services/api";
import { Badge, Button, Card, MetricTile, PageHeader } from "../components/ui";
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
  FunnelIcon,
  TableCellsIcon,
} from "@heroicons/react/24/outline";

const PAGE_SIZE = 20;
const HEADER_PAGE_SIZE = 50;

const STATUS_STYLE = {
  done:       "bg-[var(--color-valid-soft)] text-[var(--color-valid)] border border-[var(--color-valid)]/25",
  processing: "bg-[var(--color-warning-soft)] text-[var(--color-warning)] border border-[var(--color-warning)]/25",
  error:      "bg-[var(--color-danger-soft)] text-[var(--color-danger)] border border-[var(--color-danger)]/25",
  pending:    "bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)] border border-[var(--color-line)]",
};
const STATUS_LABEL = { done:"SUCCESS", processing:"PROCESSING", error:"ERROR", pending:"PENDING" };
const STATUS_DOT   = { done:"bg-[var(--color-valid)]", processing:"bg-[var(--color-warning)] animate-pulse", error:"bg-[var(--color-danger)]", pending:"bg-[var(--color-ink-faint)]" };
const FIELD_LABELS = {
  loss_ref: "Loss Ref",
  doc_no: "Loss Ref",
  outstanding: "Outstanding",
  dol: "DOL",
  gross: "Gross",
  currency: "Currency",
  insured: "Insured",
  class_code: "Class Code (COB)",
  cob: "Class Code (COB)",
  tsi: "TSI",
  title: "Title",
  value: "Value",
};

function ReviewUploadModal({
  file,
  pendingSheets,
  selectedSheet,
  mappingData,
  mapping,
  loading,
  saving,
  error,
  onSelectSheet,
  onChangeMapping,
  onConfirm,
  onSkip,
  onClose,
}) {
  const fields = (mappingData?.field_catalog || []).filter(
    (field) =>
      !(mappingData?.dataset_type === "INFOPACK" && field.field_name === "cob")
      && (field.default_source === "column" || field.candidate_headers?.length)
  );
  const missingRequired = fields.some(
    (field) => field.required && !mapping?.[field.field_name]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-upload-title"
        className="bg-[var(--color-surface)] rounded-[var(--radius-surface)] shadow-[var(--shadow-overlay)] border border-[var(--color-line)] w-full max-w-3xl max-h-[90vh] overflow-y-auto"
      >
        <div className="px-5 py-4 border-b border-[var(--color-line)] flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="review-upload-title" className="text-sm font-bold text-[var(--color-ink)]">
              Tinjau Upload
            </h2>
            <p className="text-xs text-[var(--color-ink-muted)] mt-1 truncate" title={file.file_name}>
              {file.file_name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-xs font-semibold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] disabled:opacity-50"
          >
            Tutup
          </button>
        </div>

        <div className="p-5 space-y-4">
          {pendingSheets.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {pendingSheets.map((sheet) => (
                <button
                  key={sheet.table_id}
                  type="button"
                  onClick={() => onSelectSheet(sheet)}
                  disabled={saving || loading}
                  className={`px-3 py-1.5 rounded-[var(--radius-control)] text-xs font-semibold border ${
                    selectedSheet?.table_id === sheet.table_id
                      ? "bg-[var(--color-brand)] text-white border-[var(--color-brand)]"
                      : "bg-[var(--color-surface-sunken)] text-[var(--color-ink-body)] border-[var(--color-line)]"
                  }`}
                >
                  {sheet.sheet_name}
                </button>
              ))}
            </div>
          )}

          {selectedSheet && (
            <div className="bg-[var(--color-warning-soft)] border border-[var(--color-warning)]/25 rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-ink-body)]">
              Sheet <strong>{selectedSheet.sheet_name}</strong> belum selesai. Petakan field wajib atau tandai sheet tidak dipakai.
            </div>
          )}

          {loading && (
            <div className="py-10 text-center text-xs text-[var(--color-ink-muted)] animate-pulse">
              Memuat mapping sheet...
            </div>
          )}

          {!loading && mappingData && (
            <>
              {mappingData.total_rows === 0 && (
                <p className="text-xs text-[var(--color-ink-muted)]">
                  Sheet ini tidak memiliki baris data.
                </p>
              )}
              <div className="space-y-3">
                {fields.map((field) => {
                  const candidates = field.candidate_headers || [];
                  const selected = candidates.find(
                    (candidate) => candidate.header === mapping?.[field.field_name]
                  );
                  return (
                    <label key={field.field_name} className="block">
                      <span className="flex items-center gap-2 text-xs font-semibold text-[var(--color-ink)] mb-1.5">
                        {FIELD_LABELS[field.field_name]
                          || field.field_name.replace(/_/g, " ")}
                        {field.required && (
                          <span className="text-[var(--color-danger)]">Wajib</span>
                        )}
                      </span>
                      <select
                        value={mapping?.[field.field_name] || ""}
                        onChange={(event) => onChangeMapping(field.field_name, event.target.value)}
                        disabled={saving}
                        className="w-full h-9 px-3 text-xs border border-[var(--color-line)] rounded-[var(--radius-control)] bg-[var(--color-surface)] text-[var(--color-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20"
                      >
                        <option value="">-- Pilih header sumber --</option>
                        {candidates.map((candidate) => (
                          <option key={candidate.header} value={candidate.header}>
                            {candidate.header}
                          </option>
                        ))}
                      </select>
                      {selected?.sample_values?.length > 0 && (
                        <span className="block mt-1 text-[10px] text-[var(--color-ink-muted)] truncate">
                          Contoh: {selected.sample_values.slice(0, 3).join(", ")}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              {missingRequired && (
                <p className="text-xs text-[var(--color-danger)]">
                  Semua field wajib harus dipetakan sebelum sheet diproses.
                </p>
              )}
            </>
          )}

          {error && (
            <p role="alert" className="text-xs text-[var(--color-danger)]">
              {error}
            </p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-[var(--color-line)] flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button
            variant="secondary"
            onClick={onSkip}
            disabled={saving || loading || !selectedSheet}
          >
            Tandai Tidak Dipakai
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            loading={saving}
            disabled={loading || !mappingData || missingRequired}
          >
            Simpan & Proses
          </Button>
        </div>
      </div>
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

function HeaderLibraryView({ activeTab }) {
  const [data, setData] = useState({ total: 0, headers: [] });
  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [cedantInput, setCedantInput] = useState("");
  const [cedant, setCedant] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getHeaderLibrary(activeTab, {
        cedant: cedant || undefined,
        search: search || undefined,
        skip: page * HEADER_PAGE_SIZE,
        limit: HEADER_PAGE_SIZE,
      });
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activeTab, cedant, page, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [activeTab, cedant, search]);

  const headers = data.headers || [];
  const totalPages = Math.ceil(data.total / HEADER_PAGE_SIZE);

  const applyFilters = () => {
    setSearch(searchInput.trim());
    setCedant(cedantInput.trim());
    setPage(0);
  };

  return (
    <Card
      title="Header Library"
      description="Satu baris per header pada setiap sheet upload. Header berulang tetap disimpan."
      badge={`${data.total.toLocaleString("id-ID")} header`}
      actions={
        <Button
          variant="secondary"
          size="sm"
          icon={ArrowPathIcon}
          loading={loading}
          onClick={load}
        >
          Refresh
        </Button>
      }
      padding="none"
    >
      {error && (
        <div className="m-4 bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 text-[var(--color-danger)] px-4 py-3 rounded-[var(--radius-control)] text-xs font-medium">
          {error}
        </div>
      )}

      <div className="px-5 py-3.5 border-b border-[var(--color-line)] flex flex-wrap items-center gap-3 bg-[var(--color-surface)]">
        <input
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && applyFilters()}
          placeholder="Cari header, file, atau sheet…"
          aria-label="Cari header, file, atau sheet"
          className="px-3 py-1.5 h-9 text-xs border border-[var(--color-line)] rounded-[var(--radius-control)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:border-[var(--color-brand)] bg-[var(--color-surface-sunken)] text-[var(--color-ink)] w-64"
        />
        <input
          type="text"
          value={cedantInput}
          onChange={(event) => setCedantInput(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && applyFilters()}
          placeholder="Kode cedant (opsional)"
          aria-label="Filter kode cedant"
          className="px-3 py-1.5 h-9 text-xs border border-[var(--color-line)] rounded-[var(--radius-control)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:border-[var(--color-brand)] bg-[var(--color-surface-sunken)] text-[var(--color-ink)] w-48"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={applyFilters}
        >
          Terapkan
        </Button>
      </div>

      <div className="overflow-x-auto table-scroll">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface-sunken)]">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Cedant</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">File</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider whitespace-nowrap">Batch / Table ID</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Sheet</th>
              <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Index</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Original Header</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Mapping Version</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider whitespace-nowrap">Waktu Upload</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-line)]/60">
            {loading && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-[var(--color-ink-muted)] animate-pulse">
                  Memuat header…
                </td>
              </tr>
            )}
            {!loading && headers.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-[var(--color-ink-muted)]">
                  Belum ada header yang cocok dengan filter.
                </td>
              </tr>
            )}
            {!loading && headers.map((header) => (
              <tr key={header.header_id} className="hover:bg-[var(--color-surface-sunken)]/60 transition-colors">
                <td className="px-4 py-2.5 font-semibold text-[var(--color-ink)] whitespace-nowrap">
                  {header.cedant_name || header.cedant_code || "—"}
                  {header.cedant_code && (
                    <span className="ml-1 text-[var(--color-ink-muted)] font-mono">({header.cedant_code})</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[var(--color-ink-body)] max-w-[240px] truncate" title={header.file_name}>
                  {header.file_name}
                </td>
                <td className="px-4 py-2.5 font-mono text-[var(--color-ink-muted)] whitespace-nowrap">
                  {header.batch_id} / {header.table_id}
                </td>
                <td className="px-4 py-2.5 text-[var(--color-ink-muted)] whitespace-nowrap">{header.sheet_name}</td>
                <td className="px-4 py-2.5 text-right font-mono text-[var(--color-ink-muted)]">{header.column_index}</td>
                <td className="px-4 py-2.5 font-mono font-semibold text-[var(--color-ink)] whitespace-nowrap">
                  {header.original_header}
                </td>
                <td className="px-4 py-2.5 text-[var(--color-ink-muted)]">
                  {header.mapping_version
                    ?? (header.upload_status === "skipped"
                      ? "Tidak dipakai"
                      : header.upload_status === "needs_review"
                        ? "Perlu ditinjau"
                        : "Belum dikonfirmasi")}
                </td>
                <td className="px-4 py-2.5 text-[var(--color-ink-muted)] whitespace-nowrap">
                  {header.uploaded_at
                    ? new Date(header.uploaded_at).toLocaleString("id-ID", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-5 py-3 bg-[var(--color-surface-sunken)] border-t border-[var(--color-line)] flex items-center justify-between">
          <span className="text-xs text-[var(--color-ink-muted)]">
            {page * HEADER_PAGE_SIZE + 1}–{Math.min((page + 1) * HEADER_PAGE_SIZE, data.total)} dari{" "}
            {data.total.toLocaleString("id-ID")} header
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={page === 0 || loading}
              className="p-1.5 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] disabled:opacity-40 hover:bg-[var(--color-brand-soft)]"
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeftIcon className="h-3.5 w-3.5 text-[var(--color-ink-body)]" />
            </button>
            <span className="text-xs font-semibold font-mono text-[var(--color-ink)]">{page + 1} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
              disabled={page >= totalPages - 1 || loading}
              className="p-1.5 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] disabled:opacity-40 hover:bg-[var(--color-brand-soft)]"
              aria-label="Halaman berikutnya"
            >
              <ChevronRightIcon className="h-3.5 w-3.5 text-[var(--color-ink-body)]" />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ══════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════ */
export default function LibraryPage({ initialTab }) {
  const [libraryView, setLibraryView] = useState("headers");
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
  const [reviewFile, setReviewFile] = useState(null);
  const [reviewSheet, setReviewSheet] = useState(null);
  const [reviewData, setReviewData] = useState(null);
  const [reviewMapping, setReviewMapping] = useState({});
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewError, setReviewError] = useState("");
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

  useEffect(() => {
    if (libraryView === "files") load();
  }, [libraryView, load]);
  useEffect(() => { setPage(0); setSearch(""); setSearchInput(""); }, [activeTab]);

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

  const loadReviewSheet = async (sheet) => {
    setReviewSheet(sheet);
    setReviewData(null);
    setReviewMapping({});
    setReviewError("");
    setReviewLoading(true);
    try {
      const result = await getMasterUploadTableMapping(sheet.table_id);
      setReviewData(result);
      const suggestedMapping = { ...(result.suggested_mapping || {}) };
      if (result.dataset_type === "INFOPACK" && suggestedMapping.cob) {
        if (!suggestedMapping.class_code) {
          suggestedMapping.class_code = suggestedMapping.cob;
        }
        delete suggestedMapping.cob;
      }
      setReviewMapping(suggestedMapping);
    } catch (e) {
      setReviewError(e.message);
    } finally {
      setReviewLoading(false);
    }
  };

  const handleOpenReview = async (file) => {
    const pendingSheets = file.pending_sheets || [];
    if (!pendingSheets.length) return;
    setReviewFile(file);
    await loadReviewSheet(pendingSheets[0]);
  };

  const handleFinishReview = async (skip = false) => {
    if (!reviewFile || !reviewSheet) return;
    if (
      skip
      && !window.confirm(`Tandai sheet "${reviewSheet.sheet_name}" sebagai tidak dipakai?`)
    ) {
      return;
    }
    setReviewSaving(true);
    setReviewError("");
    try {
      if (skip) {
        await skipMasterUploadSheet(reviewSheet.table_id);
      } else {
        await confirmMasterUploadMapping(reviewSheet.table_id, reviewMapping);
      }

      const remainingSheets = (reviewFile.pending_sheets || []).filter(
        (sheet) => sheet.table_id !== reviewSheet.table_id
      );
      await load();
      if (remainingSheets.length) {
        setReviewFile({ ...reviewFile, pending_sheets: remainingSheets });
        await loadReviewSheet(remainingSheets[0]);
      } else {
        setReviewFile(null);
        showToast(
          skip
            ? "Sheet dilewati. Upload selesai."
            : "Mapping disimpan. Upload selesai."
        );
      }
    } catch (e) {
      setReviewError(e.message);
    } finally {
      setReviewSaving(false);
    }
  };

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
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 py-6 space-y-5 font-sans text-[var(--color-ink)] saas-page-enter">
      <PageHeader
        title="File & Header Library"
        description="Kelola riwayat berkas Excel yang telah masuk ke Master Data dan katalog header hasil pemindaian per cedant."
        actions={
          libraryView === "files" ? (
            <Button
              variant="secondary"
              size="sm"
              icon={ArrowPathIcon}
              loading={loading}
              onClick={load}
            >
              Refresh
            </Button>
          ) : null
        }
      />

      {/* Tabs & View Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex bg-[var(--color-surface)] p-1 rounded-[var(--radius-control)] border border-[var(--color-line)] shadow-sm">
          {["OS Cedant", "Infopack"].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-[calc(var(--radius-control)-2px)] text-xs font-bold transition-all cursor-pointer ${
                activeTab === tab
                  ? "bg-[var(--color-brand)] text-white shadow-sm"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {tab === "OS Cedant" ? "OS Claim Cedant" : "InfoPack"}
            </button>
          ))}
        </div>

        <div className="flex bg-[var(--color-surface)] p-1 rounded-[var(--radius-control)] border border-[var(--color-line)] shadow-sm">
          {[
            ["files", "File Uploads"],
            ["headers", "Header Library"],
          ].map(([view, label]) => (
            <button
              key={view}
              type="button"
              onClick={() => setLibraryView(view)}
              className={`px-4 py-1.5 rounded-[calc(var(--radius-control)-2px)] text-xs font-bold transition-all cursor-pointer ${
                libraryView === view
                  ? "bg-[var(--color-brand)] text-white shadow-sm"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {libraryView === "headers" ? (
        <HeaderLibraryView activeTab={activeTab} />
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricTile
              label="Total File Diupload"
              value={totalFiles.toLocaleString("id-ID")}
              hint="Semua upload job"
              icon={BookOpenIcon}
              accent="brand"
              loading={loading}
            />
            <MetricTile
              label="Total Baris di Master"
              value={masterTotal.toLocaleString("id-ID")}
              hint="Akumulasi seluruh upload"
              icon={TableCellsIcon}
              accent="premi"
              loading={loading}
            />
            <MetricTile
              label="Baris Ditambahkan"
              value={totalAppended.toLocaleString("id-ID")}
              hint="Dari halaman aktif ini"
              icon={CheckCircleIcon}
              accent="valid"
              loading={loading}
            />
            <MetricTile
              label="Error Upload"
              value={errorCount.toLocaleString("id-ID")}
              hint={errorCount > 0 ? "Perlu diulang" : "Semua berhasil"}
              icon={ExclamationTriangleIcon}
              accent={errorCount > 0 ? "danger" : "ink"}
              loading={loading}
            />
          </div>

          {error && (
            <div className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 text-[var(--color-danger)] px-4 py-3 rounded-[var(--radius-control)] text-xs font-medium">
              {error}
            </div>
          )}

          {/* Main File Uploads Card */}
          <Card
            title={`File Uploads — ${activeTab === "OS Cedant" ? "OS Claim Cedant" : "InfoPack"}`}
            description="Semua file yang sudah diupload ke Master. Setiap baris mewakili satu file upload."
            badge={`${filtered.length} file`}
            padding="none"
          >
            {/* Toolbar */}
            <div className="px-5 py-3.5 border-b border-[var(--color-line)] flex flex-wrap items-center gap-3 bg-[var(--color-surface)]">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-ink-muted)]" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput)}
                  placeholder="Cari nama file, cedant, periode…"
                  className="pl-8 pr-3 h-9 text-xs border border-[var(--color-line)] rounded-[var(--radius-control)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:border-[var(--color-brand)] bg-[var(--color-surface-sunken)] text-[var(--color-ink)] w-60"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <FunnelIcon className="h-3.5 w-3.5 text-[var(--color-ink-muted)] shrink-0" />
                <div className="flex gap-1">
                  {[
                    { key: "all", label: "Semua" },
                    { key: "done", label: "Success" },
                    { key: "error", label: "Error" },
                  ].map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setStatusFilter(f.key)}
                      className={`px-2.5 py-1 rounded-[var(--radius-control)] text-xs font-semibold transition-colors cursor-pointer ${
                        statusFilter === f.key
                          ? "bg-[var(--color-brand)] text-white"
                          : "bg-[var(--color-surface-sunken)] text-[var(--color-ink-body)] hover:text-[var(--color-ink)] border border-[var(--color-line)]"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto table-scroll">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface-sunken)]">
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">File</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Cedant</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Periode</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-[var(--color-brand)] uppercase tracking-wider">Ditambahkan</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Dilewati</th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Total Baris</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider whitespace-nowrap">Waktu Upload</th>
                    <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-line)]/60">
                  {loading && (
                    <tr><td colSpan={9} className="text-center py-12 text-[var(--color-ink-muted)] animate-pulse">Memuat…</td></tr>
                  )}
                  {!loading && filtered.length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-center py-16">
                        <div className="flex flex-col items-center gap-2 text-[var(--color-ink-muted)]">
                          <BookOpenIcon className="h-10 w-10 text-[var(--color-ink-faint)]" />
                          <p className="font-semibold text-[var(--color-ink)]">Library kosong</p>
                          <p className="text-xs">Upload file terlebih dahulu dari halaman Upload Data.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                  {!loading && filtered.map((f) => (
                    <tr key={f.id} className="hover:bg-[var(--color-surface-sunken)]/60 transition-colors group">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 max-w-[220px]">
                          <DocumentIcon className="h-4 w-4 text-[var(--color-brand)] shrink-0" />
                          <span className="truncate text-[var(--color-ink)] font-medium text-xs" title={f.file_name}>
                            {f.file_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-[var(--color-ink)] whitespace-nowrap">
                        {f.cedant || <span className="text-[var(--color-ink-faint)] font-normal italic">—</span>}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {f.bulan && f.tahun ? (
                          <Badge tone="brand">{f.bulan}/{f.tahun}</Badge>
                        ) : <span className="text-[var(--color-ink-faint)]">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold font-mono text-[var(--color-brand)]">
                        {f.rows_appended?.toLocaleString("id-ID") ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[var(--color-ink-muted)]">
                        {f.rows_skipped?.toLocaleString("id-ID") ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[var(--color-ink)] font-medium">
                        {f.total_rows?.toLocaleString("id-ID") ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[f.status] ?? "bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)]"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_DOT[f.status] ?? "bg-[var(--color-ink-faint)]"}`} />
                          {STATUS_LABEL[f.status] ?? f.status?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[var(--color-ink-muted)] whitespace-nowrap">
                        {f.created_at
                          ? <>
                              <span className="block">{new Date(f.created_at).toLocaleDateString("id-ID", { day:"2-digit", month:"short", year:"numeric" })}</span>
                              <span className="block text-[10px] font-mono text-[var(--color-ink-faint)]">{new Date(f.created_at).toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit" })}</span>
                            </>
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                          {f.status === "error" && (
                            <span className="text-[10px] text-[var(--color-danger)] italic max-w-[100px] truncate" title={f.error_message}>
                              {f.error_message?.slice(0, 30)}
                            </span>
                          )}
                          {f.pending_sheets?.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleOpenReview(f)}
                              className="px-2 py-1 rounded-[var(--radius-control)] text-[10px] font-bold text-[var(--color-warning)] border border-[var(--color-warning)]/30 hover:bg-[var(--color-warning-soft)] transition-colors"
                              title="Tinjau sheet yang belum selesai"
                            >
                              Tinjau ({f.pending_sheets.length})
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setConfirmFile(f)}
                            className="text-[var(--color-ink-muted)] hover:text-[var(--color-danger)] transition-colors p-0.5 cursor-pointer"
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

            {totalPages > 1 && (
              <div className="px-5 py-3 bg-[var(--color-surface-sunken)] border-t border-[var(--color-line)] flex items-center justify-between">
                <span className="text-xs text-[var(--color-ink-muted)]">
                  Halaman {page + 1} / {totalPages} &middot; {total} total file
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0 || loading}
                    className="p-1.5 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] disabled:opacity-40 hover:bg-[var(--color-brand-soft)] transition-colors"
                  >
                    <ChevronLeftIcon className="h-3.5 w-3.5 text-[var(--color-ink-body)]" />
                  </button>
                  <span className="text-xs font-semibold font-mono text-[var(--color-ink)] min-w-[60px] text-center">{page + 1} / {totalPages}</span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1 || loading}
                    className="p-1.5 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] disabled:opacity-40 hover:bg-[var(--color-brand-soft)] transition-colors"
                  >
                    <ChevronRightIcon className="h-3.5 w-3.5 text-[var(--color-ink-body)]" />
                  </button>
                </div>
              </div>
            )}
          </Card>

          <div className="bg-[var(--color-brand-soft)] border border-[var(--color-brand-line)] rounded-[var(--radius-surface)] px-5 py-3.5 flex items-center gap-3 text-xs text-[var(--color-ink-body)]">
            <TableCellsIcon className="h-4 w-4 text-[var(--color-brand)] shrink-0" />
            <span>
              Library menampilkan riwayat per-file upload. Untuk melihat semua baris data yang tersimpan, buka halaman{" "}
              <strong className="text-[var(--color-brand)]">Master Data</strong> di sidebar.
              Menghapus file dari Library juga menghapus baris datanya dari Master.
            </span>
          </div>
        </>
      )}

      {/* Confirm delete modal */}
      {reviewFile && (
        <ReviewUploadModal
          file={reviewFile}
          pendingSheets={reviewFile.pending_sheets || []}
          selectedSheet={reviewSheet}
          mappingData={reviewData}
          mapping={reviewMapping}
          loading={reviewLoading}
          saving={reviewSaving}
          error={reviewError}
          onSelectSheet={loadReviewSheet}
          onChangeMapping={(fieldName, header) => {
            setReviewMapping((current) => {
              const next = { ...current };
              if (header) next[fieldName] = header;
              else delete next[fieldName];
              return next;
            });
          }}
          onConfirm={() => handleFinishReview(false)}
          onSkip={() => handleFinishReview(true)}
          onClose={() => {
            if (!reviewSaving) setReviewFile(null);
          }}
        />
      )}

      {confirmFile && (
        <ConfirmModal
          file={confirmFile}
          onConfirm={handleDelete}
          onCancel={() => setConfirmFile(null)}
          loading={deleting}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className={[
            "fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-[var(--radius-control)] shadow-[var(--shadow-overlay)] text-xs font-semibold border transition-all",
            toast.type === "error"
              ? "bg-[var(--color-danger-soft)] border-[var(--color-danger)]/30 text-[var(--color-danger)]"
              : "bg-[var(--color-valid-soft)] border-[var(--color-valid)]/30 text-[var(--color-valid)]",
          ].join(" ")}
        >
          {toast.type === "error"
            ? <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
            : <CheckCircleIcon className="h-4 w-4 shrink-0" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
