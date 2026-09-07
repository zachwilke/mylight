// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GoogleSyncJobs } from "./GoogleSyncJobs";
import { apiFetch } from "../../lib/api";
vi.mock("../../lib/api", () => ({ apiFetch: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const draft = {
  title: "My class",
  start_date: "2026-09-07",
  end_date: "2026-09-08",
  is_all_day: true,
  description: "My notes",
  location: "Library",
};
const job = {
  id: "outgoing-operation",
  state: "conflict",
  version: 3,
  attempts: 1,
  next_attempt: 0,
  message: "Changed in Google",
  draft,
  remote: {
    ...draft,
    title: "Google class",
    description: "Google notes",
    etag: '"remote-v2"',
    editable: true,
  },
};
it("shows both drafts and requires confirmation tied to the reviewed remote version", async () => {
  vi.mocked(apiFetch).mockImplementation(
    async (_url, init) => new Response(JSON.stringify(init ? {} : [job])),
  );
  render(<GoogleSyncJobs />);
  await screen.findByText("Google notes");
  fireEvent.click(screen.getByRole("button", { name: "Apply my draft" }));
  expect(apiFetch).toHaveBeenCalledTimes(1);
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Apply draft" }));
  await waitFor(() =>
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/google-jobs/outgoing-operation",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "apply",
          version: 3,
          etag: '"remote-v2"',
        }),
      }),
    ),
  );
});
it("keeps a failed resolution open and explains stopping uncertain retries", async () => {
  vi.mocked(apiFetch).mockImplementation(async (_url, init) => {
    if (init) throw new Error("Reload before continuing");
    return new Response(JSON.stringify([{ ...job, state: "retry" }]));
  });
  render(<GoogleSyncJobs />);
  fireEvent.click(await screen.findByRole("button", { name: "Stop retrying" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog.textContent).toContain(
    "does not undo a change Google may already have accepted",
  );
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Stop outgoing change" }),
  );
  await screen.findAllByText("Reload before continuing");
  expect(screen.getByRole("dialog")).toBeDefined();
});
it("prevents changes to a running job and cannot apply a draft to a deleted appointment", async () => {
  vi.mocked(apiFetch).mockResolvedValue(
    new Response(
      JSON.stringify([
        { ...job, state: "running" },
        { ...job, id: "deleted-operation", remote: null },
      ]),
    ),
  );
  render(<GoogleSyncJobs />);
  await screen.findByText("Sending to Google");
  expect(screen.queryByRole("button", { name: "Apply my draft" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Stop retrying" })).toBeNull();
  expect(
    screen.getAllByRole("button", { name: "Keep Google version" }),
  ).toHaveLength(1);
});
