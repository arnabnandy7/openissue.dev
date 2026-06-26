import { describe, expect, it, vi } from "vitest";
import { compactNumber, relativeDate } from "@/features/issues/lib/format";

describe("format helpers", () => {
  it("formats large numbers compactly", () => {
    expect(compactNumber(12500)).toBe("12.5K");
  });

  it("formats dates relative to now", () => {
    vi.setSystemTime(new Date("2026-06-26T12:00:00.000Z"));

    expect(relativeDate("2026-06-25T12:00:00.000Z")).toBe("yesterday");
    expect(relativeDate("2026-06-26T09:00:00.000Z")).toBe("3 hours ago");

    vi.useRealTimers();
  });
});
