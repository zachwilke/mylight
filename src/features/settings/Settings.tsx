import { TabContent, TabList, Tabs, TabTrigger } from "../../components/ui";
import { useSettings } from "../../hooks/useSettings";
import { BackupSettings } from "./tabs/BackupSettings";
import { AppearanceSettings } from "./tabs/AppearanceSettings";
import { FamilySettings } from "./tabs/FamilySettings";
import { GeneralSettings } from "./tabs/GeneralSettings";
import { IntegrationsSettings } from "./tabs/IntegrationsSettings";
import { PhotosSettings } from "./tabs/PhotosSettings";
import { RemoteAccessSettings } from "./tabs/RemoteAccessSettings";
import { DevicesSettings } from "./tabs/DevicesSettings";
import { AccountSettings } from "./tabs/AccountSettings";

export function Settings() {
  const { settings, loading, saving, updateSetting, updateSettings } =
    useSettings();

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

        <Tabs
          defaultValue={
            new URLSearchParams(window.location.search).get("tab") ===
            "integrations"
              ? "integrations"
              : "general"
          }
        >
          <TabList className="mb-6">
            <TabTrigger value="general">General</TabTrigger>
            <TabTrigger value="family">Family</TabTrigger>
            <TabTrigger value="integrations">Integrations</TabTrigger>
            <TabTrigger value="remote">Remote access</TabTrigger>
            <TabTrigger value="devices">Displays</TabTrigger>
            <TabTrigger value="account">Account</TabTrigger>
            <TabTrigger value="appearance">Appearance</TabTrigger>
            <TabTrigger value="photos">Photos</TabTrigger>
            <TabTrigger value="backup">Backups</TabTrigger>
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
            <IntegrationsSettings />
          </TabContent>
          <TabContent value="remote">
            <RemoteAccessSettings />
          </TabContent>
          <TabContent value="devices">
            <DevicesSettings />
          </TabContent>
          <TabContent value="account">
            <AccountSettings />
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
          <TabContent value="backup">
            <BackupSettings />
          </TabContent>
        </Tabs>
      </div>
    </div>
  );
}
