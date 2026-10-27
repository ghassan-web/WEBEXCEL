/**
 * API service – wraps all calls to the FastAPI backend.
 *
 * User isolation:
 *   Each browser tab/user gets a UUID v4 stored in localStorage under the key
 *   "wex_session_id". Every request carries this value as the X-Session-ID
 *   header (or as a query param for window.location.href downloads).
 */

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── Session ID helpers ───────────────────────────────────────────────────────

/**
 * Returns the persistent session UUID for this browser.
 * Creates and stores a new UUID v4 on first call.
 */
export function getSessionId() {
  const KEY = "wex_session_id";
  let sid = localStorage.getItem(KEY);
  if (!sid || !isValidUUID(sid)) {
    sid = generateUUID();
    localStorage.setItem(KEY, sid);
  }
  return sid;
}

function isValidUUID(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function generateUUID() {
  // crypto.randomUUID() is available in modern browsers & Node ≥ 14.17
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback (older browsers)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Default fetch headers — always includes X-Session-ID. */
function sessionHeaders(extra = {}) {
  return { "X-Session-ID": getSessionId(), ...extra };
}

// ─── Response handler ─────────────────────────────────────────────────────────

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

// ─── XHR helper (uploads with progress) ──────────────────────────────────────

function xhrUpload(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("X-Session-ID", getSessionId());

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

// ─── Compare endpoints ────────────────────────────────────────────────────────

/** POST /api/compare/upload */
export async function uploadAndCompare(formData, onProgress) {
  return xhrUpload(`${BASE_URL}/api/compare/upload`, formData, onProgress);
}

/** POST /api/compare/sheets */
export async function getSheetNames(file) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${BASE_URL}/api/compare/sheets`, {
    method: "POST",
    body: fd,
    // /sheets is stateless — no session header required, but harmless to include
    headers: sessionHeaders(),
  });
  return handleResponse(res);
}

/** GET /api/compare/jobs */
export async function listJobs(skip = 0, limit = 20) {
  const res = await fetch(
    `${BASE_URL}/api/compare/jobs?skip=${skip}&limit=${limit}`,
    { headers: sessionHeaders() },
  );
  return handleResponse(res);
}

/** GET /api/compare/jobs/:id */
export async function getJob(jobId) {
  const res = await fetch(
    `${BASE_URL}/api/compare/jobs/${jobId}`,
    { headers: sessionHeaders() },
  );
  return handleResponse(res);
}

/** GET /api/compare/jobs/:id/results */
export async function getResults(jobId, { diffType, skip = 0, limit = 50 } = {}) {
  const params = new URLSearchParams({ skip, limit });
  if (diffType) params.append("diff_type", diffType);
  const res = await fetch(
    `${BASE_URL}/api/compare/jobs/${jobId}/results?${params}`,
    { headers: sessionHeaders() },
  );
  return handleResponse(res);
}

/**
 * GET /api/compare/jobs/:id/download
 * Uses window.location.href so session_id is passed as a query param.
 */
export function downloadReport(jobId) {
  const sid = getSessionId();
  window.location.href = `${BASE_URL}/api/compare/jobs/${jobId}/download?session_id=${sid}`;
}

// ─── Master endpoints ─────────────────────────────────────────────────────────

/** POST /api/master/upload */
export async function uploadToMaster(formData, onProgress) {
  return xhrUpload(`${BASE_URL}/api/master/upload`, formData, onProgress);
}

/** GET /api/master/data */
export async function getMasterData(tipeData, { cedant, skip = 0, limit = 50 } = {}) {
  const params = new URLSearchParams({ skip, limit });
  if (tipeData) params.append("tipe_data", tipeData);
  if (cedant)   params.append("cedant", cedant);
  const res = await fetch(
    `${BASE_URL}/api/master/data?${params}`,
    { headers: sessionHeaders() },
  );
  return handleResponse(res);
}

/** GET /api/master/jobs */
export async function listUploadJobs(skip = 0, limit = 20) {
  const res = await fetch(
    `${BASE_URL}/api/master/jobs?skip=${skip}&limit=${limit}`,
    { headers: sessionHeaders() },
  );
  return handleResponse(res);
}

/** GET /api/master/library */
export async function getLibrary(tipeData, { skip = 0, limit = 50 } = {}) {
  const params = new URLSearchParams({ skip, limit });
  if (tipeData) params.append("tipe_data", tipeData);
  const res = await fetch(
    `${BASE_URL}/api/master/library?${params}`,
    { headers: sessionHeaders() },
  );
  return handleResponse(res);
}

/** DELETE /api/master/library/:jobId */
export async function deleteLibraryEntry(jobId) {
  const res = await fetch(
    `${BASE_URL}/api/master/library/${jobId}`,
    { method: "DELETE", headers: sessionHeaders() },
  );
  return handleResponse(res);
}

/**
 * GET /api/master/export  (browser nav → query param)
 */
export function exportMasterCsv(tipeData, cedant) {
  const params = new URLSearchParams({ session_id: getSessionId() });
  if (tipeData) params.append("tipe_data", tipeData);
  if (cedant)   params.append("cedant", cedant);
  window.location.href = `${BASE_URL}/api/master/export?${params}`;
}

// ─── OSCLN endpoints ──────────────────────────────────────────────────────────

/** GET /api/oscln/snapshots */
export async function listOsclnSnapshots(skip = 0, limit = 20) {
  const res = await fetch(
    `${BASE_URL}/api/oscln/snapshots?skip=${skip}&limit=${limit}`,
    { headers: sessionHeaders() },
  );
  return handleResponse(res);
}

/** POST /api/oscln/upload */
export async function uploadOsclnCsv(formData, onProgress) {
  return xhrUpload(`${BASE_URL}/api/oscln/upload`, formData, onProgress);
}

/** POST /api/oscln/reconcile */
export async function runReconciliation({ snapshotId, tipeData, primaryKeyCol, cedant }) {
  const fd = new FormData();
  fd.append("snapshot_id",     snapshotId);
  fd.append("tipe_data",       tipeData);
  fd.append("primary_key_col", primaryKeyCol);
  if (cedant) fd.append("cedant", cedant);

  const res = await fetch(`${BASE_URL}/api/oscln/reconcile`, {
    method: "POST",
    headers: sessionHeaders(),   // no Content-Type — fetch sets multipart boundary automatically
    body: fd,
  });
  return handleResponse(res);
}

/** DELETE /api/oscln/snapshots/:id */
export async function deleteOsclnSnapshot(snapshotId) {
  const res = await fetch(
    `${BASE_URL}/api/oscln/snapshots/${snapshotId}`,
    { method: "DELETE", headers: sessionHeaders() },
  );
  return handleResponse(res);
}
