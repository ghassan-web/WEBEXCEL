import { useState, useRef, useMemo, useEffect } from "react";
import { useColumnMappings } from "../hooks/useColumnMappings";
import {
  confirmMasterUploadMapping,
  inspectMasterFile,
  prepareMasterUpload,
} from "../services/api";
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
  InformationCircleIcon,
  CircleStackIcon,
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
  { id: "MAPPING",   label: "Scan & Match Columns", subtitle: "Cek kolom Excel terhadap daftar kolom target" },
  { id: "EXECUTING", label: "Process & Save",       subtitle: "Simpan ke database & arsipkan semua kolom" },
];

/** Target fields users can map for each dataset type. */
export const TARGET_SEARCH_COLUMNS = [
  {
    dbField: "doc_no",
    label: "Loss Ref",
    required: true,
    sqlType: "VARCHAR(255)",
    description: "Nomor dokumen atau referensi klaim",
    patterns: [/^doc\s*no\.?$/i, /^loss\s*ref(erence)?$/i, /\bclaim\s*(no|number)\b/i],
  },
  {
    dbField: "class_code",
    label: "Class Code",
    required: false,
    sqlType: "VARCHAR(50)",
    description: "Kode kelas bisnis atau COB",
    patterns: [/^class[\s_-]*code$/i, /^classcode$/i, /^cob$/i, /class\s*of\s*business/i],
  },
  {
    dbField: "outstanding",
    label: "Outstanding",
    required: true,
    sqlType: "NUMERIC",
    description: "Nilai cadangan klaim outstanding",
    patterns: [/outstanding/i, /\bnet\s*os\b/i, /\bos\s*amount\b/i],
  },
  {
    dbField: "dol",
    label: "DOL / Date of Loss",
    required: false,
    sqlType: "DATE",
    description: "Tanggal Kejadian Klaim (Date of Loss)",
    patterns: [
      /^dol$/i,
      /^date\s*of\s*loss$/i,
      /^loss\s*date$/i,
      /^tgl\.?\s*dol$/i,
      /^d\.o\.l\.?$/i,
      /^d\s*a\s*t\s*e\s*of\s*loss$/i,
      /trans\s*desc\/dol/i,
      /^dt\s*dol$/i,
      /^tgl_kejadian$/i,
      /^tg_kejadian$/i,
      /^occur$/i,
      /\bdol\b/i,
      /date.*loss|loss.*date/i,
    ],
  },
  {
    dbField: "currency",
    label: "Currency",
    required: false,
    sqlType: "VARCHAR(10)",
    description: "Kode mata uang",
    patterns: [/^currency$/i, /^curr(?:ency)?\s*code$/i],
  },
];

const INFOPACK_TARGET_SEARCH_COLUMNS = [
  {
    dbField: "dol",
    label: "DOL / Date of Loss",
    required: true,
    sqlType: "DATE",
    patterns: [/^dol$/i, /^date\s*of\s*loss$/i, /^loss\s*date$/i, /\bdol\b/i],
  },
  {
    dbField: "cob",
    label: "COB",
    required: true,
    sqlType: "VARCHAR(100)",
    patterns: [/^cob$/i, /class\s*of\s*business/i, /business\s*class/i],
  },
  {
    dbField: "gross",
    label: "Gross",
    required: true,
    sqlType: "NUMERIC",
    patterns: [/gross/i],
  },
  {
    dbField: "tsi",
    label: "TSI",
    required: true,
    sqlType: "NUMERIC",
    patterns: [/^tsi$/i, /total\s*sum\s*insured/i, /sum\s*insured/i],
  },
  {
    dbField: "insured",
    label: "Insured",
    required: false,
    sqlType: "TEXT",
    patterns: [/insured/i, /policyholder/i],
  },
];

