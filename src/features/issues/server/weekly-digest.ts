import "server-only";

import { convert } from "html-to-text";
import nodemailer from "nodemailer";
import type { Issue } from "@/features/issues/types/search";
import type { SavedSearch } from "@/features/issues/lib/saved-searches";
import { searchGitHubIssues } from "@/features/issues/server/github-search";

const MAX_SEARCHES_PER_DIGEST = 5;
const MAX_ISSUES_PER_SEARCH = 3;
const MAX_ISSUES_PER_DIGEST = 10;

export type DigestTrend = {
  searchKey: string;
  weekStart: Date;
  issueCount: number;
  topRepository: string | null;
  topRepositoryIssueCount: number;
};

export function getDigestSearchKey(search: SavedSearch) {
  return JSON.stringify({
    tech: search.tech.trim().toLowerCase(),
    label: search.label,
    sort: search.sort,
    linkedPr: search.linkedPr,
    hacktoberfest: search.hacktoberfest,
    experience: search.experience ?? "any",
    contributionType: search.contributionType ?? "any",
    scope: search.scope ?? "any",
    responsiveness: search.responsiveness ?? "any",
    readiness: search.readiness ?? "any",
  });
}

export function getWeekStart(date = new Date()) {
  const weekStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const daysSinceMonday = (weekStart.getUTCDay() + 6) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
  return weekStart;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function describeReadiness(issue: Issue) {
  if (!issue.contributionReadiness) return "Readiness unknown";
  if (issue.contributionReadiness.status === "ready") return "Ready to start";
  return issue.contributionReadiness.status;
}

function addAddressBookNotice(html: string, senderAddress: string) {
  const notice = `<p style="margin:20px auto;padding:0 2.5%;max-width:95%;font-size:12px;line-height:1.6;text-align:center;color:#6b7280;">To help prevent these alerts from being marked as spam, add <strong style="color:#9ca3af;">${escapeHtml(senderAddress)}</strong> to your address book.</p>`;
  const bodyEnd = html.toLowerCase().lastIndexOf("</body>");

  return bodyEnd < 0
    ? `${html}${notice}`
    : `${html.slice(0, bodyEnd)}${notice}${html.slice(bodyEnd)}`;
}

function searchUrl(baseUrl: string, search: SavedSearch) {
  const url = new URL(baseUrl);
  url.searchParams.set("tech", search.tech);
  url.searchParams.set("label", search.label);
  url.searchParams.set("sort", search.sort);
  url.searchParams.set("linkedPr", search.linkedPr);
  url.searchParams.set("hacktoberfest", search.hacktoberfest);
  url.searchParams.set("experience", search.experience ?? "any");
  url.searchParams.set("contributionType", search.contributionType ?? "any");
  url.searchParams.set("scope", search.scope ?? "any");
  url.searchParams.set("responsiveness", search.responsiveness ?? "any");
  url.searchParams.set("readiness", search.readiness ?? "any");
  return url.toString();
}

function describeTrend(change: number | null) {
  if (change === null) return "baseline recorded";
  if (change > 0) return `up ${change} from last week`;
  if (change < 0) return `down ${Math.abs(change)} from last week`;
  return "steady from last week";
}

export async function buildWeeklyDigest(
  searches: SavedSearch[],
  baseUrl: string,
  previousTrends = new Map<string, DigestTrend>(),
  weekStart = (() => {
    const start = getWeekStart();
    start.setUTCDate(start.getUTCDate() - 7);
    return start;
  })(),
): Promise<{
  subject: string;
  html: string;
  issueCount: number;
  trends: DigestTrend[];
}> {
  const selectedSearches = searches.slice(0, MAX_SEARCHES_PER_DIGEST);
  const updatedAfter = weekStart.toISOString().slice(0, 10);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const updatedBefore = weekEnd.toISOString().slice(0, 10);
  const results = await Promise.all(
    selectedSearches.map(async (search) => ({
      search,
      response: await searchGitHubIssues({
        tech: search.tech,
        label: search.label,
        sort: search.sort,
        linkedPr: search.linkedPr,
        hacktoberfest: search.hacktoberfest,
        experience: search.experience ?? "any",
        contributionType: search.contributionType ?? "any",
        scope: search.scope ?? "any",
        responsiveness: search.responsiveness ?? "any",
        readiness: search.readiness ?? "any",
        updatedAfter,
        updatedBefore,
      }),
    })),
  );
  const uniqueIssues = new Map<string, Issue>();

  for (const result of results) {
    for (const issue of result.response.issues.slice(0, MAX_ISSUES_PER_SEARCH)) {
      const current = uniqueIssues.get(issue.id);
      if (!current || current.qualityScore < issue.qualityScore) {
        uniqueIssues.set(issue.id, issue);
      }
    }
  }

  const issues = [...uniqueIssues.values()]
    .sort((left, right) => right.qualityScore - left.qualityScore)
    .slice(0, MAX_ISSUES_PER_DIGEST);
  const repositoryCounts = new Map<string, number>();

  for (const issue of issues) {
    repositoryCounts.set(issue.repo, (repositoryCounts.get(issue.repo) ?? 0) + 1);
  }

  const repositories = [...repositoryCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5);
  const trends = results.map(({ search, response }) => {
    const weeklyRepositoryCounts = new Map<string, number>();

    for (const issue of response.issues) {
      weeklyRepositoryCounts.set(
        issue.repo,
        (weeklyRepositoryCounts.get(issue.repo) ?? 0) + 1,
      );
    }

    const [topRepository, topRepositoryIssueCount] = [
      ...weeklyRepositoryCounts.entries(),
    ].sort((left, right) => right[1] - left[1])[0] ?? [null, 0];

    return {
      searchKey: getDigestSearchKey(search),
      weekStart,
      issueCount: response.totalCount,
      topRepository,
      topRepositoryIssueCount,
    } satisfies DigestTrend;
  });
  const issueItems = issues.length
    ? issues
        .map(
          (issue) => {
            const responsiveness = issue.repositoryResponsiveness;
            const status = responsiveness
              ? `${responsiveness.status[0].toUpperCase()}${responsiveness.status.slice(1)}`
              : "Unknown";
            const sample = responsiveness
              ? `, ${responsiveness.sampleSize} samples over ${responsiveness.sampleDays} days`
              : "";
            const health = issue.repositoryHealth;
            const healthText = health.score === null
              ? "Health unknown"
              : `${health.score} ${health.label} health`;
            const readiness = describeReadiness(issue);

            return `<li><a href="${escapeHtml(issue.url)}">${escapeHtml(issue.title)}</a> in ${escapeHtml(issue.repo)} — ${issue.qualityScore} quality · ${escapeHtml(readiness)} · ${escapeHtml(healthText)} · ${escapeHtml(status)} maintainer responsiveness${escapeHtml(sample)}</li>`;
          },
        )
        .join("")
    : "<li>No new matching issues this week.</li>";
  const repositoryItems = repositories.length
    ? repositories
        .map(([repository, count]) => `<li>${escapeHtml(repository)} (${count})</li>`)
        .join("")
    : "<li>No repository trend yet.</li>";
  const trendItems = selectedSearches
    .map((search, index) => {
      const trend = trends[index];
      const previous = previousTrends.get(trend.searchKey);
      const change = previous ? trend.issueCount - previous.issueCount : null;
      const comparison = describeTrend(change);
      const repository = trend.topRepository
        ? ` Leading recommendation source: ${escapeHtml(trend.topRepository)} (${trend.topRepositoryIssueCount}).`
        : "";

      return `<li><a href="${escapeHtml(searchUrl(baseUrl, search))}">${escapeHtml(search.name)}</a> — ${trend.issueCount} active opportunities; ${comparison}.${repository}</li>`;
    })
    .join("");

  return {
    subject: `${issues.length} open-source opportunities for you this week`,
    issueCount: issues.length,
    trends,
    html: `<h1>Your weekly OpenIssue.dev digest</h1><h2>Top issues</h2><ul>${issueItems}</ul><h2>Repositories appearing most often</h2><ul>${repositoryItems}</ul><h2>GitHub activity trends</h2><ul>${trendItems}</ul><p><a href="${escapeHtml(baseUrl)}">Manage or disable your weekly digest</a></p>`,
  };
}

export async function sendWeeklyDigest({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_APP_PASSWORD;
  const from = process.env.DIGEST_FROM_EMAIL;

  if (!user || !password || !from) {
    throw new Error("Weekly digest email is not configured.");
  }

  const openingBracket = from.lastIndexOf("<");
  const closingBracket = from.lastIndexOf(">");
  const fromAddress = (
    openingBracket >= 0 && closingBracket > openingBracket
      ? from.slice(openingBracket + 1, closingBracket)
      : from
  )
    .trim()
    .toLowerCase();

  if (fromAddress !== user.trim().toLowerCase()) {
    throw new Error("Digest sender must match the authenticated Gmail account.");
  }

  const htmlWithNotice = addAddressBookNotice(html, fromAddress);

  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user,
      pass: password,
    },
  });

  await transport.sendMail({
    from,
    to,
    subject,
    html: htmlWithNotice,
    text: convert(htmlWithNotice, {
      selectors: [
        { selector: "img", format: "skip" },
        { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
      ],
      wordwrap: 78,
    }),
    envelope: { from: user, to },
    headers: {
      "Auto-Submitted": "auto-generated",
      "X-Auto-Response-Suppress": "All",
    },
  });
}
