// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GoogleCalendars } from "./GoogleCalendars";
import { apiFetch } from "../../lib/api";
vi.mock("../../lib/api", () => ({ apiFetch: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/");
});
const response = (value: unknown) => new Response(JSON.stringify(value));
it("explains server setup without offering an unusable connect button", async () => {
  vi.mocked(apiFetch).mockResolvedValue(
    response({ configured: false, accounts: [] }),
  );
  render(<GoogleCalendars onChange={vi.fn()} />);
  await screen.findByText(/one-time setup/);
  expect(screen.queryByRole("button", { name: "Connect Google" })).toBeNull();
});
it("selects a calendar explicitly and refreshes its status after adding", async () => {
  const changed = vi.fn().mockResolvedValue(undefined);
  vi.mocked(apiFetch).mockImplementation(async (url, init) => {
    if (String(url) === "/api/google")
      return response({
        configured: true,
        accounts: [{ id: 2, calendars: 0 }],
      });
    if (init?.method === "POST") return response({ id: 12 });
    return response([
      { id: "school@calendar.test", summary: "School", accessRole: "reader" },
    ]);
  });
  render(<GoogleCalendars onChange={changed} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Choose calendars" }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Add School" }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(apiFetch).toHaveBeenCalledWith(
    "/api/google/2/calendars",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ calendar_id: "school@calendar.test" }),
    }),
  );
  await screen.findByText(/School added/);
});
it("retains account controls when calendar discovery fails", async () => {
  vi.mocked(apiFetch).mockImplementation(async (url) => {
    if (String(url) === "/api/google")
      return response({
        configured: true,
        accounts: [{ id: 1, calendars: 1 }],
      });
    throw new Error("Google access expired; reconnect the account");
  });
  render(<GoogleCalendars onChange={vi.fn()} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Choose calendars" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain("reconnect");
  expect(
    screen.getByRole("button", { name: "Connect or reconnect Google" }),
  ).toBeDefined();
});
it("requires confirmation to disconnect and keeps the dialog on failure", async () => {
  vi.mocked(apiFetch).mockImplementation(async (_url, init) => {
    if (init?.method === "DELETE")
      throw new Error("Could not disconnect Google");
    return response({ configured: true, accounts: [{ id: 1, calendars: 1 }] });
  });
  render(<GoogleCalendars onChange={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
  expect(apiFetch).not.toHaveBeenCalledWith("/api/google/1", expect.anything());
  const buttons = screen.getAllByRole("button", {
    name: "Disconnect",
  });
  fireEvent.click(buttons[buttons.length - 1]);
  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith("/api/google/1", {
      method: "DELETE",
    }),
  );
  await screen.findAllByText("Could not disconnect Google");
  expect(screen.getByRole("dialog")).toBeDefined();
});
it("shows the callback result and clears it from the URL", async () => {
  window.history.replaceState(
    null,
    "",
    "/settings?tab=integrations&google=connected",
  );
  vi.mocked(apiFetch).mockResolvedValue(
    response({ configured: true, accounts: [] }),
  );
  render(<GoogleCalendars onChange={vi.fn()} />);
  await screen.findByText(/Google connected/);
  expect(window.location.search).toBe("?tab=integrations");
});

it("refreshes account counts after a connected calendar changes elsewhere", async () => {
  let count = 1;
  vi.mocked(apiFetch).mockImplementation(async () =>
    response({ configured: true, accounts: [{ id: 1, calendars: count }] }),
  );
  render(<GoogleCalendars onChange={vi.fn()} />);
  await screen.findByText(/1 connected calendar/);
  count = 0;
  fireEvent(window, new Event("system-update"));
  await screen.findByText(/0 connected calendars/);
});