/** Auto-match Excel headers against the active dataset's target fields. */
function matchExcelColumnsToTargets(excelColumns = [], activeProfile = null, targets = TARGET_SEARCH_COLUMNS) {
  const matchedMap = {}; // { dbField: excelColName }
  const usedCols = new Set();

  targets.forEach((target) => {
    /* 1. Cek dari profil mapping cedant terlebih dahulu (misal profile.dateOfLoss) */
    if (target.dbField === "dol" && activeProfile?.dateOfLoss && activeProfile.dateOfLoss !== "—" && activeProfile.dateOfLoss !== "(Tidak tersedia)") {
      const exactFromProfile = excelColumns.find(
        (c) => c.trim().toLowerCase() === activeProfile.dateOfLoss.trim().toLowerCase()
      );
      if (exactFromProfile) {
        matchedMap[target.dbField] = exactFromProfile;
        usedCols.add(exactFromProfile);
        return;
      }
    }

    /* 2. Cek berdasarkan regex patterns */
    for (const pat of target.patterns || []) {
      const found = excelColumns.find((c) => !usedCols.has(c) && pat.test(String(c).trim()));
      if (found) {
        matchedMap[target.dbField] = found;
        usedCols.add(found);
        break;
      }
    }
  });

  return matchedMap;
}

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
  const {
    profiles,
    cedants: masterCedants,
    loading: mappingsLoading,
    error: mappingsError,
    dbConnected,
    reload: reloadMappings,
  } = useColumnMappings();

  /* ── Wizard & Form State ── */
  const [currentStep, setCurrentStep] = useState("UPLOAD"); // 'UPLOAD' | 'MAPPING' | 'EXECUTING' | 'SUCCESS'
  const [activeTab, setActiveTab] = useState("os"); // 'os' | 'infopack'
  const [bulan, setBulan] = useState("08");
  const [tahun, setTahun] = useState(String(new Date().getFullYear()));

  /* ── Insurance Company Search & Selection ── */
  const [selectedCedant, setSelectedCedant] = useState(null); // { name, code }
  const [selectedProfileIdx, setSelectedProfileIdx] = useState(0);
  const [cedantQuery, setCedantQuery] = useState("");
  const [cedantDropdownOpen, setCedantDropdownOpen] = useState(false);
  const cedantWrapperRef = useRef(null);

  /* ── File & Inspection State ── */
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectData, setInspectData] = useState(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [mapping, setMapping] = useState({}); // { dol: "DOL", ... }
  const [filterMode, setFilterMode] = useState("ALL"); // 'ALL' | 'MATCHED' | 'UNMATCHED'
  const [filterText, setFilterText] = useState("");

  /* ── Execution / Upload State ── */
  const [uploadPct, setUploadPct] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [preparedUpload, setPreparedUpload] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const isInfopack = activeTab === "infopack";
  const tipeData = isInfopack ? "Infopack" : "OS Cedant";
  const targetSearchColumns = isInfopack
    ? INFOPACK_TARGET_SEARCH_COLUMNS
    : TARGET_SEARCH_COLUMNS;

  /* ── Unique Insurance Company List ── */
  const allProfilesForTab = useMemo(
    () => profiles.filter((p) => p.tipe_data === (isInfopack ? "Infopack" : "OS Cedant")),
    [profiles, isInfopack]
  );

  const cedantOptions = useMemo(() => {
    const map = new Map();
    masterCedants.forEach((cedant) => {
      const name = String(cedant.cedant_name || cedant.cedant_code || "").trim();
      const code = String(cedant.cedant_code || "").trim();
      if (name && code) {
        map.set(code.toUpperCase(), {
          name,
          code,
          sheets: "All sheets",
          lossRef: "",
          dateOfLoss: "",
        });
      }
    });
    allProfilesForTab.forEach((p) => {
      if (p.cedant) {
        const code = String(p.cedantCode || p.cedant).trim();
        const key = code.toUpperCase();
        map.set(key, {
          ...map.get(key),
          name: p.cedant,
          code,
          sheets: p.sheetMet || "All sheets",
          lossRef: p.lossRef || "",
          dateOfLoss: p.dateOfLoss || "",
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [allProfilesForTab, masterCedants]);

  const activeCedantProfiles = useMemo(() => {
    if (!selectedCedant?.name) return [];
    return allProfilesForTab.filter((p) => p.cedant === selectedCedant.name);
  }, [allProfilesForTab, selectedCedant]);

  const currentProfile = activeCedantProfiles[selectedProfileIdx] ?? activeCedantProfiles[0] ?? null;

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

    /* Auto-detect Insurance Company dari nama file jika belum dipilih */
    let activeCedantObj = selectedCedant;
    if (!activeCedantObj) {
      const upperName = rawFile.name.toUpperCase();
      const filenameTokens = upperName.split(/[^A-Z0-9]+/).filter(Boolean);
      const matchedFromFilename = cedantOptions.find((c) => {
        const cleanName = c.name.replace(/\s*\(.*?\)\s*/g, "").trim().toUpperCase();
        const codeToken = String(c.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        const matchesCode = codeToken.length >= 3 && filenameTokens.includes(codeToken);
        return matchesCode || (cleanName.length >= 3 && upperName.includes(cleanName));
      });
      if (matchedFromFilename) {
        activeCedantObj = matchedFromFilename;
        setSelectedCedant(matchedFromFilename);
        setSelectedProfileIdx(0);
      }
    }

    /* Jalankan scan header ke backend */
    setIsInspecting(true);
    try {
      const fd = new FormData();
      fd.append("file", rawFile);
      fd.append("tipe_data", tipeData);
      if (activeCedantObj?.name) fd.append("cedant", activeCedantObj.name);
      if (activeCedantObj?.code) fd.append("cedant_code", activeCedantObj.code);

      const res = await inspectMasterFile(fd);
      setInspectData(res);
      if (!activeCedantObj && res.cedant_code) {
        activeCedantObj = {
          name: res.cedant_name || res.cedant_code,
          code: res.cedant_code,
          sheets: "All sheets",
        };
        setSelectedCedant(activeCedantObj);
      }

      const defSheet = res.default_sheet || res.available_sheets?.[0] || "";
      setSelectedSheet(defSheet);

      const cols = res.sheet_columns?.[defSheet] || [];
      const prof = allProfilesForTab.find((p) => p.cedant === activeCedantObj?.name) || null;
      const initialTargetMap = matchExcelColumnsToTargets(cols, prof, targetSearchColumns);
      const backendMap = res.auto_mappings?.[defSheet] || {};
      setMapping({
        ...initialTargetMap,
        ...(prof?.mapping || {}),
        ...backendMap,
      });
      setPreparedUpload(null);
    } catch (err) {
      setErrorMessage(err.message || "Gagal memindai header file Excel. Pastikan backend berjalan di port 8000.");
      setInspectData(null);
    } finally {
      setIsInspecting(false);
    }
  };

  /* Saat user mengganti sheet aktif, jalankan pencocokan ulang untuk sheet tersebut */
  const handleSheetChange = (newSheet) => {
    setSelectedSheet(newSheet);
    const cols = inspectData?.sheet_columns?.[newSheet] || [];
    const backendMap = inspectData?.auto_mappings?.[newSheet] || {};
    const targetMap = matchExcelColumnsToTargets(cols, currentProfile, targetSearchColumns);
    setMapping({
      ...targetMap,
      ...(currentProfile?.mapping || {}),
      ...backendMap,
    });
  };

  const handleAutoMatchAgain = () => {
    const cols = inspectData?.sheet_columns?.[selectedSheet] || [];
    const backendMap = inspectData?.auto_mappings?.[selectedSheet] || {};
    const targetMap = matchExcelColumnsToTargets(cols, currentProfile, targetSearchColumns);
    setMapping({
      ...targetMap,
      ...(currentProfile?.mapping || {}),
      ...backendMap,
    });
  };

  /* Mengubah penugasan kolom Excel ke field target. */
  const handleAssignExcelColumnToTarget = (excelColName, targetDbField) => {
    setMapping((prev) => {
      const next = { ...prev };
      /* Hapus penugasan lama jika kolom Excel ini sebelumnya dipetakan ke target lain */
      targetSearchColumns.forEach((t) => {
        if (t.dbField !== targetDbField && next[t.dbField] === excelColName) {
          delete next[t.dbField];
        }
      });
      if (targetDbField) {
        if (excelColName) {
          next[targetDbField] = excelColName;
        } else {
          delete next[targetDbField];
        }
      }
      return next;
    });
  };

  const matchedTargetCount = targetSearchColumns.filter(
    (target) => Boolean(mapping?.[target.dbField])
  ).length;
  const unmatchedTargetCount = targetSearchColumns.length - matchedTargetCount;
  const missingRequiredTargets = targetSearchColumns.filter(
    (target) => target.required && !mapping?.[target.dbField]
  );

  /* ── Eksekusi Simpan ke Master Database (Step 2 -> Step 3) ── */
  const handleExecuteSave = async () => {
    if (!file) return;
    setCurrentStep("EXECUTING");
    setSubmitting(true);
    setUploadPct(0);
    setErrorMessage("");

    try {
      let prepared = preparedUpload;
      const preparedSheet = prepared?.sheets?.find(
        (sheet) => sheet.sheet_name === selectedSheet
      );
      if (!preparedSheet) {
        const cedantName = selectedCedant?.name || inspectData?.cedant_name;
        const cedantCode = selectedCedant?.code || inspectData?.cedant_code;
        if (!cedantName && !cedantCode) {
          throw new Error("Cedant belum dipilih atau tidak berhasil dideteksi.");
        }
        const fd = new FormData();
        fd.append("bulan", bulan);
        fd.append("tahun", tahun);
        fd.append("tipe_data", tipeData);
        if (cedantName) fd.append("cedant", cedantName);
        if (cedantCode) fd.append("cedant_code", cedantCode);
        fd.append("file", file);
        prepared = await prepareMasterUpload(fd, (pct) => setUploadPct(pct));
        setPreparedUpload(prepared);
      }

      const sheet = prepared.sheets?.find(
        (item) => item.sheet_name === selectedSheet
      );
      if (!sheet) {
        throw new Error("Sheet yang dipilih tidak berhasil disiapkan untuk mapping.");
      }
      if (sheet.status === "ready") {
        throw new Error("Sheet ini sudah selesai diproses.");
      }
      const confirmed = sheet.status === "empty"
        ? { status: "ready", rows_appended: 0, rows_updated: 0, rows_skipped: 0 }
        : await confirmMasterUploadMapping(sheet.table_id, mapping);
      const updatedSheets = prepared.sheets.map((item) =>
        item.table_id === sheet.table_id
          ? {
              ...item,
              status: "ready",
              mapping_version: confirmed.mapping_version ?? item.suggested_version,
            }
          : item
      );
      const pendingSheets = updatedSheets.filter(
        (item) => item.status !== "ready" && item.status !== "empty"
      );
      const updatedPrepared = {
        ...prepared,
        status: pendingSheets.length ? "needs_review" : "ready",
        sheets: updatedSheets,
      };
      setPreparedUpload(updatedPrepared);
      const resultMessage = sheet.status === "empty"
        ? "Sheet berhasil diarsipkan; tidak ada baris data untuk diproses."
        : `Upload berhasil. ${confirmed.rows_appended} baris ditambahkan, ${confirmed.rows_updated} dilengkapi, dan ${confirmed.rows_skipped} dilewati.`;
      const res = {
        ...confirmed,
        ...updatedPrepared,
        status: updatedPrepared.status,
        batch_status: confirmed.batch_status || updatedPrepared.status,
        sheet: selectedSheet,
        total_rows: sheet.total_rows,
        total_columns: sheet.headers.length,
        total_headers_stored: updatedSheets.reduce(
          (total, item) => total + (item.headers?.length || 0),
          0
        ),
        pending_sheets: pendingSheets,
        message: pendingSheets.length
          ? `${resultMessage} ${pendingSheets.length} sheet lain masih menunggu konfirmasi mapping.`
          : resultMessage,
      };
      setUploadResult(res);
      setCurrentStep("SUCCESS");
    } catch (err) {
      setErrorMessage(err.message || "Gagal menyimpan data ke Master.");
      setCurrentStep("MAPPING");
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinueNextSheet = () => {
    const nextSheet = uploadResult?.pending_sheets?.[0];
    if (!nextSheet) return;
    handleSheetChange(nextSheet.sheet_name);
    setUploadResult(null);
    setCurrentStep("MAPPING");
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
    setPreparedUpload(null);
  };

  const activeStepOrder =
    currentStep === "SUCCESS"
      ? 3
      : WIZARD_STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 py-6 space-y-6 font-sans">
      {/* ── Connected 3-Step Wizard Bar ── */}
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
          STEP 1: UPLOAD & SCAN WORKBOOK HEADERS
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
                Pilih Insurance Company, periode cut-off, dan unggah file Excel untuk memindai seluruh header kolom secara otomatis.
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
                      setSelectedProfileIdx(0);
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

          {/* Database Connection Status Bar (Memuat ke database / Connect status) */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] border border-[var(--color-line)] text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <CircleStackIcon className="w-4 h-4 text-[var(--color-brand)] shrink-0" />
              {mappingsLoading ? (
                <span className="text-[var(--color-ink-muted)] font-medium animate-pulse">
                  Memuat mapping database &amp; memeriksa koneksi...
                </span>
              ) : dbConnected ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-valid)] shrink-0" />
                  <span className="font-semibold text-[var(--color-ink)]">
                    Database Connected
                  </span>
                  <span className="text-[var(--color-ink-muted)]">
                    · {cedantOptions.length} Insurance Company tersedia untuk pencarian
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <span className="font-semibold text-[var(--color-ink)]">
                    Database Unavailable ({cedantOptions.length} cedant dari database)
                  </span>
                  {mappingsError && (
                    <span className="text-[var(--color-ink-muted)] truncate max-w-md">
                      · Status DB: {mappingsError}
                    </span>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={reloadMappings}
              disabled={mappingsLoading}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-brand)] hover:underline disabled:opacity-50 cursor-pointer shrink-0"
            >
              <ArrowPathIcon className={`w-3.5 h-3.5 ${mappingsLoading ? "animate-spin" : ""}`} />
              <span>Reconnect / Refresh DB</span>
            </button>
          </div>

          {/* Top Configuration: Insurance Company Picker, Period Cut-Off & Status */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start pb-5 border-b border-[var(--color-line)]">
            {/* Insurance Company Selector (tanpa teks dalam kurung cedant) */}
            <div className="lg:col-span-5 relative" ref={cedantWrapperRef}>
              <label className="block font-bold text-[var(--color-ink)] mb-1 text-xs">
                Insurance Company <span className="text-[var(--color-danger)]">*</span>
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
                      : "Search company name or code (e.g. ACA, SOMPO, ASKRINDO)..."
                  }
                  value={selectedCedant ? selectedCedant.name : cedantQuery}
                  onChange={(e) => {
                    setCedantQuery(e.target.value);
                    if (selectedCedant) {
                      setSelectedCedant(null);
                      setSelectedProfileIdx(0);
                    }
                    setCedantDropdownOpen(true);
                  }}
                  onFocus={() => setCedantDropdownOpen(true)}
                  className="w-full py-2 px-3 bg-transparent text-xs sm:text-sm font-medium text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] outline-none"
                />
                {(selectedCedant || cedantQuery) && (
                  <button
                    type="button"
                    aria-label="Clear insurance company selection"
                    onClick={() => {
                      setSelectedCedant(null);
                      setSelectedProfileIdx(0);
                      setCedantQuery("");
                    }}
                    className="mr-3 text-[var(--color-ink-muted)] hover:text-[var(--color-danger)] cursor-pointer"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                )}
              </div>

              {cedantDropdownOpen && (
                <div className="absolute left-0 right-0 mt-1.5 bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-surface)] shadow-[var(--shadow-overlay)] z-30 max-h-64 overflow-y-auto p-1 scrollbar-none">
                  {filteredCedants.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-[var(--color-ink-muted)] italic">
                      Insurance company tidak ditemukan.
                    </div>
                  ) : (
                    filteredCedants.map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        onClick={() => {
                          setSelectedCedant(c);
                          setSelectedProfileIdx(0);
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
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)] border border-[var(--color-line)] shrink-0 ml-2 max-w-[160px] truncate">
                          {c.sheets}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Info profil mapping jika Insurance Company dipilih */}
              {selectedCedant && activeCedantProfiles.length > 1 && (
                <div className="mt-2">
                  <label className="block text-[11px] font-semibold text-[var(--color-ink-muted)] mb-1">
                    Sheet / Variant ({activeCedantProfiles.length} profil tersedia)
                  </label>
                  <select
                    value={selectedProfileIdx}
                    onChange={(e) => setSelectedProfileIdx(Number(e.target.value))}
                    className="w-full py-1.5 px-2.5 bg-[var(--color-surface)] border border-[var(--color-line)] rounded-[var(--radius-control)] text-xs font-medium text-[var(--color-ink)]"
                  >
                    {activeCedantProfiles.map((p, i) => (
                      <option key={i} value={i}>
                        {p.sheetMet} — DOL: {p.dateOfLoss}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {selectedCedant && currentProfile && (
                <div className="mt-2 px-3 py-2 rounded-[var(--radius-control)] bg-[var(--color-brand-soft)]/60 border border-[var(--color-brand-line)] flex items-center gap-2 text-xs text-[var(--color-brand)]">
                  <InformationCircleIcon className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    Sheet: <strong>{currentProfile.sheetMet}</strong> · Target DOL:{" "}
                    <strong className="font-mono">{currentProfile.dateOfLoss}</strong>
                  </span>
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
            <div className="lg:col-span-3 flex items-center lg:justify-end lg:mt-5">
              {selectedCedant ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 h-[38px] rounded-[var(--radius-control)] text-xs bg-[var(--color-surface)] border border-[var(--color-line)] shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-valid)] shrink-0 animate-pulse" />
                  <span className="font-semibold text-[var(--color-ink)]">Ready for Upload</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 h-[38px] rounded-[var(--radius-control)] text-xs text-[var(--color-ink-muted)] bg-[var(--color-surface-sunken)]/60 border border-[var(--color-line)]">
                  <span className="w-2 h-2 rounded-full bg-[var(--color-brand)] shrink-0" />
                  <span className="font-medium">Auto-Detect Partner Active</span>
                </div>
              )}
            </div>
          </div>

          {/* Breathable Dropzone */}
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
              Drag &amp; drop file Excel di sini, atau klik untuk memilih file dari komputer
            </p>
            <span className="mt-1 text-[11px] font-mono text-[var(--color-ink-muted)]">
              Format .xlsx, .xls, .xlsm, .xlsb (Maks. 50 MB) · Header kolom akan otomatis di-scan
            </span>
          </div>

          {/* File Queue & Scanned Header Summary */}
          {file && (
            <div className="space-y-4 pt-1">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--color-line)]">
                <div className="flex items-center gap-2.5">
                  <h4 className="text-xs font-bold text-[var(--color-ink)] uppercase tracking-wider">
                    File Queue (1)
                  </h4>
                  {isInspecting ? (
                    <Badge tone="brand" dot>
                      Memindai Header Excel...
                    </Badge>
                  ) : inspectData ? (
                    <Badge tone="valid" dot>
                      ✓ {scannedColumns.length} Kolom Header Terdeteksi
                    </Badge>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={handleResetAll}
                  className="text-xs text-[var(--color-ink-muted)] hover:text-[var(--color-danger)] font-semibold cursor-pointer"
                >
                  Hapus File
                </button>
              </div>

              <div className="p-4 rounded-[var(--radius-surface)] bg-[var(--color-surface-sunken)]/70 border border-[var(--color-line)] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
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
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--color-ink-muted)] flex-wrap">
                      <span>
                        Insurance Company:{" "}
                        <strong className="text-[var(--color-ink)]">
                          {selectedCedant?.name || inspectData?.detected_file_tag || "Auto"}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        Baris:{" "}
                        <strong className="font-mono text-[var(--color-ink)]">
                          {sheetRowCount.toLocaleString("id-ID")} rows
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        Kolom di Excel:{" "}
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
                      Sheet:
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

              {/* Action Bar to Proceed to Step 2 */}
              <div className="flex items-center justify-end pt-2">
                <Button
                  variant="primary"
                  icon={ArrowRightIcon}
                  disabled={!file || isInspecting || !inspectData || scannedColumns.length === 0}
                  onClick={() => setCurrentStep("MAPPING")}
                >
                  Lanjut ke Tahap 2: Cek Kolom Excel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          STEP 2: TAMPILAN UI KOLOM-KOLOM DI FILE EXCEL
          - Mencari kolom target (sementara: DOL / Date of Loss -> HIJAU)
          - Sisanya yang tidak ketemu / belum terdaftar di target -> MERAH (dimerahin)
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
                      {selectedCedant?.code || inspectData.detected_file_tag || "AUTO"}
                    </span>
                    <span className="text-[var(--color-line-strong)]">•</span>
                    <span className="font-sans font-medium text-xs text-[var(--color-ink)]">
                      {selectedCedant?.name || inspectData.cedant_name || "Insurance Company"}
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
                    Total Kolom di File Excel:{" "}
                    <strong className="text-[var(--color-ink)] font-semibold">
                      {scannedColumns.length} Kolom
                    </strong>
                  </span>
                  <span>•</span>
                  <span className="text-[var(--color-valid)] font-bold">
                    ✓ Field cocok: {matchedTargetCount}/{targetSearchColumns.length}
                  </span>
                  <span>•</span>
                  <span className="text-rose-600 font-bold">
                    ✕ Belum dipetakan: {unmatchedTargetCount}
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
                  Scan Ulang Kolom Target
                </Button>
              </div>
            </div>

            {/* Ringkasan konteks dan field inti yang akan dipetakan */}
            <div className="p-4 rounded-[var(--radius-surface)] bg-[var(--color-surface-sunken)] border border-[var(--color-line)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-ink)]">
                  Konteks Upload
                </div>
                <p className="text-xs text-[var(--color-ink-muted)]">
                  Cedant, bulan, dan tahun diambil dari pilihan upload. Hanya field inti yang perlu dicocokkan; semua kolom Excel tetap diarsipkan.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                <span className="px-3 py-1.5 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] text-xs font-semibold text-[var(--color-ink)]">
                  Cedant: <strong className="font-mono">{selectedCedant?.code || inspectData.cedant_code || "—"}</strong>
                </span>
                <span className="px-3 py-1.5 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] text-xs font-semibold text-[var(--color-ink)]">
                  Bulan: <strong>{bulan || "—"}</strong>
                </span>
                <span className="px-3 py-1.5 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] text-xs font-semibold text-[var(--color-ink)]">
                  Tahun: <strong>{tahun || "—"}</strong>
                </span>
              </div>
            </div>

            {/* Filter Mode Buttons & Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                {[
                  { id: "ALL", label: `Semua Field (${targetSearchColumns.length})` },
                  { id: "MATCHED", label: `Sudah Dipetakan (${matchedTargetCount})` },
                  { id: "UNMATCHED", label: `Belum Dipetakan (${unmatchedTargetCount})` },
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
                  placeholder="Cari field atau header Excel..."
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

            {/* ── TABEL FIELD INTI YANG PERLU DIPETAKAN ── */}
            <div className="border border-[var(--color-line)] rounded-[var(--radius-surface)] overflow-x-auto table-scroll shadow-2xs">
              <table className="w-full text-left border-collapse font-sans text-xs sm:text-[13px]">
                <thead>
                  <tr className="bg-[var(--color-surface-sunken)] border-b border-[var(--color-line)] text-[var(--color-ink-muted)] text-[11px] uppercase font-bold tracking-wider">
                    <th className="py-3 px-3 w-12 text-center border-r border-[var(--color-line)]">No</th>
                    <th className="py-3 px-4 w-3/12 border-r border-[var(--color-line)]">
                      Field yang Dibutuhkan
                    </th>
                    <th className="py-3 px-4 w-4/12 border-r border-[var(--color-line)]">
                      Kolom di File Excel
                    </th>
                    <th className="py-3 px-4 w-3/12 border-r border-[var(--color-line)]">
                      Contoh Nilai
                    </th>
                    <th className="py-3 px-4 w-2/12">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-line)] text-[var(--color-ink)]">
                  {targetSearchColumns
                    .filter((target) => {
                      const mappedColumn = mapping?.[target.dbField];
                      if (filterMode === "MATCHED" && !mappedColumn) return false;
                      if (filterMode === "UNMATCHED" && mappedColumn) return false;
                      if (!filterText.trim()) return true;
                      const q = filterText.toLowerCase();
                      const sample = String(sheetSamples[mappedColumn] || "").toLowerCase();
                      return (
                        target.label.toLowerCase().includes(q) ||
                        target.dbField.toLowerCase().includes(q) ||
                        String(mappedColumn || "").toLowerCase().includes(q) ||
                        sample.includes(q)
                      );
                    })
                    .map((target, idx) => {
                      const mappedColumn = mapping?.[target.dbField] || "";
                      const isMatched = Boolean(mappedColumn);

                      const rowClass = isMatched
                        ? "bg-[var(--color-valid-soft)]/55 hover:bg-[var(--color-valid-soft)] border-l-4 border-l-[var(--color-valid)]"
                        : target.required
                          ? "bg-rose-500/10 hover:bg-rose-500/15 border-l-4 border-l-rose-500"
                          : "bg-[var(--color-surface)] hover:bg-[var(--color-surface-sunken)] border-l-4 border-l-[var(--color-line)]";

                      return (
                        <tr key={target.dbField} className={`transition-colors ${rowClass}`}>
                          <td className="py-3 px-3 text-center font-mono text-xs text-[var(--color-ink-muted)] font-semibold border-r border-[var(--color-line)]">
                            {idx + 1}
                          </td>

                          <td className="py-3 px-4 border-r border-[var(--color-line)]">
                            <span className="font-bold text-xs sm:text-[13px] text-[var(--color-ink)]">
                              {target.label}
                            </span>
                            <span className="block mt-0.5 font-mono text-[10px] text-[var(--color-ink-muted)]">
                              {target.dbField === "doc_no" ? "loss_ref" : target.dbField}
                              {target.required ? " · Wajib" : " · Opsional"}
                            </span>
                          </td>

                          <td className="py-3 px-4 border-r border-[var(--color-line)]">
                            <select
                              value={mappedColumn}
                              onChange={(e) =>
                                handleAssignExcelColumnToTarget(e.target.value, target.dbField)
                              }
                              className={`w-full py-1.5 px-2.5 rounded-[var(--radius-control)] text-xs font-semibold border cursor-pointer focus:outline-none ${
                                isMatched
                                  ? "bg-[var(--color-surface)] border-[var(--color-valid)] text-[var(--color-valid)]"
                                  : "bg-[var(--color-surface)] border-rose-300 text-rose-600"
                              }`}
                            >
                              <option value="">— Pilih kolom Excel —</option>
                              {scannedColumns.map((column) => (
                                <option key={column} value={column}>
                                  {column}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="py-3 px-4 border-r border-[var(--color-line)] font-mono text-xs text-[var(--color-ink-body)]">
                            {mappedColumn && sheetSamples[mappedColumn] ? (
                              <span
                                className="truncate block max-w-[260px]"
                                title={sheetSamples[mappedColumn]}
                              >
                                {sheetSamples[mappedColumn]}
                              </span>
                            ) : (
                              <span className="text-[var(--color-ink-faint)] italic">
                                {mappedColumn ? "Nilai kosong" : "Pilih kolom untuk melihat contoh"}
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4">
                            {isMatched ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-control)] bg-[var(--color-valid-soft)] text-[var(--color-valid)] font-bold text-[11px] border border-[var(--color-valid)]/30">
                                <CheckCircleIcon className="w-3.5 h-3.5 shrink-0" />
                                <span>TERPETAKAN</span>
                              </span>
                            ) : target.required ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-control)] bg-rose-500/15 text-rose-600 font-bold text-[11px] border border-rose-500/30">
                                <ExclamationCircleIcon className="w-3.5 h-3.5 shrink-0" />
                                <span>WAJIB DIPETAKAN</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] text-[var(--color-ink-muted)] font-bold text-[11px] border border-[var(--color-line)]">
                                OPSIONAL
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
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

            <div className="flex flex-col items-end gap-2">
              {missingRequiredTargets.length > 0 && (
                <p className="text-xs font-semibold text-rose-600" role="status">
                  Petakan field wajib: {missingRequiredTargets.map((target) => target.label).join(", ")}.
                </p>
              )}
              <Button
                variant="primary"
                icon={ArrowRightIcon}
                disabled={submitting || missingRequiredTargets.length > 0}
                onClick={handleExecuteSave}
              >
                Process &amp; Save Data ({sheetRowCount.toLocaleString("id-ID")} Rows)
              </Button>
            </div>
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
              Menyimpan data ke tabel Master dan mengarsipkan seluruh {scannedColumns.length} kolom header beserta baris lengkap...
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-[var(--color-ink)]">
                {uploadPct < 100
                  ? "Mengunggah workbook..."
                  : "File terkirim; server sedang memproses dan menyimpan..."}
              </span>
              <span className="text-[var(--color-brand)] font-mono">
                {uploadPct < 100 ? `${uploadPct}%` : "Memproses"}
              </span>
            </div>
            <div className="w-full h-2 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden">
              <div
                className={`h-full bg-[var(--color-brand)] rounded-full transition-all duration-300 ${
                  uploadPct >= 100 ? "animate-pulse" : ""
                }`}
                style={{ width: uploadPct < 100 ? `${Math.max(10, uploadPct)}%` : "35%" }}
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
                <Badge tone="brand">
                  Batch #{uploadResult.batch_id}
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
                Headers Diarsipkan (Semua Sheet)
              </span>
              <span className="text-2xl font-bold font-mono text-[var(--color-brand)] mt-1 block">
                {uploadResult.total_headers_stored ?? uploadResult.total_columns ?? scannedColumns.length} Cols
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="secondary" onClick={handleResetAll}>
              Upload File Lain
            </Button>
            <div className="flex items-center gap-2.5 flex-wrap justify-end">
              {uploadResult.pending_sheets?.length > 0 && (
                <Button
                  variant="primary"
                  onClick={handleContinueNextSheet}
                >
                  Lanjutkan Sheet Berikutnya ({uploadResult.pending_sheets.length})
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => onNavigate?.("library_os")}
              >
                Buka Library
              </Button>
              <Button
                variant={uploadResult.pending_sheets?.length > 0 ? "secondary" : "primary"}
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
