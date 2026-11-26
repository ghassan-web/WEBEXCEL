import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  FunnelIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";

const PAGE_SIZE = 50;

const CORE_FILTERS = {
  os: [
    { key: "loss_ref", label: "Loss Ref", placeholder: "Cari loss ref..." },
    { key: "cedant_code", label: "Cedant Code", placeholder: "Kode cedant..." },
    { key: "cedant_name", label: "Cedant Name", placeholder: "Nama cedant..." },
    { key: "dol", label: "Date of Loss", placeholder: "YYYY-MM-DD atau tahun..." },
    { key: "currency", label: "Currency", placeholder: "IDR / USD..." },
    { key: "outstanding", label: "Outstanding", placeholder: "Cari outstanding..." },
  ],
  infopack: [
    { key: "cedant_code", label: "Cedant Code", placeholder: "Kode cedant..." },
    { key: "cedant_name", label: "Cedant Name", placeholder: "Nama cedant..." },
    { key: "dol", label: "Date of Loss", placeholder: "YYYY-MM-DD..." },
    { key: "cob", label: "COB", placeholder: "Cari COB..." },
    { key: "gross", label: "Gross", placeholder: "Cari nilai gross..." },
    { key: "tsi", label: "TSI", placeholder: "Cari nilai TSI..." },
    { key: "class_code", label: "Class Code", placeholder: "Cari class code..." },
    { key: "title", label: "Insured / Title", placeholder: "Cari insured..." },
    { key: "period", label: "Periode", placeholder: "Bulan/Tahun..." },
  ],
};

