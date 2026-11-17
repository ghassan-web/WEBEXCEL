import { useState, useRef, useMemo, useEffect } from "react";
import { useColumnMappings } from "../hooks/useColumnMappings";
import { inspectMasterFile, uploadToMaster } from "../services/api";
import { Button, Badge } from "../components/ui";
import {
  ArrowUpTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  TableCellsIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

const MONTHS = [
  { value: "01", label: "01 - Januari",   short: "Jan" },
  { value: "02", label: "02 - Februari",  short: "Feb" },
  { value: "03", label: "03 - Maret",     short: "Mar" },
  { value: "04", label: "04 - April",     short: "Apr" },
  { value: "05", label: "05 - Mei",       short: "Mei" },
  { value: "06", label: "06 - Juni",      short: "Jun" },
  { value: "07", label: "07 - Juli",      short: "Jul" },
  { value: "08", label: "08 - Agustus",   short: "Agt" },
  { value: "09", label: "09 - September", short: "Sep" },
  { value: "10", label: "10 - Oktober",   short: "Okt" },
  { value: "11", label: "11 - November",  short: "Nov" },
  { value: "12", label: "12 - Desember",  short: "Des" },
];

const YEARS = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - 1 + i));

const WIZARD_STEPS = [
  { id: "UPLOAD",    label: "Upload & Scan File",   subtitle: "Select partner, period & scan headers" },
  { id: "MAPPING",   label: "Map & Review Headers", subtitle: "Align core DB fields & collect all columns" },
  { id: "EXECUTING", label: "Process & Save",       subtitle: "Save core DB & archive full columns" },
];

const DEFAULT_CEDANT_SCHEMA = [
  {
    dbField: "doc_no",
    label: "Loss Ref / Document No",
    required: true,
    sqlType: "VARCHAR(255)",
    description: "Nomor dokumen / referensi klaim utama (Primary Key)",
  },
  {
    dbField: "outstanding",
    label: "Outstanding Claim (Net OS)",
    required: true,
    sqlType: "NUMERIC(30, 2)",
    description: "Nilai nominal cadangan klaim outstanding",
  },
  {
    dbField: "dol",
    label: "Date of Loss (DOL)",
    required: false,
    sqlType: "DATE",
    description: "Tanggal terjadinya kerugian / klaim",
  },
  {
    dbField: "currency",
    label: "Currency (Mata Uang)",
    required: false,
    sqlType: "VARCHAR(10)",
    description: "Kode mata uang klaim (IDR, USD, dll.)",
  },
];

const DEFAULT_INFOPACK_SCHEMA = [
  {
    dbField: "class_code",
    label: "Class Code (COB)",
    required: false,
    sqlType: "VARCHAR(50)",
    description: "Kode lini bisnis / Class of Business",
  },
  {
    dbField: "title",
    label: "Title / Insured / Uraian",
    required: true,
    sqlType: "TEXT",
    description: "Nama tertanggung atau judul baris InfoPack",
  },
  {
    dbField: "value",
    label: "Value / Gross Amount",
    required: true,
    sqlType: "TEXT",
    description: "Nilai angka / nominal pada laporan InfoPack",
  },
];

/** Auto-detect bulan & tahun dari nama file (contoh: "ACA - 08_INDO RE - Os per 31Agt2026...") */
function detectMonthYearFromFilename(filename) {
  const s = String(filename || "").toLowerCase();
  let detectedYear = "";
  const yearMatch = s.match(/\b(202[4-9]|2030)\b/);
  if (yearMatch) detectedYear = yearMatch[1];

  const monthMap = [
    [/jan|januari/, "01"],
    [/feb|februari/, "02"],
    [/mar|maret/, "03"],
    [/apr|april/, "04"],
    [/mei|may/, "05"],
    [/jun|juni/, "06"],
    [/jul|juli/, "07"],
    [/agt|agu|agustus|aug/, "08"],
    [/sep|sept|september/, "09"],
    [/okt|oct|oktober/, "10"],
    [/nov|november/, "11"],
    [/des|dec|desember/, "12"],
  ];
  let detectedMonth = "";
  for (const [regex, mVal] of monthMap) {
    if (regex.test(s)) {
      detectedMonth = mVal;
      break;
    }
  }
  if (!detectedMonth) {
    const numPrefix = s.match(/(?:^|[\s_-])(0[1-9]|1[0-2])(?:_|\s|-)/);
    if (numPrefix) detectedMonth = numPrefix[1];
  }
  return { month: detectedMonth, year: detectedYear };
}

