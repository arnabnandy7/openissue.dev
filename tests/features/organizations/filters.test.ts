import { describe, expect, it } from "vitest";
import {
  DEFAULT_ORGANIZATION_FILTERS,
  organizationSearchParams,
  readOrganizationFilters,
  validateOrganizationFilters,
} from "@/features/organizations/filters";

describe("organization filters", () => {
  it("reads defaults when parameters are absent or invalid", () => {
    const filters = readOrganizationFilters(new URLSearchParams(""));
    expect(filters).toEqual(DEFAULT_ORGANIZATION_FILTERS);

    const invalid = readOrganizationFilters(
      new URLSearchParams("status=bogus&sort=random&page=-5"),
    );
    expect(invalid.status).toBe("open");
    expect(invalid.sort).toBe("updated");
    expect(invalid.page).toBe(1);
  });

  it("reads valid search parameters", () => {
    const params = new URLSearchParams(
      "org=vercel&tech=TypeScript&repository=vercel/next.js&status=closed&sort=comments&page=3",
    );
    const filters = readOrganizationFilters(params);
    expect(filters).toEqual({
      org: "vercel",
      tech: "TypeScript",
      repository: "vercel/next.js",
      status: "closed",
      sort: "comments",
      page: 3,
    });
  });

  it("validates required fields and formats", () => {
    expect(
      validateOrganizationFilters({
        ...DEFAULT_ORGANIZATION_FILTERS,
        org: "",
        tech: "React",
      }),
    ).toBe("Organization is required.");

    expect(
      validateOrganizationFilters({
        ...DEFAULT_ORGANIZATION_FILTERS,
        org: "invalid org name!",
        tech: "React",
      }),
    ).toContain("alphanumeric characters or hyphens");

    expect(
      validateOrganizationFilters({
        ...DEFAULT_ORGANIZATION_FILTERS,
        org: "vercel",
        tech: "",
      }),
    ).toBe("Technology is required.");

    expect(
      validateOrganizationFilters({
        ...DEFAULT_ORGANIZATION_FILTERS,
        org: "vercel",
        tech: "React",
        repository: "other-org/some-repo",
      }),
    ).toBe('Repository must belong to the "vercel" organization.');

    expect(
      validateOrganizationFilters({
        ...DEFAULT_ORGANIZATION_FILTERS,
        org: "vercel",
        tech: "React",
        repository: "vercel/next.js",
      }),
    ).toBeNull();
  });

  it("serializes filters to URLSearchParams", () => {
    const params = organizationSearchParams({
      org: "facebook",
      tech: "React",
      repository: "react",
      status: "closed",
      sort: "created",
      page: 2,
    });
    expect(params.get("org")).toBe("facebook");
    expect(params.get("tech")).toBe("React");
    expect(params.get("repository")).toBe("react");
    expect(params.get("status")).toBe("closed");
    expect(params.get("sort")).toBe("created");
    expect(params.get("page")).toBe("2");
  });
});
