/**
 * API service – wraps all calls to the FastAPI backend.
 */

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function handleResponse(res) {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      msg = data.detail || data.message || msg;
    } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

/**
 * POST /api/compare/upload
 * Sends both Excel files + form params, returns job summary.
 */
export async function uploadAndCompare(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/api/compare/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          resolve({});
        }
      } else {
        let msg = `HTTP ${xhr.status}`;
        try {
          const data = JSON.parse(xhr.responseText);
          msg = data.detail || data.message || msg;
        } catch (_) {}
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => reject(new Error("Koneksi gagal. Pastikan backend berjalan."));
    xhr.send(formData);
  });
}

/**
 * POST /api/compare/sheets
 * Returns list of sheet names from an uploaded file.
 */
export async function getSheetNames(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE_URL}/api/compare/sheets`, { method: "POST", body: fd });
  return handleResponse(res);
}

/**
 * GET /api/compare/jobs?skip=&limit=
 */
export async function listJobs(skip = 0, limit = 20) {
  const res = await fetch(`${BASE_URL}/api/compare/jobs?skip=${skip}&limit=${limit}`);
  return handleResponse(res);
}

/**
 * GET /api/compare/jobs/:id
 */
export async function getJob(jobId) {
  const res = await fetch(`${BASE_URL}/api/compare/jobs/${jobId}`);
  return handleResponse(res);
}

/**
 * GET /api/compare/jobs/:id/results?diff_type=&skip=&limit=
 */
export async function getResults(jobId, { diffType, skip = 0, limit = 50 } = {}) {
  const params = new URLSearchParams({ skip, limit });
  if (diffType) params.append("diff_type", diffType);
  const res = await fetch(`${BASE_URL}/api/compare/jobs/${jobId}/results?${params}`);
  return handleResponse(res);
}

/**
 * GET /api/compare/jobs/:id/download  → triggers file download
 */
export function downloadReport(jobId) {
  window.location.href = `${BASE_URL}/api/compare/jobs/${jobId}/download`;
}

/**
 * POST /api/master/upload — single-file ingestion → append to Master
 */
export async function uploadToMaster(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/api/master/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({}); }
      } else {
        let msg = `HTTP ${xhr.status}`;
        try {
          const data = JSON.parse(xhr.responseText);
          msg = data.detail || data.message || msg;
        } catch (_) {}
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => reject(new Error("Koneksi gagal. Pastikan backend berjalan."));
    xhr.send(formData);
  });
}

/**
 * GET /api/master/data?tipe_data=&cedant=&skip=&limit=
 */
export async function getMasterData(tipeData, { cedant, skip = 0, limit = 50 } = {}) {
  const params = new URLSearchParams({ skip, limit });
  if (tipeData) params.append("tipe_data", tipeData);
  if (cedant)   params.append("cedant", cedant);
  const res = await fetch(`${BASE_URL}/api/master/data?${params}`);
  return handleResponse(res);
}

/**
 * GET /api/master/jobs?skip=&limit=
 */
export async function listUploadJobs(skip = 0, limit = 20) {
  const res = await fetch(`${BASE_URL}/api/master/jobs?skip=${skip}&limit=${limit}`);
  return handleResponse(res);
}

/**
 * GET /api/master/library?tipe_data=&skip=&limit=
 */
export async function getLibrary(tipeData, { skip = 0, limit = 50 } = {}) {
  const params = new URLSearchParams({ skip, limit });
  if (tipeData) params.append("tipe_data", tipeData);
  const res = await fetch(`${BASE_URL}/api/master/library?${params}`);
  return handleResponse(res);
}

/**
 * DELETE /api/master/library/:jobId
 */
export async function deleteLibraryEntry(jobId) {
  const res = await fetch(`${BASE_URL}/api/master/library/${jobId}`, { method: "DELETE" });
  return handleResponse(res);
}

/**
 * GET /api/master/export?tipe_data=&cedant=  → triggers CSV download
 */
export function exportMasterCsv(tipeData, cedant) {
  const params = new URLSearchParams();
  if (tipeData) params.append("tipe_data", tipeData);
  if (cedant)   params.append("cedant", cedant);
  window.location.href = `${BASE_URL}/api/master/export?${params}`;
}

// ─── OSCLN ────────────────────────────────────────────────────

/**
 * GET /api/oscln/snapshots?skip=&limit=
 */
export async function listOsclnSnapshots(skip = 0, limit = 20) {
  const res = await fetch(`${BASE_URL}/api/oscln/snapshots?skip=${skip}&limit=${limit}`);
  return handleResponse(res);
}

/**
 * POST /api/oscln/upload  — upload one CSV file as OSCLN snapshot
 * formData must contain: file, bulan, tahun, primary_key_col
 */
export async function uploadOsclnCsv(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/api/oscln/upload`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch { resolve({}); }
      } else {
        let msg = `HTTP ${xhr.status}`;
        try {
          const data = JSON.parse(xhr.responseText);
          msg = data.detail || data.message || msg;
        } catch (_) {}
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => reject(new Error("Koneksi gagal. Pastikan backend berjalan."));
    xhr.send(formData);
  });
}

/**
 * POST /api/oscln/reconcile  — run Master-vs-OSCLN comparison
 */
export async function runReconciliation({ snapshotId, tipeData, primaryKeyCol, cedant }) {
  const fd = new FormData();
  fd.append("snapshot_id",     snapshotId);
  fd.append("tipe_data",       tipeData);
  fd.append("primary_key_col", primaryKeyCol);
  if (cedant) fd.append("cedant", cedant);

  const res = await fetch(`${BASE_URL}/api/oscln/reconcile`, { method: "POST", body: fd });
  return handleResponse(res);
}

/**
 * DELETE /api/oscln/snapshots/:id
 */
export async function deleteOsclnSnapshot(snapshotId) {
  const res = await fetch(`${BASE_URL}/api/oscln/snapshots/${snapshotId}`, { method: "DELETE" });
  return handleResponse(res);
}
