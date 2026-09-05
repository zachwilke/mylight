import { Clock, Lock, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { LocationSearch } from "../../../components/LocationSearch";
import {
  Button,
  Card,
  CardContent,
  Input,
  Tooltip,
} from "../../../components/ui";
import { apiFetch } from "../../../lib/api";
import { getReverseGeocoding } from "../../../utils/weather";

interface GeneralSettingsProps {
  settings: Record<string, string | undefined>;
  saving: boolean;
  onSave: (key: string, value: string) => Promise<boolean>;
}

export function GeneralSettings({
  settings,
  saving,
  onSave,
}: GeneralSettingsProps) {
  const [familyName, setFamilyName] = useState("");
  const [locationName, setLocationName] = useState("");
  const [choreResetTime, setChoreResetTime] = useState("00:00");
  const [editCode, setEditCode] = useState("");

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settings.family_name) setFamilyName(settings.family_name);

    // Initialize location name (try to reverse geocode if only coords exist, or use stored name if we had it - but backend only stores "lat,lng")
    // Ideally we would store the name too, but sticking to "lat,lng" format requirement:
    if (settings.weather_location?.includes(",")) {
      const parts = settings.weather_location.split(",");
      const lat = parseFloat(parts[0].trim());
      const lng = parseFloat(parts[1].trim());

      if (!isNaN(lat) && !isNaN(lng)) {
        // Attempt to fetch name for display if not already set by local interaction
        getReverseGeocoding(lat, lng).then((name) => {
          if (name) setLocationName(name);
          else setLocationName(`${lat}, ${lng}`);
        });
      }
    } else if (settings.weather_location) {
      // Fallback for zip codes or other formats if any legacy exist
      setLocationName(settings.weather_location);
    }

    if (settings.chore_reset_time) setChoreResetTime(settings.chore_reset_time);
    if (settings.edit_code) setEditCode(settings.edit_code);
  }, [settings]);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const saveFamilyName = async () => {
    const success = await onSave("family_name", familyName);
    if (success) showSuccess("Family name saved");
  };

  const handleLocationSelect = async (loc: {
    name: string;
    lat: number;
    lng: number;
  }) => {
    setLocationName(loc.name);
    const locationString = `${loc.lat},${loc.lng}`;
    const success = await onSave("weather_location", locationString);
    if (success) showSuccess(`Location saved: ${loc.name}`);
  };

  const saveChoreResetTime = async () => {
    const success = await onSave("chore_reset_time", choreResetTime);
    if (success) showSuccess("Reset time saved");
  };

  const saveEditCode = async () => {
    const success = await onSave("edit_code", editCode);
    if (success) showSuccess("Passcode saved");
  };

  const manualResetChores = async () => {
    try {
      await apiFetch("/api/chores/reset", { method: "POST" });
      showSuccess("Chores have been reset");
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 flex items-center gap-2">
              Family Name
              <Tooltip content="Displayed on the home screen and screensaver." />
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 flex items-center gap-2">
              Weather Location
              <Tooltip content="Used for weather forecasts and local time." />
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <LocationSearch
                  initialValue={locationName}
                  onLocationSelect={handleLocationSelect}
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Search for your City or Zip Code to set the weather location.
            </p>
          </div>

          {/* Chore Reset Time & Edit Code */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-gray-100 dark:border-gray-800 pt-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 flex items-center gap-2">
                Chore Reset Time
                <Tooltip content="The time when daily chore status resets (24-hour format)." />
              </label>
              <div className="flex gap-2">
                <Input
                  type="time"
                  value={choreResetTime}
                  onChange={(e) => setChoreResetTime(e.target.value)}
                  icon={<Clock size={14} />}
                  className="flex-1"
                />
                <Button
                  variant="secondary"
                  onClick={saveChoreResetTime}
                  loading={saving}
                >
                  <Save size={16} />
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setShowResetConfirm(true)}
                  title="Reset All Chores Now"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 flex items-center gap-2">
                Edit Passcode
                <Tooltip content="Required to enter Edit Mode for changing chores or settings." />
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
