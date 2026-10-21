/**
 * Paginated, filterable table for comparison results.
 * Fetches data from the API on demand.
 */
import { useState, useEffect, useCallback } from "react";
import { getResults, downloadReport } from "../services/api";
import { ArrowDownTrayIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";

const DIFF_LABELS = {
  matched:   { label: "Matched",       cls: "bg-green-100 text-green-800"  },
  changed:   { label: "Berubah",       cls: "bg-yellow-100 text-yellow-800"},
  only_in_a: { label: "Hanya di A",    cls: "bg-red-100 text-red-800"      },
  only_in_b: { label: "Hanya di B",    cls: "bg-blue-100 text-blue-800"    },
};

const PAGE_SIZE = 50;

export default function ResultTable({ jobId, primaryKeyCol }) {
  const [diffFilter, setDiffFilter] = useState("");
  const [page, setPage]             = useState(0);
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);

  const fetch = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getResults(jobId, {
        diffType: diffFilter || undefined,
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [jobId, diffFilter, page]);

  useEffect(() => { fetch(); }, [fetch]);

  // Reset page when filter changes
  useEffect(() => { setPage(0); }, [diffFilter]);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  // Determine columns from first row that has data
  const cols = (() => {
    if (!data?.results?.length) return [];
    for (const r of data.results) {
      const src = r.row_data_a || r.row_data_b;
      if (src) return Object.keys(src);
    }
    return [];
  })();

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            { value: "",          label: "Semua" },
            { value: "changed",   label: "Berubah" },
            { value: "only_in_a", label: "Hanya di A" },
            { value: "only_in_b", label: "Hanya di B" },
            { value: "matched",   label: "Matched" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDiffFilter(opt.value)}
              className={[
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                diffFilter === opt.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-blue-400",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => downloadReport(jobId)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow transition-colors"
          aria-label="Download laporan Excel"
        >
          <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" />
          Download Laporan Excel
        </button>
      </div>

      {/* Table */}
      {loading && (
        <div className="text-center py-10 text-gray-500 text-sm animate-pulse">
          Memuat data…
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {!loading && data && (
        <>
          <p className="text-sm text-gray-500">
            Menampilkan{" "}
            <span className="font-medium text-gray-700">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, data.total)}
            </span>{" "}
            dari <span className="font-medium text-gray-700">{data.total.toLocaleString("id-ID")}</span> baris
          </p>

          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Status</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">
                    {primaryKeyCol || "Primary Key"}
                  </th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">Kolom Berubah</th>
                  {cols.map((c) => (
                    <th key={`a-${c}`} className="px-3 py-3 text-left font-semibold text-blue-700 whitespace-nowrap">
                      A: {c}
                    </th>
                  ))}
                  {cols.map((c) => (
                    <th key={`b-${c}`} className="px-3 py-3 text-left font-semibold text-emerald-700 whitespace-nowrap">
                      B: {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {data.results.length === 0 && (
                  <tr>
                    <td colSpan={3 + cols.length * 2} className="text-center py-8 text-gray-400">
                      Tidak ada data untuk filter ini.
                    </td>
                  </tr>
                )}
                {data.results.map((row) => {
                  const badge = DIFF_LABELS[row.diff_type] || { label: row.diff_type, cls: "bg-gray-100 text-gray-700" };
                  const changed = row.changed_columns || [];
                  const rowBg =
                    row.diff_type === "only_in_a" ? "bg-red-50" :
                    row.diff_type === "only_in_b" ? "bg-blue-50" :
                    row.diff_type === "changed"   ? "bg-yellow-50" : "";

                  return (
                    <tr key={row.id} className={`hover:bg-gray-50 ${rowBg}`}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-800 whitespace-nowrap">
                        {row.primary_key_value}
                      </td>
                      <td className="px-3 py-2 text-gray-500">
                        {changed.length > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {changed.map((c) => (
                              <span key={c} className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded text-xs">
                                {c}
                              </span>
                            ))}
                          </span>
                        ) : "—"}
                      </td>

                      {/* File A columns */}
                      {cols.map((c) => {
                        const valA = row.row_data_a?.[c] ?? "";
                        const valB = row.row_data_b?.[c] ?? "";
                        const isDiff = changed.includes(c);
                        return (
                          <td
                            key={`a-${c}`}
                            className={`px-3 py-2 whitespace-nowrap ${isDiff ? "bg-red-100 font-semibold text-red-800" : "text-gray-700"}`}
                          >
                            {valA === "" ? <span className="text-gray-300">—</span> : valA}
                          </td>
                        );
                      })}

                      {/* File B columns */}
                      {cols.map((c) => {
                        const valB = row.row_data_b?.[c] ?? "";
                        const isDiff = changed.includes(c);
                        return (
                          <td
                            key={`b-${c}`}
                            className={`px-3 py-2 whitespace-nowrap ${isDiff ? "bg-green-100 font-semibold text-green-800" : "text-gray-700"}`}
                          >
                            {valB === "" ? <span className="text-gray-300">—</span> : valB}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-2 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-100 transition-colors"
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
              <span className="text-sm text-gray-600">
                Halaman <strong>{page + 1}</strong> / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-2 rounded-lg border border-gray-300 disabled:opacity-40 hover:bg-gray-100 transition-colors"
                aria-label="Halaman berikutnya"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
