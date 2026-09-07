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
import type { Event, OccurrenceEditor } from "../../types";
vi.mock("../../lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("../../hooks/useCalendarEvents", () => ({
  useCalendarEvents: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function setup(moved = false) {
  const series: Event = {
    id: 1,
    title: "Class",
    version: 3,
    start_date: "2026-09-07T14:00:00Z",
    end_date: "2026-09-07T15:00:00Z",
    timezone: "UTC",
    recurrence: "FREQ=WEEKLY;COUNT=4",
    member_ids: [],
  };
  const editor: OccurrenceEditor = {
    series,
    occurrence: {
      ...series,
      id: moved ? 2 : 1,
      title: moved ? "Moved class" : "Class",
      start_date: moved ? "2026-10-01T16:00:00Z" : "2026-09-14T14:00:00Z",
      end_date: moved ? "2026-10-01T17:00:00Z" : "2026-09-14T15:00:00Z",
      recurrence: "",
    },
    key: "2026-09-14T14:00:00.000Z",
    future_recurrence: "FREQ=WEEKLY;COUNT=3",
    exdates: moved ? ["2026-09-14T14:00:00.000Z"] : [],
    cancelled: false,
  };
  const date = new Date();
  date.setHours(14, 0, 0, 0);
  vi.mocked(useCalendarEvents).mockReturnValue({
    members: [],
    events: [
      {
        ...(moved ? editor.occurrence : series),
        series_id: moved ? 1 : 0,
        recurrence_id: moved ? editor.key : "",
        occurrence_key: editor.key,
        original_id: moved ? 2 : 1,
        occurrenceId: "selected",
        date,
        end: new Date(+date + 3600000),
        startMinutes: 840,
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
  vi.mocked(apiFetch).mockImplementation(
    async (url) =>
      new Response(
        JSON.stringify(String(url).includes("?occurrence=") ? editor : []),
      ),
  );
  return editor;
}
async function open(title = "Class") {
  render(<CalendarView />);
  fireEvent.click(screen.getByRole("button", { name: title }));
  await screen.findByLabelText("Apply changes to");
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Save Changes",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
}
function lastSave() {
  return JSON.parse(
    String(
      vi
        .mocked(apiFetch)
        .mock.calls.filter(([, init]) => init?.method === "PUT")
        .slice(-1)[0]?.[1]?.body,
    ),
  );
}

it("defaults to only the clicked occurrence and preserves its original key after moving it", async () => {
  const editor = setup(true);
  await open("Moved class");
  expect(
    (screen.getByLabelText("Apply changes to") as HTMLSelectElement).value,
  ).toBe("occurrence");
  expect((screen.getByLabelText("Start date") as HTMLInputElement).value).toBe(
    "2026-10-01",
  );
  fireEvent.change(screen.getByLabelText("Start date"), {
    target: { value: "2026-10-02" },
  });
  fireEvent.change(screen.getByLabelText("End date"), {
    target: { value: "2026-10-02" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await waitFor(() =>
    expect(lastSave()).toEqual(
      expect.objectContaining({
        scope: "occurrence",
        occurrence: editor.key,
        version: 3,
        recurrence: "",
        start_date: "2026-10-02T16:00:00.000Z",
      }),
    ),
  );
  expect(
    vi
      .mocked(apiFetch)
      .mock.calls.find(([, init]) => init?.method === "PUT")?.[0],
  ).toBe("/api/events/1");
});
it("future edits use the remaining COUNT and require explicit scope confirmation", async () => {
  setup();
  await open();
  fireEvent.change(screen.getByLabelText("Apply changes to"), {
    target: { value: "future" },
  });
  const save = screen.getByRole("button", {
    name: "Save future occurrences",
  }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  expect((screen.getByLabelText("Start date") as HTMLInputElement).value).toBe(
    "2026-09-14",
  );
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "Apply my changes to this and future occurrences",
    }),
  );
  await waitFor(() => expect(save.disabled).toBe(false));
  fireEvent.click(save);
  await waitFor(() =>
    expect(lastSave()).toEqual(
      expect.objectContaining({
        scope: "future",
        recurrence: "FREQ=WEEKLY;COUNT=3",
        reset_exceptions: true,
      }),
    ),
  );
});
it("single cancellation sends scope and original identity after confirmation", async () => {
  const editor = setup();
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  const confirm = screen.getByRole("dialog", {
    name: "Cancel this occurrence",
  });
  expect(
    vi
      .mocked(apiFetch)
      .mock.calls.filter(([, init]) => init?.method === "DELETE"),
  ).toHaveLength(0);
  fireEvent.click(
    within(confirm).getByRole("button", { name: "Cancel occurrence" }),
  );
  await waitFor(() => {
    const call = vi
      .mocked(apiFetch)
      .mock.calls.find(([, init]) => init?.method === "DELETE");
    const url = new URL(String(call?.[0]), "http://localhost");
    expect(url.pathname).toBe("/api/events/1");
    expect(url.searchParams.get("scope")).toBe("occurrence");
    expect(url.searchParams.get("occurrence")).toBe(editor.key);
    expect(url.searchParams.get("version")).toBe("3");
  });
});
it("keeps a rejected occurrence draft until the user reloads the latest series", async () => {
  const editor = setup();
  let reads = 0;
  vi.mocked(apiFetch).mockImplementation(async (url, init) => {
    if (init?.method === "PUT") throw new Error("Changed on another device");
    if (String(url).includes("?occurrence=")) {
      reads++;
      return new Response(
        JSON.stringify(
          reads === 1
            ? editor
            : {
                ...editor,
                series: { ...editor.series, version: 4 },
                occurrence: { ...editor.occurrence, title: "Remote edit" },
              },
        ),
      );
    }
    return new Response("[]");
  });
  await open();
  fireEvent.change(screen.getByLabelText("Event title"), {
    target: { value: "My draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
  await screen.findByRole("alert");
  expect((screen.getByLabelText("Event title") as HTMLInputElement).value).toBe(
    "My draft",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Discard draft and load latest" }),
  );
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Event title") as HTMLInputElement).value,
    ).toBe("Remote edit"),
  );
  expect(
    (screen.getByLabelText("Apply changes to") as HTMLSelectElement).value,
  ).toBe("occurrence");
});
it("lets an owner restore individual changes from the series editor", async () => {
  const editor = setup(true);
  await open("Moved class");
  fireEvent.change(screen.getByLabelText("Apply changes to"), {
    target: { value: "series" },
  });
  fireEvent.click(screen.getByText(/Individual changes and cancellations/));
  fireEvent.click(screen.getByRole("button", { name: /Reset .* to series/ }));
  await waitFor(() => {
    const call = vi
      .mocked(apiFetch)
      .mock.calls.find(([, init]) => init?.method === "DELETE");
    const url = new URL(String(call?.[0]), "http://localhost");
    expect(url.searchParams.get("scope")).toBe("restore");
    expect(url.searchParams.get("occurrence")).toBe(editor.key);
  });
});
