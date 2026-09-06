// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EventModal } from "./EventModal";
import { apiFetch } from "../../../lib/api";

vi.mock("../../../lib/api", () => ({ apiFetch: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("requires explicit acknowledgement before changing an existing recurring series", async () => {
  vi.mocked(apiFetch).mockResolvedValue(new Response("[]"));
  const onSave = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    render(
      <EventModal
        isOpen
        onClose={() => {}}
        onDelete={() => {}}
        onSave={onSave}
        currentEvent={{
          id: 1,
          title: "Weekly walk",
          start_date: "2026-09-05T12:00:00Z",
          recurrence: "FREQ=WEEKLY",
        }}
      />,
    ),
  );
  const save = screen.getByRole("button", {
    name: "Save entire series",
  }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  await act(async () =>
    fireEvent.submit(screen.getByLabelText("Start date").closest("form")!),
  );
  expect(onSave).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "Apply my changes to the entire series",
    }),
  );
  await act(async () => fireEvent.click(save));
  expect(onSave).toHaveBeenCalledOnce();
});

it("shows and preserves a custom RRULE instead of presenting it as non-recurring", async () => {
  vi.mocked(apiFetch).mockResolvedValue(new Response("[]"));
  const onSave = vi.fn().mockResolvedValue(undefined);
  const rule = "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE";
  await act(async () =>
    render(
      <EventModal
        isOpen
        onClose={() => {}}
        onDelete={() => {}}
        onSave={onSave}
        currentEvent={{
          id: 1,
          title: "Custom series",
          start_date: "2026-09-05T12:00:00Z",
          rrule: rule,
        }}
      />,
    ),
  );
  expect(
    (screen.getByRole("combobox", { name: "Repeat" }) as HTMLSelectElement)
      .value,
  ).toBe(rule);
  expect(
    screen.getByRole("option", { name: "Custom recurrence (preserved)" }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "Apply my changes to the entire series",
    }),
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Save entire series" })),
  );
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({ recurrence: rule }),
  );
});

it("edits an interval/count schedule, retains it after failure and can remove repetition", async () => {
  vi.mocked(apiFetch).mockResolvedValue(new Response("[]"));
  const onSave = vi
    .fn()
    .mockRejectedValueOnce(new Error("Offline"))
    .mockResolvedValue(undefined);
  await act(async () =>
    render(
      <EventModal
        isOpen
        onClose={() => {}}
        onDelete={() => {}}
        onSave={onSave}
        currentEvent={{
          id: 1,
          title: "Practice",
          start_date: "2026-09-05T12:00:00Z",
          recurrence: "FREQ=WEEKLY;INTERVAL=2;COUNT=10",
        }}
      />,
    ),
  );
  expect(
    (screen.getByLabelText("Repeat interval") as HTMLInputElement).value,
  ).toBe("2");
  expect(
    (screen.getByLabelText("Number of occurrences") as HTMLInputElement).value,
  ).toBe("10");
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "Apply my changes to the entire series",
    }),
  );
  fireEvent.change(screen.getByLabelText("Number of occurrences"), {
    target: { value: "6" },
  });
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Save entire series" })),
  );
  expect(onSave).toHaveBeenLastCalledWith(
    expect.objectContaining({ recurrence: "FREQ=WEEKLY;INTERVAL=2;COUNT=6" }),
  );
  expect(screen.getByRole("alert").textContent).toContain("Offline");
  expect(
    (screen.getByLabelText("Number of occurrences") as HTMLInputElement).value,
  ).toBe("6");
  fireEvent.change(screen.getByLabelText("Repeat"), { target: { value: "" } });
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Save entire series" })),
  );
  expect(onSave).toHaveBeenLastCalledWith(
    expect.objectContaining({ recurrence: "" }),
  );
});

