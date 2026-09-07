// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { apiFetch } from "../../../lib/api";
import { GoogleEventModal, type GoogleEventView } from "./GoogleEventModal";
vi.mock("../../../lib/api", () => ({ apiFetch: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const event = {
  id: "feed-1-instance",
  title: "Class",
  start_date: "2026-09-07",
  google_event_id: "instance",
  source_id: 1,
  source_name: "School",
};
const view: GoogleEventView = {
  title: "Class",
  start_date: "2026-09-07",
  end_date: "2026-09-08",
  is_all_day: true,
  description: "",
  location: "",
  etag: '"v1"',
  editable: true,
  recurring: true,
};
it("queues only the selected Google occurrence and reuses the request ID after an ambiguous response", async () => {
  const payloads: Record<string, unknown>[] = [];
  const queued = vi.fn();
  const close = vi.fn();
  vi.mocked(apiFetch).mockImplementation(async (_url, init) => {
    if (!init) return new Response(JSON.stringify(view));
    payloads.push(JSON.parse(String(init.body)));
    if (payloads.length === 1) throw new Error("Connection lost");
    return new Response(JSON.stringify({ state: "pending" }), { status: 202 });
  });
  render(<GoogleEventModal event={event} onClose={close} onQueued={queued} />);
  const title = await screen.findByLabelText("Title");
  fireEvent.change(title, { target: { value: "Library class" } });
  fireEvent.click(screen.getByRole("button", { name: "Queue Google edit" }));
  await screen.findByText(/Connection lost/);
  expect((title as HTMLInputElement).value).toBe("Library class");
  fireEvent.click(screen.getByRole("button", { name: "Queue Google edit" }));
  await waitFor(() => expect(queued).toHaveBeenCalledOnce());
  expect(payloads[0].request_id).toBe(payloads[1].request_id);
  expect(payloads[0]).toMatchObject({
    title: "Library class",
    etag: '"v1"',
    start_date: "2026-09-07",
  });
  expect(payloads[0]).not.toHaveProperty("recurrence");
  expect(close).toHaveBeenCalledOnce();
});
it("preserves exact original instants when displayed clocks are unchanged", async () => {
  const timed = {
    ...view,
    is_all_day: false,
    start_date: "2026-11-01T07:30:12.456Z",
    end_date: "2026-11-01T08:30:12.456Z",
  };
  let submitted: Record<string, unknown> = {};
  vi.mocked(apiFetch).mockImplementation(async (_url, init) => {
    if (!init) return new Response(JSON.stringify(timed));
    submitted = JSON.parse(String(init.body));
    return new Response("{}");
  });
  render(
    <GoogleEventModal event={event} onClose={vi.fn()} onQueued={vi.fn()} />,
  );
  await screen.findByLabelText("Starts");
  fireEvent.click(screen.getByRole("button", { name: "Queue Google edit" }));
  await waitFor(() => expect(submitted.start_date).toBe(timed.start_date));
  expect(submitted.end_date).toBe(timed.end_date);
});
it("offers a retry after loading fails", async () => {
  vi.mocked(apiFetch)
    .mockRejectedValueOnce(new Error("Google unavailable"))
    .mockResolvedValueOnce(new Response(JSON.stringify(view)));
  render(
    <GoogleEventModal event={event} onClose={vi.fn()} onQueued={vi.fn()} />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Retry loading appointment" }),
  );
  await screen.findByLabelText("Title");
});

it("shows inclusive all-day end dates and sends Google's exclusive end", async () => {
  let submitted: Record<string, unknown> = {};
  vi.mocked(apiFetch).mockImplementation(async (_url, init) => {
    if (!init) return new Response(JSON.stringify(view));
    submitted = JSON.parse(String(init.body));
    return new Response("{}");
  });
  render(
    <GoogleEventModal event={event} onClose={vi.fn()} onQueued={vi.fn()} />,
  );
  const end = await screen.findByLabelText("Ends");
  expect((end as HTMLInputElement).value).toBe("2026-09-07");
  fireEvent.change(end, { target: { value: "2026-09-09" } });
  fireEvent.click(screen.getByRole("button", { name: "Queue Google edit" }));
  await waitFor(() => expect(submitted.end_date).toBe("2026-09-10"));
});
