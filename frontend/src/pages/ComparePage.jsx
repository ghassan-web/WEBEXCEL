import { useState, useRef } from "react";
import { useMasterUpload } from "../hooks/useMasterUpload";
import {
  ArrowUpTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  CloudArrowUpIcon,
  FolderOpenIcon,
  DocumentIcon,
  XCircleIcon,
  CalendarIcon,
  InformationCircleIcon,
  LightBulbIcon,
} from "@heroicons/react/24/outline";

/* ─── constants ──────────────────────────────────────── */
const MONTHS_EN = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const MONTHS = [
  ["01","Januari"],["02","Februari"],["03","Maret"],["04","April"],
  ["05","Mei"],["06","Juni"],["07","Juli"],["08","Agustus"],
  ["09","September"],["10","Oktober"],["11","November"],["12","Desember"],
];
const YEARS = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - 1 + i));

const SEL = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-400 transition appearance-none";

/* ─── Cedant → primary key map  (OS Claim Cedant) ────── */
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
  { value: "BRINS",               label: "BRINS",                          key: "domino",                  hint: "Kolom: domino" },
  { value: "CHINA TAIPING",       label: "CHINA TAIPING",                  key: "Claim No.",               hint: "Kolom: Claim No." },
  { value: "DAYIN",               label: "DAYIN",                          key: "REFNO",                   hint: "Kolom: REFNO" },
  { value: "ENERGY RE",           label: "ENERGY RE",                      key: "Ref No.",                 hint: "Kolom: Ref No." },
  { value: "JASINDO",             label: "JASINDO",                        key: "Reference",               hint: "Kolom: Reference" },
  { value: "JCR (Broker)",        label: "JCR (Broker)",                   key: "DLA JCR",                 hint: "Kolom: DLA JCR" },
  { value: "KB INS",              label: "KB INS",                         key: "Claim No.",               hint: "Kolom: Claim No." },
  { value: "KARK (Proportional)", label: "KARK (Proportional)",            key: "Insured",                 hint: "Kolom: Insured (sheet List Realisasi)" },
  { value: "KARK (Non-Proportional)", label: "KARK (Non-Proportional)",    key: "Insured Name",            hint: "Kolom: Insured Name (sheet 5.1)" },
  { value: "KB INS (Non-Proportional)", label: "KB INS (Non-Proportional)", key: "Claim No",               hint: "Kolom: Claim No (sheet 2.11)" },
  { value: "KBRU (Broker)",       label: "KBRU (Broker)",                  key: "REFF CLAIM",              hint: "Kolom: REFF CLAIM" },
  { value: "LINKS RE (Broker)",   label: "LINKS RE (Broker)",              key: "(LINKS-RE) CLAIM NUMBER", hint: "Kolom: (LINKS-RE) CLAIM NUMBER" },
  { value: "LIPPO",               label: "LIPPO",                          key: "No DLA / Claim",          hint: "Kolom: No DLA / Claim" },
  { value: "LIPPO (Proportional)", label: "LIPPO (Proportional)",          key: "Claim No",                hint: "Kolom: Claim No (Exhibit 5.1 / 5.2)" },
  { value: "LIPPO (Non-Proportional)", label: "LIPPO (Non-Proportional)",  key: "Insured Name",            hint: "Kolom: Insured Name (Exhibit 5.1) / Event Name (Exhibit 5.2)" },
  { value: "MAIPARK (Non-Proportional)", label: "MAIPARK (Non-Proportional)", key: "Event",                hint: "Kolom: Event (sheet Exhibit 4.1)" },
  { value: "MAXIMUS (Proportional)",             label: "MAXIMUS (Proportional)",             key: "LOSS NO.",             hint: "Kolom: LOSS NO. (sheet 2.10)" },
  { value: "MAXIMUS (Non-Proportional)",         label: "MAXIMUS (Non-Proportional)",         key: "LOSS NO.",             hint: "Kolom: LOSS NO. (sheet 2.10)" },
  { value: "MAXIMUS (Surety Bond Proportional)", label: "MAXIMUS (Surety Bond Proportional)", key: "LOSS NO.",             hint: "Kolom: LOSS NO. (sheet OS Loses)" },
  { value: "MERITZ KORINDO (Proportional - MV & PA)", label: "MERITZ KORINDO (Proportional - MV & PA)", key: "Claim No.",       hint: "Kolom: Claim No. (sheet List of Individual Losses 5 Yrs)" },
  { value: "MKI (Non-Proportional)",                 label: "MKI (Non-Proportional)",                 key: "Claim No.",       hint: "Kolom: Claim No. (sheet Larger Loss)" },
  { value: "MAG",                 label: "MAG",                            key: "REFNO",                   hint: "Kolom: REFNO" },
  { value: "MARSH (Broker)",      label: "MARSH (Broker)",                 key: "Trans No.",               hint: "Kolom: Trans No." },
  { value: "MNC",                 label: "MNC",                            key: "CLAIM NO",                hint: "Kolom: CLAIM NO" },
  { value: "MPM",                 label: "MPM",                            key: "Name Ref No.",            hint: "Kolom: Name Ref No." },
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
];