export default function MasterPage() {
  const [data, setData] = useState(null); // { total, scanned_headers, rows }
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState({});
  const [filterDraft, setFilterDraft] = useState({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("os"); // 'os' | 'infopack'
  const [selectedCedant, setSelectedCedant] = useState("");
  const [mappingProfiles, setMappingProfiles] = useState([]);
  const [cedantOptionsError, setCedantOptionsError] = useState(null);
  const [cedantDropdownOpen, setCedantDropdownOpen] = useState(false);
  const [cedantSearch, setCedantSearch] = useState("");
  const cedantDropdownRef = useRef(null);
  const [columnView, setColumnView] = useState("core"); // 'core' | 'all'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const tipeData = activeTab === "os" ? "OS Cedant" : "Infopack";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (columnView === "all" && !selectedCedant) {
      setData({ total: 0, scanned_headers: [], rows: [] });
      setLoading(false);
      return;
    }
    try {
      const res = await getMasterData(tipeData, {
        cedant: selectedCedant || undefined,
        search: search || undefined,
        filters,
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tipeData, selectedCedant, search, filters, page, columnView]);

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
    const handleClickOutside = (event) => {
      if (!cedantDropdownRef.current?.contains(event.target)) {
        setCedantDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setPage(0);
  }, [activeTab, search, selectedCedant, filters]);

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
  const filteredCedantOptions = useMemo(() => {
    const query = cedantSearch.trim().toLocaleLowerCase();
    if (!query) return cedantOptions;
    return cedantOptions.filter(({ code, name }) =>
      `${name} ${code}`.toLocaleLowerCase().includes(query),
    );
  }, [cedantOptions, cedantSearch]);
  const activeCoreFilters = CORE_FILTERS[activeTab];
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

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
        cedantCode: displayValue(r.cedant || d.cedant_code),
        cedantName: displayValue(r.cedant_name || d.cedant_name),
        sheet,
        classCode: displayValue(d.class_code),
        dol: displayValue(d.dol),
        cob: displayValue(d.cob),
        gross: displayValue(d.gross),
        tsi: displayValue(d.tsi),
        title: displayValue(d.title || r.primary_key_value),
        value: displayValue(d.value),
        period: [r.bulan, r.tahun].filter(Boolean).join("/"),
      };
    }

    return {
      cedant: displayValue(r.cedant),
      cedantCode: displayValue(r.cedant || d.cedant_code),
      cedantName: displayValue(r.cedant_name || d.cedant_name),
      lossRef: displayValue(r.primary_key_value || d.doc_no),
      outstanding: displayValue(d.outstanding),
      dol: displayValue(d.dol),
      currency: displayValue(d.currency),
      ket: displayValue(d.Description || d.description || d.keterangan || d.Name_TTG),
    };
  }

  const handleSearch = () => setSearch(searchInput.trim());

  const handleApplyFilters = () => {
    const appliedFilters = Object.fromEntries(
      activeCoreFilters
        .map(({ key }) => [key, String(filterDraft[key] || "").trim()])
        .filter(([, value]) => value),
    );
    setPage(0);
    setFilters(appliedFilters);
    setFilterOpen(false);
  };

  const handleClearFilters = () => {
    setPage(0);
    setFilters({});
    setFilterDraft({});
  };

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
                setFilters({});
                setFilterDraft({});
                setFilterOpen(false);
                setCedantSearch("");
                setCedantDropdownOpen(false);
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

        <div className="relative w-full sm:w-[320px]" ref={cedantDropdownRef}>
          <span
            className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[var(--color-ink-muted)]"
          >
            Filter Cedant
          </span>
          <button
            type="button"
            id="master-cedant-filter"
            aria-haspopup="listbox"
            aria-expanded={cedantDropdownOpen}
            aria-controls="master-cedant-options"
            onClick={() => setCedantDropdownOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-left text-sm text-[var(--color-ink)] transition-colors hover:border-[var(--color-line-strong)] focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold">
                {selectedCedantName || "Semua Cedant"}
              </span>
              <span className="block truncate text-[11px] text-[var(--color-ink-muted)]">
                {selectedCedant || "Tampilkan data dari semua cedant"}
              </span>
            </span>
            <ChevronDownIcon
              className={`h-4 w-4 shrink-0 text-[var(--color-ink-muted)] transition-transform ${
                cedantDropdownOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {cedantDropdownOpen && (
            <div className="absolute right-0 z-40 mt-2 w-full overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-overlay)]">
              <div className="border-b border-[var(--color-line)] p-3">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-muted)]" />
                  <input
                    type="search"
                    autoFocus
                    value={cedantSearch}
                    onChange={(event) => setCedantSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setCedantDropdownOpen(false);
                    }}
                    placeholder="Cari nama atau kode cedant..."
                    aria-label="Cari nama atau kode cedant"
                    className="w-full rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] py-2 pl-9 pr-3 text-xs text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-brand)] focus:outline-none"
                  />
                </div>
                <p className="mt-2 text-[11px] text-[var(--color-ink-muted)]">
                  {filteredCedantOptions.length} cedant ditemukan
                </p>
              </div>

              <div
                id="master-cedant-options"
                role="listbox"
                aria-label="Pilihan cedant"
                className="max-h-64 overflow-y-auto p-1"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={!selectedCedant}
                  onClick={() => {
                    setSelectedCedant("");
                    setCedantSearch("");
                    setCedantDropdownOpen(false);
                  }}
                  className={`w-full rounded-[var(--radius-control)] px-3 py-2 text-left text-xs transition-colors ${
                    !selectedCedant
                      ? "bg-[var(--color-brand-soft)] font-semibold text-[var(--color-brand)]"
                      : "text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"
                  }`}
                >
                  <span className="block">Semua Cedant</span>
                  <span className="mt-0.5 block text-[11px] text-[var(--color-ink-muted)]">
                    Tampilkan data dari semua cedant
                  </span>
                </button>

                {filteredCedantOptions.length ? (
                  filteredCedantOptions.map((option) => (
                    <button
                      key={option.code}
                      type="button"
                      role="option"
                      aria-selected={selectedCedant === option.code}
                      onClick={() => {
                        setSelectedCedant(option.code);
                        setCedantSearch("");
                        setCedantDropdownOpen(false);
                      }}
                      className={`mt-1 flex w-full items-center justify-between gap-3 rounded-[var(--radius-control)] px-3 py-2 text-left text-xs transition-colors ${
                        selectedCedant === option.code
                          ? "bg-[var(--color-brand-soft)] font-semibold text-[var(--color-brand)]"
                          : "text-[var(--color-ink)] hover:bg-[var(--color-surface-sunken)]"
                      }`}
                    >
                      <span className="min-w-0 truncate">{option.name}</span>
                      <span className="shrink-0 rounded border border-[var(--color-line)] bg-[var(--color-surface-sunken)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-ink-muted)]">
                        {option.code}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-4 text-center text-xs text-[var(--color-ink-muted)]">
                    Cedant tidak ditemukan.
                  </p>
                )}
              </div>
            </div>
          )}
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
      <div className="relative bg-[var(--color-surface)] rounded-[var(--radius-surface)] border border-[var(--color-line)] shadow-[var(--shadow-card)]">
        {/* Card Toolbar */}
        <div className="px-5 py-3.5 border-b border-[var(--color-line)] flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-sm font-bold text-[var(--color-ink)]">
              {columnView === "core"
                ? "Core Master Database Records"
                : selectedCedantName
                  ? `Scanned Excel Columns — ${selectedCedantName}`
                  : "Scanned Excel Columns — Pilih Cedant"}
            </span>
            <Badge tone="brand">
              {columnView === "all" && !selectedCedant
                ? "Per cedant"
                : `${totalRows.toLocaleString("id-ID")} rows`}
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
          <div className="relative flex items-center gap-2">
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

            <button
              type="button"
              onClick={() => {
                if (!filterOpen) setFilterDraft(filters);
                setFilterOpen((open) => !open);
              }}
              aria-expanded={filterOpen}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-control)] border text-xs font-semibold transition-colors ${
                filterOpen || activeFilterCount
                  ? "border-[var(--color-brand-line)] bg-[var(--color-brand-soft)] text-[var(--color-brand)]"
                  : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              <FunnelIcon className="h-3.5 w-3.5" />
              Filter
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-[var(--color-brand)] px-1.5 text-[10px] text-white">
                  {activeFilterCount}
                </span>
              )}
              {filterOpen ? (
                <ChevronUpIcon className="h-3.5 w-3.5" />
              ) : (
                <ChevronDownIcon className="h-3.5 w-3.5" />
              )}
            </button>

            {filterOpen && (
              <div className="absolute right-0 top-full z-30 mt-2 w-[min(27rem,calc(100vw-18rem))] min-w-[18rem] rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-xl">
                <div className="mb-3 text-sm font-bold text-[var(--color-ink)]">
                  Filter per Kolom
                </div>
                <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
                  {activeCoreFilters.map((field) => (
                    <label key={field.key} className="min-w-0">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-[var(--color-ink-muted)]">
                        {field.label}
                      </span>
                      <input
                        type="text"
                        value={filterDraft[field.key] || ""}
                        onChange={(event) =>
                          setFilterDraft((current) => ({
                            ...current,
                            [field.key]: event.target.value,
                          }))
                        }
                        onKeyDown={(event) =>
                          event.key === "Enter" && handleApplyFilters()
                        }
                        placeholder={field.placeholder}
                        className="w-full rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:outline-none focus:border-[var(--color-brand)]"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[var(--color-line)] pt-3">
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="text-xs font-semibold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                  >
                    Reset filter
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyFilters}
                    className="rounded-[var(--radius-control)] bg-[var(--color-brand)] px-3 py-2 text-xs font-bold text-white hover:opacity-90"
                  >
                    Terapkan Filter
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto table-scroll">
          {columnView === "core" ? (
            /* ── MODE 1: CORE DB COLUMNS ── */
            <table className="min-w-full text-xs sm:text-[13px] border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)] text-[11px] uppercase font-bold tracking-wider">
                  {activeTab === "os" ? (
                    <>
                      <th className="px-4 py-3 text-left whitespace-nowrap">Loss Ref</th>
                      <th className="px-4 py-3 text-left whitespace-nowrap">Cedant Code</th>
                      <th className="px-4 py-3 text-left whitespace-nowrap">Cedant Name</th>
                      <th className="px-4 py-3 text-left whitespace-nowrap">Date of Loss</th>
                      <th className="px-4 py-3 text-left whitespace-nowrap">Currency</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Outstanding</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 text-left whitespace-nowrap">Cedant Code</th>
                      <th className="px-4 py-3 text-left whitespace-nowrap">Cedant Name</th>
                      <th className="px-4 py-3 text-left whitespace-nowrap">DOL</th>
                      <th className="px-4 py-3 text-left whitespace-nowrap">COB</th>
                      <th className="px-4 py-3 text-left whitespace-nowrap">Insured / Title</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">Gross</th>
                      <th className="px-4 py-3 text-right whitespace-nowrap">TSI</th>
                      <th className="px-4 py-3 text-left whitespace-nowrap">Periode</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-line)]/60">
                {loading && (
                  <tr>
                    <td
                      colSpan={activeTab === "infopack" ? 8 : 6}
                      className="text-center py-12 text-[var(--color-ink-muted)] animate-pulse"
                    >
                      Memuat data Master...
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={activeTab === "infopack" ? 8 : 6}
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
                      const fmtNum = (rawStr) => {
                        const cleaned = String(rawStr || "").replace(/[^0-9.\-]/g, "");
                        if (!cleaned) return "—";
                        const num = Number(cleaned);
                        if (Number.isNaN(num)) return rawStr;
                        return num.toLocaleString("id-ID", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        });
                      };
                      return (
                        <tr
                          key={r.id}
                          className="hover:bg-[var(--color-surface-sunken)]/60 transition-colors"
                        >
                          <td className="px-4 py-2.5 font-mono font-semibold text-[var(--color-ink)] whitespace-nowrap">
                            {d.cedantCode}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--color-ink-body)] max-w-[220px]">
                            <span className="truncate block" title={d.cedantName}>
                              {d.cedantName || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[var(--color-ink-body)] whitespace-nowrap">
                            {d.dol || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--color-brand)] font-medium whitespace-nowrap">
                            {d.cob || d.classCode || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-[var(--color-ink)] font-medium max-w-[240px]">
                            <span className="truncate block" title={d.title}>
                              {d.title || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-semibold text-[var(--color-ink)] whitespace-nowrap">
                            {fmtNum(d.gross)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[var(--color-ink-body)] whitespace-nowrap">
                            {fmtNum(d.tsi)}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[var(--color-ink-muted)] whitespace-nowrap">
                            {d.period || "—"}
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
                        <td className="px-4 py-2.5 font-mono text-[var(--color-ink)] whitespace-nowrap">
                          {d.lossRef}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-semibold text-[var(--color-ink)] whitespace-nowrap">
                          {d.cedantCode}
                        </td>
                        <td className="px-4 py-2.5 text-[var(--color-ink-body)] max-w-[280px]">
                          <span className="truncate block" title={d.cedantName}>
                            {d.cedantName || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[var(--color-ink-body)] whitespace-nowrap">
                          {d.dol}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-[var(--color-ink-body)] whitespace-nowrap">
                          {d.currency}
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
        {totalPages > 1 && (columnView === "core" || selectedCedant) && (
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
