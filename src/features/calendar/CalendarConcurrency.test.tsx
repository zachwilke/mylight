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
import { CalendarView } from "./CalendarView";
import { apiFetch } from "../../lib/api";
import { useCalendarEvents } from "../../hooks/useCalendarEvents";
import type { Event } from "../../types";

vi.mock("../../lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("../../hooks/useCalendarEvents", () => ({
  useCalendarEvents: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function setup(recurrence = "") {
  const date = new Date();
  date.setHours(9, 0, 0, 0);
  const event: Event = {
    id: 1,
    title: "Original event",
    version: 1,
    start_date: date.toISOString(),
    end_date: new Date(date.getTime() + 3600000).toISOString(),
    member_ids: [],
    recurrence,
  };
  vi.mocked(useCalendarEvents).mockReturnValue({
    members: [],
    events: [
      {
        ...event,
        original_id: 1,
        occurrenceId: "occ",
        date,
        end: new Date(date.getTime() + 3600000),
        startMinutes: 540,
        durationMinutes: 60,
        member: {
          id: 0,
          name: "Family",
          color: null,
          avatar: null,
          stars: 0,
          phone: null,
          visible: true,
        },
      },
    ],
    error: "",
    loading: false,
    retry: () => {},
  });
  return event;
}

it("keeps a conflicting draft and uses the refreshed version only after explicit reload", async () => {
  const original = setup();
  let rejectSave = true;
  vi.mocked(apiFetch).mockImplementation(async (url, init) => {
    if (url === "/api/family") return new Response("[]");
    if (init?.method === "PUT" && rejectSave)
      throw new Error("Changed on another device");
    return new Response(
      JSON.stringify({ ...original, title: "Remote edit", version: 2 }),
    );
  });
  render(<CalendarView />);
  fireEvent.click(screen.getByRole("button", { name: "Original event" }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Save Changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Event title" }), {
    target: { value: "My unsaved draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await screen.findByRole("alert");
  expect(
    (screen.getByRole("textbox", { name: "Event title" }) as HTMLInputElement)
      .value,
  ).toBe("My unsaved draft");
  const firstSave = vi
    .mocked(apiFetch)
    .mock.calls.find(([, init]) => init?.method === "PUT");
  expect(JSON.parse(String(firstSave?.[1]?.body)).version).toBe(1);
  fireEvent.click(
    screen.getByRole("button", { name: "Discard draft and load latest" }),
  );
  await waitFor(() =>
    expect(
      (screen.getByRole("textbox", { name: "Event title" }) as HTMLInputElement)
        .value,
    ).toBe("Remote edit"),
  );
  rejectSave = false;
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Save Changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Edit Event" })).toBeNull(),
  );
  const saves = vi
    .mocked(apiFetch)
    .mock.calls.filter(([, init]) => init?.method === "PUT");
  expect(JSON.parse(String(saves[1][1]?.body))).toEqual(
    expect.objectContaining({ version: 2, title: "Remote edit" }),
  );
});

it("makes series-wide deletion explicit and surfaces a stale-delete conflict", async () => {
  const series = setup("FREQ=WEEKLY");
  vi.mocked(apiFetch).mockImplementation(async (url, init) => {
    if (String(url).includes("?occurrence="))
      return new Response(
        JSON.stringify({
          series,
          occurrence: { ...series, recurrence: "" },
          key: series.start_date,
          future_recurrence: series.recurrence,
          exdates: [],
          cancelled: false,
        }),
      );
    if (init?.method === "DELETE")
      throw new Error("This event changed on another device");
    return new Response("[]");
  });
  render(<CalendarView />);
  fireEvent.click(screen.getByRole("button", { name: "Original event" }));
  fireEvent.change(await screen.findByLabelText("Apply changes to"), {
    target: { value: "series" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(
    screen.getByRole("dialog", { name: "Delete entire series" }),
  ).toBeTruthy();
  expect(screen.getByText(/This deletes every occurrence/)).toBeTruthy();
  fireEvent.click(
    within(
      screen.getByRole("dialog", { name: "Delete entire series" }),
    ).getByRole("button", { name: "Delete" }),
  );
  await waitFor(() =>
    expect(vi.mocked(apiFetch)).toHaveBeenCalledWith(
      "/api/events/1?version=1",
      { method: "DELETE" },
    ),
  );
  await waitFor(() =>
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0),
  );
  expect(screen.getByRole("dialog", { name: "Edit Event" })).toBeTruthy();
});