export default function ComparePage({ onNavigate }) {
  const { profiles, loading: mappingsLoading } = useColumnMappings();

  /* ── Wizard & Form State ── */
  const [currentStep, setCurrentStep] = useState("UPLOAD"); // 'UPLOAD' | 'MAPPING' | 'EXECUTING' | 'SUCCESS'
  const [activeTab, setActiveTab] = useState("os"); // 'os' | 'infopack'
  const [bulan, setBulan] = useState("08");
  const [tahun, setTahun] = useState(String(new Date().getFullYear()));

  /* ── Cedant Search & Selection ── */
  const [selectedCedant, setSelectedCedant] = useState(null); // { name, code }
  const [cedantQuery, setCedantQuery] = useState("");
  const [cedantDropdownOpen, setCedantDropdownOpen] = useState(false);
  const cedantWrapperRef = useRef(null);

  /* ── File & Inspection State ── */
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectData, setInspectData] = useState(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [mapping, setMapping] = useState({}); // { doc_no: "DocNo", outstanding: "Amount_Net_OS", ... }
  const [filterMode, setFilterMode] = useState("ALL"); // 'ALL' | 'CORE' | 'EXTRA'
  const [filterText, setFilterText] = useState("");

  /* ── Execution / Upload State ── */
  const [uploadPct, setUploadPct] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const isInfopack = activeTab === "infopack";
  const tipeData = isInfopack ? "Infopack" : "OS Cedant";

  /* ── Unique Cedant List from DB Mappings ── */
  const cedantOptions = useMemo(() => {
    const filtered = profiles.filter(
      (p) => p.tipe_data === (isInfopack ? "Infopack" : "OS Cedant")
    );
    const map = new Map();
    filtered.forEach((p) => {
      if (p.cedant && !map.has(p.cedant)) {
        map.set(p.cedant, {
          name: p.cedant,
          code: p.cedantCode || p.cedant,
          sheets: p.sheetMet || "All sheets",
          lossRef: p.lossRef || "",
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [profiles, isInfopack]);

  const filteredCedants = useMemo(() => {
    if (!cedantQuery.trim()) return cedantOptions;
    const q = cedantQuery.toLowerCase();
    return cedantOptions.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [cedantOptions, cedantQuery]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (cedantWrapperRef.current && !cedantWrapperRef.current.contains(e.target)) {
        setCedantDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ── Active Sheet Columns & Sample Values ── */
  const scannedColumns = useMemo(() => {
    if (!inspectData || !selectedSheet) return [];
    return inspectData.sheet_columns?.[selectedSheet] || [];
  }, [inspectData, selectedSheet]);

  const sheetSamples = useMemo(() => {
    if (!inspectData || !selectedSheet) return {};
    return inspectData.sheet_samples?.[selectedSheet] || {};
  }, [inspectData, selectedSheet]);

  const sheetRowCount = useMemo(() => {
    if (!inspectData || !selectedSheet) return 0;
    return inspectData.sheet_row_counts?.[selectedSheet] ?? 0;
  }, [inspectData, selectedSheet]);

  const targetSchema = useMemo(() => {
    if (inspectData?.target_schema?.length) return inspectData.target_schema;
    return isInfopack ? DEFAULT_INFOPACK_SCHEMA : DEFAULT_CEDANT_SCHEMA;
  }, [inspectData, isInfopack]);

  /* ── Handle File Drop / Select & Run Header Scanner (/api/master/inspect) ── */
  const handleSelectFile = async (rawFile) => {
    if (!rawFile) return;
    const lower = rawFile.name.toLowerCase();
    if (![".xlsx", ".xls", ".xlsm", ".xlsb"].some((ext) => lower.endsWith(ext))) {
      setErrorMessage("Format file tidak didukung. Gunakan file Excel (.xlsx, .xls, .xlsm, atau .xlsb).");
      return;
    }

    setErrorMessage("");
    setFile(rawFile);
    setUploadResult(null);

    /* Auto-detect bulan & tahun dari nama file */
    const { month: detM, year: detY } = detectMonthYearFromFilename(rawFile.name);
    if (detM) setBulan(detM);
    if (detY) setTahun(detY);

    /* Jalankan scan header ke backend */
    setIsInspecting(true);
    try {
      const fd = new FormData();
      fd.append("file", rawFile);
      fd.append("tipe_data", tipeData);
      if (selectedCedant?.name) fd.append("cedant", selectedCedant.name);
      if (selectedCedant?.code) fd.append("cedant_code", selectedCedant.code);

      const res = await inspectMasterFile(fd);
      setInspectData(res);

      const defSheet = res.default_sheet || res.available_sheets?.[0] || "";
      setSelectedSheet(defSheet);
      setMapping(res.auto_mappings?.[defSheet] || {});

      /* Jika cedant belum dipilih manual tapi terdeteksi dari file/mapping, set otomatis */
      if (!selectedCedant && (res.cedant_name || res.cedant_code)) {
        const matchedOpt = cedantOptions.find(
          (c) =>
            c.code.toLowerCase() === String(res.cedant_code || "").toLowerCase() ||
            c.name.toLowerCase() === String(res.cedant_name || "").toLowerCase()
        );
        if (matchedOpt) {
          setSelectedCedant(matchedOpt);
        } else if (res.cedant_code) {
          setSelectedCedant({
            name: res.cedant_name || res.cedant_code,
            code: res.cedant_code,
          });
        }
      }
    } catch (err) {
      setErrorMessage(err.message || "Gagal memindai header file Excel.");
      setInspectData(null);
    } finally {
      setIsInspecting(false);
    }
  };

  /* Saat user mengganti sheet aktif, muat auto_mapping untuk sheet tersebut */
  const handleSheetChange = (newSheet) => {
    setSelectedSheet(newSheet);
    if (inspectData?.auto_mappings?.[newSheet]) {
      setMapping(inspectData.auto_mappings[newSheet]);
    }
  };

  const handleUpdateMapping = (dbField, excelCol) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (!excelCol) delete next[dbField];
      else next[dbField] = excelCol;
      return next;
    });
  };

  const handleAutoMatchAgain = () => {
    if (inspectData?.auto_mappings?.[selectedSheet]) {
      setMapping({ ...inspectData.auto_mappings[selectedSheet] });
    }
  };

  /* ── Kelengkapan Kolom Inti DB ── */
  const requiredFields = useMemo(
    () => targetSchema.filter((f) => f.required),
    [targetSchema]
  );
  const mappedRequiredCount = useMemo(
    () => requiredFields.filter((f) => Boolean(mapping?.[f.dbField])).length,
    [requiredFields, mapping]
  );
  const isMappingComplete = requiredFields.length === 0 || mappedRequiredCount === requiredFields.length;

  /* ── Daftar Kolom Excel yang Terpetakan ke DB vs Kolom Tambahan yang Tetap Disimpan ── */
  const mappedSourceSet = useMemo(() => {
    const s = new Set();
    Object.values(mapping || {}).forEach((val) => {
      if (val) {
        String(val)
          .split("|")
          .forEach((p) => {
            if (p.trim()) s.add(p.trim());
          });
      }
    });
    return s;
  }, [mapping]);

  const extraScannedColumns = useMemo(
    () => scannedColumns.filter((col) => !mappedSourceSet.has(col)),
    [scannedColumns, mappedSourceSet]
  );

  /* ── Eksekusi Simpan ke Master Database (Step 2 -> Step 3) ── */
  const handleExecuteSave = async () => {
    if (!file) return;
    setCurrentStep("EXECUTING");
    setSubmitting(true);
    setUploadPct(0);
    setErrorMessage("");

    try {
      const fd = new FormData();
      fd.append("bulan", bulan);
      fd.append("tahun", tahun);
      fd.append("tipe_data", tipeData);
      const pkCol = isInfopack
        ? mapping.title || scannedColumns[0] || ""
        : mapping.doc_no || scannedColumns[0] || "";
      fd.append("primary_key_col", pkCol);
      if (selectedCedant?.name) fd.append("cedant", selectedCedant.name);
      if (selectedCedant?.code) fd.append("cedant_code", selectedCedant.code);
      if (selectedSheet) fd.append("sheet_name", selectedSheet);
      fd.append("custom_mapping", JSON.stringify(mapping));
      fd.append("file", file);

      const res = await uploadToMaster(fd, (pct) => setUploadPct(pct));
      setUploadResult(res);
      setCurrentStep("SUCCESS");
    } catch (err) {
      setErrorMessage(err.message || "Gagal menyimpan data ke Master.");
      setCurrentStep("MAPPING");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetAll = () => {
    setFile(null);
    setInspectData(null);
    setSelectedSheet("");
    setMapping({});
    setUploadResult(null);
    setErrorMessage("");
    setUploadPct(0);
    setCurrentStep("UPLOAD");
  };

  const activeStepOrder =
    currentStep === "SUCCESS"
      ? 3
      : WIZARD_STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 py-6 space-y-6 font-sans">
      {/* ── Connected 3-Step Wizard Bar (mengikuti referensi example/UploadBordero.jsx) ── */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-surface)] px-5 py-3.5 shadow-[var(--shadow-card)] flex flex-wrap items-center justify-between gap-4">
        {WIZARD_STEPS.map((step, idx) => {
          const isCurrent = currentStep === step.id;
          const isCompleted = activeStepOrder > idx;
          return (
            <div key={step.id} className="flex items-center gap-3 flex-1 min-w-[180px]">
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs shrink-0 transition-all ${
                  isCompleted
                    ? "bg-[var(--color-valid)] text-white"
                    : isCurrent
                      ? "bg-[var(--color-brand)] text-white shadow-xs"
                      : "bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)] border border-[var(--color-line)]"
                }`}
              >
                {isCompleted ? <CheckIcon className="w-4 h-4 stroke-[2.5]" /> : idx + 1}
              </span>
              <div className="min-w-0">
                <div
                  className={`text-xs font-semibold leading-tight ${
                    isCurrent || isCompleted
                      ? "text-[var(--color-ink)]"
                      : "text-[var(--color-ink-muted)]"
                  }`}
                >
                  {step.label}
                </div>
                <div className="text-[11px] text-[var(--color-ink-muted)] truncate">
                  {step.subtitle}
                </div>
              </div>
              {idx < WIZARD_STEPS.length - 1 && (
                <div
                  className="hidden md:block flex-1 h-px bg-[var(--color-line)] ml-2"
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Error Banner ── */}
      {errorMessage && (
        <div
          role="alert"
          className="p-4 bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/25 rounded-[var(--radius-surface)] flex items-center justify-between gap-3 text-[var(--color-danger)] text-[var(--text-body-sm)]"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <ExclamationCircleIcon className="w-5 h-5 shrink-0 text-[var(--color-danger)]" />
            <span className="font-medium">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage("")}
            className="text-[var(--color-danger)] hover:underline font-semibold text-xs cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          STEP 1: UPLOAD & SCAN WORKBOOK HEADERS (mengikuti example/UploadWidget.jsx)
      ════════════════════════════════════════════════════════════════════ */}
      {currentStep === "UPLOAD" && (
        <div className="bg-[var(--color-surface)] p-5 sm:p-6 rounded-[var(--radius-surface)] border border-[var(--color-line)] shadow-[var(--shadow-card)] w-full space-y-6 text-[var(--text-body)]">
          {/* Header: Title & Dataset Type Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[var(--color-line)] gap-3">
            <div>
              <h2 className="text-[var(--text-title)] font-bold text-[var(--color-ink)] tracking-tight">
                Upload OS Claims &amp; InfoPack Files
              </h2>
              <p className="text-xs text-[var(--color-ink-muted)] mt-0.5">
                Pilih perusahaan asuransi (cedant), periode cut-off, dan unggah file Excel untuk memindai seluruh header kolom secara otomatis.
              </p>
            </div>

            {/* Dataset Type Switcher */}
            <div className="flex items-center gap-2 self-start sm:self-center">
              <span className="text-[11px] font-bold text-[var(--color-ink-muted)] uppercase tracking-wider">
                Dataset:
              </span>
              <div className="flex bg-[var(--color-surface-sunken)] p-0.5 rounded-[var(--radius-control)] border border-[var(--color-line)]">
                {[
                  { key: "os", label: "OS Claim Cedant" },
                  { key: "infopack", label: "InfoPack" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.key);
                      setSelectedCedant(null);
                      handleResetAll();
                    }}
                    className={`px-3 py-1 text-xs font-bold rounded-[calc(var(--radius-control)-2px)] transition-all cursor-pointer ${
                      activeTab === tab.key
                        ? "bg-[var(--color-surface)] text-[var(--color-brand)] shadow-2xs"
                        : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Top Configuration: Cedant Picker, Period Cut-Off & Pipeline Status */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end pb-5 border-b border-[var(--color-line)]">
            {/* Insurance Company (Cedant) Selector */}
            <div className="lg:col-span-5 relative" ref={cedantWrapperRef}>
              <label className="block font-bold text-[var(--color-ink)] mb-1 text-xs">
                Insurance Company (Cedant){" "}
                <span className="text-[var(--color-ink-muted)] font-normal">(opsional / auto-detect)</span>
              </label>
              <div className="relative flex items-center bg-[var(--color-surface-sunken)] border border-[var(--color-line)] rounded-[var(--radius-control)] focus-within:border-[var(--color-brand)] focus-within:bg-[var(--color-surface)] focus-within:ring-2 focus-within:ring-[var(--color-brand)]/15 transition-all">
                <MagnifyingGlassIcon className="w-4 h-4 text-[var(--color-ink-muted)] ml-3 shrink-0" />
                {selectedCedant && (
                  <span className="ml-2 font-mono text-xs uppercase tracking-wider font-semibold text-[var(--color-brand)] bg-[var(--color-brand-soft)] border border-[var(--color-brand-line)] px-2 py-0.5 rounded-[var(--radius-control)] shrink-0">
                    {selectedCedant.code}
                  </span>
                )}
                <input
                  type="text"
                  placeholder={
                    selectedCedant
                      ? selectedCedant.name
                      : mappingsLoading
                        ? "Memuat daftar cedant..."
                        : "Cari nama atau kode cedant (atau biarkan auto-detect)..."
                  }
                  value={selectedCedant ? selectedCedant.name : cedantQuery}
                  onChange={(e) => {
                    setCedantQuery(e.target.value);
                    if (selectedCedant) setSelectedCedant(null);
                    setCedantDropdownOpen(true);
                  }}
                  onFocus={() => setCedantDropdownOpen(true)}
                  className="w-full py-2 px-3 bg-transparent text-xs sm:text-sm font-medium text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] outline-none"
                />
                {(selectedCedant || cedantQuery) && (
                  <button
                    type="button"
                    aria-label="Clear cedant selection"
                    onClick={() => {
                      setSelectedCedant(null);
                      setCedantQuery("");
                    }}
                    className="mr-3 text-[var(--color-ink-muted)] hover:text-[var(--color-danger)] cursor-pointer"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                )}
              </div>

              {cedantDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1.5 bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-surface)] shadow-[var(--shadow-overlay)] z-30 max-h-60 overflow-y-auto p-1 scrollbar-none">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCedant(null);
                      setCedantQuery("");
                      setCedantDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-[var(--radius-control)] text-xs flex items-center justify-between hover:bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)] transition-colors cursor-pointer border-b border-[var(--color-line)]/60 mb-1"
                  >
                    <span className="font-semibold text-[var(--color-brand)]">
                      ✦ Auto-detect dari File &amp; Mapping Database
                    </span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
                      AUTO
                    </span>
                  </button>

                  {filteredCedants.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-[var(--color-ink-muted)] italic">
                      Cedant tidak ditemukan.
                    </div>
                  ) : (
                    filteredCedants.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => {
                          setSelectedCedant(c);
                          setCedantDropdownOpen(false);
                          setCedantQuery("");
                        }}
                        className={`w-full text-left px-3 py-2 rounded-[var(--radius-control)] text-xs flex items-center justify-between transition-colors cursor-pointer ${
                          selectedCedant?.name === c.name
                            ? "bg-[var(--color-brand-soft)] text-[var(--color-brand)] font-bold"
                            : "hover:bg-[var(--color-surface-sunken)] text-[var(--color-ink-body)]"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded-[var(--radius-control)] border shrink-0 bg-[var(--color-brand-soft)] text-[var(--color-brand)] border-[var(--color-brand-line)]">
                            {c.code}
                          </span>
                          <span className="truncate font-sans font-medium text-sm text-[var(--color-ink)]">
                            {c.name}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)] border border-[var(--color-line)] shrink-0 ml-2">
                          {c.sheets}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Cut-Off Period (Month & Year) */}
            <div className="lg:col-span-4 grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-[var(--color-ink)] mb-1 text-xs">
                  Bulan Cut-Off <span className="text-[var(--color-danger)]">*</span>
                </label>
                <select
                  value={bulan}
                  onChange={(e) => setBulan(e.target.value)}
                  className="w-full h-[38px] px-3 bg-[var(--color-surface-sunken)] border border-[var(--color-line)] rounded-[var(--radius-control)] text-xs font-semibold text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-brand)] cursor-pointer"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-[var(--color-ink)] mb-1 text-xs">
                  Tahun <span className="text-[var(--color-danger)]">*</span>
                </label>
                <select
                  value={tahun}
                  onChange={(e) => setTahun(e.target.value)}
                  className="w-full h-[38px] px-3 bg-[var(--color-surface-sunken)] border border-[var(--color-line)] rounded-[var(--radius-control)] text-xs font-semibold text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-brand)] cursor-pointer font-mono"
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Pipeline Status Pill */}
            <div className="lg:col-span-3 flex items-center lg:justify-end h-[38px]">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 h-[38px] rounded-[var(--radius-control)] text-xs bg-[var(--color-surface)] border border-[var(--color-line)] shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-[var(--color-valid)] shrink-0 animate-pulse" />
                <span className="font-semibold text-[var(--color-ink)]">Header Scanner Active</span>
              </div>
            </div>
          </div>

          {/* Breathable Dropzone (mengikuti example/UploadWidget.jsx) */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload file Excel klaim"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.[0]) {
                handleSelectFile(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className="border-2 border-dashed rounded-[var(--radius-surface)] p-8 flex flex-col items-center justify-center transition-all border-[var(--color-line-strong)]/60 hover:border-[var(--color-brand)] bg-[var(--color-surface-sunken)]/25 hover:bg-[var(--color-brand-soft)]/15 cursor-pointer group focus:outline-hidden focus:ring-2 focus:ring-[var(--color-brand)]"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.xlsm,.xlsb"
              onChange={(e) => {
                if (e.target.files?.[0]) handleSelectFile(e.target.files[0]);
                e.target.value = "";
              }}
              className="hidden"
            />
            <div className="w-11 h-11 rounded-[var(--radius-control)] bg-[var(--color-brand-soft)] text-[var(--color-brand)] flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform border border-[var(--color-brand-line)]">
              <ArrowUpTrayIcon className="w-5 h-5" />
            </div>
            <p className="font-bold text-xs sm:text-sm text-[var(--color-ink)] text-center">
              Drag &amp; drop file Excel OS Claim / InfoPack di sini, atau klik untuk memilih file
            </p>
            <span className="mt-1 text-[11px] font-mono text-[var(--color-ink-muted)]">
              Mendukung .xlsx, .xls, .xlsm, .xlsb (Maks. 50 MB) · Seluruh header kolom akan di-scan otomatis
            </span>
          </div>

          {/* File Queue & Scanned Header Preview Section */}
          {file && (
            <div className="space-y-4 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--color-line)]">
                <div className="flex items-center gap-2.5">
                  <h4 className="text-xs font-bold text-[var(--color-ink)] uppercase tracking-wider">
                    Scanned Workbook Queue (1)
                  </h4>
                  {isInspecting ? (
                    <Badge tone="brand" dot>
                      Scanning Excel Headers...
                    </Badge>
                  ) : inspectData ? (
                    <Badge tone="valid" dot>
                      ✓ {scannedColumns.length} Headers Scanned &amp; Ready
                    </Badge>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={handleResetAll}
                  className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-danger)] font-semibold cursor-pointer"
                >
                  Clear File
                </button>
              </div>

              {/* Queued File Card */}
              <div className="p-4 rounded-[var(--radius-surface)] bg-[var(--color-surface-sunken)]/70 border border-[var(--color-line)] space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-[var(--radius-control)] bg-[var(--color-brand-soft)] text-[var(--color-brand)] border border-[var(--color-brand-line)] flex items-center justify-center shrink-0 mt-0.5">
                      <DocumentTextIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-[var(--color-ink)] truncate">
                          {file.name}
                        </span>
                        <span className="text-[11px] font-mono text-[var(--color-ink-muted)] bg-[var(--color-surface)] px-2 py-0.5 rounded border border-[var(--color-line)]">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </span>
                        {inspectData?.detected_file_tag && (
                          <Badge tone="brand">Tag: {inspectData.detected_file_tag}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-[var(--color-ink-muted)] flex-wrap">
                        <span>
                          Periode:{" "}
                          <strong className="font-mono text-[var(--color-ink)]">
                            {bulan}/{tahun}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          Baris Terdeteksi:{" "}
                          <strong className="font-mono text-[var(--color-ink)]">
                            {sheetRowCount.toLocaleString("id-ID")} rows
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          Total Kolom Header:{" "}
                          <strong className="font-mono text-[var(--color-brand)]">
                            {scannedColumns.length} kolom
                          </strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Sheet Selector Dropdown */}
                  {inspectData?.available_sheets?.length > 0 && (
                    <div className="flex items-center gap-2 shrink-0">
                      <label className="text-xs font-semibold text-[var(--color-ink-muted)]">
                        Active Sheet:
                      </label>
                      <select
                        value={selectedSheet}
                        onChange={(e) => handleSheetChange(e.target.value)}
                        className="px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-control)] text-xs font-mono font-semibold text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-brand)]"
                      >
                        {inspectData.available_sheets.map((sh) => (
                          <option key={sh} value={sh}>
                            {sh} ({inspectData.sheet_columns?.[sh]?.length || 0} cols)
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Preview seluruh header hasil scan */}
                {!isInspecting && scannedColumns.length > 0 && (
                  <div className="pt-3 border-t border-[var(--color-line)]/80 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold uppercase tracking-wider text-[var(--color-ink-muted)]">
                        Scanned Excel Headers ({scannedColumns.length} Kolom Ditemukan):
                      </span>
                      <span className="text-[var(--color-valid)] font-semibold">
                        {Object.keys(mapping).length} kolom otomatis dipetakan ke Tabel Inti DB ·{" "}
                        {extraScannedColumns.length} kolom tambahan disimpan ke Katalog
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {scannedColumns.map((col, i) => {
                        const isCoreMapped = mappedSourceSet.has(col);
                        return (
                          <span
                            key={col}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-control)] text-xs font-mono border transition-colors ${
                              isCoreMapped
                                ? "bg-[var(--color-valid-soft)] text-[var(--color-valid)] border-[var(--color-valid)]/30 font-semibold"
                                : "bg-[var(--color-surface)] text-[var(--color-ink-body)] border-[var(--color-line)]"
                            }`}
                            title={
                              sheetSamples[col]
                                ? `Contoh nilai: ${sheetSamples[col]}`
                                : "Header terdeteksi"
                            }
                          >
                            <span className="text-[10px] text-[var(--color-ink-faint)]">
                              #{i + 1}
                            </span>
                            <span>{col}</span>
                            {isCoreMapped && (
                              <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-[var(--color-valid)] text-white font-sans font-bold">
                                DB
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Bar to Proceed to Step 2 */}
              <div className="flex items-center justify-end pt-2">
                <Button
                  variant="primary"
                  icon={ArrowRightIcon}
                  disabled={!file || isInspecting || !inspectData || scannedColumns.length === 0}
                  onClick={() => setCurrentStep("MAPPING")}
                >
                  Next: Map &amp; Review All Headers
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          STEP 2: COLUMN MAPPER & HEADER CATALOG REVIEW (mengikuti example/ColumnMapper.jsx)
      ════════════════════════════════════════════════════════════════════ */}
      {currentStep === "MAPPING" && inspectData && (
        <div className="space-y-6">
          <div className="bg-[var(--color-surface)] rounded-[var(--radius-surface)] border border-[var(--color-line)] p-5 sm:p-6 space-y-6 font-sans shadow-[var(--shadow-card)]">
            {/* Top File & Mapping Status Header */}
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-5 border-b border-[var(--color-line)]">
              <div className="space-y-2 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[11px] uppercase tracking-wider text-[var(--color-brand)] bg-[var(--color-brand-soft)] px-2.5 py-1 rounded-[var(--radius-control)] border border-[var(--color-brand-line)]">
                    {tipeData.toUpperCase()}
                  </span>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-control)] bg-[var(--color-surface)] border border-[var(--color-line)]">
                    <span className="font-mono text-xs uppercase tracking-wider font-semibold text-[var(--color-brand)]">
                      {selectedCedant?.code || inspectData.cedant_code || "AUTO"}
                    </span>
                    <span className="text-[var(--color-line-strong)]">•</span>
                    <span className="font-sans font-medium text-xs text-[var(--color-ink)]">
                      {selectedCedant?.name || inspectData.cedant_name || "Auto-Detect Cedant"}
                    </span>
                  </div>
                  <h3
                    className="text-sm sm:text-base font-bold text-[var(--color-ink)] truncate max-w-md"
                    title={file?.name}
                  >
                    {file?.name}
                  </h3>
                </div>

                <div className="flex items-center gap-2 text-xs text-[var(--color-ink-muted)] flex-wrap">
                  <span>
                    Sheet:{" "}
                    <strong className="font-mono text-[var(--color-ink)] font-semibold">
                      {selectedSheet}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Scanned Excel Columns:{" "}
                    <strong className="text-[var(--color-ink)] font-semibold">
                      {scannedColumns.length} Columns
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Core DB Target:{" "}
                    <strong className="text-[var(--color-ink)] font-semibold">
                      {targetSchema.length} Fields
                    </strong>
                  </span>
                  <span>•</span>
                  <span
                    className={`inline-flex items-center gap-1 font-bold ${
                      isMappingComplete ? "text-[var(--color-valid)]" : "text-[var(--color-danger)]"
                    }`}
                  >
                    {isMappingComplete ? (
                      <CheckCircleIcon className="w-4 h-4" />
                    ) : (
                      <ExclamationCircleIcon className="w-4 h-4" />
                    )}
                    <span>
                      Mandatory DB Fields: {mappedRequiredCount}/{requiredFields.length}
                    </span>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={ArrowPathIcon}
                  onClick={handleAutoMatchAgain}
                >
                  Auto-Match Headers
                </Button>
              </div>
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                {[
                  { id: "ALL", label: `All Scanned & Target (${scannedColumns.length})` },
                  { id: "CORE", label: `Core DB Fields (${targetSchema.length})` },
                  {
                    id: "EXTRA",
                    label: `Collected Extra Headers (${extraScannedColumns.length})`,
                  },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setFilterMode(mode.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border shrink-0 ${
                      filterMode === mode.id
                        ? "bg-[var(--color-brand)] text-white border-[var(--color-brand)] shadow-2xs"
                        : "bg-[var(--color-surface)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] border-[var(--color-line)] hover:bg-[var(--color-surface-sunken)]"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              <div className="relative min-w-[220px] max-w-xs">
                <MagnifyingGlassIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)]" />
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Cari nama kolom atau sampel..."
                  className="w-full pl-8 pr-7 py-1.5 bg-[var(--color-surface)] border border-[var(--color-line)] rounded-lg text-xs font-medium text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20"
                />
                {filterText && (
                  <button
                    type="button"
                    onClick={() => setFilterText("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer"
                  >
                    <XMarkIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* ── TABLE 1: CORE TARGET DATABASE FIELDS (Masuk ke Tabel Utama PostgreSQL) ── */}
            {(filterMode === "ALL" || filterMode === "CORE") && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ink)]">
                      1. Core Database Columns ({isInfopack ? "master_os_infopack_web" : "master_os_cedant_web"})
                    </h4>
                    <p className="text-[11px] text-[var(--color-ink-muted)]">
                      Kolom-kolom utama di bawah ini akan diekstrak, dinormalisasi, dan disimpan langsung ke kolom tabel utama PostgreSQL.
                    </p>
                  </div>
                </div>

                <div className="border border-[var(--color-line)] rounded-[var(--radius-surface)] overflow-x-auto table-scroll shadow-2xs">
                  <table className="w-full text-left border-collapse font-sans text-xs sm:text-[13px]">
                    <thead>
                      <tr className="bg-[var(--color-surface-sunken)] border-b border-[var(--color-line)] text-[var(--color-ink-muted)] text-[11px] uppercase font-bold tracking-wider">
                        <th className="py-3 px-3 w-12 text-center border-r border-[var(--color-line)]">No</th>
                        <th className="py-3 px-4 w-3/12 border-r border-[var(--color-line)]">Core Target Field</th>
                        <th className="py-3 px-4 w-4/12 border-r border-[var(--color-line)]">Source Column (Scanned Excel Header)</th>
                        <th className="py-3 px-4 w-3/12 border-r border-[var(--color-line)]">Sample Value (from File)</th>
                        <th className="py-3 px-4 w-2/12">DB Column &amp; Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-line)] text-[var(--color-ink)]">
                      {targetSchema
                        .filter((col) => {
                          if (!filterText.trim()) return true;
                          const q = filterText.toLowerCase();
                          const src = mapping?.[col.dbField] || "";
                          return (
                            col.label.toLowerCase().includes(q) ||
                            col.dbField.toLowerCase().includes(q) ||
                            src.toLowerCase().includes(q)
                          );
                        })
                        .map((targetCol, idx) => {
                          const selectedSource = mapping?.[targetCol.dbField] || "";
                          const isMapped = Boolean(selectedSource);
                          const isRequired = targetCol.required;
                          const sampleVal = selectedSource
                            ? selectedSource
                                .split("|")
                                .map((p) => sheetSamples[p.trim()] || "")
                                .filter(Boolean)
                                .join(" | ")
                            : "";

                          const rowClass = isMapped
                            ? "bg-[var(--color-valid-soft)]/45 hover:bg-[var(--color-valid-soft)]/80 border-l-4 border-l-[var(--color-valid)]"
                            : isRequired
                              ? "bg-rose-500/10 hover:bg-rose-500/15 border-l-4 border-l-rose-500"
                              : "bg-amber-500/5 hover:bg-amber-500/10 border-l-4 border-l-amber-500/30";

                          return (
                            <tr key={targetCol.dbField} className={`transition-colors ${rowClass}`}>
                              <td className="py-3 px-3 text-center font-mono text-xs text-[var(--color-ink-muted)] font-semibold border-r border-[var(--color-line)]">
                                {idx + 1}
                              </td>
                              <td className="py-3 px-4 border-r border-[var(--color-line)]">
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <span className="font-semibold text-[var(--color-ink)] block">
                                      {targetCol.label}
                                    </span>
                                    <span className="text-[11px] text-[var(--color-ink-muted)]">
                                      {targetCol.description}
                                    </span>
                                  </div>
                                  {isMapped ? (
                                    <span className="px-2 py-0.5 rounded-[var(--radius-control)] bg-[var(--color-valid-soft)] text-[var(--color-valid)] font-semibold text-[10px] shrink-0 border border-[var(--color-valid)]/25 flex items-center gap-1">
                                      <CheckCircleIcon className="w-3.5 h-3.5" />
                                      <span>Mapped</span>
                                    </span>
                                  ) : isRequired ? (
                                    <span className="px-2 py-0.5 rounded-[var(--radius-control)] bg-rose-500/15 text-rose-600 font-bold text-[10px] shrink-0 border border-rose-500/30">
                                      REQUIRED
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-[var(--radius-control)] bg-amber-500/10 text-amber-700 font-medium text-[10px] shrink-0 border border-amber-500/20">
                                      Optional
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4 border-r border-[var(--color-line)]">
                                <select
                                  value={selectedSource}
                                  onChange={(e) =>
                                    handleUpdateMapping(targetCol.dbField, e.target.value)
                                  }
                                  className="w-full py-2 px-3 bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-control)] text-xs font-mono font-semibold text-[var(--color-ink)] focus:outline-none focus:border-[var(--color-brand)] cursor-pointer"
                                >
                                  <option value="">-- Pilih Header Kolom Excel --</option>
                                  {scannedColumns.map((col) => (
                                    <option key={col} value={col}>
                                      {col}
                                      {sheetSamples[col]
                                        ? ` (ex: ${String(sheetSamples[col]).slice(0, 28)})`
                                        : ""}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="py-3 px-4 border-r border-[var(--color-line)] font-mono text-xs text-[var(--color-ink-body)]">
                                {sampleVal ? (
                                  <span className="truncate block max-w-[260px]" title={sampleVal}>
                                    {sampleVal}
                                  </span>
                                ) : (
                                  <span className="text-[var(--color-ink-faint)] italic">—</span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                <span className="font-mono text-xs text-[var(--color-brand)] font-semibold block">
                                  {targetCol.dbField}
                                </span>
                                <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">
                                  {targetCol.sqlType}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TABLE 2: ALL SCANNED HEADERS CATALOG (Disimpan Lengkap & Tetap Bisa Di-GET) ── */}
            {(filterMode === "ALL" || filterMode === "EXTRA") && (
              <div className="space-y-2.5 pt-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-ink)]">
                        2. Full Scanned Excel Header Catalog ({scannedColumns.length} Columns Collected)
                      </h4>
                      <Badge tone="brand">Queryable via GET /api/master/data &amp; /headers</Badge>
                    </div>
                    <p className="text-[11px] text-[var(--color-ink-muted)] mt-0.5">
                      Meskipun hanya {targetSchema.length} kolom inti yang masuk ke tabel utama, <strong>seluruh {scannedColumns.length} kolom beserta datanya</strong> tetap disimpan dan dapat di-GET / ditampilkan di halaman Master Data.
                    </p>
                  </div>
                </div>

                <div className="border border-[var(--color-line)] rounded-[var(--radius-surface)] overflow-x-auto table-scroll shadow-2xs">
                  <table className="w-full text-left border-collapse font-sans text-xs sm:text-[13px]">
                    <thead>
                      <tr className="bg-[var(--color-surface-sunken)] border-b border-[var(--color-line)] text-[var(--color-ink-muted)] text-[11px] uppercase font-bold tracking-wider">
                        <th className="py-2.5 px-3 w-12 text-center border-r border-[var(--color-line)]">No</th>
                        <th className="py-2.5 px-4 w-4/12 border-r border-[var(--color-line)]">Scanned Excel Header</th>
                        <th className="py-2.5 px-4 w-4/12 border-r border-[var(--color-line)]">Sample Row Value</th>
                        <th className="py-2.5 px-4 w-4/12">Storage &amp; Retrieval Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-line)] text-[var(--color-ink)]">
                      {scannedColumns
                        .filter((col) => {
                          if (filterMode === "EXTRA" && mappedSourceSet.has(col)) return false;
                          if (!filterText.trim()) return true;
                          const q = filterText.toLowerCase();
                          const sample = String(sheetSamples[col] || "").toLowerCase();
                          return col.toLowerCase().includes(q) || sample.includes(q);
                        })
                        .map((col, idx) => {
                          const isCore = mappedSourceSet.has(col);
                          const mappedTargetField = Object.entries(mapping || {}).find(([, src]) =>
                            String(src || "")
                              .split("|")
                              .map((s) => s.trim())
                              .includes(col)
                          )?.[0];

                          return (
                            <tr
                              key={col}
                              className="hover:bg-[var(--color-surface-sunken)]/60 transition-colors"
                            >
                              <td className="py-2.5 px-3 text-center font-mono text-xs text-[var(--color-ink-muted)] border-r border-[var(--color-line)]">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 px-4 font-mono font-semibold text-[var(--color-ink)] border-r border-[var(--color-line)]">
                                {col}
                              </td>
                              <td className="py-2.5 px-4 font-mono text-xs text-[var(--color-ink-body)] border-r border-[var(--color-line)]">
                                {sheetSamples[col] ? (
                                  <span
                                    className="truncate block max-w-[320px]"
                                    title={sheetSamples[col]}
                                  >
                                    {sheetSamples[col]}
                                  </span>
                                ) : (
                                  <span className="text-[var(--color-ink-faint)] italic">Empty</span>
                                )}
                              </td>
                              <td className="py-2.5 px-4">
                                {isCore ? (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge tone="valid" dot>
                                      Core DB Column ({mappedTargetField})
                                    </Badge>
                                    <span className="text-[11px] text-[var(--color-ink-muted)]">
                                      + Full Row Store
                                    </span>
                                  </div>
                                ) : (
                                  <Badge tone="brand" dot>
                                    Stored in Full Row &amp; Header Catalog (GET Ready)
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Step 2 Footer Actions */}
          <div className="flex items-center justify-between pt-1">
            <Button
              variant="secondary"
              icon={ArrowLeftIcon}
              onClick={() => setCurrentStep("UPLOAD")}
            >
              Back to Upload
            </Button>

            <Button
              variant="primary"
              icon={ArrowRightIcon}
              disabled={!isMappingComplete || submitting}
              onClick={handleExecuteSave}
            >
              Process &amp; Save Data ({sheetRowCount.toLocaleString("id-ID")} Rows)
            </Button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          STEP 3A: EXECUTING PROGRESS
      ════════════════════════════════════════════════════════════════════ */}
      {currentStep === "EXECUTING" && (
        <div className="bg-[var(--color-surface)] p-6 md:p-8 rounded-[var(--radius-surface)] border border-[var(--color-line)] shadow-[var(--shadow-card)] space-y-6 max-w-2xl mx-auto">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-[var(--radius-surface)] bg-[var(--color-brand-soft)] text-[var(--color-brand)] flex items-center justify-center mx-auto border border-[var(--color-brand-line)]">
              <ArrowPathIcon className="w-7 h-7 animate-spin" />
            </div>
            <h2 className="text-[var(--text-title)] font-bold text-[var(--color-ink)] tracking-tight">
              Processing &amp; Storing Claims Data
            </h2>
            <p className="text-[var(--text-caption)] text-[var(--color-ink-muted)] max-w-md mx-auto">
              Menyimpan kolom inti ke tabel Master PostgreSQL dan mengarsipkan seluruh {scannedColumns.length} kolom header beserta baris lengkap...
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-[var(--color-ink)]">
                {uploadPct < 100 ? "Mengunggah workbook..." : "Menyimpan ke database..."}
              </span>
              <span className="text-[var(--color-brand)] font-mono">{uploadPct}%</span>
            </div>
            <div className="w-full h-2 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-brand)] rounded-full transition-all duration-300"
                style={{ width: `${Math.max(10, uploadPct)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          STEP 3B: COMPLETED SUMMARY
      ════════════════════════════════════════════════════════════════════ */}
      {currentStep === "SUCCESS" && uploadResult && (
        <div className="bg-[var(--color-surface)] p-6 md:p-8 rounded-[var(--radius-surface)] border border-[var(--color-line)] shadow-[var(--shadow-card)] space-y-6 max-w-3xl mx-auto">
          <div className="flex items-start gap-4 pb-5 border-b border-[var(--color-line)]">
            <div className="w-12 h-12 rounded-full bg-[var(--color-valid-soft)] text-[var(--color-valid)] border border-[var(--color-valid)]/25 flex items-center justify-center shrink-0">
              <CheckCircleIcon className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[var(--text-title)] font-bold text-[var(--color-ink)] tracking-tight">
                  Data Berhasil Diproses &amp; Disimpan
                </h2>
                <Badge tone="valid" dot>
                  Job #{uploadResult.job_id}
                </Badge>
              </div>
              <p className="text-xs text-[var(--color-ink-muted)]">
                {uploadResult.message}
              </p>
            </div>
          </div>

          {/* Stat Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] border border-[var(--color-line)]">
              <span className="text-[11px] font-semibold text-[var(--color-ink-muted)] block">
                Total Rows Processed
              </span>
              <span className="text-2xl font-bold font-mono text-[var(--color-ink)] mt-1 block">
                {(uploadResult.total_rows ?? 0).toLocaleString("id-ID")}
              </span>
            </div>
            <div className="p-4 rounded-[var(--radius-control)] bg-[var(--color-valid-soft)]/50 border border-[var(--color-valid)]/25">
              <span className="text-[11px] font-semibold text-[var(--color-valid)] block">
                Appended to Master DB
              </span>
              <span className="text-2xl font-bold font-mono text-[var(--color-valid)] mt-1 block">
                {(uploadResult.rows_appended ?? 0).toLocaleString("id-ID")}
              </span>
            </div>
            <div className="p-4 rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] border border-[var(--color-line)]">
              <span className="text-[11px] font-semibold text-[var(--color-ink-muted)] block">
                Skipped (Duplicate Key)
              </span>
              <span className="text-2xl font-bold font-mono text-[var(--color-ink-body)] mt-1 block">
                {(uploadResult.rows_skipped ?? 0).toLocaleString("id-ID")}
              </span>
            </div>
            <div className="p-4 rounded-[var(--radius-control)] bg-[var(--color-brand-soft)]/50 border border-[var(--color-brand-line)]">
              <span className="text-[11px] font-semibold text-[var(--color-brand)] block">
                Scanned Headers Stored
              </span>
              <span className="text-2xl font-bold font-mono text-[var(--color-brand)] mt-1 block">
                {uploadResult.total_columns ?? scannedColumns.length} Cols
              </span>
            </div>
          </div>

          {/* Stored Header Summary */}
          {uploadResult.scanned_headers?.length > 0 && (
            <div className="p-4 rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)]/60 border border-[var(--color-line)] space-y-2">
              <div className="text-xs font-bold text-[var(--color-ink)]">
                Seluruh Header yang Tersimpan &amp; Bisa Di-GET ({uploadResult.scanned_headers.length} Kolom):
              </div>
              <div className="flex flex-wrap gap-1.5">
                {uploadResult.scanned_headers.map((h) => (
                  <span
                    key={h}
                    className="px-2 py-0.5 rounded text-[11px] font-mono bg-[var(--color-surface)] border border-[var(--color-line)] text-[var(--color-ink-body)]"
                  >
                    {h}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button variant="secondary" onClick={handleResetAll}>
              Upload File Lain
            </Button>
            <div className="flex items-center gap-2.5">
              <Button
                variant="secondary"
                onClick={() => onNavigate?.("library_os")}
              >
                Buka Library
              </Button>
              <Button
                variant="primary"
                icon={TableCellsIcon}
                onClick={() => onNavigate?.("master")}
              >
                Lihat di Master Data (Semua Kolom)
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
