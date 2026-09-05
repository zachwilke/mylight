import { Monitor, Moon, Save, Sparkles, Sun, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  Input,
  Toggle,
  Tooltip,
} from "../../../components/ui";
import { useTheme } from "../../../hooks/useTheme";

interface AppearanceSettingsProps {
  settings: Record<string, string | undefined>;
  saving: boolean;
  onSave: (key: string, value: string) => Promise<boolean>;
  onSaveMultiple: (updates: Record<string, string>) => Promise<boolean>;
}

export function AppearanceSettings({
  settings,
  saving,
  onSave,
  onSaveMultiple,
}: AppearanceSettingsProps) {
  const [theme, setTheme] = useTheme();
  const [screensaverTimeout, setScreensaverTimeout] = useState<number | string>(
    1,
  );
  const [enableConfetti, setEnableConfetti] = useState(true);
  const [enableMajorCelebration, setEnableMajorCelebration] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settings.screensaver_timeout) {
      setScreensaverTimeout(settings.screensaver_timeout);
    }
    if (settings.enable_confetti !== undefined) {
      setEnableConfetti(settings.enable_confetti === "true");
    }
    if (settings.enable_major_celebration !== undefined) {
      setEnableMajorCelebration(settings.enable_major_celebration === "true");
    }
  }, [settings]);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const saveScreensaverTimeout = async () => {
    const success = await onSave(
      "screensaver_timeout",
      screensaverTimeout.toString(),
    );
    if (success) {
      showSuccess("Timeout saved");
      window.dispatchEvent(
        new CustomEvent("update-timeout", { detail: screensaverTimeout }),
      );
    }
  };

  const triggerScreensaver = () => {
    window.dispatchEvent(new CustomEvent("trigger-screensaver"));
  };

  const saveAnimations = async () => {
    const success = await onSaveMultiple({
      enable_confetti: enableConfetti.toString(),
      enable_major_celebration: enableMajorCelebration.toString(),
    });
    if (success) showSuccess("Animation settings saved");
  };

  return (
    <div className="space-y-6">
      {successMessage && (
        <div className="bg-success-light text-success px-4 py-2 rounded-xl text-sm font-medium animate-fade-in">
          {successMessage}
        </div>
      )}

      {/* Theme Selection */}
      <Card>
        <CardContent>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Display Theme
          </h3>
          <div className="flex gap-2 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
            {[
              { id: "light", label: "Light", icon: Sun },
              { id: "dark", label: "Dark", icon: Moon },
              { id: "system", label: "System", icon: Monitor },
            ].map((option) => (
              <button
                key={option.id}
                onClick={() => setTheme(option.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  theme === option.id
                    ? "bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                }`}
              >
                <option.icon size={18} />
                {option.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Animation Settings */}
      <Card>
        <CardContent className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Animations
          </h3>

          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
                <Sparkles size={18} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Confetti on Checkoff
                </p>
                <p className="text-xs text-gray-500">
                  Play small confetti effect when completing a task.
                </p>
              </div>
            </div>
            <Toggle
              checked={enableConfetti}
              onChange={setEnableConfetti}
              color="primary"
            />
          </div>

          <div className="border-t border-gray-100 dark:border-gray-800" />

          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-purple-600 dark:text-purple-400">
                <Zap size={18} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Major Celebration
                </p>
                <p className="text-xs text-gray-500">
                  Fireworks and light show when all chores are done.
                </p>
              </div>
            </div>
            <Toggle
              checked={enableMajorCelebration}
              onChange={setEnableMajorCelebration}
              color="purple"
            />
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
            <Button
              variant="secondary"
              onClick={saveAnimations}
              loading={saving}
            >
              <Save size={16} />
              Save Preferences
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Screensaver Settings */}
      <Card>
        <CardContent>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Screensaver
          </h3>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 flex items-center gap-2">
                Idle Timeout (Minutes)
                <Tooltip content="Minutes of inactivity before the screensaver starts." />
              </label>
              <Input
                type="number"
                min="1"
                value={screensaverTimeout}
                onChange={(e) => setScreensaverTimeout(e.target.value)}
                className="w-full"
              />
            </div>
            <Button
              variant="secondary"
              onClick={saveScreensaverTimeout}
              loading={saving}
            >
              <Save size={16} />
            </Button>
            <Button variant="ghost" onClick={triggerScreensaver}>
              <Monitor size={16} />
              Test
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
