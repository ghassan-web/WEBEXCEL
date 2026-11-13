import { useState } from "react";
import { useColumnMappings } from "../hooks/useColumnMappings";
import {
  AdjustmentsHorizontalIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  TagIcon,
  CurrencyDollarIcon,
  CalendarIcon,
} from "@heroicons/react/24/outline";

/* --- colour helpers ----------------------------------------- */
const BROKER_COLOR = "text-teal-700 font-semibold";
const CEDANT_COLOR = "font-semibold text-gray-800";

function isBroker(name) { return name.toLowerCase().includes("broker"); }

/* --- main page ----------------------------------------------- */
export default function MappingRulesPage() {
  const [activeTab, setActiveTab] = useState("os");
  const [search,    setSearch]    = useState("");
  const { profiles: allProfiles, loading, error, reload } = useColumnMappings();

  const profiles = allProfiles.filter(p =>
    p.tipe_data === (activeTab === "os" ? "OS Cedant" : "Infopack")
  );

  const filtered = profiles.filter(p => {
    const q = search.toLowerCase();
    return !q
      || p.cedant.toLowerCase().includes(q)
      || p.cedantCode.toLowerCase().includes(q)
      || p.sheetMet.toLowerCase().includes(q)
      || p.lossRef.toLowerCase().includes(q)
      || p.outstanding.toLowerCase().includes(q)
      || p.dateOfLoss.toLowerCase().includes(q)
      || Object.entries(p.mapping).some(([field, column]) =>
        `${field} ${column}`.toLowerCase().includes(q)
      );
  });

  const readyCount = profiles.filter(p => p.status === "READY").length;

  return (
    <div className="flex-1 flex flex-col bg-gray-50 overflow-auto">

      {/* Sticky header */}
      <div className="page-header">
        <div className="h-8 w-8 rounded-xl bg-teal-600 flex items-center justify-center flex-shrink-0">
          <AdjustmentsHorizontalIcon className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold text-gray-800">Mapping Rules</h1>
          <p className="text-xs text-gray-400">Profil pemetaan kolom dari database &mdash; read only</p>
        </div>
        <button
          onClick={reload}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 bg-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
        >
          <ArrowPathIcon className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Reload Mapping
        </button>
      </div>

      <div className="px-6 py-6 flex flex-col gap-5 max-w-6xl w-full">

        {/* Tabs */}
        <div className="flex gap-0 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm">
          {[["os","OS Claim Cedant"],["infopack","InfoPack"]].map(([key, label]) => (
            <button
              key={key}
              onClick={() => { setActiveTab(key); setSearch(""); }}
              className={[
                "px-5 py-1.5 rounded-lg text-sm font-medium transition-all",
                activeTab === key
                  ? "bg-white shadow text-teal-700 font-semibold border border-gray-200"
                  : "text-gray-500 hover:text-gray-700",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Section title */}
        <div>
          <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-0.5">REFERENCE INTELLIGENCE</p>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold text-gray-800">
                Mapping Rules &mdash; {activeTab === "os" ? "OS Claim Cedant" : "InfoPack"}
              </h2>
              <p className="text-xs text-gray-400 mt-1 max-w-xl">
                Mapping aktif dibaca langsung dari tabel <code>master_upload_column_mapping</code>.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
            Mapping database gagal dimuat: {error}
          </div>
        )}

        {/* Info card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Mapping database</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-teal-700 font-mono">master_upload_column_mapping</span>
            <span className="ml-auto text-xs text-gray-500">
              {loading ? "Memuat…" : `${allProfiles.length} profil aktif`}
            </span>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 pt-1 border-t border-gray-50 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs text-orange-600">
              <TagIcon className="h-3.5 w-3.5" /> Loss Ref
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-purple-600">
              <CurrencyDollarIcon className="h-3.5 w-3.5" /> Outstanding
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-blue-600">
              <CalendarIcon className="h-3.5 w-3.5" /> Date of Loss
            </span>
          </div>

          {/* Sheet number note */}
          <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-start gap-2 text-xs text-gray-500">
            <InformationCircleIcon className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
            <span>
              <strong className="text-gray-700">Aturan sheet:</strong>{" "}
              Mapping diterapkan sesuai daftar sheet pada kolom <code>argument</code>.
              Jika daftar sheet kosong, mapping berlaku untuk semua sheet.
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-2.5 flex items-center gap-3">
          <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari cedant, sheet, kolom, loss ref, outstanding..."
            className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 placeholder-gray-400"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-xs text-gray-400 hover:text-gray-600 px-1">
              &#x2715;
            </button>
          )}
          <span className="text-xs text-gray-400 flex-shrink-0">
            {filtered.length} / {profiles.length}
          </span>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">Cedant Code</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide min-w-[160px]">Cedant</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide min-w-[140px]">Sheet Met</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-orange-500 uppercase tracking-wide min-w-[120px]">
                    <span className="inline-flex items-center gap-1"><TagIcon className="h-3 w-3" /> Loss Ref</span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-purple-500 uppercase tracking-wide min-w-[140px]">
                    <span className="inline-flex items-center gap-1"><CurrencyDollarIcon className="h-3 w-3" /> Outstanding</span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-blue-500 uppercase tracking-wide whitespace-nowrap">
                    <span className="inline-flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> Date of Loss</span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold text-indigo-500 uppercase tracking-wide">Mapped Fields</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      {loading ? "Memuat mapping database…" : "Tidak ada profil yang cocok dengan pencarian."}
                    </td>
                  </tr>
                )}
                {filtered.map((p, i) => (
                  <tr key={`${p.cedantCode}-${p.sheetMet}-${i}`} className="hover:bg-teal-50/30 transition-colors">
                    {/* Column */}
                    <td className="px-3 py-1.5">
                      <span className="font-mono font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded text-[11px]">
                        {p.cedantCode || "—"}
                      </span>
                    </td>
                    {/* Cedant */}
                    <td className={`px-3 py-1.5 whitespace-nowrap ${isBroker(p.cedant) ? BROKER_COLOR : CEDANT_COLOR}`}>
                      {p.cedant}
                    </td>
                    {/* Sheet Met */}
                    <td className="px-3 py-1.5 text-gray-500 max-w-[200px]">
                      <span className="truncate block" title={p.sheetMet}>{p.sheetMet}</span>
                    </td>
                    {/* Loss Ref */}
                    <td className="px-3 py-1.5 whitespace-nowrap text-gray-700 font-medium">
                      {p.lossRef}
                    </td>
                    {/* Outstanding */}
                    <td className="px-3 py-1.5 text-gray-700">
                      <span className="truncate block max-w-[180px]" title={p.outstanding}>{p.outstanding}</span>
                    </td>
                    {/* Date of Loss */}
                    <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">
                      {p.dateOfLoss}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-wrap gap-1 max-w-[320px]">
                        {Object.entries(p.mapping).map(([field, column]) => (
                          <span key={field} className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                            {field} &rarr; {column}
                          </span>
                        ))}
                      </div>
                    </td>
                    {/* Status */}
                    <td className="px-3 py-1.5">
                      {p.status === "READY" ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded">
                          <CheckCircleIcon className="h-2.5 w-2.5" />READY
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded">
                          <ExclamationTriangleIcon className="h-2.5 w-2.5" />INCOMPLETE
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Menampilkan <strong className="text-gray-600">{filtered.length}</strong> dari{" "}
              <strong className="text-gray-600">{profiles.length}</strong> profil &middot;{" "}
              <span className="text-emerald-600 font-semibold">{readyCount} READY</span>
            </span>
            <span className="text-xs text-gray-400">Source: database &middot; read only</span>
          </div>
        </div>

      </div>
    </div>
  );
}