it("creates an inclusive all-day cutoff and validates it before saving", async () => {
  vi.mocked(apiFetch).mockResolvedValue(new Response("[]"));
  const onSave = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    render(
      <EventModal
        isOpen
        onClose={() => {}}
        onDelete={() => {}}
        onSave={onSave}
        currentEvent={{
          id: 1,
          title: "Practice",
          start_date: "2026-09-05",
          is_all_day: true,
        }}
      />,
    ),
  );
  fireEvent.change(screen.getByLabelText("Repeat"), {
    target: { value: "DAILY" },
  });
  fireEvent.change(screen.getByLabelText("Repeat ends"), {
    target: { value: "until" },
  });
  fireEvent.change(screen.getByLabelText("Last repeat date"), {
    target: { value: "2026-09-04" },
  });
  const form = screen.getByLabelText("Start date").closest("form")!;
  await act(async () => fireEvent.submit(form));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain("on or after");
  fireEvent.change(screen.getByLabelText("Last repeat date"), {
    target: { value: "2026-09-08" },
  });
  await act(async () => fireEvent.submit(form));
  expect(onSave).toHaveBeenLastCalledWith(
    expect.objectContaining({ recurrence: "FREQ=DAILY;UNTIL=20260908" }),
  );
});

it("converts a supported cutoff when switching an existing all-day series to timed", async () => {
  vi.mocked(apiFetch).mockResolvedValue(new Response("[]"));
  const onSave = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    render(
      <EventModal
        isOpen
        onClose={() => {}}
        onDelete={() => {}}
        onSave={onSave}
        currentEvent={{
          id: 1,
          title: "Practice",
          start_date: "2026-09-05",
          is_all_day: true,
          recurrence: "FREQ=DAILY;UNTIL=20260908",
        }}
      />,
    ),
  );
  fireEvent.click(
    screen.getByRole("checkbox", {
      name: "Apply my changes to the entire series",
    }),
  );
  fireEvent.click(screen.getByRole("switch", { name: "All day" }));
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Save entire series" })),
  );
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      is_all_day: false,
      recurrence: expect.stringMatching(/^FREQ=DAILY;UNTIL=\d{8}T\d{6}Z$/),
    }),
  );
});

it("locks repeat controls during a pending save", async () => {
  vi.mocked(apiFetch).mockResolvedValue(new Response("[]"));
  let finish!: () => void;
  const onSave = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () =>
    render(
      <EventModal
        isOpen
        onClose={() => {}}
        onDelete={() => {}}
        onSave={onSave}
        currentEvent={{
          id: 1,
          title: "Practice",
          start_date: "2026-09-05",
          is_all_day: true,
        }}
      />,
    ),
  );
  fireEvent.change(screen.getByLabelText("Repeat"), {
    target: { value: "WEEKLY" },
  });
  await act(async () =>
    fireEvent.submit(screen.getByLabelText("Start date").closest("form")!),
  );
  expect(screen.getByLabelText("Repeat interval").matches(":disabled")).toBe(
    true,
  );
  expect(screen.getByLabelText("Repeat ends").matches(":disabled")).toBe(true);
  await act(async () => finish());
  expect(screen.getByLabelText("Repeat interval").matches(":disabled")).toBe(
    false,
  );
});

