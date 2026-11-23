import { useCallback, useEffect, useState } from "react";
import { getColumnMappings } from "../services/api";

export function useColumnMappings() {
  const [profiles, setProfiles] = useState([]);
  const [mappingVersions, setMappingVersions] = useState([]);
  const [mappingFields, setMappingFields] = useState([]);
  const [cedants, setCedants] = useState([]);
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
      if (response.db_connected === false) {
        throw new Error(response.db_error || "Koneksi mapping database gagal.");
      }
      setProfiles(response.profiles);
      setMappingVersions(
        Array.isArray(response.mapping_versions) ? response.mapping_versions : [],
      );
      setMappingFields(
        Array.isArray(response.mapping_fields) ? response.mapping_fields : [],
      );
      setCedants(Array.isArray(response.cedants) ? response.cedants : []);
      setDbConnected(true);
    } catch (e) {
      setError(e.message);
      setDbConnected(false);
      setProfiles([]);
      setMappingVersions([]);
      setMappingFields([]);
      setCedants([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return {
    profiles,
    mappingVersions,
    mappingFields,
    cedants,
    loading,
    error,
    dbConnected,
    reload,
  };
}