/* ─── Cedant → primary key map  (InfoPack) ───────────── */
/* InfoPack: primary key = DOL + COB (composite) untuk semua cedant */
const CEDANT_MAP_INFOPACK = [
  { value: "",               label: "— Pilih Cedant / Sumber —", key: "",        hint: "" },
  { value: "ABB",            label: "ABB",                        key: "DOL|COB", hint: "DOL · COB" },
  { value: "ACA",            label: "ACA",                        key: "DOL|COB", hint: "DOL · COB" },
  { value: "ADHI RE",        label: "ADHI RE",                    key: "DOL|COB", hint: "DOL · COB" },
  { value: "AGGI",           label: "AGGI",                       key: "DOL|COB", hint: "DOL · COB" },
  { value: "AON (Broker)",   label: "AON (Broker)",               key: "DOL|COB", hint: "DOL · COB" },
  { value: "API RE (Broker)",label: "API RE (Broker)",            key: "DOL|COB", hint: "DOL · COB" },
  { value: "ASIB",           label: "ASIB",                       key: "DOL|COB", hint: "DOL · COB" },
  { value: "ASKRINDO",       label: "ASKRINDO",                   key: "DOL|COB", hint: "DOL · COB" },
  { value: "ASTRARAHANA",    label: "ASTRARAHANA",                key: "DOL|COB", hint: "DOL · COB" },
  { value: "AVRIST",         label: "AVRIST",                     key: "DOL|COB", hint: "DOL · COB" },
  { value: "AXA",            label: "AXA",                        key: "DOL|COB", hint: "DOL · COB" },
  { value: "BCA INSURANCE",  label: "BCA INSURANCE",              key: "DOL|COB", hint: "DOL · COB" },
  { value: "BINTANG",        label: "BINTANG",                    key: "DOL|COB", hint: "DOL · COB" },
  { value: "BRINS",          label: "BRINS",                      key: "DOL|COB", hint: "DOL · COB" },
  { value: "CHINA TAIPING",  label: "CHINA TAIPING",              key: "DOL|COB", hint: "DOL · COB" },
  { value: "ETIGA",          label: "ETIGA",                      key: "DOL|COB", hint: "DOL · COB" },
  { value: "FPG",            label: "FPG",                        key: "DOL|COB", hint: "DOL · COB" },
  { value: "GEGI",           label: "GEGI",                       key: "DOL|COB", hint: "DOL · COB" },
  { value: "HARTA AMAN",     label: "HARTA AMAN",                 key: "DOL|COB", hint: "DOL · COB" },
  { value: "JASA RAHARJA",   label: "JASA RAHARJA",               key: "DOL|COB", hint: "DOL · COB" },
  { value: "JASINDO",        label: "JASINDO",                    key: "DOL|COB", hint: "DOL · COB" },
  { value: "JASTAN",            label: "JASTAN (Proportional)",      key: "DOL|COB", hint: "DOL · COB" },
  { value: "JASTAN (Non-Proportional)", label: "JASTAN (Non-Proportional)", key: "DOL|COB", hint: "DOL · COB" },
  { value: "KARK (Proportional)",      label: "KARK (Proportional)",       key: "DOL|COB", hint: "DOL · COB" },
  { value: "KARK (Non-Proportional)", label: "KARK (Non-Proportional)",   key: "DOL|COB", hint: "DOL · COB" },
  { value: "KB INS (Proportional)",    label: "KB INS (Proportional)",     key: "DOL|COB", hint: "DOL · COB" },
  { value: "KB INS (Non-Proportional)", label: "KB INS (Non-Proportional)", key: "DOL|COB", hint: "DOL · COB" },
  { value: "LIPPO",          label: "LIPPO",                      key: "DOL|COB", hint: "DOL · COB" },
  { value: "LIPPO (Proportional)", label: "LIPPO (Proportional)", key: "DOL|COB", hint: "DOL · COB" },
  { value: "LIPPO (Non-Proportional)", label: "LIPPO (Non-Proportional)", key: "DOL|COB", hint: "DOL · COB" },
  { value: "MAIPARK (Non-Proportional)", label: "MAIPARK (Non-Proportional)", key: "DOL|COB", hint: "DOL · COB" },
  { value: "MAXIMUS (Proportional)",             label: "MAXIMUS (Proportional)",             key: "DOL|COB", hint: "DOL · COB" },
  { value: "MAXIMUS (Non-Proportional)",         label: "MAXIMUS (Non-Proportional)",         key: "DOL|COB", hint: "DOL · COB" },
  { value: "MAXIMUS (Surety Bond Proportional)", label: "MAXIMUS (Surety Bond Proportional)", key: "DOL|COB", hint: "DOL · COB" },
  { value: "MERITZ KORINDO (Proportional - MV & PA)", label: "MERITZ KORINDO (Proportional - MV & PA)", key: "DOL|COB", hint: "DOL · COB" },
  { value: "MKI (Non-Proportional)",                 label: "MKI (Non-Proportional)",                 key: "DOL|COB", hint: "DOL · COB" },
  { value: "MAG",            label: "MAG",                        key: "DOL|COB", hint: "DOL · COB" },
  { value: "MNC",            label: "MNC",                        key: "DOL|COB", hint: "DOL · COB" },
  { value: "MPM",            label: "MPM",                        key: "DOL|COB", hint: "DOL · COB" },
  { value: "OONA",           label: "OONA",                       key: "DOL|COB", hint: "DOL · COB" },
  { value: "RAMAYANA",       label: "RAMAYANA",                   key: "DOL|COB", hint: "DOL · COB" },
  { value: "SAMSUNG TUGU",   label: "SAMSUNG TUGU",               key: "DOL|COB", hint: "DOL · COB" },
  { value: "SINAR MAS",      label: "SINAR MAS",                  key: "DOL|COB", hint: "DOL · COB" },
  { value: "SOMPO",          label: "SOMPO",                      key: "DOL|COB", hint: "DOL · COB" },
  { value: "TOKIO MARINE",   label: "TOKIO MARINE",               key: "DOL|COB", hint: "DOL · COB" },
  { value: "TPI",            label: "TPI",                        key: "DOL|COB", hint: "DOL · COB" },
  { value: "UMUM MEGA",      label: "UMUM MEGA",                  key: "DOL|COB", hint: "DOL · COB" },
  { value: "VIDEI",          label: "VIDEI",                      key: "DOL|COB", hint: "DOL · COB" },
];

