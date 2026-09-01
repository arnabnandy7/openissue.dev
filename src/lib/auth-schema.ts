import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  alertEmail: text("alert_email"),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  weeklyDigestEnabled: integer("weekly_digest_enabled", { mode: "boolean" })
    .default(false)
    .notNull(),
  weeklyDigestLastSentAt: integer("weekly_digest_last_sent_at", {
    mode: "timestamp_ms",
  }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("account_issuer_accountId_uidx").on(
      table.issuer,
      table.accountId,
    ),
    index("account_userId_idx").on(table.userId),
  ],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const admin = sqliteTable("admin", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

export const savedSearch = sqliteTable(
  "saved_search",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tech: text("tech").notNull(),
    label: text("label").notNull(),
    sort: text("sort").notNull(),
    linkedPr: text("linked_pr").notNull(),
    hacktoberfest: text("hacktoberfest").notNull(),
    experience: text("experience").default("any").notNull(),
    contributionType: text("contribution_type").default("any").notNull(),
    scope: text("scope").default("any").notNull(),
    responsiveness: text("responsiveness").default("any").notNull(),
    readiness: text("readiness").default("any").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("saved_search_userId_idx").on(table.userId)],
);

export const opportunity = sqliteTable(
  "opportunity",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repositoryFullName: text("repository_full_name").notNull(),
    issueNumber: integer("issue_number").notNull(),
    issueUrl: text("issue_url").notNull(),
    title: text("title").notNull(),
    savedAt: integer("saved_at", { mode: "timestamp_ms" }),
    openedAt: integer("opened_at", { mode: "timestamp_ms" }),
    workflowState: text("workflow_state").default("saved").notNull(),
    note: text("note"),
    followUpAt: integer("follow_up_at", { mode: "timestamp_ms" }),
    workflowUpdatedAt: integer("workflow_updated_at", { mode: "timestamp_ms" })
      .default(sql`0`)
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("opportunity_user_repository_issue_uidx").on(
      table.userId,
      table.repositoryFullName,
      table.issueNumber,
    ),
    index("opportunity_user_id_idx").on(table.userId),
    index("opportunity_user_workflow_state_idx").on(
      table.userId,
      table.workflowState,
    ),
  ],
);

export const digestTrendSnapshot = sqliteTable(
  "digest_trend_snapshot",
  {
    id: text("id").primaryKey(),
    searchKey: text("search_key").notNull(),
    weekStart: integer("week_start", { mode: "timestamp_ms" }).notNull(),
    issueCount: integer("issue_count").notNull(),
    topRepository: text("top_repository"),
    topRepositoryIssueCount: integer("top_repository_issue_count")
      .default(0)
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("digest_trend_snapshot_search_week_uidx").on(
      table.searchKey,
      table.weekStart,
    ),
  ],
);

export const repositoryDigestTemplate = sqliteTable(
  "repository_digest_template",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").default("Repository alerts").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).default(true).notNull(),
    frequency: text("frequency", {
      enum: ["daily", "weekly", "fortnightly"],
    })
      .default("weekly")
      .notNull(),
    lastSentAt: integer("last_sent_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("repository_digest_template_user_id_uidx").on(table.userId),
  ],
);

export const repositoryDigestRepository = sqliteTable(
  "repository_digest_repository",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id")
      .notNull()
      .references(() => repositoryDigestTemplate.id, { onDelete: "cascade" }),
    repositoryFullName: text("repository_full_name").notNull(),
    repositoryUrl: text("repository_url").notNull(),
    position: integer("position").notNull(),
    lastIssueIds: text("last_issue_ids").default("[]").notNull(),
  },
  (table) => [
    uniqueIndex("repository_digest_repository_template_repo_uidx").on(
      table.templateId,
      table.repositoryFullName,
    ),
    index("repository_digest_repository_template_position_idx").on(
      table.templateId,
      table.position,
    ),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  savedSearches: many(savedSearch),
  opportunities: many(opportunity),
  issueFeedback: many(issueFeedback),
  hiddenRepositories: many(hiddenRepository),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const savedSearchRelations = relations(savedSearch, ({ one }) => ({
  user: one(user, {
    fields: [savedSearch.userId],
    references: [user.id],
  }),
}));

export const opportunityRelations = relations(opportunity, ({ one }) => ({
  user: one(user, {
    fields: [opportunity.userId],
    references: [user.id],
  }),
}));

export const issueFeedback = sqliteTable(
  "issue_feedback",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repositoryFullName: text("repository_full_name").notNull(),
    issueNumber: integer("issue_number").notNull(),
    issueUrl: text("issue_url").notNull(),
    reason: text("reason").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("issue_feedback_user_repository_issue_uidx").on(
      table.userId,
      table.repositoryFullName,
      table.issueNumber,
    ),
    index("issue_feedback_user_id_idx").on(table.userId),
  ],
);

export const hiddenRepository = sqliteTable(
  "hidden_repository",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repositoryFullName: text("repository_full_name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("hidden_repository_user_repo_uidx").on(
      table.userId,
      table.repositoryFullName,
    ),
    index("hidden_repository_user_id_idx").on(table.userId),
  ],
);

export const issueFeedbackRelations = relations(issueFeedback, ({ one }) => ({
  user: one(user, {
    fields: [issueFeedback.userId],
    references: [user.id],
  }),
}));

export const hiddenRepositoryRelations = relations(hiddenRepository, ({ one }) => ({
  user: one(user, {
    fields: [hiddenRepository.userId],
    references: [user.id],
  }),
}));
