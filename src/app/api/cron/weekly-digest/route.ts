import { and, eq, or } from "drizzle-orm";
import {
  deliverWeeklyDigest,
  getDigestContext,
  getRepositoryAlertSchedule,
  isRepositoryAlertDue,
} from "@/features/issues/server/digest-delivery";
import { repositoryDigestTemplate, user } from "@/lib/auth-schema";
import { getDatabase } from "@/lib/db";

const SIX_DAYS_IN_MS = 6 * 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const database = getDatabase();
  const now = new Date();
  const cutoff = new Date(now.getTime() - SIX_DAYS_IN_MS);
  const context = await getDigestContext(database);
  const recipients = await database
    .select({
      id: user.id,
      email: user.email,
      alertEmail: user.alertEmail,
      weeklyDigestLastSentAt: user.weeklyDigestLastSentAt,
    })
    .from(user)
    .leftJoin(
      repositoryDigestTemplate,
      eq(repositoryDigestTemplate.userId, user.id),
    )
    .where(
      and(
        eq(user.banned, false),
        or(
          eq(user.weeklyDigestEnabled, true),
          eq(repositoryDigestTemplate.enabled, true),
        ),
      ),
    );
  let sent = 0;
  let failed = 0;
  const baseUrl = process.env.BETTER_AUTH_URL ?? "https://openissue-dev.vercel.app";

  for (const recipient of recipients) {
    try {
      const repositorySchedule = await getRepositoryAlertSchedule(
        database,
        recipient.id,
      );
      const includeSavedSearches =
        now.getUTCDay() === 1 &&
        (!recipient.weeklyDigestLastSentAt ||
          recipient.weeklyDigestLastSentAt <= cutoff);
      const includeRepositoryAlerts = Boolean(
        repositorySchedule?.enabled &&
          isRepositoryAlertDue(
            repositorySchedule.frequency,
            repositorySchedule.lastSentAt,
            now,
          ),
      );

      if (
        (includeSavedSearches || includeRepositoryAlerts) &&
        (await deliverWeeklyDigest(database, recipient, context, baseUrl, {
          includeSavedSearches,
          includeRepositoryAlerts,
        }))
      ) {
        sent += 1;
      }
    } catch (error) {
      failed += 1;
      console.error("Unable to send weekly digest.", error);
    }
  }

  return Response.json({ recipients: recipients.length, sent, failed });
}
