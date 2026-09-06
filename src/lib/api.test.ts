import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api";

describe("account request boundaries", () => {
  let events: EventTarget;
  beforeEach(() => {
    events = new EventTarget();
    vi.stubGlobal("window", events);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("retains conflict status for callers without expiring the session", async () => {
    const expired = vi.fn();
    events.addEventListener("session-expired", expired);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: "Changed elsewhere" }), {
            status: 409,
          }),
        ),
    );
    await expect(
      apiFetch("/api/events/1", { method: "PUT" }),
    ).rejects.toMatchObject({ status: 409, message: "Changed elsewhere" });
    expect(expired).not.toHaveBeenCalled();
  });

  it("adds CSRF protection to same-origin account changes", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await apiFetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const headers = fetch.mock.calls[0][1].headers as Headers;
    expect(headers.get("X-MyLight-Request")).toBe("1");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("does not sign out a valid session after an incorrect confirmation password", async () => {
    const expired = vi.fn();
    events.addEventListener("session-expired", expired);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: "Current password is incorrect" }),
            { status: 403 },
          ),
        ),
    );
    await expect(
      apiFetch("/api/account/password", { method: "POST" }),
    ).rejects.toThrow("Current password is incorrect");
    expect(expired).not.toHaveBeenCalled();
  });

  it("clears a revoked account or display session on the next protected request", async () => {
    const expired = vi.fn();
    events.addEventListener("session-expired", expired);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 401 })),
    );
    await expect(apiFetch("/api/device")).rejects.toThrow();
    expect(expired).toHaveBeenCalledOnce();
  });

  it("does not send the MyLight protection header to an external service", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await apiFetch("https://example.test/api/data");
    expect(
      (fetch.mock.calls[0][1].headers as Headers).has("X-MyLight-Request"),
    ).toBe(false);
  });
});
