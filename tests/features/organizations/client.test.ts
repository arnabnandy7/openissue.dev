import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchOrganizationData,
  OrganizationClientError,
} from "@/features/organizations/client";

afterEach(() => vi.unstubAllGlobals());

describe("fetchOrganizationData", () => {
  it("returns json data on successful response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchOrganizationData<{ ok: boolean }>("/api/test");
    expect(data).toEqual({ ok: true });
  });

  it("extracts error message and retry-after header on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Rate limited" }), {
        status: 429,
        headers: { "Retry-After": "45" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchOrganizationData("/api/test")).rejects.toThrow(
      "Rate limited",
    );

    try {
      await fetchOrganizationData("/api/test");
    } catch (err) {
      expect(err).toBeInstanceOf(OrganizationClientError);
      expect((err as OrganizationClientError).retryAfter).toBe(45);
    }
  });

  it("handles non-JSON error responses gracefully", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("Internal server error", {
        status: 500,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchOrganizationData("/api/test")).rejects.toThrow(
      "Request failed (500)",
    );
  });

  it("handles JSON error responses without error field", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "Something broke" }), {
        status: 500,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchOrganizationData("/api/test")).rejects.toThrow(
      "Request failed (500)",
    );
  });
});
