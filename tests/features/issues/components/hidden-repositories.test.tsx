// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HiddenRepositories } from "@/features/issues/components/hidden-repositories";

const fetchMock = vi.fn();
globalThis.fetch = fetchMock;

describe("HiddenRepositories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state initially", () => {
    fetchMock.mockReturnValue(new Promise(() => {})); // Never resolves
    render(<HiddenRepositories />);
    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("renders empty state", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ repositories: [] }),
    });
    render(<HiddenRepositories />);
    await waitFor(() => {
      expect(screen.getByText("You have not hidden any repositories.")).toBeDefined();
    });
  });

  it("renders the empty state when loading repositories fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("network failure"));

    render(<HiddenRepositories />);

    expect(
      await screen.findByText("You have not hidden any repositories."),
    ).toBeDefined();
    expect(consoleError).toHaveBeenCalledWith(expect.any(Error));

    consoleError.mockRestore();
  });

  it("renders the empty state for a non-OK repository response", async () => {
    fetchMock.mockResolvedValue({ ok: false });

    render(<HiddenRepositories />);

    expect(
      await screen.findByText("You have not hidden any repositories."),
    ).toBeDefined();
  });

  it("does not update state after unmounting", async () => {
    let resolveFetch: ((value: unknown) => void) | undefined;
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const view = render(<HiddenRepositories />);
    view.unmount();
    resolveFetch?.({
      ok: true,
      json: async () => ({ repositories: [] }),
    });

    await Promise.resolve();
    await Promise.resolve();
  });

  it("renders repositories and handles unhide", async () => {
    fetchMock.mockImplementation((url, init) => {
      if (url === "/api/hidden-repositories" && !init) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            repositories: [{ id: "1", repositoryFullName: "acme/repo", createdAt: "" }],
          }),
        });
      }
      if (init?.method === "DELETE") {
        return Promise.resolve({ ok: true });
      }
      return Promise.resolve({ ok: false });
    });

    render(<HiddenRepositories />);
    
    await waitFor(() => {
      expect(screen.getByText("acme/repo")).toBeDefined();
    });

    const user = userEvent.setup();
    const unhideBtn = screen.getByRole("button", { name: "Unhide" });
    await user.click(unhideBtn);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/hidden-repositories?repositoryFullName=acme%2Frepo"),
      expect.objectContaining({ method: "DELETE" })
    );

    await waitFor(() => {
      expect(screen.queryByText("acme/repo")).toBeNull();
    });
  });

  it("keeps a repository visible when unhide fails", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          repositories: [{ id: "1", repositoryFullName: "acme/repo", createdAt: "" }],
        }),
      })
      .mockResolvedValueOnce({ ok: false });

    render(<HiddenRepositories />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Unhide" }));

    expect(screen.getByText("acme/repo")).toBeDefined();
  });

  it("keeps a repository visible when the unhide request rejects", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          repositories: [{ id: "1", repositoryFullName: "acme/repo", createdAt: "" }],
        }),
      })
      .mockRejectedValueOnce(new Error("network failure"));

    render(<HiddenRepositories />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Unhide" }));

    expect(screen.getByText("acme/repo")).toBeDefined();
    expect(consoleError).toHaveBeenCalledWith(expect.any(Error));

    consoleError.mockRestore();
  });
});
