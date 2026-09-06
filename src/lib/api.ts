export class APIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "APIError";
  }
}

/** Same-origin API requests use cookie sessions and a CSRF protection header. */
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const local = typeof input === "string" && input.startsWith("/api/");
  const headers = new Headers(init.headers);
  if (local) headers.set("X-MyLight-Request", "1");
  try {
    const response = await fetch(input, { ...init, headers });
    if (local && !response.ok) {
      if (response.status === 401 && input !== "/api/login") {
        window.dispatchEvent(new Event("session-expired"));
      }
      const body = await response
        .clone()
        .json()
        .catch(() => null);
      throw new APIError(
        body?.error || `Request failed (${response.status})`,
        response.status,
      );
    }
    return response;
  } catch (error) {
    if (
      local &&
      !["/api/session", "/api/login", "/api/setup"].includes(String(input))
    ) {
      window.dispatchEvent(
        new CustomEvent("api-error", {
          detail:
            error instanceof Error
              ? error.message
              : "Could not connect. Please try again.",
        }),
      );
    }
    throw error;
  }
}
