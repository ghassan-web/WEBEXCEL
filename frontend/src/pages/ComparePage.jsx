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

<<<<<<< HEAD
const WIZARD_STEPS = [
  { id: "UPLOAD",    label: "Upload & Scan File",   subtitle: "Select partner, period & scan headers" },
  { id: "MAPPING",   label: "Scan & Match Columns", subtitle: "Cek kolom Excel terhadap daftar kolom target" },
  { id: "EXECUTING", label: "Process & Save",       subtitle: "Simpan ke database & arsipkan semua kolom" },
];

/** Target fields users can map for each dataset type. */
export const TARGET_SEARCH_COLUMNS = [
  {
    dbField: "doc_no",
    label: "Loss Ref / Doc No",
    required: true,
    sqlType: "VARCHAR(255)",
    description: "Nomor dokumen atau referensi klaim",
    patterns: [/^doc\s*no\.?$/i, /^loss\s*ref(erence)?$/i, /\bclaim\s*(no|number)\b/i],
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
=======
const SEL = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-400 transition appearance-none";

/* ─── Cedant → primary key map ───────────────────────── */
const CEDANT_MAP = [
  { value: "",                    label: "— Pilih Cedant / Sumber —",      key: "",                        hint: "" },
  { value: "ABB",                 label: "ABB",                            key: "AL_Index",                hint: "Kolom: AL_Index" },
  { value: "ACA",                 label: "ACA",                            key: "RefNo",                   hint: "Kolom: RefNo" },
  { value: "ADHI RE",             label: "ADHI RE",                        key: "CLAIM NO",                hint: "Kolom: CLAIM NO" },
  { value: "AHIB",                label: "AHIB",                           key: "CLAIM NO",                hint: "Kolom: CLAIM NO" },
  { value: "AON",                 label: "AON",                            key: "Claim Code",              hint: "Kolom: Claim Code" },
  { value: "AON (Broker)",        label: "AON (Broker)",                   key: "Contract Code",           hint: "Kolom: Contract Code" },
  { value: "API RE (Broker)",     label: "API RE (Broker)",                key: "FLA / GLA APRE",          hint: "Kolom: FLA / GLA APRE" },
  { value: "ASM",                 label: "ASM",                            key: "DLA_FLA_DIBAI",           hint: "Kolom: DLA_FLA_DIBAI" },
  { value: "ASIB",                label: "ASIB",                           key: "No. DLA / Ribu / Nota",   hint: "Kolom: No. DLA / Ribu / Nota" },
  { value: "BINTANG",             label: "BINTANG",                        key: "Claim Number",            hint: "Kolom: Claim Number" },
  { value: "BRINS",               label: "BRINS",                          key: "claimno",                 hint: "Kolom: claimno" },
  { value: "CHINA TAIPING (CLAIM NO)",  label: "CHINA TAIPING (CLAIM NO)",  key: "Claim No",               hint: "Kolom: Claim No" },
  { value: "CHINA TAIPING (POLICY NO)", label: "CHINA TAIPING (POLICY NO)",key: "Policy No",               hint: "Kolom: Policy No" },
  { value: "CHINA TAIPING (DLA NO)",    label: "CHINA TAIPING (DLA NO)",   key: "DLA NO",                  hint: "Kolom: DLA NO" },
  { value: "CHINA TAIPING (REF NO)",    label: "CHINA TAIPING (REF NO)",   key: "REF NO",                  hint: "Kolom: REF NO" },
  { value: "DAYIN",               label: "DAYIN",                          key: "REFNO",                   hint: "Kolom: REFNO" },
  { value: "ENERGY RE",           label: "ENERGY RE",                      key: "Ref No",                  hint: "Kolom: Ref No" },
  { value: "JASINDO",             label: "JASINDO",                        key: "Referensi",               hint: "Kolom: Referensi" },
  { value: "JCR (Broker)",        label: "JCR (Broker)",                   key: "DLA JCR",                 hint: "Kolom: DLA JCR" },
  { value: "KB INS",              label: "KB INS",                         key: "Claim No.",               hint: "Kolom: Claim No." },
  { value: "KBRU (Broker)",       label: "KBRU (Broker)",                  key: "REFF CLAIM",              hint: "Kolom: REFF CLAIM" },
  { value: "LINKS RE (Broker)",   label: "LINKS RE (Broker)",              key: "(LINKS-RE) CLAIM NUMBER", hint: "Kolom: (LINKS-RE) CLAIM NUMBER" },
  { value: "LIPPO",               label: "LIPPO",                          key: "No DLA / Claim",          hint: "Kolom: No DLA / Claim" },
  { value: "MAG",                 label: "MAG",                            key: "REFNO",                   hint: "Kolom: REFNO" },
  { value: "MARSH (Broker)",      label: "MARSH (Broker)",                 key: "Trans No.",               hint: "Kolom: Trans No." },
  { value: "MNC",                 label: "MNC",                            key: "CLAIM NO",                hint: "Kolom: CLAIM NO" },
  { value: "MPM",                 label: "MPM",                            key: "Name\nRef No.",            hint: "Kolom: Name\nRef No." },
  { value: "MURE (BROKER)",       label: "MURE (BROKER)",                  key: "No Claim MURE",           hint: "Kolom: No Claim MURE" },
  { value: "OONA",                label: "OONA",                           key: "Slip No./DLA No.",        hint: "Kolom: Slip No./DLA No." },
  { value: "RAMAYANA",            label: "RAMAYANA",                       key: "NO. DLA",                 hint: "Kolom: NO. DLA" },
  { value: "SAMSUNG TUGU",        label: "SAMSUNG TUGU",                   key: "INVOICE NO",              hint: "Kolom: INVOICE NO" },
  { value: "SINAR MAS",           label: "SINAR MAS",                      key: "No. Invoice",             hint: "Kolom: No. Invoice" },
  { value: "SOMPO (FAC OUT)",     label: "SOMPO — FAC OUT",                key: "OUR DEBT/CREDIT NO.",     hint: "Kolom: OUR DEBT/CREDIT NO. (sheet FAC OUT)" },
  { value: "SOMPO (CLAIM)",       label: "SOMPO — CLAIM / AEGS",           key: "Cross Reference",         hint: "Kolom: Cross Reference (sheet CLAIM/AEGS)" },
  { value: "SOMPO (OS D/I)",      label: "SOMPO — OS, D/I",                key: "Ref No.",                 hint: "Kolom: Ref No. (sheet OS D/I)" },
  { value: "SOMPO (CLAIM-OS)",    label: "SOMPO — CLAIM (Outstanding)",    key: "OUR DEBIT/CREDIT NO",     hint: "Kolom: OUR DEBIT/CREDIT NO (sheet CLAIM outstanding)" },
  { value: "TOKIO MARINE",        label: "TOKIO MARINE",                   key: "CLAIM NO.",               hint: "Kolom: CLAIM NO." },
  { value: "TPI",                 label: "TPI",                            key: "Claim Number",            hint: "Kolom: Claim Number" },
  { value: "TRINITY RE (BROKER)", label: "TRINITY RE (BROKER)",            key: "Trinity Claim Reff.",     hint: "Kolom: Trinity Claim Reff." },
  { value: "TRIPA",               label: "TRIPA",                          key: "DocNo",                   hint: "Kolom: DocNo" },
  { value: "UMUM MEGA",           label: "UMUM MEGA",                      key: "REFNO",                   hint: "Kolom: REFNO" },
  { value: "VIDEI",               label: "VIDEI",                          key: "No DLA",                  hint: "Kolom: No DLA" },
  { value: "JBBODA (BROKER)",     label: "JBBODA (BROKER)",                key: "NO. REIBS",               hint: "Kolom: NO. REIBS"},
  { value: "JASINDO",             label: "JASINDO",                        key: "Referensi",               hint: "Kolom: Referensi" },
  { value: "JASA RAHARJA",        label: "JASA RAHARJA",                   key: "REF NO",                  hint: "Kolom: REF NO" },
  { value: "IGNA ASIA (BROKER)",  label: "IGNA ASIA (BROKER)",             key: "REFERENCE IGNA RE / DLA", hint: "Kolom: REFERENCE IGNA RE / DLA" },
  { value: "IBURE (BROKER)",      label: "IBURE (BROKER)",                 key: "Reference No",            hint: "Kolom: Reference No" },
  { value: "IBS RE (Broker)",     label: "IBS RE (Broker) — IBS Claimno",  key: "IBS Claimno",             hint: "Kolom: IBS Claimno" },
  { value: "IBS RE (Broker) 2",   label: "IBS RE (Broker) — NO CLAIM CUBE",key: "NO CLAIM CUBE",           hint: "Kolom: NO CLAIM CUBE" },
  { value: "HARTA AMAN",          label: "HARTA AMAN",                     key: "Reference No",            hint: "Kolom: Reference No" },
  { value: "GUYCARP (BROKER)",    label: "GUYCARP (BROKER)",               key: "Client Reference",        hint: "Kolom: Client Reference" },
  { value: "CEGI",                label: "CEGI",                           key: "Claim N0",                hint: "Kolom: Claim N0" },
  { value: "GARUDA RE (BROKER)" , label: "GARUDA RE (BROKER)",             key: "Claim No",                hint: "Kolom: Claim No" },
  { value: "FPG",                 label: "FPG",                            key: "Document No.",            hint: "Kolom: Document No." },
  { value: "FL RE (BROKER)",      label: "FL RE (BROKER)",                 key: "DLA FLRe",                hint: "Kolom: DLA FLRe" },
  { value: "ETIQA",               label: "ETIQA",                          key: "Reference No.",           hint: "Kolom: Reference No." },
  { value: "DEKAI",               label: "DEKAI",                          key: "PLA/DLA DEKAI",           hint: "Kolom: PLA/DLA DEKAI" },
  { value: "CIPTA COLEMON (BROKER)", label: "CIPTA COLEMON (BROKER)",      key: "CCA Claim Ref. No.",      hint: "Kolom: CCA Claim Ref. No." },
  { value: "BCA INSURANCE",      label: "BCA INSURANCE",                   key: "Reference No.",           hint: "Kolom: Reference No." },
  { value: "AXA",                label: "AXA",                             key: "Ref No.",                  hint: "Kolom: Ref No." },
  { value: "AVRIST",             label: "AVRIST",                          key: "CLAIM NUMBER",            hint: "Kolom: CLAIM NUMBER" },
  { value: "ASWATA",             label: "ASWATA",                          key: "DLA REASURANSI",          hint: "Kolom: DLA REASURANSI" },
  { value: "ASTRA BUANA",        label: "ASTRA BUANA",                     key: "ClaimNo",                 hint: "Kolom: ClaimNo" },
  { value: "ASRINDA (BROKER)",   label: "ASRINDA (BROKER)",                key: "DLA ASRINDA",             hint: "Kolom: DLA ASRINDA" },
  { value: "ASKRINDO",           label: "ASKRINDO",                        key: "DLA/PLA",                 hint: "Kolom: DLA/PLA" },
  { value: "ASEI",               label: "ASEI",                            key: "No. DLA / Polis / Nota",  hint: "Kolom: No. DLA / Polis / Nota" },
  { value: "APIRE (BROKER) (PLA / DLA APIRE)",           label: "APIRE (PLA / DLA APIRE)",                         key: "PLA / DLA APIRE",         hint: "Kolom: PLA / DLA APIRE" },
  { value: "APIRE(BROKER) (No. DLA APIRE)",              label: "APIRE (No. DLA APIRE)",                           key: "No. DLA APIRE",           hint: "No. DLA APIRE" },
  { value: "AGGI",              label: "AGGI",                            key: "CLAIM NO",               hint: "Kolom: CLAIM NO" },
  { value: "ADHI RE",           label: "ADHI RE",                          key: "CLAIM NO",               hint: "Kolom: CLAIM NO" },



];


/* ─── Upload steps guide ─────────────────────────────── */
const STEPS = [
  { n: "1", title: "Pilih Jenis Data",        desc: 'Pilih "OS Claim Cedant" atau "InfoPack" sesuai file yang akan diupload.' },
  { n: "2", title: "Pilih Bulan Cut-Off",     desc: "Klik field Bulan Cut-Off, pilih bulan dan tahun periode data." },
  { n: "3", title: "Pilih Cedant / Sumber",   desc: "Pilih nama cedant dari dropdown. Kolom identifier akan otomatis terisi sesuai mapping." },
  { n: "4", title: "Pilih Sheet (opsional)",  desc: "Jika file punya banyak sheet, pilih sheet yang berisi data OS Claim." },
  { n: "5", title: "Upload File",             desc: 'Klik "+ Select Excel" atau drag & drop file .xlsx/.xls ke area drop zone.' },
  { n: "6", title: "Klik Upload ke Master",   desc: "Klik tombol hijau. Data akan otomatis di-append ke Master tanpa menghapus data sebelumnya." },
>>>>>>> 772547da4971a77d44c538bf43765efad620e01f
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
    allProfilesForTab.forEach((p) => {
      if (p.cedant && !map.has(p.cedant)) {
        map.set(p.cedant, {
          name: p.cedant,
          code: p.cedantCode || p.cedant,
          sheets: p.sheetMet || "All sheets",
          lossRef: p.lossRef || "",
          dateOfLoss: p.dateOfLoss || "",
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "id"));
  }, [allProfilesForTab]);

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
      const matchedFromFilename = cedantOptions.find((c) => {
        const cleanName = c.name.replace(/\s*\(.*?\)\s*/g, "").trim().toUpperCase();
        return cleanName.length >= 3 && upperName.includes(cleanName);
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
        ...backendMap,
        ...initialTargetMap,
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
      ...backendMap,
      ...targetMap,
    });
  };

  const handleAutoMatchAgain = () => {
    const cols = inspectData?.sheet_columns?.[selectedSheet] || [];
    const backendMap = inspectData?.auto_mappings?.[selectedSheet] || {};
    const targetMap = matchExcelColumnsToTargets(cols, currentProfile, targetSearchColumns);
    setMapping({
      ...backendMap,
      ...targetMap,
    });
  };

  /* Mengubah penugasan kolom Excel ke kolom Target (misal memilih kolom mana yang merupakan DOL) */
  const handleAssignExcelColumnToTarget = (excelColName, targetDbField) => {
    setMapping((prev) => {
      const next = { ...prev };
      /* Hapus penugasan lama jika kolom Excel ini sebelumnya dipetakan ke target lain */
      targetSearchColumns.forEach((t) => {
        if (next[t.dbField] === excelColName) {
          delete next[t.dbField];
        }
      });
      if (targetDbField) {
        next[targetDbField] = excelColName;
      }
      return next;
    });
  };

  /* Lookup cepat untuk menandai kolom yang dipetakan ke field target. */
  const excelColToTargetMap = useMemo(() => {
    const map = {}; // { excelColName: targetObj }
    targetSearchColumns.forEach((t) => {
      const assignedExcelCol = mapping?.[t.dbField];
      if (assignedExcelCol) {
        map[assignedExcelCol] = t;
      }
    });
    return map;
  }, [mapping]);

  const matchedExcelColsCount = useMemo(
    () => scannedColumns.filter((col) => Boolean(excelColToTargetMap[col])).length,
    [scannedColumns, excelColToTargetMap]
  );

  const unmatchedExcelColsCount = useMemo(
    () => scannedColumns.length - matchedExcelColsCount,
    [scannedColumns, matchedExcelColsCount]
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
                    ✓ Ketemu (Target): {matchedExcelColsCount} Kolom
                  </span>
                  <span>•</span>
                  <span className="text-rose-600 font-bold">
                    ✕ Tidak Ketemu: {unmatchedExcelColsCount} Kolom
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

            {/* Banner Daftar Kolom Target yang Dicari Saat Ini */}
            <div className="p-4 rounded-[var(--radius-surface)] bg-[var(--color-surface-sunken)] border border-[var(--color-line)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-bold uppercase tracking-wider text-[var(--color-ink)]">
                  Target Kolom yang Dicari Saat Ini ({targetSearchColumns.length} Target):
                </div>
                <p className="text-xs text-[var(--color-ink-muted)]">
                  Kolom Excel yang cocok dengan daftar target ditandai <strong>Hijau (Matched)</strong>, sedangkan kolom lainnya yang tidak termasuk/tidak ketemu ditandai <strong>Merah</strong>. Seluruh {scannedColumns.length} kolom tetap disimpan agar bisa di-GET.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                {targetSearchColumns.map((t) => {
                  const foundCol = mapping?.[t.dbField];
                  return (
                    <div
                      key={t.dbField}
                      className={`px-3 py-1.5 rounded-[var(--radius-control)] border text-xs font-semibold flex items-center gap-2 ${
                        foundCol
                          ? "bg-[var(--color-valid-soft)] text-[var(--color-valid)] border-[var(--color-valid)]/30"
                          : "bg-rose-500/15 text-rose-600 border-rose-500/30"
                      }`}
                    >
                      {foundCol ? (
                        <>
                          <CheckCircleIcon className="w-4 h-4 shrink-0" />
                          <span>
                            {t.label}: <strong className="font-mono">{foundCol}</strong>
                          </span>
                        </>
                      ) : (
                        <>
                          <ExclamationCircleIcon className="w-4 h-4 shrink-0" />
                          <span>{t.label}: TIDAK DITEMUKAN</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Filter Mode Buttons & Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
                {[
                  { id: "ALL", label: `Semua Kolom Excel (${scannedColumns.length})` },
                  { id: "MATCHED", label: `Ketemu / Matched (${matchedExcelColsCount})` },
                  { id: "UNMATCHED", label: `Tidak Ketemu / Merah (${unmatchedExcelColsCount})` },
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
                  placeholder="Cari nama kolom Excel..."
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

            {/* ── TABEL UTAMA TAHAP 2: SELURUH KOLOM YANG ADA DI FILE EXCEL ── */}
            <div className="border border-[var(--color-line)] rounded-[var(--radius-surface)] overflow-x-auto table-scroll shadow-2xs">
              <table className="w-full text-left border-collapse font-sans text-xs sm:text-[13px]">
                <thead>
                  <tr className="bg-[var(--color-surface-sunken)] border-b border-[var(--color-line)] text-[var(--color-ink-muted)] text-[11px] uppercase font-bold tracking-wider">
                    <th className="py-3 px-3 w-12 text-center border-r border-[var(--color-line)]">No</th>
                    <th className="py-3 px-4 w-4/12 border-r border-[var(--color-line)]">
                      Kolom di File Excel (Scanned Header)
                    </th>
                    <th className="py-3 px-4 w-3/12 border-r border-[var(--color-line)]">
                      Contoh Nilai (Baris 1)
                    </th>
                    <th className="py-3 px-4 w-3/12 border-r border-[var(--color-line)]">
                      Target Kolom Dicari
                    </th>
                    <th className="py-3 px-4 w-2/12">Status Pencarian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-line)] text-[var(--color-ink)]">
                  {scannedColumns
                    .filter((col) => {
                      const matchedTarget = excelColToTargetMap[col];
                      if (filterMode === "MATCHED" && !matchedTarget) return false;
                      if (filterMode === "UNMATCHED" && matchedTarget) return false;
                      if (!filterText.trim()) return true;
                      const q = filterText.toLowerCase();
                      const sample = String(sheetSamples[col] || "").toLowerCase();
                      return col.toLowerCase().includes(q) || sample.includes(q);
                    })
                    .map((col, idx) => {
                      const matchedTarget = excelColToTargetMap[col];
                      const isMatched = Boolean(matchedTarget);

                      /* Kolom yang cocok (DOL) -> Hijau; Sisanya yang gak ketemu -> Merah */
                      const rowClass = isMatched
                        ? "bg-[var(--color-valid-soft)]/55 hover:bg-[var(--color-valid-soft)] border-l-4 border-l-[var(--color-valid)]"
                        : "bg-rose-500/10 hover:bg-rose-500/15 border-l-4 border-l-rose-500";

                      return (
                        <tr key={col} className={`transition-colors ${rowClass}`}>
                          <td className="py-3 px-3 text-center font-mono text-xs text-[var(--color-ink-muted)] font-semibold border-r border-[var(--color-line)]">
                            {idx + 1}
                          </td>

                          {/* Nama Kolom di File Excel */}
                          <td className="py-3 px-4 border-r border-[var(--color-line)]">
                            <span
                              className={`font-mono font-bold text-xs sm:text-[13px] ${
                                isMatched ? "text-[var(--color-valid)]" : "text-rose-700"
                              }`}
                            >
                              {col}
                            </span>
                          </td>

                          {/* Contoh Nilai dari Baris Pertama */}
                          <td className="py-3 px-4 border-r border-[var(--color-line)] font-mono text-xs text-[var(--color-ink-body)]">
                            {sheetSamples[col] ? (
                              <span
                                className="truncate block max-w-[260px]"
                                title={sheetSamples[col]}
                              >
                                {sheetSamples[col]}
                              </span>
                            ) : (
                              <span className="text-[var(--color-ink-faint)] italic">—</span>
                            )}
                          </td>

                          {/* Dropdown Pemetaan ke Daftar Kolom Target */}
                          <td className="py-3 px-4 border-r border-[var(--color-line)]">
                            <select
                              value={matchedTarget?.dbField || ""}
                              onChange={(e) =>
                                handleAssignExcelColumnToTarget(col, e.target.value)
                              }
                              className={`w-full py-1.5 px-2.5 rounded-[var(--radius-control)] text-xs font-semibold border cursor-pointer focus:outline-none ${
                                isMatched
                                  ? "bg-[var(--color-surface)] border-[var(--color-valid)] text-[var(--color-valid)]"
                                  : "bg-[var(--color-surface)] border-rose-300 text-rose-600"
                              }`}
                            >
                              <option value="">— Tidak Cocok (Unmatched) —</option>
                              {targetSearchColumns.map((t) => (
                                <option key={t.dbField} value={t.dbField}>
                                  {t.label} ({t.dbField})
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Badge Status Ketemu (Hijau) vs Tidak Ketemu (Merah) */}
                          <td className="py-3 px-4">
                            {isMatched ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-control)] bg-[var(--color-valid-soft)] text-[var(--color-valid)] font-bold text-[11px] border border-[var(--color-valid)]/30">
                                <CheckCircleIcon className="w-3.5 h-3.5 shrink-0" />
                                <span>KETEMU ({matchedTarget.dbField.toUpperCase()})</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--radius-control)] bg-rose-500/15 text-rose-600 font-bold text-[11px] border border-rose-500/30">
                                <ExclamationCircleIcon className="w-3.5 h-3.5 shrink-0" />
                                <span>TIDAK KETEMU</span>
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

            <Button
              variant="primary"
              icon={ArrowRightIcon}
              disabled={submitting}
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
              Menyimpan data ke tabel Master dan mengarsipkan seluruh {scannedColumns.length} kolom header beserta baris lengkap...
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
<<<<<<< HEAD
=======

function DropZone({ file, onFile, disabled }) {
  const fileRef   = useRef(null);
  const folderRef = useRef(null);
  const [drag, setDrag] = useState(false);

  const pick = (files) => {
    const f = Array.from(files).find(f => f.name.endsWith(".xlsx") || f.name.endsWith(".xls") || f.name.endsWith(".xlsb"));
    if (f) onFile(f);
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        onDrop={e => { e.preventDefault(); setDrag(false); if (!disabled) pick(e.dataTransfer.files); }}
        onDragOver={e => { e.preventDefault(); if (!disabled) setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        className={[
          "rounded-xl border-2 border-dashed px-4 py-7 transition-all flex flex-col items-center justify-center gap-2 min-h-[120px]",
          drag ? "border-teal-500 bg-teal-50" : "border-teal-200 bg-white",
          disabled ? "opacity-50" : "",
        ].join(" ")}
      >
        {!file ? (
          <>
            <CloudArrowUpIcon className="h-9 w-9 text-teal-500" />
            <p className="text-sm font-bold text-gray-700">Drop Excel files here</p>
            <p className="text-xs text-teal-600">Format .xlsx / .xls / .xlsb · Maks. 15 MB per file</p>
          </>
        ) : (
          <div className="w-full flex items-center gap-2 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
            <DocumentIcon className="h-4 w-4 text-teal-500 flex-shrink-0" />
            <span className="flex-1 text-xs text-gray-700 truncate font-medium">{file.name}</span>
            <span className="text-[10px] text-gray-400 flex-shrink-0">{(file.size/1024/1024).toFixed(1)} MB</span>
            <button type="button" onClick={() => onFile(null)} disabled={disabled}
              className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0" aria-label="Hapus file">
              <XCircleIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      <input ref={fileRef}   type="file" accept=".xlsx,.xls,.xlsb" className="hidden"
        onChange={e => { pick(e.target.files); e.target.value = ""; }} disabled={disabled} />
      <input ref={folderRef} type="file" accept=".xlsx,.xls" multiple webkitdirectory="" className="hidden"
        onChange={e => { pick(e.target.files); e.target.value = ""; }} disabled={disabled} />
      <div className="flex gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled}
          className="flex-1 flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
          <ArrowUpTrayIcon className="h-3.5 w-3.5" /> + Select Excel
        </button>
        <button type="button" onClick={() => folderRef.current?.click()} disabled={disabled}
          className="flex-1 flex items-center justify-center gap-1.5 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-600 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 transition-colors">
          <FolderOpenIcon className="h-3.5 w-3.5" /> ⊞ Select Folder
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════ */
export default function ComparePage({ onNavigate }) {
  const {
    form, updateForm,
    file, handleFileChange,
    sheets,
    uploadPct, loading,
    result, error,
    submit, reset,
  } = useMasterUpload();

  const [activeTab,   setActiveTab]   = useState("os");
  const [driveUrl,    setDriveUrl]    = useState("");
  const [driveBulan,  setDriveBulan]  = useState("");
  const [driveTahun,  setDriveTahun]  = useState(String(new Date().getFullYear()));
  const [driveCedant, setDriveCedant] = useState("");
  const [showGuide,   setShowGuide]   = useState(true);

  const jenisTipe    = activeTab === "os" ? "OS Cedant" : "Infopack";
  const selectedEntry = CEDANT_MAP.find(c => c.value === form.cedant);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    updateForm("tipe_data", tab === "os" ? "OS Cedant" : "Infopack");
  };

  const handleCedantChange = (val) => {
    const entry = CEDANT_MAP.find(c => c.value === val);
    updateForm("cedant", val);
    updateForm("primary_key_col", entry?.key ?? "");
  };

  const handleSubmit = () => {
    if (!form.tipe_data) updateForm("tipe_data", jenisTipe);
    submit();
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-auto">

      {/* ── Header ── */}
      <div className="page-header">
        <div className="h-8 w-8 rounded-xl bg-teal-600 flex items-center justify-center flex-shrink-0">
          <ArrowUpTrayIcon className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600">DATA INGESTION</p>
          <h1 className="text-base font-bold text-gray-800 leading-tight">Upload Data</h1>
        </div>
        <button onClick={() => { reset(); setShowGuide(true); }} disabled={loading}
          className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 bg-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
          <ArrowPathIcon className="h-3.5 w-3.5" /> ↺ Refresh
        </button>
      </div>

      <div className="px-6 py-6 flex flex-col gap-5 max-w-6xl w-full">

        {/* ── Tabs ── */}
        <div className="flex gap-0 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm">
          {[["os","OS Claim Cedant"],["infopack","InfoPack"]].map(([key, label]) => (
            <button key={key} onClick={() => handleTabChange(key)}
              className={[
                "px-5 py-1.5 rounded-lg text-sm font-medium transition-all",
                activeTab === key
                  ? "bg-white shadow text-teal-700 font-semibold border border-gray-200"
                  : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >{label}</button>
          ))}
        </div>

        {/* ── Step-by-step guide ── */}
        {showGuide && (
          <div className="bg-white rounded-2xl border border-teal-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 bg-teal-50 border-b border-teal-100">
              <div className="flex items-center gap-2">
                <LightBulbIcon className="h-4 w-4 text-teal-600 flex-shrink-0" />
                <span className="text-sm font-bold text-teal-800">Cara Upload Data — 6 Langkah</span>
              </div>
              <button onClick={() => setShowGuide(false)}
                className="text-xs text-teal-500 hover:text-teal-700 font-medium transition-colors">
                Sembunyikan ✕
              </button>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 md:grid-cols-3 gap-3">
              {STEPS.map(s => (
                <div key={s.n} className="flex items-start gap-3">
                  <span className="flex-shrink-0 h-6 w-6 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                    {s.n}
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-gray-800">{s.title}</p>
                    <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Section subtitle ── */}
        <p className="text-xs text-gray-400 -mt-2">
          Pilih jenis data dan bulan cut-off sebelum upload. Setiap file dicatat otomatis dengan waktu upload dan riwayat aktivitas.
        </p>

        {/* ── Two-panel ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* ══ LEFT: Upload from Computer ══ */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Upload from Computer</h3>
              <p className="text-xs text-teal-600 mt-0.5">Pilih banyak file atau unggah satu folder yang berisi Excel.</p>
            </div>

            {/* Step 1+2: Jenis Data + Bulan Cut-Off */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="jenis_local" text="Jenis Data" required />
                <div className="relative">
                  <select id="jenis_local"
                    value={form.tipe_data || jenisTipe}
                    onChange={e => updateForm("tipe_data", e.target.value)}
                    disabled={loading} className={SEL + " pr-8"}>
                    <option value="OS Cedant">OS Claim Cedant</option>
                    <option value="Infopack">Infopack</option>
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▼</span>
                </div>
              </div>
              <CutOffPicker
                bulan={form.bulan} tahun={form.tahun}
                onBulan={v => updateForm("bulan", v)}
                onTahun={v => updateForm("tahun", v)}
                disabled={loading}
              />
            </div>

            {/* Step 3: Cedant */}
            <div>
              <Label htmlFor="cedant_local" text="Cedant / Sumber" required />
              <div className="relative">
                <select id="cedant_local" value={form.cedant}
                  onChange={e => handleCedantChange(e.target.value)}
                  disabled={loading} className={SEL + " pr-8"}>
                  {CEDANT_MAP.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▼</span>
              </div>

              {/* Auto-filled PK hint — no editable raw field */}
              {selectedEntry?.key ? (
                <div className="flex items-center gap-1.5 mt-1.5 bg-teal-50 border border-teal-100 rounded-lg px-3 py-1.5">
                  <InformationCircleIcon className="h-3.5 w-3.5 text-teal-500 flex-shrink-0" />
                  <span className="text-xs text-teal-700">
                    Identifier otomatis: <strong className="font-mono">{selectedEntry.key}</strong>
                  </span>
                </div>
              ) : (
                <p className="text-xs text-gray-400 mt-1">Pilih cedant agar kolom identifier terisi otomatis.</p>
              )}
            </div>

            {/* Manual PK override — only shown if cedant selected but user needs to correct */}
            {form.cedant && (
              <div>
                <Label htmlFor="pk_col" text="Koreksi Kolom Identifier (jika perlu)" />
                <input id="pk_col" type="text"
                  value={form.primary_key_col}
                  onChange={e => updateForm("primary_key_col", e.target.value)}
                  disabled={loading}
                  placeholder={selectedEntry?.key || "Nama kolom…"}
                  className={SEL + " font-mono text-xs"}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Edit hanya jika kolom di file berbeda dari mapping di atas. Biasanya tidak perlu diubah.
                </p>
              </div>
            )}

            {/* Step 4: Sheet selector */}
            {sheets.length > 0 && (
              <div>
                <Label htmlFor="sheet_name" text="Sheet (opsional)" />
                <div className="relative">
                  <select id="sheet_name" value={form.sheet_name}
                    onChange={e => updateForm("sheet_name", e.target.value)}
                    disabled={loading} className={SEL + " pr-8"}>
                    <option value="">— Sheet pertama (default) —</option>
                    {sheets.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▼</span>
                </div>
              </div>
            )}

            {/* Step 5: Drop zone */}
            <DropZone file={file} onFile={handleFileChange} disabled={loading} />

            {/* Progress */}
            {loading && uploadPct > 0 && uploadPct < 100 && (
              <div className="flex flex-col gap-1">
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
            {loading && uploadPct >= 100 && (
              <div className="flex items-center gap-2 text-xs text-teal-700 animate-pulse">
                <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> Memproses data…
              </div>
            )}

            {/* Error */}
            {error && (
              <div role="alert" className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2.5 rounded-xl text-xs">
                <ExclamationCircleIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-0.5">Upload gagal</p>
                  <p>{error}</p>
                  {error.includes("tidak ditemukan") && (
                    <p className="mt-1 text-red-500">
                      💡 Coba koreksi nama kolom pada field "Koreksi Kolom Identifier" di atas, sesuaikan dengan nama kolom yang muncul di pesan error.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Success */}
            {result && (
              <div className="flex items-start gap-2 bg-teal-50 border border-teal-200 text-teal-800 px-4 py-3 rounded-xl text-xs">
                <CheckCircleIcon className="h-5 w-5 flex-shrink-0 mt-0.5 text-teal-600" />
                <div>
                  <p className="font-bold text-sm text-teal-800">Upload berhasil! ✓</p>
                  <p className="mt-1 text-teal-700 leading-relaxed">
                    <strong>{result.rows_appended?.toLocaleString("id-ID")}</strong> baris ditambahkan ke Master ·{" "}
                    <strong>{result.rows_skipped?.toLocaleString("id-ID")}</strong> dilewati (sudah ada) ·{" "}
                    Total <strong>{result.total_rows?.toLocaleString("id-ID")}</strong> baris diproses
                  </p>
                  <p className="mt-1 text-teal-600">
                    Sheet: <code className="bg-teal-100 px-1.5 py-0.5 rounded font-mono">{result.sheet}</code>
                    {" "}· Lihat hasil di halaman{" "}
                    <button onClick={() => onNavigate?.("master")} className="font-bold underline">Master</button>
                    {" "}atau{" "}
                    <button onClick={() => onNavigate?.("library_os")} className="font-bold underline">Library</button>.
                  </p>
                </div>
              </div>
            )}

            {/* Step 6: Submit */}
            <button type="button" onClick={handleSubmit} disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors">
              <ArrowUpTrayIcon className="h-4 w-4" />
              {loading ? "Memproses…" : "⊕ Upload ke Master"}
            </button>
          </div>

          {/* ══ RIGHT: Import from Google Drive ══ */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Import from Google Drive</h3>
              <p className="text-xs text-teal-600 mt-0.5">Gunakan apabila seluruh Excel sudah berada dalam satu folder Drive.</p>
            </div>

            {/* Drive URL */}
            <div>
              <Label htmlFor="drive_url" text="Google Drive Folder URL / ID" />
              <input id="drive_url" type="url" value={driveUrl} onChange={e => setDriveUrl(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 placeholder-gray-300" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label text="Jenis Data" required />
                <div className="relative">
                  <select value={jenisTipe} disabled className={SEL + " pr-8 bg-gray-50 cursor-default"}>
                    <option>OS Claim Cedant</option>
                    <option>Infopack</option>
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▼</span>
                </div>
              </div>
              <CutOffPicker bulan={driveBulan} tahun={driveTahun}
                onBulan={setDriveBulan} onTahun={setDriveTahun} disabled={false} />
            </div>

            <div>
              <Label text="Cedant / Sumber" />
              <div className="relative">
                <select value={driveCedant} onChange={e => setDriveCedant(e.target.value)} className={SEL + " pr-8"}>
                  {CEDANT_MAP.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▼</span>
              </div>
            </div>

            <button type="button" disabled
              className="flex items-center justify-center gap-2 bg-teal-600 disabled:bg-teal-400 text-white text-sm font-semibold px-4 py-2.5 rounded-xl cursor-not-allowed"
              title="Membutuhkan integrasi Google Drive API">
              <ArrowUpTrayIcon className="h-4 w-4" /> ⊕ Import Folder Excel
            </button>

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 leading-relaxed">
              Hanya file Excel pada level teratas folder yang diimpor. File asli Drive tidak dimodifikasi; aplikasi membuat salinan kerja.
            </div>

            {/* Tips */}
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex flex-col gap-2">
              <p className="text-xs font-bold text-gray-700">💡 Tips upload</p>
              <ul className="text-xs text-gray-500 space-y-1 list-none">
                <li>• Pastikan file Excel tidak di-protect dengan password</li>
                <li>• Data harus ada di baris pertama sebagai header kolom</li>
                <li>• Jika ada error "kolom tidak ditemukan", cek nama kolom identifier di Mapping Rules</li>
                <li>• Upload berikutnya <strong>otomatis append</strong> — data lama tidak terhapus</li>
                <li>• Duplicate (sama persis) otomatis dilewati tanpa error</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-3.5 flex items-center justify-between gap-4 text-xs text-gray-500">
          <span>
            Setelah upload, kelola file melalui{" "}
            <button onClick={() => onNavigate?.("library")}
              className="text-teal-600 font-semibold hover:underline">Library</button>{" "}
            atau lanjutkan deteksi sesuai jenis data.
          </span>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => onNavigate?.("library_os")}
              className="border border-gray-200 bg-white hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 text-gray-600 px-3 py-1.5 rounded-lg transition-colors">
              Library OS Claim →
            </button>
            <button onClick={() => onNavigate?.("library_infopack")}
              className="border border-gray-200 bg-white hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 text-gray-600 px-3 py-1.5 rounded-lg transition-colors">
              Library InfoPack →
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
>>>>>>> 772547da4971a77d44c538bf43765efad620e01f