it("round-trips multiple participants, distinguishes duplicate names and can clear to Shared", async () => {
  vi.mocked(apiFetch).mockResolvedValue(
    new Response(
      JSON.stringify([
        { id: 1, name: "Alex" },
        { id: 2, name: "Alex" },
      ]),
    ),
  );
  const onSave = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    render(
      <EventModal
        isOpen
        onClose={() => {}}
        onDelete={() => {}}
        onSave={onSave}
        currentEvent={{
          id: 1,
          title: "Together",
          start_date: "2026-09-05T12:00:00Z",
          member_id: 1,
          member_ids: [1, 2],
        }}
      />,
    ),
  );
  expect(
    (screen.getByRole("checkbox", { name: "Alex · #1" }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  expect(
    (screen.getByRole("checkbox", { name: "Alex · #2" }) as HTMLInputElement)
      .checked,
  ).toBe(true);
  await act(async () =>
    fireEvent.submit(screen.getByLabelText("Start date").closest("form")!),
  );
  expect(onSave).toHaveBeenLastCalledWith(
    expect.objectContaining({ member_ids: [1, 2] }),
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Alex · #1" }));
  await act(async () =>
    fireEvent.submit(screen.getByLabelText("Start date").closest("form")!),
  );
  expect(onSave).toHaveBeenLastCalledWith(
    expect.objectContaining({ member_ids: [2] }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear / Shared" }));
  await act(async () =>
    fireEvent.submit(screen.getByLabelText("Start date").closest("form")!),
  );
  expect(onSave).toHaveBeenLastCalledWith(
    expect.objectContaining({ member_ids: [] }),
  );
});

it("preserves unavailable selections rather than silently dropping them", async () => {
  vi.mocked(apiFetch).mockResolvedValue(new Response("[]"));
  const onSave = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    render(
      <EventModal
        isOpen
        onClose={() => {}}
        onDelete={() => {}}
        onSave={onSave}
        currentEvent={{
          id: 1,
          title: "Legacy",
          start_date: "2026-09-05T12:00:00Z",
          member_id: 7,
        }}
      />,
    ),
  );
  expect(
    (
      screen.getByRole("checkbox", {
        name: "Unavailable member #7",
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);
  await act(async () =>
    fireEvent.submit(screen.getByLabelText("Start date").closest("form")!),
  );
  expect(onSave).toHaveBeenLastCalledWith(
    expect.objectContaining({ member_ids: [7] }),
  );
});

it("shows family loading failures and rejects malformed profile payloads", async () => {
  for (const result of [
    new Error("Offline"),
    new Response('{"unexpected":true}'),
  ]) {
    if (result instanceof Error) vi.mocked(apiFetch).mockRejectedValue(result);
    else vi.mocked(apiFetch).mockResolvedValue(result);
    await act(async () =>
      render(
        <EventModal
          isOpen
          onClose={() => {}}
          onDelete={() => {}}
          onSave={async () => {}}
          currentEvent={null}
        />,
      ),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Could not load family profiles",
    );
    expect(
      (screen.getByRole("button", { name: "Save Event" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    cleanup();
  }
});

it("round-trips an all-day event without changing dates or adding a day on edit", async () => {
  vi.mocked(apiFetch).mockResolvedValue(new Response("[]"));
  const onSave = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    render(
      <EventModal
        isOpen
        onClose={() => {}}
        onDelete={() => {}}
        onSave={onSave}
        currentEvent={{
          id: 1,
          title: "DST trip",
          start_date: "2026-03-07",
          end_date: "2026-03-10",
          is_all_day: true,
        }}
      />,
    ),
  );
  expect((screen.getByLabelText("Start date") as HTMLInputElement).value).toBe(
    "2026-03-07",
  );
  expect((screen.getByLabelText("End date") as HTMLInputElement).value).toBe(
    "2026-03-09",
  );
  await act(async () =>
    fireEvent.submit(screen.getByLabelText("Start date").closest("form")!),
  );
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      start_date: "2026-03-07",
      end_date: "2026-03-10",
      is_all_day: true,
    }),
  );
});

it("retains the one-day default when an all-day event has no stored end", async () => {
  vi.mocked(apiFetch).mockResolvedValue(new Response("[]"));
  const onSave = vi.fn().mockResolvedValue(undefined);
  await act(async () =>
    render(
      <EventModal
        isOpen
        onClose={() => {}}
        onDelete={() => {}}
        onSave={onSave}
        currentEvent={{
          id: 1,
          title: "Birthday",
          start_date: "2026-11-01",
          is_all_day: true,
        }}
      />,
    ),
  );
  expect((screen.getByLabelText("End date") as HTMLInputElement).value).toBe(
    "2026-11-01",
  );
  await act(async () =>
    fireEvent.submit(screen.getByLabelText("Start date").closest("form")!),
  );
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      start_date: "2026-11-01",
      end_date: "2026-11-02",
    }),
  );
});
