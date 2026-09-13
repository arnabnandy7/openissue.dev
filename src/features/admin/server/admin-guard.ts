import "server-only";

import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { admin, user } from "@/lib/auth-schema";
import { getDatabase } from "@/lib/db";

export async function checkIsAdmin(userId: string): Promise<boolean> {
  const database = getDatabase();

  const [userRow] = await database
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (userRow?.role === "admin") {
    return true;
  }

  const [adminRow] = await database
    .select({ userId: admin.userId })
    .from(admin)
    .where(eq(admin.userId, userId))
    .limit(1);

  return Boolean(adminRow);
}

export async function getAdminSession(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session) {
    return { session: null, isAdmin: false };
  }

  const isAdmin = await checkIsAdmin(session.user.id);
  return { session, isAdmin };
}