/* ─── Upload steps guide ─────────────────────────────── */
const STEPS = [
  { n: "1", title: "Pilih Jenis Data",        desc: 'Pilih "OS Claim Cedant" atau "InfoPack" sesuai file yang akan diupload.' },
  { n: "2", title: "Pilih Bulan Cut-Off",     desc: "Klik field Bulan Cut-Off, pilih bulan dan tahun periode data." },
  { n: "3", title: "Pilih Cedant / Sumber",   desc: "Pilih nama cedant dari dropdown. Kolom identifier akan otomatis terisi sesuai mapping." },
  { n: "4", title: "Pilih Sheet (opsional)",  desc: "Jika file punya banyak sheet, pilih sheet yang berisi data OS Claim." },
  { n: "5", title: "Upload File",             desc: 'Klik "+ Select Excel" atau drag & drop file .xlsx/.xls ke area drop zone.' },
  { n: "6", title: "Klik Upload ke Master",   desc: "Klik tombol hijau. Data akan otomatis di-append ke Master tanpa menghapus data sebelumnya." },
];

/* ─── helpers ────────────────────────────────────────── */
function Label({ htmlFor, text, required }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-gray-600 mb-1">
      {text}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function CutOffPicker({ bulan, tahun, onBulan, onTahun, disabled }) {
  const [open, setOpen] = useState(false);
  const idx        = bulan ? parseInt(bulan, 10) - 1 : -1;
  const displayVal = bulan ? `${MONTHS_EN[idx]} ${tahun}` : "";

  return (
    <div className="relative">
      <Label text="Bulan Cut-Off" required />
      <div
        onClick={() => !disabled && setOpen(o => !o)}
        className={[
          "flex items-center border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white cursor-pointer select-none",
          disabled ? "opacity-50 pointer-events-none" : "hover:border-teal-400",
        ].join(" ")}
      >
        <span className={`flex-1 ${displayVal ? "text-gray-700" : "text-gray-400"}`}>
          {displayVal || "Pilih bulan…"}
        </span>
        <CalendarIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg p-3 flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map(([v, l]) => (
              <button key={v} type="button"
                onClick={() => { onBulan(v); setOpen(false); }}
                className={[
                  "text-xs px-2 py-1.5 rounded-lg transition-colors",
                  bulan === v ? "bg-teal-600 text-white font-semibold" : "hover:bg-teal-50 text-gray-700",
                ].join(" ")}
              >{l}</button>
            ))}
          </div>
          <select value={tahun} onChange={e => onTahun(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-full focus:outline-none focus:ring-2 focus:ring-teal-500">
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

function DropZone({ file, onFile, disabled }) {
  const fileRef   = useRef(null);
  const folderRef = useRef(null);
  const [drag, setDrag] = useState(false);

  // Accept semua file Excel — filter di sini, bukan di attribute accept
  // agar dialog tidak menyembunyikan file valid di beberapa browser/OS
  const EXCEL_EXTS = [".xlsx", ".xls", ".xlsm", ".xlsb"];
  const isExcel = (name) => EXCEL_EXTS.some(ext => name.toLowerCase().endsWith(ext));

  const pick = (files) => {
    const f = Array.from(files).find(f => isExcel(f.name));
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
            <p className="text-xs text-teal-600">Format .xlsx / .xls · Maks. 15 MB per file</p>
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
      {/* accept="*" — tampilkan SEMUA file di dialog, filter ekstensi di pick() */}
      <input ref={fileRef}   type="file" accept="*" className="hidden"
        onChange={e => { pick(e.target.files); e.target.value = ""; }} disabled={disabled} />
      <input ref={folderRef} type="file" accept="*" multiple webkitdirectory="" className="hidden"
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

  const jenisTipe       = activeTab === "os" ? "OS Cedant" : "Infopack";
  const isInfopack      = activeTab === "infopack";
  const activeCedantMap = isInfopack ? CEDANT_MAP_INFOPACK : CEDANT_MAP;
  const selectedEntry   = activeCedantMap.find(c => c.value === form.cedant);

  // For InfoPack composite key: split "DOL|COB" into editable parts
  const isComposite = isInfopack && selectedEntry?.key?.includes("|");
  const [dolPart, cobPart] = isComposite
    ? selectedEntry.key.split("|").map(s => s.trim())
    : ["", ""];

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    updateForm("tipe_data", tab === "os" ? "OS Cedant" : "Infopack");
    updateForm("cedant", "");
    updateForm("primary_key_col", "");
  };

  const handleCedantChange = (val) => {
    const entry = activeCedantMap.find(c => c.value === val);
    updateForm("cedant", val);
    updateForm("primary_key_col", entry?.key ?? "");
  };

  // Called when user edits the DOL or COB part individually
  const handleCompositePartChange = (part, value) => {
    const current = form.primary_key_col || selectedEntry?.key || "|";
    const parts   = current.split("|");
    if (part === "dol") parts[0] = value;
    else                parts[1] = value;
    updateForm("primary_key_col", parts.join("|"));
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
                  {activeCedantMap.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">▼</span>
              </div>

              {/* Auto-filled PK hint */}
              {selectedEntry?.key ? (
                isComposite ? (
                  <div className="mt-1.5 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <InformationCircleIcon className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                      <span className="text-xs font-semibold text-blue-700">
                        InfoPack: Primary Key = DOL + COB (composite)
                      </span>
                    </div>
                    <p className="text-xs text-blue-600 leading-relaxed">
                      Nilai <strong>tanggal kejadian</strong> dan <strong>kelas bisnis</strong> digabung otomatis
                      sebagai identifier unik. Sesuaikan nama kolom di bawah jika berbeda dari file kamu.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-1.5 bg-teal-50 border border-teal-100 rounded-lg px-3 py-1.5">
                    <InformationCircleIcon className="h-3.5 w-3.5 text-teal-500 flex-shrink-0" />
                    <span className="text-xs text-teal-700">
                      Identifier otomatis: <strong className="font-mono">{selectedEntry.key}</strong>
                    </span>
                  </div>
                )
              ) : (
                <p className="text-xs text-gray-400 mt-1">Pilih cedant agar kolom identifier terisi otomatis.</p>
              )}
            </div>

            {/* PK override — composite (InfoPack) vs single (OS) */}
            {form.cedant && isComposite ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold text-gray-600">
                  Kolom DOL &amp; COB <span className="text-gray-400 font-normal">(sesuaikan jika nama kolom di file berbeda)</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Kolom DOL</label>
                    <input type="text"
                      value={(form.primary_key_col || selectedEntry?.key || "").split("|")[0] ?? dolPart}
                      onChange={e => handleCompositePartChange("dol", e.target.value)}
                      disabled={loading}
                      placeholder={dolPart || "Date Of Loss"}
                      className={SEL + " font-mono text-xs"}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Kolom COB</label>
                    <input type="text"
                      value={(form.primary_key_col || selectedEntry?.key || "").split("|")[1] ?? cobPart}
                      onChange={e => handleCompositePartChange("cob", e.target.value)}
                      disabled={loading}
                      placeholder={cobPart || "COB"}
                      className={SEL + " font-mono text-xs"}
                    />
                  </div>
                </div>
                <p className="text-[10px] text-gray-400">
                  Key yang dikirim: <code className="font-mono bg-gray-100 px-1 rounded">
                    {form.primary_key_col || selectedEntry?.key || "—"}
                  </code>
                </p>
              </div>
            ) : form.cedant ? (
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
            ) : null}

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
                  {activeCedantMap.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
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
