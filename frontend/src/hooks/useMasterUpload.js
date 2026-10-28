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

  const handleFileChange = useCallback(async (f) => {
    setFile(f);
    setSheets([]);
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
    }
  }, [updateForm]);

  const reset = useCallback(() => {
    setForm(INITIAL_FORM);
    setFile(null);
    setSheets([]);
    setUploadPct(0);
    setResult(null);
    setError(null);
  }, []);

  const submit = useCallback(async () => {
    if (!form.bulan)                  return setError("Bulan Cut-Off wajib dipilih.");
    if (!form.tahun)                  return setError("Tahun wajib dipilih.");
    if (!form.tipe_data)              return setError("Jenis Data wajib dipilih.");
    if (!form.cedant)                 return setError("Cedant / Sumber wajib dipilih agar nama cedant tersimpan dengan benar.");
    if (!form.primary_key_col.trim()) return setError("Kolom Primary Key wajib diisi. Pilih Cedant atau ketik nama kolom secara manual.");
    if (!file)                        return setError("File Excel wajib diunggah lewat drop zone.");

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
      if (form.cedant)     fd.append("cedant",     form.cedant);
      if (form.sheet_name) fd.append("sheet_name", form.sheet_name);
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
