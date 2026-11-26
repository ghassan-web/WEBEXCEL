import { useMemo, useState } from "react";
import { useColumnMappings } from "../hooks/useColumnMappings";
import { addColumnMappingVersion } from "../services/api";
import { PageHeader, Card, Button, Badge } from "../components/ui";
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  InformationCircleIcon,
  PlusIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

const DATASET_BY_TAB = {
  os: "OS Cedant",
  infopack: "Infopack",
};

const FIELD_LABELS = {
  doc_no: "loss_ref",
  title: "insured",
};

function buildVersionGroups(versions) {
  const grouped = new Map();

  versions.forEach((profile) => {
    const sheetNames = [...new Set(profile.sheetNames || [])].sort((a, b) =>
      a.localeCompare(b),
    );
    const sheetKey = sheetNames.map((name) => name.toLowerCase()).join("|") || "*";
    const key = `${profile.tipe_data}|${profile.cedantCode}|${sheetKey}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        cedant: profile.cedant,
        cedantCode: profile.cedantCode,
        tipeData: profile.tipe_data,
        sheetNames,
        sheetMet: profile.sheetMet || (sheetNames.length ? sheetNames.join(", ") : "All sheets"),
        versions: new Map(),
      });
    }

    const group = grouped.get(key);
    const versionNumber = Number(profile.mappingVersion) || 1;
    const version = group.versions.get(versionNumber) || { mapping: {} };
    Object.assign(version.mapping, profile.mapping || {});
    group.versions.set(versionNumber, version);
  });

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      versions: [...group.versions.entries()]
        .map(([versionNumber, version]) => ({
          versionNumber,
          mapping: version.mapping,
        }))
        .sort((a, b) => a.versionNumber - b.versionNumber),
    }))
    .sort((a, b) =>
      `${a.cedant} ${a.sheetMet}`.localeCompare(`${b.cedant} ${b.sheetMet}`),
    );
}

function fieldLabel(fieldName) {
  return FIELD_LABELS[fieldName] || fieldName;
}

export default function MappingRulesPage() {
  const [activeTab, setActiveTab] = useState("os");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [savingKey, setSavingKey] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const {
    profiles,
    mappingVersions,
    mappingFields,
    loading,
    error,
    reload,
  } = useColumnMappings();

  const datasetType = DATASET_BY_TAB[activeTab];
  const activeProfiles = profiles.filter((profile) => profile.tipe_data === datasetType);
  const activeVersions = mappingVersions.filter(
    (profile) => profile.tipe_data === datasetType,
  );
  const versionGroups = useMemo(() => {
    if (activeVersions.length) return buildVersionGroups(activeVersions);

    return buildVersionGroups(
      activeProfiles.map((profile) => ({
        ...profile,
        mappingVersion: profile.mappingVersion || 1,
      })),
    );
  }, [activeProfiles, activeVersions]);

  const catalogFields = mappingFields
    .filter((field) => field.dataset_type === datasetType)
    .map((field) => field.field_name);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredGroups = versionGroups.filter((group) => {
    if (!normalizedSearch) return true;
    const mappedValues = group.versions.flatMap((version) =>
      Object.entries(version.mapping).flat(),
    );
    return [
      group.cedant,
      group.cedantCode,
      group.sheetMet,
      ...mappedValues,
    ].some((value) => String(value).toLowerCase().includes(normalizedSearch));
  });
  const totalVersions = versionGroups.reduce(
    (count, group) => count + group.versions.length,
    0,
  );

  const handleAddMapping = async (group, fieldName) => {
    const latestVersion = group.versions[group.versions.length - 1];
    const editKey = `${group.key}:${fieldName}`;
    const headerName = editing?.key === editKey ? editing.value.trim() : "";
    if (!headerName) return;
    if (!window.confirm("Apakah Anda yakin ingin menyimpan mapping ini sebagai versi baru?")) {
      return;
    }

    setSavingKey(editKey);
    setSaveError("");
    setSaveMessage("");
    try {
      const mapping = {
        ...(latestVersion?.mapping || {}),
        [fieldName]: headerName,
      };
      await addColumnMappingVersion({
        cedant_code: group.cedantCode,
        dataset_type: datasetType,
        sheet_names: group.sheetNames,
        mapping,
      });
      setEditing(null);
      setSaveMessage(
        `Mapping ${fieldLabel(fieldName)} berhasil disimpan sebagai versi baru.`,
      );
      await reload();
    } catch (requestError) {
      setSaveError(requestError.message || "Gagal menyimpan mapping.");
    } finally {
      setSavingKey("");
    }
  };

  const startEditing = (group, fieldName) => {
    const latestVersion = group.versions[group.versions.length - 1];
    setSaveError("");
    setSaveMessage("");
    setEditing({
      key: `${group.key}:${fieldName}`,
      value: latestVersion?.mapping?.[fieldName] || "",
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 py-6 space-y-5 font-sans text-[var(--color-ink)] saas-page-enter">
      <PageHeader
        title={`Mapping Rules — ${datasetType}`}
        description="Lihat riwayat versi dan tambahkan aturan pemetaan kolom Excel per cedant & sheet. Tekan (+) untuk menyimpan mapping baru sebagai versi berikutnya."
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

      {/* Dataset Tabs & Info Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex bg-[var(--color-surface)] p-1 rounded-[var(--radius-control)] border border-[var(--color-line)] shadow-2xs">
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
                setEditing(null);
                setSaveError("");
                setSaveMessage("");
              }}
              className={`px-4 py-1.5 rounded-[calc(var(--radius-control)-2px)] text-xs font-bold transition-all cursor-pointer ${
                activeTab === key
                  ? "bg-[var(--color-brand)] text-white shadow-2xs"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--color-ink-muted)]">
          <Badge tone="brand">
            {loading ? "Memuat…" : `${versionGroups.length} cedant/sheet`}
          </Badge>
          <Badge tone="neutral">
            {loading ? "—" : `${totalVersions} versi`}
          </Badge>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/25 text-[var(--color-danger)] px-4 py-3 rounded-[var(--radius-control)] text-xs font-medium"
        >
          Mapping database gagal dimuat: {error}
        </div>
      )}
      {saveError && (
        <div
          role="alert"
          className="bg-[var(--color-danger-soft)] border border-[var(--color-danger)]/25 text-[var(--color-danger)] px-4 py-3 rounded-[var(--radius-control)] text-xs font-medium"
        >
          {saveError}
        </div>
      )}
      {saveMessage && (
        <div
          role="status"
          className="bg-[var(--color-valid-soft)] border border-[var(--color-valid)]/25 text-[var(--color-valid)] px-4 py-3 rounded-[var(--radius-control)] text-xs font-medium"
        >
          {saveMessage}
        </div>
      )}

      {/* Info Banner + Search Bar */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-line)] bg-[var(--color-surface-sunken)]/40 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[var(--color-ink-muted)]">
            <InformationCircleIcon className="h-4 w-4 text-[var(--color-brand)] shrink-0" />
            <span>
              Mapping disimpan sebagai versi baru (`mapping_id` unik) dan versi sebelumnya tetap terjaga.
            </span>
          </div>

          <div className="relative w-full sm:w-80">
            <MagnifyingGlassIcon className="h-4 w-4 text-[var(--color-ink-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari cedant, sheet, field, atau header..."
              className="w-full h-9 pl-9 pr-14 rounded-[var(--radius-control)] border border-[var(--color-line)] bg-[var(--color-surface)] text-xs text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)] focus:outline-none focus:border-[var(--color-brand)]"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-mono text-[var(--color-ink-muted)]">
              {filteredGroups.length}/{versionGroups.length}
            </span>
          </div>
        </div>
      </Card>

      {filteredGroups.length === 0 && (
        <Card className="text-center py-12 text-[var(--color-ink-muted)] text-xs">
          {loading ? "Memuat mapping database…" : "Tidak ada mapping yang cocok dengan pencarian."}
        </Card>
      )}

      <div className="space-y-4">
        {filteredGroups.map((group) => {
          const fieldNames = [
            ...new Set([
              ...catalogFields,
              ...group.versions.flatMap((version) => Object.keys(version.mapping)),
            ]),
          ].sort((a, b) => fieldLabel(a).localeCompare(fieldLabel(b)));
          const versionNumbers = group.versions.map((version) => version.versionNumber);
          const nextVersion = Math.max(0, ...versionNumbers) + 1;
          const latestVersion = group.versions[group.versions.length - 1];

          return (
            <Card key={group.key} padding="none" className="overflow-hidden">
              <div className="px-4 py-3 flex flex-wrap items-center gap-2.5 border-b border-[var(--color-line)] bg-[var(--color-surface)]">
                <Badge tone="brand" className="font-mono">
                  {group.cedantCode || "—"}
                </Badge>
                <span className="text-sm font-bold text-[var(--color-ink)]">{group.cedant}</span>
                <span className="text-xs text-[var(--color-ink-muted)]">
                  · Sheet: <span className="font-medium text-[var(--color-ink-body)]">{group.sheetMet}</span>
                </span>
              </div>

              <div className="overflow-x-auto table-scroll">
                <table className="min-w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface-sunken)] text-[11px] uppercase font-bold tracking-wider">
                      <th className="px-4 py-2.5 text-left text-[var(--color-ink-muted)] whitespace-nowrap">
                        Cedant
                      </th>
                      <th className="px-4 py-2.5 text-left text-[var(--color-ink-muted)] whitespace-nowrap">
                        Field
                      </th>
                      {versionNumbers.map((version) => (
                        <th
                          key={version}
                          className="px-4 py-2.5 text-left text-[var(--color-brand)] whitespace-nowrap min-w-[160px]"
                        >
                          Mapping Ver {version}
                        </th>
                      ))}
                      <th className="px-4 py-2.5 text-left text-[var(--color-brand)] whitespace-nowrap min-w-[190px]">
                        Mapping Ver {nextVersion}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-line)]/60">
                    {fieldNames.map((fieldName) => {
                      const editKey = `${group.key}:${fieldName}`;
                      const isEditing = editing?.key === editKey;
                      return (
                        <tr
                          key={fieldName}
                          className="hover:bg-[var(--color-surface-sunken)]/50 transition-colors"
                        >
                          <td className="px-4 py-2.5 font-mono text-[var(--color-ink-muted)] whitespace-nowrap">
                            {group.cedantCode || group.cedant}
                          </td>
                          <td className="px-4 py-2.5 font-mono font-semibold text-[var(--color-ink)] whitespace-nowrap">
                            {fieldLabel(fieldName)}
                          </td>
                          {group.versions.map((version) => (
                            <td
                              key={version.versionNumber}
                              className="px-4 py-2.5 text-[var(--color-ink-body)] whitespace-nowrap"
                            >
                              {version.mapping[fieldName] || (
                                <span className="text-[var(--color-ink-faint)]">—</span>
                              )}
                            </td>
                          ))}
                          <td className="px-4 py-2.5">
                            {isEditing ? (
                              <form
                                className="flex items-center gap-1.5"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  handleAddMapping(group, fieldName);
                                }}
                              >
                                <input
                                  autoFocus
                                  type="text"
                                  value={editing.value}
                                  onChange={(event) =>
                                    setEditing((current) => ({
                                      ...current,
                                      value: event.target.value,
                                    }))
                                  }
                                  placeholder="Nama kolom Excel"
                                  className="w-40 h-8 rounded-[var(--radius-control)] border border-[var(--color-brand)] px-2.5 text-xs text-[var(--color-ink)] bg-[var(--color-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/20"
                                />
                                <button
                                  type="submit"
                                  disabled={!editing.value.trim() || savingKey === editKey}
                                  className="h-8 w-8 inline-flex items-center justify-center rounded-[var(--radius-control)] bg-[var(--color-brand)] text-white hover:opacity-90 disabled:opacity-40 cursor-pointer"
                                  aria-label="Simpan mapping"
                                  title="Simpan mapping"
                                >
                                  <CheckIcon className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditing(null)}
                                  disabled={savingKey === editKey}
                                  className="h-8 w-8 inline-flex items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-line)] text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-sunken)] disabled:opacity-40 cursor-pointer"
                                  aria-label="Batal"
                                  title="Batal"
                                >
                                  <XMarkIcon className="h-3.5 w-3.5" />
                                </button>
                              </form>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEditing(group, fieldName)}
                                disabled={Boolean(savingKey)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-brand-line)] bg-[var(--color-brand-soft)] text-[var(--color-brand)] hover:opacity-85 disabled:opacity-40 cursor-pointer transition-opacity"
                                aria-label={`Tambah mapping ${fieldLabel(fieldName)}`}
                                title="Tambah mapping ke versi baru"
                              >
                                <PlusIcon className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {fieldNames.length === 0 && (
                      <tr>
                        <td
                          colSpan={versionNumbers.length + 3}
                          className="px-4 py-8 text-center text-[var(--color-ink-muted)]"
                        >
                          Belum ada field mapping untuk profil ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-2.5 bg-[var(--color-surface-sunken)]/50 border-t border-[var(--color-line)] text-xs text-[var(--color-ink-muted)] flex items-center justify-between gap-2">
                <span>
                  Versi aktif:{" "}
                  <strong className="text-[var(--color-ink)]">
                    {latestVersion ? `Mapping Ver ${latestVersion.versionNumber}` : "Belum ada"}
                  </strong>
                </span>
                <span className="text-[var(--color-valid)] font-semibold">
                  {latestVersion
                    ? `${Object.keys(latestVersion.mapping).length} field terpetakan`
                    : "Tambah mapping pertama"}
                </span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
