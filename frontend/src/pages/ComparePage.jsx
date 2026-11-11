import { useState, useRef } from "react";
import { useMasterUpload } from "../hooks/useMasterUpload";
import { PROFILES_OS, PROFILES_INFOPACK } from "../services/mappingData";
import {
  ArrowUpTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  CloudArrowUpIcon,
  DocumentIcon,
  XCircleIcon,
  CalendarIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

/* ─── constants ─────────────────────────────────────────── */
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

/* ─── helpers ────────────────────────────────────────────── */
function Label({ htmlFor, text, required, optional }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-gray-600 mb-1">
      {text}
      {required && <span className="text-red-500 ml-0.5">*</span>}
      {optional && <span className="text-gray-400 font-normal ml-1">(opsional)</span>}
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
          "flex items-center border rounded-lg px-3 py-2 text-sm bg-white cursor-pointer select-none",
          disabled ? "opacity-50 pointer-events-none" : "hover:border-teal-400",
          !bulan ? "border-amber-300 ring-1 ring-amber-200" : "border-gray-200",
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
  const fileRef = useRef(null);
  const [drag, setDrag] = useState(false);

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
          "rounded-xl border-2 border-dashed px-4 py-8 transition-all flex flex-col items-center justify-center gap-2 min-h-[140px]",
          drag ? "border-teal-500 bg-teal-50" : "border-teal-200 bg-white",
          disabled ? "opacity-50 cursor-not-allowed" : "",
        ].join(" ")}
      >
        {!file ? (
          <>
            <CloudArrowUpIcon className="h-10 w-10 text-teal-400" />
            <p className="text-sm font-bold text-gray-700">Drop file Excel di sini</p>
            <p className="text-xs text-gray-400">Format .xlsx / .xls · Maks. 50 MB</p>
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
      <input ref={fileRef} type="file" accept="*" className="hidden"
        onChange={e => { pick(e.target.files); e.target.value = ""; }} disabled={disabled} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={disabled}
        className="w-full flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors">
        <ArrowUpTrayIcon className="h-4 w-4" /> + Select Excel
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════ */
export default function ComparePage({ onNavigate }) {
  const {
    form, updateForm,
    file, handleFileChange,
    sheets,
    uploadPct, loading,
    result, error,
    submit, reset,
  } = useMasterUpload();

  const [activeTab,          setActiveTab]          = useState("os");
  const [selectedProfileIdx, setSelectedProfileIdx] = useState(0);

  const jenisTipe  = activeTab === "os" ? "OS Cedant" : "Infopack";
  const isInfopack = activeTab === "infopack";

  const allProfiles   = isInfopack ? PROFILES_INFOPACK : PROFILES_OS;
  const uniqueCedants = [...new Set(allProfiles.map(p => p.cedant))].sort((a, b) =>
    a.localeCompare(b, "id")
  );

  const activeProfiles = allProfiles.filter(p => p.cedant === form.cedant);
  const currentProfile = activeProfiles[selectedProfileIdx] ?? activeProfiles[0] ?? null;
  const isComposite    = currentProfile?.lossRef?.includes("|") ?? false;

  /* ── handlers ── */
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    updateForm("tipe_data", tab === "os" ? "OS Cedant" : "Infopack");
    updateForm("cedant", "");
    updateForm("primary_key_col", "");
    updateForm("sheet_name", "");
    setSelectedProfileIdx(0);
  };

  const handleCedantChange = (val) => {
    updateForm("cedant", val);
    setSelectedProfileIdx(0);
    updateForm("sheet_name", "");
    if (!val) {
      updateForm("primary_key_col", "");
      return;
    }
    const profiles = allProfiles.filter(p => p.cedant === val);
    const pk = (profiles[0]?.lossRef && profiles[0].lossRef !== "—")
      ? profiles[0].lossRef : "";
    updateForm("primary_key_col", pk);
    // Auto-set sheet dari profil pertama jika tersedia
    if (profiles[0]?.sheetMet) {
      updateForm("sheet_name", profiles[0].sheetMet);
    }
  };

  const handleProfileChange = (idx) => {
    const i = Number(idx);
    setSelectedProfileIdx(i);
    const p = activeProfiles[i];
    if (!p) return;
    if (p.lossRef && p.lossRef !== "—") updateForm("primary_key_col", p.lossRef);
    if (p.sheetMet) updateForm("sheet_name", p.sheetMet);
  };

  const handleCompositePartChange = (part, value) => {
    const current = form.primary_key_col || currentProfile?.lossRef || "|";
    const parts   = current.split("|");
    if (part === "left")  parts[0] = value;
    else                  parts[1] = value;
    updateForm("primary_key_col", parts.join("|"));
  };

  /**
   * handleFilePick — pass preferredSheet dari mapping ke hook
   * agar sheet di-auto-resolve sebelum user klik Upload.
   */
  const handleFilePick = (f) => {
    const preferred = currentProfile?.sheetMet ?? null;
    handleFileChange(f, preferred);
  };

  const handleSubmit = () => {
    if (!form.tipe_data) updateForm("tipe_data", jenisTipe);
    submit();
  };

  /* ── render ── */
  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-auto">

      {/* Header */}
      <div className="page-header">
        <div className="h-8 w-8 rounded-xl bg-teal-600 flex items-center justify-center flex-shrink-0">
          <ArrowUpTrayIcon className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-teal-600">DATA INGESTION</p>
          <h1 className="text-base font-bold text-gray-800 leading-tight">Upload Data</h1>
        </div>
        <button onClick={() => { reset(); setSelectedProfileIdx(0); }} disabled={loading}
          className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 bg-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40">
          <ArrowPathIcon className="h-3.5 w-3.5" /> &#x21BA; Refresh
        </button>
      </div>

      <div className="px-6 py-6 max-w-2xl w-full flex flex-col gap-5">

        {/* Tabs */}
        <div className="flex gap-0 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm">
          {[["os","OS Claim Cedant"],["infopack","InfoPack"]].map(([key, label]) => (
            <button key={key} onClick={() => handleTabChange(key)}
              className={[
                "px-5 py-1.5 rounded-lg text-sm font-medium transition-all",
                activeTab === key
                  ? "bg-white shadow text-teal-700 font-semibold border border-gray-200"
                  : "text-gray-500 hover:text-gray-700",
              ].join(" ")}>
              {label}
            </button>
          ))}
        </div>

        {/* Section title */}
        <div>
          <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-0.5">DATA INGESTION</p>
          <h2 className="text-2xl font-extrabold text-gray-800">Upload Data</h2>
          <p className="text-xs text-gray-400 mt-1">
            Pilih jenis data dan bulan cut-off sebelum upload. Setiap file dicatat otomatis dengan waktu upload dan riwayat aktivitas.
          </p>
        </div>

        {/* Upload panel */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-5">
          <div>
            <h3 className="text-base font-bold text-gray-800">Upload from Computer</h3>
            <p className="text-xs text-gray-400 mt-0.5">Lengkapi form lalu klik Upload ke Master.</p>
          </div>

          {/* Bulan Cut-Off */}
          <CutOffPicker
            bulan={form.bulan} tahun={form.tahun}
            onBulan={v => updateForm("bulan", v)}
            onTahun={v => updateForm("tahun", v)}
            disabled={loading}
          />

          {/* Cedant / Sumber */}
          <div>
            <Label htmlFor="cedant_local" text="Cedant / Sumber" optional />
            <div className="relative">
              <select id="cedant_local" value={form.cedant}
                onChange={e => handleCedantChange(e.target.value)}
                disabled={loading} className={SEL + " pr-8"}>
                <option value="">Auto-detect dari mapping</option>
                {uniqueCedants.map(val => (
                  <option key={val} value={val}>{val}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">&#9660;</span>
            </div>

            {!form.cedant && (
              <p className="text-xs text-gray-400 mt-1.5">
                OS Claim dipindai berdasarkan mapping warna dan dapat di-append ke Master.
              </p>
            )}

            {/* Multi-profil: dropdown sheet/variant */}
            {form.cedant && activeProfiles.length > 1 && (
              <div className="mt-2">
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Sheet / Variant
                  <span className="text-gray-400 font-normal ml-1">({activeProfiles.length} profil tersedia)</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedProfileIdx}
                    onChange={e => handleProfileChange(e.target.value)}
                    disabled={loading}
                    className={SEL + " pr-8"}>
                    {activeProfiles.map((p, i) => (
                      <option key={i} value={i}>
                        {p.sheetMet} &mdash; {p.lossRef !== "—" ? p.lossRef : "—"}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">&#9660;</span>
                </div>
                {currentProfile && (
                  <p className="text-xs text-teal-600 mt-1">
                    Primary key: <strong className="font-mono">{currentProfile.lossRef}</strong>
                    {currentProfile.outstanding && currentProfile.outstanding !== "—" &&
                      <> &middot; OS: {currentProfile.outstanding}</>}
                  </p>
                )}
              </div>
            )}

            {/* Single profil: info auto-fill */}
            {form.cedant && activeProfiles.length === 1 && currentProfile && (
              <div className="mt-1.5 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2 flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <InformationCircleIcon className="h-3.5 w-3.5 text-teal-500 flex-shrink-0" />
                  <span className="text-xs text-teal-700">
                    Sheet: <strong>{currentProfile.sheetMet}</strong>
                    {" "}&middot; Key: <strong className="font-mono">{currentProfile.lossRef}</strong>
                  </span>
                </div>
                {currentProfile.outstanding && currentProfile.outstanding !== "—" && (
                  <p className="text-xs text-teal-600 ml-5">
                    Outstanding: {currentProfile.outstanding} &middot; DOL: {currentProfile.dateOfLoss}
                  </p>
                )}
              </div>
            )}

            {/* Composite key editor */}
            {form.cedant && isComposite && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Kolom 1</label>
                  <input type="text"
                    value={(form.primary_key_col || currentProfile?.lossRef || "").split("|")[0] ?? ""}
                    onChange={e => handleCompositePartChange("left", e.target.value)}
                    disabled={loading} className={SEL + " font-mono text-xs"} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">Kolom 2</label>
                  <input type="text"
                    value={(form.primary_key_col || currentProfile?.lossRef || "").split("|")[1] ?? ""}
                    onChange={e => handleCompositePartChange("right", e.target.value)}
                    disabled={loading} className={SEL + " font-mono text-xs"} />
                </div>
              </div>
            )}

            {/* Override PK manual */}
            {form.cedant && !isComposite && activeProfiles.length > 0 && (
              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">
                  Koreksi kolom identifier <span className="text-gray-400">(jika nama kolom di file berbeda)</span>
                </label>
                <input id="pk_col" type="text"
                  value={form.primary_key_col}
                  onChange={e => updateForm("primary_key_col", e.target.value)}
                  disabled={loading}
                  placeholder={currentProfile?.lossRef || "Nama kolom…"}
                  className={SEL + " font-mono text-xs"} />
              </div>
            )}
          </div>

          {/* Sheet selector — muncul setelah file dipilih dan ada >1 sheet */}
          {sheets.length > 1 && (
            <div>
              <Label htmlFor="sheet_name" text="Sheet" optional />
              <div className="relative">
                <select id="sheet_name" value={form.sheet_name}
                  onChange={e => updateForm("sheet_name", e.target.value)}
                  disabled={loading} className={SEL + " pr-8"}>
                  <option value="">&#8212; Sheet pertama (default) &#8212;</option>
                  {sheets.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">&#9660;</span>
              </div>
              {form.cedant && currentProfile && sheets.includes(currentProfile.sheetMet) && form.sheet_name !== currentProfile.sheetMet && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <InformationCircleIcon className="h-3.5 w-3.5 flex-shrink-0" />
                  Mapping menyarankan sheet <strong className="font-mono">{currentProfile.sheetMet}</strong>
                </p>
              )}
            </div>
          )}

          {/* Drop zone */}
          <DropZone file={file} onFile={handleFilePick} disabled={loading} />

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
                    Coba koreksi nama kolom pada field "Koreksi kolom identifier" di atas.
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
                <p className="font-bold text-sm text-teal-800">Upload berhasil!</p>
                <p className="mt-1 text-teal-700 leading-relaxed">
                  <strong>{result.rows_appended?.toLocaleString("id-ID")}</strong> baris ditambahkan ke Master &middot;{" "}
                  <strong>{result.rows_skipped?.toLocaleString("id-ID")}</strong> dilewati &middot;{" "}
                  Total <strong>{result.total_rows?.toLocaleString("id-ID")}</strong> baris diproses
                </p>
                <p className="mt-1 text-teal-600">
                  Sheet: <code className="bg-teal-100 px-1.5 py-0.5 rounded font-mono">{result.sheet}</code>
                  {" "}&middot; Lihat di{" "}
                  <button onClick={() => onNavigate?.("master")} className="font-bold underline">Master</button>
                  {" "}atau{" "}
                  <button onClick={() => onNavigate?.("library_os")} className="font-bold underline">Library</button>.
                </p>
              </div>
            </div>
          )}

          {/* Submit button */}
          <button type="button" onClick={handleSubmit} disabled={loading || !file}
            className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white text-sm font-semibold px-4 py-3 rounded-xl transition-colors">
            <ArrowUpTrayIcon className="h-4 w-4" />
            {loading ? "Mengunggah…" : "Upload ke Master"}
          </button>

        </div>
      </div>
    </div>
  );
}
