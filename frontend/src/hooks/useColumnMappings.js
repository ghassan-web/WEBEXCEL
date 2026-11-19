import { useCallback, useEffect, useState } from "react";
import { getColumnMappings } from "../services/api";

export function useColumnMappings() {
  const [profiles, setProfiles] = useState([]);
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
      setDbConnected(true);
    } catch (e) {
      setError(e.message);
      setDbConnected(false);
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { profiles, loading, error, dbConnected, reload };
}
