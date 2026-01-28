import { useState, useEffect, useCallback } from 'react';

interface Settings {
  family_name?: string;
  weather_location?: string;
  screensaver_timeout?: string;
  google_chat_webhook?: string;
  chore_reset_time?: string;
  edit_code?: string;
  enable_confetti?: string;
  enable_major_celebration?: string;
  [key: string]: string | undefined;
}

interface UseSettingsReturn {
  settings: Settings;
  loading: boolean;
  saving: boolean;
  error: string | null;
  updateSetting: (key: string, value: string) => Promise<boolean>;
  updateSettings: (updates: Record<string, string>) => Promise<boolean>;
  refetch: () => Promise<void>;
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
      console.error('Failed to fetch settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSetting = useCallback(async (key: string, value: string): Promise<boolean> => {
    try {
      setSaving(true);
      setError(null);

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });

      if (!res.ok) throw new Error('Failed to save setting');

      setSettings(prev => ({ ...prev, [key]: value }));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save setting');
      console.error('Failed to update setting:', err);
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const updateSettings = useCallback(async (updates: Record<string, string>): Promise<boolean> => {
    try {
      setSaving(true);
      setError(null);

      const promises = Object.entries(updates).map(([key, value]) =>
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value }),
        })
      );

      const results = await Promise.all(promises);
      const allOk = results.every(res => res.ok);

      if (!allOk) throw new Error('Failed to save some settings');

      setSettings(prev => ({ ...prev, ...updates }));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
      console.error('Failed to update settings:', err);
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    settings,
    loading,
    saving,
    error,
    updateSetting,
    updateSettings,
    refetch: fetchSettings,
  };
}
