import { useState, useEffect, useCallback, useMemo } from "react";
import { getMasterData, getColumnMappings, exportMasterCsv } from "../services/api";
import { PageHeader, Button, Badge } from "../components/ui";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  TableCellsIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";

const PAGE_SIZE = 50;

export default function MasterPage() {
  const [data, setData] = useState(null); // { total, scanned_headers, rows }
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [activeTab, setActiveTab] = useState("os"); // 'os' | 'infopack'
  const [selectedCedant, setSelectedCedant] = useState("");
  const [mappingProfiles, setMappingProfiles] = useState([]);
  const [cedantOptionsError, setCedantOptionsError] = useState(null);
  const [columnView, setColumnView] = useState("core"); // 'core' | 'all'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const tipeData = activeTab === "os" ? "OS Cedant" : "Infopack";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMasterData(tipeData, {
        cedant: selectedCedant || undefined,
        search: search || undefined,
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tipeData, selectedCedant, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    getColumnMappings()
      .then((res) => {
        if (!cancelled) setMappingProfiles(res.profiles || []);
      })
      .catch((e) => {
        if (!cancelled) setCedantOptionsError(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPage(0);
  }, [activeTab, search, selectedCedant]);

  const totalRows = data?.total ?? 0;
  const totalPages = Math.ceil(totalRows / PAGE_SIZE);
  const rows = data?.rows || [];
  const scannedHeaders = data?.scanned_headers || [];
  const cedantOptions = useMemo(() => {
    const options = new Map();
    mappingProfiles
      .filter((profile) => profile.tipe_data === tipeData)
      .forEach((profile) => {
        const code = String(profile.cedantCode || "").trim();
        if (code && !options.has(code)) {
          options.set(code, {
            code,
            name: String(profile.cedant || code).trim(),
          });
        }
      });
    return [...options.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [mappingProfiles, tipeData]);
  const selectedCedantName = cedantOptions.find(
    (option) => option.code === selectedCedant,
  )?.name;

  const displayValue = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value).trim();
    return ["-", "—", "–", "nan", "none"].includes(text.toLowerCase()) ? "" : text;
  };

  function mapCoreRow(r) {
    const d = r.row_data || {};
    const sheet = displayValue(r.sheet_name || d.sheet);

    if (activeTab === "infopack") {
      return {
        cedant: displayValue(r.cedant),
        sheet,
        classCode: displayValue(d.class_code),
        title: displayValue(d.title || r.primary_key_value),
        value: displayValue(d.value),
        period: [r.bulan, r.tahun].filter(Boolean).join("/"),
      };
    }

    return {
      cedant: displayValue(r.cedant),
      sheet,
      lossRef: displayValue(r.primary_key_value || d.doc_no),
      outstanding: displayValue(d.outstanding),
      dol: displayValue(d.dol),
      currency: displayValue(d.currency),
      ket: displayValue(d.Description || d.description || d.keterangan || d.Name_TTG),
    };
  }

  const handleSearch = () => setSearch(searchInput.trim());

  const handleExport = () => {
    setExporting(true);
    exportMasterCsv(tipeData, selectedCedant || undefined);
    setTimeout(() => setExporting(false), 1500);
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 py-6 space-y-5 font-sans saas-page-enter">
      {/* Top Heading & Actions */}
      <PageHeader
        title={`Master ${activeTab === "os" ? "OS Claim Cedant" : "InfoPack"}`}
        description="Pilih cedant untuk melihat data intinya atau seluruh kolom asli hasil scan file Excel."
        actions={
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              icon={ArrowPathIcon}
              loading={loading}
              onClick={load}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={ArrowDownTrayIcon}
              loading={exporting}
              disabled={totalRows === 0}
              onClick={handleExport}
            >
              Export Excel
            </Button>
          </div>
        }
      />

      {/* Dataset Tabs & Column View Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Dataset Type Tabs */}
        <div className="flex bg-[var(--color-surface)] p-1 rounded-[var(--radius-control)] border border-[var(--color-line)] shadow-2xs">
          {[
            ["os", "OS Claim Cedant"],
            ["infopack", "InfoPack"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActiveTab(key);
                setSelectedCedant("");
              }}
              className={`px-4 py-1.5 rounded-[calc(var(--radius-control)-2px)] text-xs font-bold transition-all cursor-pointer ${
                activeTab === key
                  ? "bg-[var(--color-brand)] text-white shadow-2xs"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label
            htmlFor="master-cedant-filter"
            className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-ink-muted)]"
          >
            Cedant
          </label>
          <select
            id="master-cedant-filter"
            value={selectedCedant}
            onChange={(event) => {
              setSelectedCedant(event.target.value);
              setPage(0);
            }}
            className="max-w-[260px] rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-brand)]"
          >
            <option value="">Semua Cedant</option>
            {cedantOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name} ({option.code})
              </option>
            ))}
          </select>
        </div>

        {/* Column View Mode Toggle: Core DB Columns vs All Scanned Excel Headers */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-ink-muted)]">
            Column View:
          </span>
          <div className="flex bg-[var(--color-surface)] p-1 rounded-[var(--radius-control)] border border-[var(--color-line)] shadow-2xs">
            <button
              type="button"
              onClick={() => setColumnView("core")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[calc(var(--radius-control)-2px)] text-xs font-bold transition-all cursor-pointer ${
                columnView === "core"
                  ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)] border border-[var(--color-brand-line)]"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              <TableCellsIcon className="w-3.5 h-3.5" />
              <span>Core DB Columns</span>
            </button>
            <button
              type="button"
              onClick={() => setColumnView("all")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[calc(var(--radius-control)-2px)] text-xs font-bold transition-all cursor-pointer ${
                columnView === "all"
                  ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)] border border-[var(--color-brand-line)]"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              <Squares2X2Icon className="w-3.5 h-3.5" />
              <span>
                All Scanned Columns ({scannedHeaders.length || "Full"})
              </span>
            </button>
          </div>
        </div>
      </div>

      {cedantOptionsError && (
        <div className="text-xs text-[var(--color-danger)]">
          Daftar mapping cedant tidak dapat dimuat: {cedantOptionsError}
        </div>
      )}

      {error && (
        <div className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/25 text-[var(--color-danger)] px-4 py-3 rounded-[var(--radius-surface)] text-xs font-medium">
          {error}
        </div>
      )}

      {/* Main Data Card */}
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-surface)] border border-[var(--color-line)] shadow-[var(--shadow-card)] overflow-hidden">
        {/* Card Toolbar */}
        <div className="px-5 py-3.5 border-b border-[var(--color-line)] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-sm font-bold text-[var(--color-ink)]">
              {columnView === "core"
                ? "Core Master Database Records"
                : "Full Scanned Excel Columns (All Headers)"}
            </span>
            <Badge tone="brand">
              {totalRows.toLocaleString("id-ID")} rows
            </Badge>
            {selectedCedantName && (
              <Badge tone="valid">{selectedCedantName}</Badge>
            )}
            {columnView === "all" && scannedHeaders.length > 0 && (
              <Badge tone="valid" dot>
                {scannedHeaders.length} Scanned Headers Active
              </Badge>
            )}
          </div>

          {/* Search Input */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--color-ink-muted)]" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Cari loss ref / cedant / sheet..."
                className="pl-8 pr-7 py-1.5 text-xs border border-[var(--color-line)] rounded-[var(--radius-control)] focus:outline-none focus:border-[var(--color-brand)] bg-[var(--color-surface)] w-56 font-medium text-[var(--color-ink)]"
              />
              {(searchInput || search) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSearchInput("");
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer"
                >
                  <XMarkIcon className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <Button variant="secondary" size="xs" onClick={handleSearch}>
              Search
            </Button>
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto table-scroll">
          {columnView === "core" ? (
            /* ── MODE 1: CORE DB COLUMNS ── */
            <table className="min-w-full text-xs sm:text-[13px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)] text-[11px] uppercase font-bold tracking-wider">
                  <th className="px-4 py-3 text-left whitespace-nowrap">Cedant Code</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">Sheet</th>
                  {activeTab === "os" ? (
                    <>
                      <th className="px-4 py-3 text-left whitespace-nowrap">Loss Ref</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Outstanding</th>
                      <th className="px-4 py-3 text-left whitespace-nowrap">Currency</th>
                      <th className="px-4 py-3 text-left whitespace-nowrap">Date of Loss</th>
                      <th className="px-4 py-3 text-left whitespace-nowrap">Description / Insured</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 text-left whitespace-nowrap">Class Code</th>
                      <th className="px-4 py-3 text-left whitespace-nowrap">Title / Uraian</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Value</th>
                      <th className="px-4 py-3 text-left whitespace-nowrap">Periode</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]/60">
                {loading && (
                  <tr>
                    <td
                      colSpan={activeTab === "os" ? 7 : 6}
                      className="text-center py-12 text-[var(--color-ink-muted)] animate-pulse"
                    >
                      Memuat data Master...
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={activeTab === "os" ? 7 : 6}
                      className="text-center py-12 text-[var(--color-ink-muted)]"
                    >
                      Belum ada data yang sesuai. Silakan unggah file Excel melalui halaman Upload Data.
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((r) => {
                    const d = mapCoreRow(r);
                    if (activeTab === "infopack") {
                      return (
                        <tr
                          key={r.id}
                          className="hover:bg-[var(--color-surface-sunken)]/60 transition-colors"
                        >
                          <td className="px-4 py-2.5 font-mono font-semibold text-[var(--color-ink)] whitespace-nowrap">
                            {d.cedant}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--color-brand)] font-medium whitespace-nowrap">
                            {d.sheet}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[var(--color-ink-body)] whitespace-nowrap">
                            {d.classCode}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--color-ink)] font-medium">
                            {d.title}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[var(--color-ink)] whitespace-nowrap">
                            {d.value}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[var(--color-ink-muted)] whitespace-nowrap">
                            {d.period}
                          </td>
                        </tr>
                      );
                    }

                    const outRaw = d.outstanding.replace(/[^0-9.\-]/g, "");
                    const outNum = outRaw ? Number(outRaw) : null;
                    const isNeg = outNum !== null && outNum < 0;

                    return (
                      <tr
                        key={r.id}
                        className="hover:bg-[var(--color-surface-sunken)]/60 transition-colors"
                      >
                        <td className="px-4 py-2.5 font-mono font-semibold text-[var(--color-ink)] whitespace-nowrap">
                          {d.cedant}
                        </td>
                        <td className="px-4 py-2.5 text-[var(--color-brand)] font-medium whitespace-nowrap">
                          {d.sheet}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[var(--color-ink)] whitespace-nowrap">
                          {d.lossRef}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono font-semibold whitespace-nowrap ${
                            isNeg ? "text-[var(--color-danger)]" : "text-[var(--color-ink)]"
                          }`}
                        >
                          {outNum !== null
                            ? isNeg
                              ? `(${Math.abs(outNum).toLocaleString("id-ID", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })})`
                              : outNum.toLocaleString("id-ID", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })
                            : ""}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[var(--color-ink-body)] whitespace-nowrap">
                          {d.currency}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[var(--color-ink-body)] whitespace-nowrap">
                          {d.dol}
                        </td>
                        <td className="px-4 py-2.5 text-[var(--color-ink-body)] max-w-[260px]">
                          <span className="truncate block" title={d.ket}>
                            {d.ket || "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          ) : (
            /* ── MODE 2: ALL SCANNED EXCEL COLUMNS (Semua Header Bisa Di-GET) ── */
            <table className="min-w-full text-xs sm:text-[13px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)] text-[11px] uppercase font-bold tracking-wider">
                  <th className="px-3.5 py-3 text-left whitespace-nowrap border-r border-[var(--color-line)]">
                    Cedant
                  </th>
                  <th className="px-3.5 py-3 text-left whitespace-nowrap border-r border-[var(--color-line)]">
                    Sheet
                  </th>
                  {(scannedHeaders.length > 0
                    ? scannedHeaders
                    : ["doc_no", "dol", "currency", "outstanding"]
                  ).map((hdr) => (
                    <th
                      key={hdr}
                      className="px-3.5 py-3 text-left whitespace-nowrap font-mono border-r border-[var(--color-line)]/60"
                    >
                      {hdr}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]/60">
                {loading && (
                  <tr>
                    <td
                      colSpan={(scannedHeaders.length || 4) + 2}
                      className="text-center py-12 text-[var(--color-ink-muted)] animate-pulse"
                    >
                      Memuat seluruh kolom hasil scan...
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={(scannedHeaders.length || 4) + 2}
                      className="text-center py-12 text-[var(--color-ink-muted)]"
                    >
                      Belum ada data. Unggah file Excel di halaman Upload Data untuk men-scan seluruh header.
                    </td>
                  </tr>
                )}
                {!loading &&
                  rows.map((r) => {
                    const rowDict = { ...(r.row_data || {}), ...(r.full_row_data || {}) };
                    const colsToRender =
                      scannedHeaders.length > 0
                        ? scannedHeaders
                        : ["doc_no", "dol", "currency", "outstanding"];

                    return (
                      <tr
                        key={r.id}
                        className="hover:bg-[var(--color-surface-sunken)]/60 transition-colors"
                      >
                        <td className="px-3.5 py-2.5 font-mono font-semibold text-[var(--color-ink)] whitespace-nowrap border-r border-[var(--color-line)]">
                          {displayValue(r.cedant)}
                        </td>
                        <td className="px-3.5 py-2.5 text-[var(--color-brand)] font-medium whitespace-nowrap border-r border-[var(--color-line)]">
                          {displayValue(r.sheet_name)}
                        </td>
                        {colsToRender.map((hdr) => {
                          const val = displayValue(rowDict[hdr]);
                          return (
                            <td
                              key={hdr}
                              className="px-3.5 py-2.5 font-mono text-xs text-[var(--color-ink-body)] whitespace-nowrap border-r border-[var(--color-line)]/40 max-w-[260px] truncate"
                              title={val}
                            >
                              {val || "—"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 bg-[var(--color-surface-sunken)] border-t border-[var(--color-line)] flex items-center justify-between">
            <span className="text-xs text-[var(--color-ink-muted)] font-mono">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalRows)} dari{" "}
              {totalRows.toLocaleString("id-ID")} baris
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="p-1.5 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] disabled:opacity-40 hover:bg-[var(--color-brand-soft)] transition-colors cursor-pointer"
              >
                <ChevronLeftIcon className="h-3.5 w-3.5 text-[var(--color-ink)]" />
              </button>
              <span className="text-xs font-semibold font-mono text-[var(--color-ink)] min-w-[70px] text-center">
                {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loading}
                className="p-1.5 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] disabled:opacity-40 hover:bg-[var(--color-brand-soft)] transition-colors cursor-pointer"
              >
                <ChevronRightIcon className="h-3.5 w-3.5 text-[var(--color-ink)]" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
