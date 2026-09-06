// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChoreChart } from "./ChoreChart";
import { apiFetch } from "../../lib/api";

vi.mock("../../lib/api", () => ({ apiFetch: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

it("reports an incompatible name-keyed response instead of silently hiding tasks", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(apiFetch).mockImplementation(
    async (path) =>
      new Response(
        JSON.stringify(
          path === "/api/chores?group_by=member_id"
            ? { Alex: [] }
            : path === "/api/family"
              ? []
              : {},
        ),
      ),
  );
  await act(async () => render(<ChoreChart />));
  expect(screen.getByRole("alert").textContent).toContain(
    "ID-based task groups",
  );
  expect(
    screen.getByRole("button", { name: "Retry task loading" }),
  ).toBeTruthy();
});

it("does not let an older reload overwrite a pending task completion", async () => {
  let resolveStale!: (response: Response) => void;
  let resolveSave!: (response: Response) => void;
  let reads = 0;
  let saved = false;
  let writes = 0;
  const chores = (completed: boolean) => ({
    "1": [
      {
        id: 1,
        title: "Feed cat",
        member_id: 1,
        time_of_day: "Morning",
        completed,
      },
    ],
  });
  const response = (value: unknown) => new Response(JSON.stringify(value));
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    if (path === "/api/chores/1/toggle") {
      writes++;
      return new Promise<Response>((resolve) => {
        resolveSave = resolve;
      });
    }
    if (path === "/api/chores?group_by=member_id") {
      reads++;
      if (reads === 2)
        return new Promise<Response>((resolve) => {
          resolveStale = resolve;
        });
      return response(chores(saved));
    }
    if (path === "/api/family")
      return response([
        { id: 1, name: "Sam", stars: saved ? 1 : 0, visible: true },
      ]);
    if (path === "/api/settings")
      return response({
        enable_confetti: "false",
        enable_major_celebration: "false",
      });
    throw new Error(`Unexpected test request ${path}`);
  });
  render(<ChoreChart />);
  const button = await screen.findByRole("button", { name: "Feed cat" });
  await act(async () => {
    window.dispatchEvent(new Event("system-update"));
  });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(writes).toBe(1);
  expect(screen.getByText("Feed cat").className).toContain("line-through");
  await act(async () => resolveStale(response(chores(false))));
  expect(screen.getByText("Feed cat").className).toContain("line-through");
  saved = true;
  await act(async () => resolveSave(response({ success: true })));
  expect(reads).toBe(3);
  expect(screen.getByText("Feed cat").className).toContain("line-through");
});

it("keeps duplicate-name task columns and star totals separate", async () => {
  let saved = false;
  const response = (value: unknown) => new Response(JSON.stringify(value));
  vi.mocked(apiFetch).mockImplementation(async (path) => {
    if (path === "/api/chores?group_by=member_id")
      return response({
        "1": [
          {
            id: 1,
            member_id: 1,
            title: "Feed cat",
            time_of_day: "Morning",
            completed: saved,
          },
        ],
        "2": [
          {
            id: 2,
            member_id: 2,
            title: "Water plants",
            time_of_day: "Morning",
            completed: false,
          },
        ],
      });
    if (path === "/api/family")
      return response([
        { id: 1, name: "Alex", stars: saved ? 3 : 2, visible: true },
        { id: 2, name: "Alex", stars: 7, visible: true },
      ]);
    if (path === "/api/settings")
      return response({
        enable_confetti: "false",
        enable_major_celebration: "false",
      });
    if (path === "/api/chores/1/toggle") {
      saved = true;
      return response({ success: true });
    }
    throw new Error(`Unexpected test request ${path}`);
  });
  await act(async () => render(<ChoreChart />));
  const first = within(
    screen.getByRole("region", { name: "Tasks for Alex · #1" }),
  );
  const second = within(
    screen.getByRole("region", { name: "Tasks for Alex · #2" }),
  );
  expect(first.queryByText("Water plants")).toBeNull();
  expect(second.queryByText("Feed cat")).toBeNull();
  expect(first.getByText("2")).toBeTruthy();
  expect(second.getByText("7")).toBeTruthy();
  await act(async () =>
    fireEvent.click(first.getByRole("button", { name: "Feed cat" })),
  );
  expect(first.getByText("3")).toBeTruthy();
  expect(second.getByText("7")).toBeTruthy();
  expect(second.getByText("Water plants").className).not.toContain(
    "line-through",
  );
});
