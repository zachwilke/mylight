import { useState, useEffect } from 'react';
import { Save, Trash2, Calendar } from 'lucide-react';
import { Button, Card, CardContent, Input } from '../../../components/ui';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { CalendarSubscription } from '../../../types';

const PRESET_COLORS = [
  { label: 'Gray', value: 'bg-gray-200 text-gray-800' },
  { label: 'Red', value: 'bg-red-100 text-red-800' },
  { label: 'Green', value: 'bg-emerald-100 text-emerald-800' },
  { label: 'Blue', value: 'bg-blue-100 text-blue-800' },
  { label: 'Purple', value: 'bg-purple-100 text-purple-800' },
];

interface IntegrationsSettingsProps {
  settings: Record<string, string | undefined>;
  saving: boolean;
  onSave: (key: string, value: string) => Promise<boolean>;
}

export function IntegrationsSettings({ settings, saving, onSave }: IntegrationsSettingsProps) {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Calendar subscriptions
  const [calendars, setCalendars] = useState<CalendarSubscription[]>([]);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0].value);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  useEffect(() => {
    if (settings.google_chat_webhook) {
      setWebhookUrl(settings.google_chat_webhook);
    }
  }, [settings]);

  useEffect(() => {
    fetch('/api/calendars')
      .then(res => res.json())
      .then(data => setCalendars(data || []))
      .catch(console.error);
  }, []);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const saveWebhookUrl = async () => {
    if (!webhookUrl) return;
    const success = await onSave('google_chat_webhook', webhookUrl);
    if (success) showSuccess('Webhook saved');
  };

  const addCalendar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl) return;

    try {
      const res = await fetch('/api/calendars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl, name: newName || 'Calendar', color: newColor }),
      });
      const data = await res.json();
      setCalendars([...calendars, data]);
      setNewUrl('');
      setNewName('');
      showSuccess('Calendar added');
    } catch (err) {
      console.error(err);
    }
  };

  const confirmDeleteCalendar = async () => {
    if (!pendingDeleteId) return;
    try {
      await fetch(`/api/calendars/${pendingDeleteId}`, { method: 'DELETE' });
      setCalendars(calendars.filter(c => c.id !== pendingDeleteId));
      setPendingDeleteId(null);
      setShowDeleteConfirm(false);
      showSuccess('Calendar removed');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDeleteCalendar}
        title="Unsubscribe Calendar"
        message="Are you sure you want to unsubscribe from this calendar?"
        confirmText="Unsubscribe"
      />

      {successMessage && (
        <div className="bg-success-light text-success px-4 py-2 rounded-xl text-sm font-medium animate-fade-in">
          {successMessage}
        </div>
      )}

      {/* Google Chat Webhook */}
      <Card>
        <CardContent>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Google Chat Webhook
          </h3>
          <div className="flex gap-2">
            <Input
              type="url"
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              placeholder="https://chat.googleapis.com/..."
              className="flex-1"
            />
            <Button onClick={saveWebhookUrl} loading={saving}>
              <Save size={16} />
              Save
            </Button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Configure a webhook to receive notifications in Google Chat.
          </p>
        </CardContent>
      </Card>

      {/* External Calendars */}
      <Card>
        <CardContent className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            External Calendar Subscriptions
          </h3>

          {calendars.map(cal => (
            <div
              key={cal.id}
              className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl"
            >
              <div className="flex items-center gap-4 overflow-hidden">
                <div
                  className={`w-10 h-10 rounded-full ${
                    cal.color || 'bg-gray-100 dark:bg-gray-700'
                  } flex items-center justify-center shrink-0`}
                >
                  <Calendar size={18} className="opacity-70 dark:text-white" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-semibold text-gray-800 dark:text-gray-100 truncate">
                    {cal.name}
                  </h4>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-xs">
                    {cal.url}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setPendingDeleteId(cal.id);
                  setShowDeleteConfirm(true);
                }}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}

          {/* Add Calendar Form */}
          <form
            onSubmit={addCalendar}
            className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800 space-y-3"
          >
            <h4 className="font-bold text-gray-700 dark:text-gray-300 text-sm">Add Subscription</h4>
            <Input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Calendar Name (e.g. Holidays)"
            />
            <Input
              type="text"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="iCal URL (https://...)"
            />
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setNewColor(c.value)}
                  className={`w-6 h-6 rounded-full ${c.value.split(' ')[0]} border-2 transition-all ${
                    newColor === c.value ? 'border-gray-600 dark:border-white' : 'border-transparent'
                  }`}
                  title={c.label}
                />
              ))}
              <Button type="submit" className="ml-auto" size="sm">
                Subscribe
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
