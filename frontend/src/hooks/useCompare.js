/**
 * Custom hook – manages the compare form state and submission lifecycle.
 */
import { useState, useCallback } from "react";
import { uploadAndCompare, getSheetNames } from "../services/api";

const INITIAL_FORM = {
  bulan: "",
  tahun: new Date().getFullYear().toString(),
  tipe_data: "",
  primary_key_col: "",
  sheet_a: "",
  sheet_b: "",
};

export function useCompare() {
  const [form, setForm]           = useState(INITIAL_FORM);
  const [fileA, setFileA]         = useState(null);
  const [fileB, setFileB]         = useState(null);
  const [sheetsA, setSheetsA]     = useState([]);
  const [sheetsB, setSheetsB]     = useState([]);
  const [uploadPct, setUploadPct] = useState(0);
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);   // job summary after compare
  const [error, setError]         = useState(null);

  const updateForm = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleFileChange = useCallback(async (which, file) => {
    if (which === "a") {
      setFileA(file);
      setSheetsA([]);
      updateForm("sheet_a", "");
      if (file) {
        try {
          const data = await getSheetNames(file);
          setSheetsA(data.sheets || []);
        } catch (_) {}
      }
    } else {
      setFileB(file);
      setSheetsB([]);
      updateForm("sheet_b", "");
      if (file) {
        try {
          const data = await getSheetNames(file);
          setSheetsB(data.sheets || []);
        } catch (_) {}
      }
    }
  }, [updateForm]);

  const reset = useCallback(() => {
    setForm(INITIAL_FORM);
    setFileA(null);
    setFileB(null);
    setSheetsA([]);
    setSheetsB([]);
    setUploadPct(0);
    setResult(null);
    setError(null);
  }, []);

  const submit = useCallback(async () => {
    // Basic validation
    if (!form.bulan)     return setError("Bulan Cut-Off wajib dipilih.");
    if (!form.tahun)     return setError("Tahun wajib dipilih.");
    if (!form.tipe_data) return setError("Jenis Data wajib dipilih.");
    if (!form.primary_key_col.trim()) return setError("Pilih Cedant / Sumber agar Primary Key terisi otomatis.");
    if (!fileA) return setError("File A (Utama) wajib diunggah — tambahkan lewat drop zone.");
    if (!fileB) return setError("File B (Pembanding) wajib diunggah — tambahkan dua file ke drop zone.");

    setError(null);
    setLoading(true);
    setUploadPct(0);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("bulan",           form.bulan);
      fd.append("tahun",           form.tahun);
      fd.append("tipe_data",       form.tipe_data);
      fd.append("primary_key_col", form.primary_key_col.trim());
      if (form.sheet_a) fd.append("sheet_a", form.sheet_a);
      if (form.sheet_b) fd.append("sheet_b", form.sheet_b);
      fd.append("file_a", fileA);
      fd.append("file_b", fileB);

      const data = await uploadAndCompare(fd, setUploadPct);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [form, fileA, fileB]);

  return {
    form, updateForm,
    fileA, fileB, handleFileChange,
    sheetsA, sheetsB,
    uploadPct, loading,
    result, error,
    submit, reset,
  };
}
