export interface Device {
  id: number;
  name: string;
  can_complete_tasks: boolean;
  expires_at: number;
  revoked_at: number | null;
  preferences: {
    home_view: "today" | "week";
    theme: "system" | "light" | "dark";
  };
}

/** Validate the response before rendering; older records may omit preferences. */
export function parseDevices(value: unknown): Device[] {
  if (!Array.isArray(value)) throw new Error("Invalid display list");
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid display");
    const device = item as Record<string, unknown>;
    if (
      typeof device.id !== "number" ||
      !Number.isSafeInteger(device.id) ||
      device.id <= 0 ||
      typeof device.name !== "string" ||
      typeof device.can_complete_tasks !== "boolean" ||
      typeof device.expires_at !== "number" ||
      !Number.isFinite(device.expires_at) ||
      (device.revoked_at !== null &&
        (typeof device.revoked_at !== "number" ||
          !Number.isFinite(device.revoked_at)))
    ) {
      throw new Error("Invalid display");
    }
    const preferences =
      device.preferences && typeof device.preferences === "object"
        ? (device.preferences as Record<string, unknown>)
        : {};
    return {
      id: device.id,
      name: device.name,
      can_complete_tasks: device.can_complete_tasks,
      expires_at: device.expires_at,
      revoked_at: device.revoked_at as number | null,
      preferences: {
        home_view: preferences.home_view === "week" ? "week" : "today",
        theme:
          preferences.theme === "dark" || preferences.theme === "light"
            ? preferences.theme
            : "system",
      },
    };
  });
}
