import { useState } from "react";
import { useColumnMappings } from "../hooks/useColumnMappings";
import { PageHeader, Card, Button, Badge } from "../components/ui";
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  TagIcon,
  CurrencyDollarIcon,
  CalendarIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

const BROKER_COLOR = "text-[var(--color-brand)] font-semibold";
const CEDANT_COLOR = "font-semibold text-[var(--color-ink)]";

function isBroker(name) {
  return name.toLowerCase().includes("broker");
}

export default function MappingRulesPage() {
  const [activeTab, setActiveTab] = useState("os");
  const [search, setSearch] = useState("");
  const { profiles: allProfiles, loading, error, reload } = useColumnMappings();

  const profiles = allProfiles.filter(
    (p) => p.tipe_data === (activeTab === "os" ? "OS Cedant" : "Infopack")
  );

  const filtered = profiles.filter((p) => {
    const q = search.toLowerCase();
    return (
      !q ||
      p.cedant.toLowerCase().includes(q) ||
      p.cedantCode.toLowerCase().includes(q) ||
      p.sheetMet.toLowerCase().includes(q) ||
      p.lossRef.toLowerCase().includes(q) ||
      p.outstanding.toLowerCase().includes(q) ||
      p.dateOfLoss.toLowerCase().includes(q) ||
      Object.entries(p.mapping).some(([field, column]) =>
        `${field} ${column}`.toLowerCase().includes(q)
      )
    );
  });

  const readyCount = profiles.filter((p) => p.status === "READY").length;

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 py-6 space-y-5 font-sans text-[var(--color-ink)] saas-page-enter">
      <PageHeader
        title={`Mapping Rules — ${activeTab === "os" ? "OS Claim Cedant" : "InfoPack"}`}
        description="Profil pemetaan kolom aktif dibaca langsung dari tabel rekonsiliasi.master_mapping_column (read-only)."
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={ArrowPathIcon}
            loading={loading}
            onClick={reload}
          >
            Reload Mapping
          </Button>
        }
      />

      {/* Dataset Type Switcher (aligned with MasterPage) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex bg-[var(--color-surface)] p-1 rounded-[var(--radius-control)] border border-[var(--color-line)] shadow-sm">
          {[
            ["os", "OS Claim Cedant"],
            ["infopack", "InfoPack"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setActiveTab(key);
                setSearch("");
              }}
              className={`px-4 py-1.5 rounded-[calc(var(--radius-control)-2px)] text-xs font-bold transition-all cursor-pointer ${
                activeTab === key
                  ? "bg-[var(--color-brand)] text-white shadow-sm"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <Badge tone="brand">
          {loading ? "Memuat…" : `${profiles.length} profil aktif · ${readyCount} READY`}
        </Badge>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/30 text-[var(--color-danger)] px-4 py-3 rounded-[var(--radius-control)] text-xs font-medium flex items-center gap-2"
        >
          <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
          <span>Mapping database gagal dimuat: {error}</span>
        </div>
      )}

      {/* Reference Info Card */}
      <Card
        title="Mapping Database Reference"
        description="Sumber aturan otomatis pemetaan kolom per cedant & nama sheet"
        badge="master_mapping_column"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-600">
              <TagIcon className="h-3.5 w-3.5" /> Loss Ref
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-brand)]">
              <CurrencyDollarIcon className="h-3.5 w-3.5" /> Outstanding
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-claim)]">
              <CalendarIcon className="h-3.5 w-3.5" /> Date of Loss
            </span>
          </div>

          <div className="bg-[var(--color-surface-sunken)] border border-[var(--color-line)] rounded-[var(--radius-control)] px-4 py-3 flex items-start gap-2 text-xs text-[var(--color-ink-muted)]">
            <InformationCircleIcon className="h-4 w-4 text-[var(--color-brand)] shrink-0 mt-0.5" />
            <span>
              <strong className="text-[var(--color-ink)]">Aturan sheet:</strong>{" "}
              Mapping diterapkan sesuai daftar sheet pada kolom{" "}
              <code className="font-mono text-[var(--color-ink)]">argument</code>. Jika daftar
              sheet kosong, mapping berlaku untuk semua sheet.
            </span>
          </div>
        </div>
      </Card>

      {/* Main Directory Table */}
      <Card padding="none">
        {/* Search bar */}
        <div className="p-4 border-b border-[var(--color-line)] bg-[var(--color-surface)] flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-lg">
            <MagnifyingGlassIcon className="h-4 w-4 text-[var(--color-ink-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari cedant, kode, sheet, loss ref, atau kolom outstanding..."
              className="w-full pl-9 pr-9 h-9 bg-[var(--color-surface-sunken)] border border-[var(--color-line)] rounded-[var(--radius-control)] text-[13px] text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20 focus:border-[var(--color-brand)] transition-all"
            />
            {search && (
              <button
                type="button"
                aria-label="Hapus pencarian"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer"
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <span className="text-xs font-mono text-[var(--color-ink-muted)] shrink-0">
            {filtered.length} / {profiles.length}
          </span>
        </div>

        <div className="overflow-x-auto table-scroll">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface-sunken)]">
                <th className="px-3.5 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">
                  Cedant Code
                </th>
                <th className="px-3.5 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider min-w-[160px]">
                  Cedant
                </th>
                <th className="px-3.5 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider min-w-[140px]">
                  Sheet Met
                </th>
                <th className="px-3.5 py-2.5 text-left text-[11px] font-semibold text-orange-600 uppercase tracking-wider min-w-[120px]">
                  <span className="inline-flex items-center gap-1">
                    <TagIcon className="h-3 w-3" /> Loss Ref
                  </span>
                </th>
                <th className="px-3.5 py-2.5 text-left text-[11px] font-semibold text-[var(--color-brand)] uppercase tracking-wider min-w-[140px]">
                  <span className="inline-flex items-center gap-1">
                    <CurrencyDollarIcon className="h-3 w-3" /> Outstanding
                  </span>
                </th>
                <th className="px-3.5 py-2.5 text-left text-[11px] font-semibold text-[var(--color-claim)] uppercase tracking-wider whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    <CalendarIcon className="h-3 w-3" /> Date of Loss
                  </span>
                </th>
                <th className="px-3.5 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">
                  Mapped Fields
                </th>
                <th className="px-3.5 py-2.5 text-left text-[11px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-line)]/60">
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="text-center py-12 text-[var(--color-ink-muted)]"
                  >
                    {loading
                      ? "Memuat mapping database…"
                      : "Tidak ada profil yang cocok dengan pencarian."}
                  </td>
                </tr>
              )}
              {filtered.map((p, i) => (
                <tr
                  key={`${p.cedantCode}-${p.sheetMet}-${i}`}
                  className="hover:bg-[var(--color-surface-sunken)]/60 transition-colors"
                >
                  <td className="px-3.5 py-2">
                    <span className="font-mono font-bold text-[var(--color-brand)] bg-[var(--color-brand-soft)] border border-[var(--color-brand-line)] px-1.5 py-0.5 rounded text-[11px]">
                      {p.cedantCode || "—"}
                    </span>
                  </td>
                  <td
                    className={`px-3.5 py-2 whitespace-nowrap ${
                      isBroker(p.cedant) ? BROKER_COLOR : CEDANT_COLOR
                    }`}
                  >
                    {p.cedant}
                  </td>
                  <td className="px-3.5 py-2 text-[var(--color-ink-muted)] max-w-[200px]">
                    <span className="truncate block" title={p.sheetMet}>
                      {p.sheetMet}
                    </span>
                  </td>
                  <td className="px-3.5 py-2 whitespace-nowrap text-[var(--color-ink)] font-medium">
                    {p.lossRef}
                  </td>
                  <td className="px-3.5 py-2 text-[var(--color-ink)]">
                    <span
                      className="truncate block max-w-[180px]"
                      title={p.outstanding}
                    >
                      {p.outstanding}
                    </span>
                  </td>
                  <td className="px-3.5 py-2 text-[var(--color-ink-muted)] whitespace-nowrap">
                    {p.dateOfLoss}
                  </td>
                  <td className="px-3.5 py-2">
                    <div className="flex flex-wrap gap-1 max-w-[320px]">
                      {Object.entries(p.mapping).map(([field, column]) => (
                        <span
                          key={field}
                          className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--color-brand-soft)] text-[var(--color-brand)] border border-[var(--color-brand-line)]"
                        >
                          {field} &rarr; {column}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3.5 py-2">
                    {p.status === "READY" ? (
                      <Badge tone="valid" icon={CheckCircleIcon}>
                        READY
                      </Badge>
                    ) : (
                      <Badge tone="warning" icon={ExclamationTriangleIcon}>
                        INCOMPLETE
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        <div className="px-4 py-3 bg-[var(--color-surface-sunken)] border-t border-[var(--color-line)] flex items-center justify-between text-xs text-[var(--color-ink-muted)]">
          <span>
            Menampilkan <strong className="text-[var(--color-ink)]">{filtered.length}</strong> dari{" "}
            <strong className="text-[var(--color-ink)]">{profiles.length}</strong> profil &middot;{" "}
            <span className="text-[var(--color-valid)] font-semibold">{readyCount} READY</span>
          </span>
          <span>Source: database &middot; read only</span>
        </div>
      </Card>
    </div>
  );
}
