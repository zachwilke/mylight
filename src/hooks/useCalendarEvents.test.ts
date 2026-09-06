// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { apiFetch } from "../lib/api";
import { useCalendarEvents } from "./useCalendarEvents";

vi.mock("../lib/api", () => ({ apiFetch: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const member = {
  id: 7,
  name: "Alex",
  color: null,
  avatar: null,
  stars: 0,
  phone: null,
  visible: true,
};
const start = new Date(2026, 8, 5);
const end = new Date(2026, 8, 6);
const event = {
  id: 1,
  title: "Appointment",
  member_id: 7,
  start_date: new Date(2026, 8, 5, 9).toISOString(),
};
const json = (body: unknown) => new Response(JSON.stringify(body));

it("clears stale events and reports failed recurrence expansion on refresh", async () => {
  let broken = false;
  vi.mocked(apiFetch).mockImplementation(async (url) =>
    json(
      url === "/api/family"
        ? [member]
        : [
            {
              ...event,
              ...(broken
                ? { timezone: "Mars/Olympus", recurrence: "FREQ=DAILY" }
                : {}),
            },
          ],
    ),
  );
  const { result, rerender } = renderHook(
    ({ refresh }) => useCalendarEvents(start, end, refresh),
    { initialProps: { refresh: 0 } },
  );
  await waitFor(() => expect(result.current.events).toHaveLength(1));
  broken = true;
  rerender({ refresh: 1 });
  await waitFor(() => expect(result.current.error).not.toBe(""));
  expect(result.current.events).toEqual([]);
  broken = false;
  await act(async () => result.current.retry());
  await waitFor(() => expect(result.current.events).toHaveLength(1));
  expect(result.current.error).toBe("");
});

it("returns family options and resolves unassigned, subscribed and deleted-member events as shared", async () => {
  vi.mocked(apiFetch).mockImplementation(async (url) =>
    json(
      url === "/api/family"
        ? [member]
        : [
            event,
            { ...event, id: 2, member_id: 0 },
            {
              ...event,
              id: "feed",
              member_id: undefined,
              is_external: true,
              source_name: "School",
            },
            { ...event, id: 3, member_id: 999 },
          ],
    ),
  );
  const { result } = renderHook(() => useCalendarEvents(start, end, 0));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.members).toEqual([member]);
  expect(result.current.events.map((value) => value.member.id)).toEqual([
    7, 0, 0, 0,
  ]);
  expect(result.current.events[2].member.name).toBe("School");
});

it("does not replace current family options with a superseded refresh response", async () => {
  let resolveOld!: (response: Response) => void;
  vi.mocked(apiFetch)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValueOnce(json([event]))
    .mockResolvedValueOnce(json([{ ...member, name: "Renamed Alex" }]))
    .mockResolvedValueOnce(json([event]));
  const { result, rerender } = renderHook(
    ({ refresh }) => useCalendarEvents(start, end, refresh),
    { initialProps: { refresh: 0 } },
  );
  rerender({ refresh: 1 });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => resolveOld(json([member])));
  expect(result.current.members[0].name).toBe("Renamed Alex");
  expect(result.current.events[0].member.name).toBe("Renamed Alex");
});
