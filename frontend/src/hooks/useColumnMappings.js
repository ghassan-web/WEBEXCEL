import { useCallback, useEffect, useState } from "react";
import { getColumnMappings } from "../services/api";

export function useColumnMappings() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getColumnMappings();
      if (!Array.isArray(response.profiles)) {
        throw new Error("Respons mapping database tidak valid.");
      }
      setProfiles(response.profiles);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { profiles, loading, error, reload };
}
