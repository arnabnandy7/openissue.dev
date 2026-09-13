import type {
  PullRequest,
  PullRequestDetails,
  PullRequestReview,
} from "./types";

export type ReadinessSignal = {
  label: string;
  points: number | null;
  maximum: number;
  reason: string;
};

export type PullRequestScore = {
  minimum: number | null;
  maximum: number | null;
  coverage: number;
  label:
    | "Ready"
    | "Needs attention"
    | "Blocked"
    | "Draft"
    | "Partial"
    | "Not applicable";
  signals: ReadinessSignal[];
  explanation: string;
};

const REVIEW_POINTS: Record<string, number> = {
  APPROVED: 30,
  REVIEW_REQUIRED: 10,
  CHANGES_REQUESTED: 0,
};
const CHECK_POINTS: Record<string, number> = {
  SUCCESS: 25,
  PENDING: 5,
  EXPECTED: 5,
  FAILURE: 0,
  ERROR: 0,
};

function decisionSignal(
  label: string,
  value: string | null | undefined,
  points: Record<string, number>,
  maximum: number,
  unknownReason: string,
): ReadinessSignal {
  if (!value || !Object.hasOwn(points, value))
    return { label, points: null, maximum, reason: unknownReason };
  return {
    label,
    points: points[value],
    maximum,
    reason: value.replaceAll("_", " ").toLowerCase(),
  };
}

function conflictSignal(
  mergeable: boolean | null | undefined,
): ReadinessSignal {
  if (mergeable == null)
    return {
      label: "Merge conflicts",
      points: null,
      maximum: 15,
      reason: "Mergeability unknown",
    };
  return {
    label: "Merge conflicts",
    points: mergeable ? 15 : 0,
    maximum: 15,
    reason: mergeable
      ? "No merge conflicts reported"
      : "Merge conflicts reported",
  };
}

function sizeSignal(
  changes: PullRequestDetails | null | undefined,
): ReadinessSignal {
  if (
    !changes ||
    ![changes.additions, changes.deletions, changes.changedFiles].every(
      (value) => Number.isFinite(value) && value >= 0,
    )
  ) {
    return {
      label: "Review size",
      points: null,
      maximum: 10,
      reason: "Change size unknown",
    };
  }
  const lines = changes.additions + changes.deletions;
  let points = 0;
  if (lines <= 200 && changes.changedFiles <= 5) points = 10;
  else if (lines <= 1000 && changes.changedFiles <= 20) points = 5;
  return {
    label: "Review size",
    points,
    maximum: 10,
    reason: `${changes.changedFiles} files and ${lines} changed lines; smaller changes are easier to review`,
  };
}

function readinessCap(status: PullRequest["status"], blocked: boolean) {
  if (status === "draft")
    return {
      value: 39,
      explanation:
        "Draft readiness is capped at 39 until the author marks it ready for review.",
    };
  if (blocked)
    return {
      value: 49,
      explanation:
        "Changes requested, failing checks, or merge conflicts cap readiness at 49.",
    };
  return {
    value: 100,
    explanation:
      "Readiness estimates review progress and effort; it does not judge code quality or guarantee a merge.",
  };
}

function scoreLabel(
  status: PullRequest["status"],
  blocked: boolean,
  unknown: number,
  minimum: number,
): PullRequestScore["label"] {
  if (status === "draft") return "Draft";
  if (blocked) return "Blocked";
  if (unknown > 0) return "Partial";
  return minimum >= 80 ? "Ready" : "Needs attention";
}

export function scorePullRequest(
  status: PullRequest["status"],
  review?: PullRequestReview | null,
  details?: PullRequestDetails | null,
): PullRequestScore {
  if (status === "closed" || status === "merged") {
    return {
      minimum: null,
      maximum: null,
      coverage: 0,
      label: "Not applicable",
      signals: [],
      explanation:
        "Readiness applies to active PRs. A completed PR is not scored as a new review opportunity.",
    };
  }

  const changes = details ?? review?.details;
  const signals: ReadinessSignal[] = [
    {
      label: "PR state",
      points: status === "draft" ? 0 : 20,
      maximum: 20,
      reason: status === "draft" ? "Still a draft" : "Open and not a draft",
    },
    decisionSignal(
      "Review",
      review?.reviewDecision,
      REVIEW_POINTS,
      30,
      "Review decision unknown",
    ),
    decisionSignal(
      "CI checks",
      review?.checks,
      CHECK_POINTS,
      25,
      "Check status unknown",
    ),
    conflictSignal(changes?.mergeable),
    sizeSignal(changes),
  ];
  const blocked =
    review?.reviewDecision === "CHANGES_REQUESTED" ||
    review?.checks === "FAILURE" ||
    review?.checks === "ERROR" ||
    changes?.mergeable === false;
  const cap = readinessCap(status, blocked);
  const earned = signals.reduce((sum, signal) => sum + (signal.points ?? 0), 0);
  const unknown = signals.reduce(
    (sum, signal) => sum + (signal.points === null ? signal.maximum : 0),
    0,
  );
  const minimum = Math.min(cap.value, earned);
  const maximum = Math.min(cap.value, earned + unknown);
  const label = scoreLabel(status, blocked, unknown, minimum);
  return {
    minimum,
    maximum,
    coverage: 100 - unknown,
    label,
    signals,
    explanation: cap.explanation,
  };
}
