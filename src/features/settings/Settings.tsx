import { Tabs, TabList, TabTrigger, TabContent } from '../../components/ui';
import { useSettings } from '../../hooks/useSettings';
import { GeneralSettings } from './tabs/GeneralSettings';
import { FamilySettings } from './tabs/FamilySettings';
import { IntegrationsSettings } from './tabs/IntegrationsSettings';
import { AppearanceSettings } from './tabs/AppearanceSettings';
import { PhotosSettings } from './tabs/PhotosSettings';

export function Settings() {
  const { settings, loading, saving, updateSetting, updateSettings } = useSettings();

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-gray-400">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 dark:bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto pb-24">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Settings
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage your family's preferences and configuration.
          </p>
        </div>

        <Tabs defaultValue="general">
          <TabList className="mb-6">
            <TabTrigger value="general">General</TabTrigger>
            <TabTrigger value="family">Family</TabTrigger>
            <TabTrigger value="integrations">Integrations</TabTrigger>
            <TabTrigger value="appearance">Appearance</TabTrigger>
            <TabTrigger value="photos">Photos</TabTrigger>
          </TabList>

          <TabContent value="general">
            <GeneralSettings
              settings={settings}
              saving={saving}
              onSave={updateSetting}
            />
          </TabContent>

          <TabContent value="family">
            <FamilySettings />
          </TabContent>

          <TabContent value="integrations">
            <IntegrationsSettings
              settings={settings}
              saving={saving}
              onSave={updateSetting}
            />
          </TabContent>

          <TabContent value="appearance">
            <AppearanceSettings
              settings={settings}
              saving={saving}
              onSave={updateSetting}
              onSaveMultiple={updateSettings}
            />
          </TabContent>

          <TabContent value="photos">
            <PhotosSettings />
          </TabContent>
        </Tabs>
      </div>
    </div>
  );
}
