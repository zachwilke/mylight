import { useState, useEffect } from 'react';
import { Save, MapPin, Clock, Lock, Trash2 } from 'lucide-react';
import { Button, Card, CardContent, Input } from '../../../components/ui';
import { ConfirmDialog } from '../../../components/ConfirmDialog';

interface GeneralSettingsProps {
  settings: Record<string, string | undefined>;
  saving: boolean;
  onSave: (key: string, value: string) => Promise<boolean>;
}

export function GeneralSettings({ settings, saving, onSave }: GeneralSettingsProps) {
  const [familyName, setFamilyName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [choreResetTime, setChoreResetTime] = useState('00:00');
  const [editCode, setEditCode] = useState('');

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settings.family_name) setFamilyName(settings.family_name);
    if (settings.weather_location?.includes(',')) {
      const parts = settings.weather_location.split(',');
      setLatitude(parts[0].trim());
      setLongitude(parts[1].trim());
    }
    if (settings.chore_reset_time) setChoreResetTime(settings.chore_reset_time);
    if (settings.edit_code) setEditCode(settings.edit_code);
  }, [settings]);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const saveFamilyName = async () => {
    const success = await onSave('family_name', familyName);
    if (success) showSuccess('Family name saved');
  };

  const saveLocation = async () => {
    if (!latitude || !longitude) return;
    const locationString = `${latitude.trim()},${longitude.trim()}`;
    const success = await onSave('weather_location', locationString);
    if (success) showSuccess('Location saved');
  };

  const saveChoreResetTime = async () => {
    const success = await onSave('chore_reset_time', choreResetTime);
    if (success) showSuccess('Reset time saved');
  };

  const saveEditCode = async () => {
    const success = await onSave('edit_code', editCode);
    if (success) showSuccess('Passcode saved');
  };

  const manualResetChores = async () => {
    try {
      await fetch('/api/chores/reset', { method: 'POST' });
      showSuccess('Chores have been reset');
      setShowResetConfirm(false);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={manualResetChores}
        title="Reset All Chores"
        message="Are you sure you want to uncheck all chores for everyone? This action cannot be undone."
        confirmText="Reset"
      />

      {successMessage && (
        <div className="bg-success-light text-success px-4 py-2 rounded-xl text-sm font-medium animate-fade-in">
          {successMessage}
        </div>
      )}

      <Card>
        <CardContent className="space-y-6">
          {/* Family Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
              Family Name
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={familyName}
                onChange={(e) => setFamilyName(e.target.value)}
                placeholder="e.g. The Miller Family"
                className="flex-1"
              />
              <Button onClick={saveFamilyName} loading={saving}>
                <Save size={16} />
                Save
              </Button>
            </div>
          </div>

          {/* Weather Location */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
              Weather Location (Coordinates)
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                inputMode="decimal"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="Latitude"
                icon={<MapPin size={14} />}
                className="flex-1"
              />
              <Input
                type="text"
                inputMode="decimal"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="Longitude"
                icon={<MapPin size={14} />}
                className="flex-1"
              />
              <Button onClick={saveLocation} loading={saving}>
                <Save size={16} />
                Save
              </Button>
            </div>
          </div>

          {/* Chore Reset Time & Edit Code */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-gray-100 dark:border-gray-800 pt-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
                Chore Reset Time
              </label>
              <div className="flex gap-2">
                <Input
                  type="time"
                  value={choreResetTime}
                  onChange={(e) => setChoreResetTime(e.target.value)}
                  icon={<Clock size={14} />}
                  className="flex-1"
                />
                <Button variant="secondary" onClick={saveChoreResetTime} loading={saving}>
                  <Save size={16} />
                </Button>
                <Button variant="danger" onClick={() => setShowResetConfirm(true)} title="Reset All Chores Now">
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5">
                Edit Passcode
              </label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  placeholder="e.g. 1234"
                  icon={<Lock size={14} />}
                  className="flex-1"
                />
                <Button onClick={saveEditCode} loading={saving}>
                  <Save size={16} />
                  Save
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
