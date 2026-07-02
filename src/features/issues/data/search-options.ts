import { Bug, CalendarDays, Code2, FileText, Sparkles, Tags, Users } from "lucide-react";

export const LABEL_OPTIONS = [
  { value: "help-wanted", label: "help wanted", icon: Tags },
  { value: "good-first-issue", label: "good first issue", icon: Sparkles },
  { value: "up-for-grabs", label: "up-for-grabs", icon: Users },
  { value: "first-timers-only", label: "first-timers-only", icon: Code2 },
  { value: "hacktoberfest", label: "hacktoberfest", icon: CalendarDays },
  { value: "bug", label: "bug", icon: Bug },
  { value: "documentation", label: "documentation", icon: FileText },
];

export const TECH_EXAMPLES = [
  "Java",
  "Spring Boot",
  "React",
  "Python",
  "Kubernetes",
];

export const GITHUB_LABELS: Record<string, string> = {
  "help-wanted": "help wanted",
  "help wanted": "help wanted",
  "good-first-issue": "good first issue",
  "good first issue": "good first issue",
  "up-for-grabs": "up-for-grabs",
  "first-timers-only": "first-timers-only",
  hacktoberfest: "hacktoberfest",
  bug: "bug",
  documentation: "documentation",
};

export const LANGUAGE_ALIASES: Record<string, string> = {
  csharp: "C#",
  "c#": "C#",
  cpp: "C++",
  "c++": "C++",
  go: "Go",
  golang: "Go",
  java: "Java",
  javascript: "JavaScript",
  python: "Python",
  ruby: "Ruby",
  rust: "Rust",
  typescript: "TypeScript",
};

export const TOPIC_ALIASES: Record<string, { topic: string; language?: string }> = {
  angular: { topic: "angular", language: "TypeScript" },
  kubernetes: { topic: "kubernetes", language: "Go" },
  next: { topic: "nextjs", language: "TypeScript" },
  "next.js": { topic: "nextjs", language: "TypeScript" },
  nextjs: { topic: "nextjs", language: "TypeScript" },
  node: { topic: "nodejs", language: "JavaScript" },
  "node.js": { topic: "nodejs", language: "JavaScript" },
  nodejs: { topic: "nodejs", language: "JavaScript" },
  react: { topic: "react", language: "TypeScript" },
  "spring boot": { topic: "spring-boot", language: "Java" },
  springboot: { topic: "spring-boot", language: "Java" },
  vue: { topic: "vue", language: "TypeScript" },
};

export const SORT_OPTIONS = [
  { value: "updated", label: "Recently updated" },
  { value: "comments", label: "Most comments" },
  { value: "created", label: "Newest" },
];

export const GITHUB_SORTS = new Set(SORT_OPTIONS.map((option) => option.value));

export const LINKED_PR_OPTIONS = [
  { value: "any", label: "Any linked PRs" },
  { value: "yes", label: "Linked PR: Yes" },
  { value: "no", label: "Linked PR: No" },
];

export const LINKED_PR_FILTERS = new Set(
  LINKED_PR_OPTIONS.map((option) => option.value),
);

export const HACKTOBERFEST_OPTIONS = [
  { value: "any", label: "All issues" },
  { value: "only", label: "Hacktoberfest ready" },
];

export const HACKTOBERFEST_FILTERS = new Set(
  HACKTOBERFEST_OPTIONS.map((option) => option.value),
);
