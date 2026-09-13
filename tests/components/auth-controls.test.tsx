// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { signIn, signOut, useSession } = vi.hoisted(() => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: { social: signIn },
    signOut,
    useSession,
  },
}));

vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

import { AuthControls } from "@/components/auth-controls";

beforeEach(() => {
  signIn.mockReset();
  signOut.mockReset();
  useSession.mockReset();
});

afterEach(cleanup);

describe("AuthControls", () => {
  it("shows a disabled loading state", () => {
    useSession.mockReturnValue({ data: null, isPending: true });

    render(<AuthControls />);

    expect(
      (screen.getByRole("button", {
        name: "Loading account…",
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("starts GitHub sign-in for a signed-out user", () => {
    useSession.mockReturnValue({ data: null, isPending: false });

    render(<AuthControls />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in with GitHub" }));

    expect(signIn).toHaveBeenCalledWith({
      provider: "github",
      callbackURL: "/",
    });
  });

  it("shows the signed-in user and signs out", () => {
    useSession.mockReturnValue({
      data: {
        user: {
          name: "Octo Cat",
          image: "https://avatars.githubusercontent.com/u/1?v=4",
        },
      },
      isPending: false,
    });

    render(<AuthControls />);

    expect(screen.getByText("Octo Cat")).toBeTruthy();
    expect(screen.getByRole("presentation").getAttribute("src")).toBe(
      "https://avatars.githubusercontent.com/u/1?v=4",
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("renders a signed-in user without an avatar", () => {
    useSession.mockReturnValue({
      data: { user: { name: "No Avatar", image: null } },
      isPending: false,
    });

    render(<AuthControls />);

    expect(screen.getByText("No Avatar")).toBeTruthy();
    expect(screen.queryByRole("presentation")).toBeNull();
    expect(screen.queryByRole("button", { name: "Admin Console" })).toBeNull();
  });

  it("renders an Admin Console button when user has admin role", () => {
    useSession.mockReturnValue({
      data: {
        user: {
          name: "Admin User",
          role: "admin",
          image: null,
        },
      },
      isPending: false,
    });

    render(<AuthControls />);

    const adminButton = screen.getByRole("button", { name: "Admin Console" });
    expect(adminButton).toBeTruthy();
    expect(screen.getByText("Admin")).toBeTruthy();
  });
});
