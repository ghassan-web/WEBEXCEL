/**
 * useMasterUpload — manages single-file upload → Master append flow.
 */
import { useState, useCallback } from "react";
import { uploadToMaster, getSheetNames } from "../services/api";

const INITIAL_FORM = {
  bulan:           "",
  tahun:           new Date().getFullYear().toString(),
  tipe_data:       "",
  primary_key_col: "",
  cedant:          "",
  cedant_code:     "",
  sheet_name:      "",
};

export function useMasterUpload() {
  const [form,      setForm]      = useState(INITIAL_FORM);
  const [file,      setFile]      = useState(null);
  const [sheets,    setSheets]    = useState([]);
  const [uploadPct, setUploadPct] = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState(null);

  const updateForm = useCallback((key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  /**
   * handleFileChange
   * @param {File|null} f
   * @param {string|string[]|null} preferredSheets - sheet names from the active mapping profile
   */
  const handleFileChange = useCallback(async (f, preferredSheets = null) => {
    setFile(f);
    setSheets([]);
<<<<<<< HEAD
    setError(null);
    setForm(prev => ({ ...prev, sheet_name: "" }));

    if (!f) return;

    try {
      const data = await getSheetNames(f);
      const sheetList = data.sheets || [];
      setSheets(sheetList);

      const candidates = Array.isArray(preferredSheets)
        ? preferredSheets
        : preferredSheets ? [preferredSheets] : [];
      const resolved = candidates
        .map(preferred => sheetList.find(sheet =>
          sheet.trim().toLowerCase() === preferred.trim().toLowerCase()
        ))
        .find(Boolean) || (sheetList.length === 1 ? sheetList[0] : "");

      if (resolved) {
        setForm(prev => ({ ...prev, sheet_name: resolved }));
      }
    } catch (e) {
      setError(e.message || "Gagal membaca daftar sheet dari file.");
=======
    updateForm("sheet_name", "");
    if (f && !f.name.endsWith(".xlsb")) {
      // .xlsb sheet detection via backend
      try {
        const data = await getSheetNames(f);
        setSheets(data.sheets || []);
      } catch (_) {}
    } else if (f && f.name.endsWith(".xlsb")) {
      try {
        const data = await getSheetNames(f);
        setSheets(data.sheets || []);
      } catch (_) {}
>>>>>>> 772547da4971a77d44c538bf43765efad620e01f
    }
  }, []);

  const reset = useCallback(() => {
    setForm(INITIAL_FORM);
    setFile(null);
    setSheets([]);
    setUploadPct(0);
    setResult(null);
    setError(null);
  }, []);

  const submit = useCallback(async () => {
    if (!form.bulan)     return setError("Bulan Cut-Off wajib dipilih.");
    if (!form.tahun)     return setError("Tahun wajib dipilih.");
    if (!form.tipe_data) return setError("Jenis Data wajib dipilih.");
    if (!file)           return setError("File Excel wajib diunggah lewat drop zone.");

    if (form.cedant && !form.primary_key_col.trim()) {
      return setError("Kolom Primary Key wajib diisi. Pilih profil sheet atau ketik nama kolom secara manual.");
    }

    setError(null);
    setLoading(true);
    setUploadPct(0);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("bulan",     form.bulan);
      fd.append("tahun",     form.tahun);
      fd.append("tipe_data", form.tipe_data);
      if (form.cedant && form.primary_key_col.trim()) {
        fd.append("primary_key_col", form.primary_key_col.trim());
      }
      if (form.cedant)      fd.append("cedant",      form.cedant);
      if (form.cedant_code) fd.append("cedant_code", form.cedant_code);
      if (form.sheet_name)  fd.append("sheet_name",  form.sheet_name);
      fd.append("file", file);

      const data = await uploadToMaster(fd, setUploadPct);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [form, file]);

  return {
    form, updateForm,
    file, handleFileChange,
    sheets,
    uploadPct, loading,
    result, error,
    submit, reset,
  };
}
