import { useMemo, useState } from "react";
import { useColumnMappings } from "../hooks/useColumnMappings";
import { addColumnMappingVersion } from "../services/api";
import {
  AdjustmentsHorizontalIcon,
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
    <div className="flex-1 flex flex-col bg-gray-50 overflow-auto">
      <div className="page-header">
        <div className="h-8 w-8 rounded-xl bg-teal-600 flex items-center justify-center flex-shrink-0">
          <AdjustmentsHorizontalIcon className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-base font-bold text-gray-800">Mapping Rules</h1>
          <p className="text-xs text-gray-400">
            Lihat riwayat versi dan tambahkan mapping kolom
          </p>
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

      <div className="px-6 py-6 flex flex-col gap-5 max-w-7xl w-full">
        <div className="flex gap-0 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm">
          {[
            ["os", "OS Claim Cedant"],
            ["infopack", "InfoPack"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setActiveTab(key);
                setSearch("");
                setEditing(null);
                setSaveError("");
                setSaveMessage("");
              }}
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

        <div>
          <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-0.5">
            REFERENCE INTELLIGENCE
          </p>
          <h2 className="text-2xl font-extrabold text-gray-800">
            Mapping Rules &mdash; {datasetType}
          </h2>
          <p className="text-xs text-gray-400 mt-1 max-w-2xl">
            Setiap baris adalah field dan setiap kolom adalah versi mapping. Tekan{" "}
            <span className="font-bold text-teal-700">+</span> untuk menambahkan atau
            memperbarui mapping pada versi baru.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"
          >
            Mapping database gagal dimuat: {error}
          </div>
        )}
        {saveError && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm"
          >
            {saveError}
          </div>
        )}
        {saveMessage && (
          <div
            role="status"
            className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm"
          >
            {saveMessage}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex flex-wrap items-center gap-3">
          <InformationCircleIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <span className="text-xs text-gray-500">
            Mapping disimpan sebagai versi baru dan versi sebelumnya tetap tersedia.
          </span>
          <span className="ml-auto text-xs text-gray-500">
            {loading ? "Memuat…" : `${versionGroups.length} cedant/sheet · ${totalVersions} versi`}
          </span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-2.5 flex items-center gap-3">
          <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari cedant, sheet, field, atau header..."
            className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 placeholder-gray-400"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-xs text-gray-400 hover:text-gray-600 px-1"
              aria-label="Hapus pencarian"
            >
              &#x2715;
            </button>
          )}
          <span className="text-xs text-gray-400 flex-shrink-0">
            {filteredGroups.length} / {versionGroups.length}
          </span>
        </div>

        {filteredGroups.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm text-center py-12 text-gray-400 text-sm">
            {loading ? "Memuat mapping database…" : "Tidak ada mapping yang cocok dengan pencarian."}
          </div>
        )}

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
            <section
              key={group.key}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
            >
              <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b border-gray-100">
                <span className="font-mono font-bold text-teal-700 bg-teal-50 px-2 py-1 rounded text-xs">
                  {group.cedantCode || "—"}
                </span>
                <span className="text-sm font-semibold text-gray-800">{group.cedant}</span>
                <span className="text-xs text-gray-400">· Sheet: {group.sheetMet}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">
                        Cedant
                      </th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wide">
                        Field
                      </th>
                      {versionNumbers.map((version) => (
                        <th
                          key={version}
                          className="px-3 py-2.5 text-left font-semibold text-teal-700 uppercase tracking-wide min-w-[160px]"
                        >
                          Mapping Ver {version}
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-left font-semibold text-teal-700 uppercase tracking-wide min-w-[190px]">
                        Mapping Ver {nextVersion}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {fieldNames.map((fieldName) => {
                      const editKey = `${group.key}:${fieldName}`;
                      const isEditing = editing?.key === editKey;
                      return (
                        <tr
                          key={fieldName}
                          className="hover:bg-teal-50/30 transition-colors"
                        >
                          <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                            {group.cedantCode || group.cedant}
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-gray-700 whitespace-nowrap">
                            {fieldLabel(fieldName)}
                          </td>
                          {group.versions.map((version) => (
                            <td
                              key={version.versionNumber}
                              className="px-3 py-2 text-gray-700 whitespace-nowrap"
                            >
                              {version.mapping[fieldName] || (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          ))}
                          <td className="px-3 py-2">
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
                                  className="w-40 rounded-lg border border-teal-300 px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                                />
                                <button
                                  type="submit"
                                  disabled={!editing.value.trim() || savingKey === editKey}
                                  className="rounded-lg bg-teal-600 p-1.5 text-white hover:bg-teal-700 disabled:opacity-40"
                                  aria-label="Simpan mapping"
                                  title="Simpan mapping"
                                >
                                  <CheckIcon className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditing(null)}
                                  disabled={savingKey === editKey}
                                  className="rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
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
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 disabled:opacity-40"
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
                          className="px-4 py-8 text-center text-gray-400"
                        >
                          Belum ada field mapping untuk profil ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
                Versi aktif:{" "}
                <strong className="text-gray-700">
                  {latestVersion ? `Mapping Ver ${latestVersion.versionNumber}` : "Belum ada"}
                </strong>
                {" · "}
                <span className="text-emerald-700 font-semibold">
                  {latestVersion
                    ? `${Object.keys(latestVersion.mapping).length} field terpetakan`
                    : "Tambah mapping pertama"}
                </span>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
