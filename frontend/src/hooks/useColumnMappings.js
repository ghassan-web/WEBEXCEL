import { useCallback, useEffect, useState } from "react";
import { getColumnMappings } from "../services/api";
import { PROFILES_OS, PROFILES_INFOPACK } from "../services/mappingData";

function normalizeStaticProfiles() {
  const osList = (PROFILES_OS || []).map((p) => {
    const sheetNames =
      p.sheetMet && p.sheetMet !== "All sheets"
        ? p.sheetMet.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    const mapping = {};
    if (p.lossRef && p.lossRef !== "—") mapping.doc_no = p.lossRef;
    if (p.outstanding && p.outstanding !== "—") mapping.outstanding = p.outstanding;
    if (p.dateOfLoss && p.dateOfLoss !== "—" && p.dateOfLoss !== "(Tidak tersedia)") {
      mapping.dol = p.dateOfLoss;
    }
    return {
      tipe_data: "OS Cedant",
      cedant: p.cedant,
      cedantCode: p.col || p.cedant,
      sheetNames,
      sheetMet: p.sheetMet || "All sheets",
      lossRef: p.lossRef || "—",
      outstanding: p.outstanding || "—",
      dateOfLoss: p.dateOfLoss || "—",
      status: p.status || "READY",
      mapping,
      source: "static",
    };
  });

  const infoList = (PROFILES_INFOPACK || []).map((p) => {
    const sheetNames =
      p.sheetMet && p.sheetMet !== "All sheets"
        ? p.sheetMet.split("/").map((s) => s.trim()).filter(Boolean)
        : [];
    const mapping = {};
    if (p.lossRef && p.lossRef !== "—") mapping.title = p.lossRef;
    if (p.outstanding && p.outstanding !== "—" && p.outstanding !== "(Tidak tersedia)") {
      mapping.value = p.outstanding;
    }
    if (p.dateOfLoss && p.dateOfLoss !== "—" && p.dateOfLoss !== "(Tidak tersedia)") {
      mapping.dol = p.dateOfLoss;
    }
    return {
      tipe_data: "Infopack",
      cedant: p.cedant,
      cedantCode: p.col || p.cedant,
      sheetNames,
      sheetMet: p.sheetMet || "All sheets",
      lossRef: p.lossRef || "—",
      outstanding: p.outstanding || "—",
      dateOfLoss: p.dateOfLoss || "—",
      status: p.status || "READY",
      mapping,
      source: "static",
    };
  });

  return [...osList, ...infoList];
}

const STATIC_PROFILES = normalizeStaticProfiles();

export function useColumnMappings() {
  const [profiles, setProfiles] = useState(STATIC_PROFILES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dbConnected, setDbConnected] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getColumnMappings();
      if (!Array.isArray(response.profiles)) {
        throw new Error("Respons mapping database tidak valid.");
      }
      if (response.profiles.length > 0) {
        /* Gabungkan profil dari DB dengan profil statis yang belum ada di DB */
        const dbKeys = new Set(
          response.profiles.map(
            (p) => `${p.tipe_data}::${String(p.cedant).toLowerCase()}::${String(p.sheetMet).toLowerCase()}`
          )
        );
        const extraStatic = STATIC_PROFILES.filter(
          (p) => !dbKeys.has(`${p.tipe_data}::${String(p.cedant).toLowerCase()}::${String(p.sheetMet).toLowerCase()}`)
        );
        setProfiles([...response.profiles, ...extraStatic]);
      } else {
        setProfiles(STATIC_PROFILES);
      }
      setDbConnected(true);
    } catch (e) {
      setError(e.message);
      setDbConnected(false);
      setProfiles(STATIC_PROFILES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { profiles, loading, error, dbConnected, reload };
}
