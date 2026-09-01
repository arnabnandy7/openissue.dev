import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchResponse } from "@/features/issues/types/search";

const { searchGitHubIssues, createTransport, sendMail } = vi.hoisted(() => ({
  searchGitHubIssues: vi.fn(),
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/issues/server/github-search", () => ({ searchGitHubIssues }));
vi.mock("nodemailer", () => ({
  default: { createTransport },
}));

import {
  buildWeeklyDigest,
  getDigestSearchKey,
  getWeekStart,
  sendWeeklyDigest,
} from "@/features/issues/server/weekly-digest";

const savedSearch = {
  id: "saved-1",
  name: "React & docs",
  tech: "React",
  label: "documentation",
  sort: "updated",
  linkedPr: "any",
  hacktoberfest: "any",
  responsiveness: "responsive",
  readiness: "ready",
  createdAt: "2026-08-19T00:00:00.000Z",
};

function response(): SearchResponse {
  return {
    query: "React",
    totalCount: 1,
    candidateCount: 1,
    rateLimitRemaining: "100",
    tokenConfigured: true,
    page: 1,
    issues: [
      {
        id: "issue-1",
        title: "Improve <docs>",
        url: "https://github.com/acme/repo/issues/1",
        repo: "acme/repo",
        repoUrl: "https://github.com/acme/repo",
        stars: 10,
        comments: 0,
        labels: ["documentation"],
        updatedAt: "2026-08-20T00:00:00.000Z",
        createdAt: "2026-08-19T00:00:00.000Z",
        assigned: false,
        linkedPrCount: 0,
        hacktoberfest: false,
        hacktoberfestSource: null,
        qualityScore: 80,
        repositoryHealth: { score: 80, label: "active", signals: [] },
        repositoryResponsiveness: {
          status: "responsive",
          sampleDays: 90,
          sampleSize: 6,
          signals: ["Median first maintainer response: 1 day"],
        },
      },
    ],
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("weekly digest", () => {
  it("builds escaped recommendations and saved-search links", async () => {
    searchGitHubIssues.mockResolvedValue(response());

    const digest = await buildWeeklyDigest(
      [savedSearch],
      "https://openissue.dev/",
      new Map(),
      new Date("2026-08-17T00:00:00.000Z"),
    );

    expect(digest.issueCount).toBe(1);
    expect(digest.html).toContain("Improve &lt;docs&gt;");
    expect(digest.html).toContain("tech=React");
    expect(digest.html).toContain("readiness=ready");
    expect(digest.html).toContain("React &amp; docs");
    expect(digest.html).toContain("baseline recorded");
    expect(digest.html).toContain("Responsive maintainer responsiveness");
    expect(digest.html).toContain("6 samples over 90 days");
    expect(digest.html).toContain("80 quality");
    expect(digest.html).toContain("80 active health");
    expect(digest.html).toContain(
      "Leading recommendation source: acme/repo (1)",
    );
    expect(searchGitHubIssues).toHaveBeenCalledWith(
      expect.objectContaining({
        updatedAfter: "2026-08-17",
        updatedBefore: "2026-08-23",
        responsiveness: "responsive",
        readiness: "ready",
      }),
    );
  });

  it("compares GitHub activity with the previous weekly snapshot", async () => {
    searchGitHubIssues.mockResolvedValue(response());
    const weekStart = new Date("2026-08-24T00:00:00.000Z");
    const searchKey = JSON.stringify({
      tech: "react",
      label: "documentation",
      sort: "updated",
      linkedPr: "any",
      hacktoberfest: "any",
      experience: "any",
      contributionType: "any",
      scope: "any",
      responsiveness: "responsive",
      readiness: "ready",
    });

    const digest = await buildWeeklyDigest(
      [savedSearch],
      "https://openissue.dev/",
      new Map([
        [
          searchKey,
          {
            searchKey,
            weekStart: new Date("2026-08-17T00:00:00.000Z"),
            issueCount: 0,
            topRepository: null,
            topRepositoryIssueCount: 0,
          },
        ],
      ]),
      weekStart,
    );

    expect(digest.html).toContain("up 1 from last week");
  });

  it("renders empty results using the default completed week", async () => {
    searchGitHubIssues.mockResolvedValue({
      ...response(),
      totalCount: 0,
      candidateCount: 0,
      issues: [],
    });

    const digest = await buildWeeklyDigest([savedSearch], "https://openissue.dev/");
    expect(digest.issueCount).toBe(0);
    expect(digest.html).toContain("No new matching issues this week.");
    expect(digest.html).toContain("No repository trend yet.");
    expect(digest.html).not.toContain("Leading recommendation source:");
    expect(getWeekStart(new Date("2026-08-23T18:00:00Z"))).toEqual(
      new Date("2026-08-17T00:00:00.000Z"),
    );
    expect(getDigestSearchKey({ ...savedSearch, tech: " React " })).toContain(
      '"tech":"react"',
    );
    expect(getDigestSearchKey(savedSearch)).toContain('"readiness":"ready"');
  });

  it("shows unknown responsiveness when older issue data has no analytics", async () => {
    const issueWithoutResponsiveness = { ...response().issues[0] };
    delete issueWithoutResponsiveness.repositoryResponsiveness;
    delete issueWithoutResponsiveness.contributionReadiness;
    searchGitHubIssues.mockResolvedValue({
      ...response(),
      issues: [issueWithoutResponsiveness],
    });

    const digest = await buildWeeklyDigest([savedSearch], "https://openissue.dev/");

    expect(digest.html).toContain("80 quality");
    expect(digest.html).toContain("Readiness unknown");
    expect(digest.html).toContain("Unknown maintainer responsiveness");
    expect(digest.html).not.toContain("0 samples over 90 days");
  });

  it("shows non-ready classifications and unknown repository health", async () => {
    searchGitHubIssues.mockResolvedValue({
      ...response(),
      issues: [{
        ...response().issues[0],
        repositoryHealth: {
          score: null,
          label: "unknown",
          signals: ["Repository metadata unavailable"],
        },
        contributionReadiness: {
          score: 55,
          status: "ask",
          signals: ["Ask the maintainer before starting"],
          documentation: {
            readme: null,
            contributing: null,
            license: null,
            codeOfConduct: null,
            issueTemplate: null,
            pullRequestTemplate: null,
          },
        },
      }],
    });

    const digest = await buildWeeklyDigest([savedSearch], "https://openissue.dev/");

    expect(digest.html).toContain("ask");
    expect(digest.html).toContain("Health unknown");
  });

  it("reports down and steady trends and keeps the higher-ranked duplicate", async () => {
    const lowerRankedDuplicate = {
      ...response().issues[0],
      qualityScore: 20,
      repositoryHealth: { score: 20, label: "stale", signals: [] },
    };
    const secondSearch = {
      ...savedSearch,
      id: "saved-2",
      name: "Second search",
      tech: "TypeScript",
    };
    searchGitHubIssues
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce({
        ...response(),
        totalCount: 1,
        issues: [lowerRankedDuplicate],
      });
    const firstKey = getDigestSearchKey(savedSearch);
    const secondKey = getDigestSearchKey(secondSearch);

    const digest = await buildWeeklyDigest(
      [savedSearch, secondSearch],
      "https://openissue.dev/",
      new Map([
        [
          firstKey,
          {
            searchKey: firstKey,
            weekStart: new Date("2026-08-10T00:00:00Z"),
            issueCount: 3,
            topRepository: "acme/repo",
            topRepositoryIssueCount: 1,
          },
        ],
        [
          secondKey,
          {
            searchKey: secondKey,
            weekStart: new Date("2026-08-10T00:00:00Z"),
            issueCount: 1,
            topRepository: "acme/repo",
            topRepositoryIssueCount: 1,
          },
        ],
      ]),
      new Date("2026-08-17T00:00:00Z"),
    );

    expect(digest.issueCount).toBe(1);
    expect(digest.html).toContain("down 2 from last week");
    expect(digest.html).toContain("steady from last week");
  });

  it("sends through configured Gmail SMTP", async () => {
    vi.stubEnv("SMTP_USER", "openissue.project@gmail.com");
    vi.stubEnv("SMTP_APP_PASSWORD", "app-password");
    vi.stubEnv(
      "DIGEST_FROM_EMAIL",
      "OpenIssue.dev <openissue.project@gmail.com>",
    );
    createTransport.mockReturnValue({ sendMail });
    sendMail.mockResolvedValue(undefined);

    await sendWeeklyDigest({
      to: "user@example.com",
      subject: "Digest",
      html: "<p>Hi</p>",
    });

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: "openissue.project@gmail.com",
        pass: "app-password",
      },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: "OpenIssue.dev <openissue.project@gmail.com>",
      to: "user@example.com",
      subject: "Digest",
      html: expect.stringContaining(
        "add <strong style=\"color:#9ca3af;\">openissue.project@gmail.com</strong> to your address book",
      ),
      text: expect.stringMatching(
        /add\s+openissue\.project@gmail\.com to your address book/,
      ),
      envelope: {
        from: "openissue.project@gmail.com",
        to: "user@example.com",
      },
      headers: {
        "Auto-Submitted": "auto-generated",
        "X-Auto-Response-Suppress": "All",
      },
    });
  });

  it("rejects a From address that differs from the authenticated Gmail account", async () => {
    vi.stubEnv("SMTP_USER", "openissue.project@gmail.com");
    vi.stubEnv("SMTP_APP_PASSWORD", "app-password");
    vi.stubEnv("DIGEST_FROM_EMAIL", "OpenIssue.dev <alerts@example.com>");

    await expect(
      sendWeeklyDigest({
        to: "recipient@example.com",
        subject: "Digest",
        html: "<p>Digest</p>",
      }),
    ).rejects.toThrow(
      "Digest sender must match the authenticated Gmail account.",
    );
    expect(createTransport).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, "password", "sender@example.com"],
    ["user@example.com", undefined, "sender@example.com"],
    ["user@example.com", "password", undefined],
  ])("rejects incomplete SMTP configuration", async (user, password, from) => {
    if (user) vi.stubEnv("SMTP_USER", user);
    if (password) vi.stubEnv("SMTP_APP_PASSWORD", password);
    if (from) vi.stubEnv("DIGEST_FROM_EMAIL", from);

    await expect(
      sendWeeklyDigest({
        to: "recipient@example.com",
        subject: "Digest",
        html: "<p>Digest</p>",
      }),
    ).rejects.toThrow("Weekly digest email is not configured.");
  });
});
