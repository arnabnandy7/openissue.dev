import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { hiddenRepository, issueFeedback } from '@/lib/auth-schema';

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { repositoryFullName, issueNumber, issueUrl, reason } = await request.json();

  if (!repositoryFullName || !issueNumber || !issueUrl || !reason) {
    return Response.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const database = getDatabase();

  try {
    if (reason === 'Hide this repository') {
      await database
        .insert(hiddenRepository)
        .values({
          id: crypto.randomUUID(),
          userId: session.user.id,
          repositoryFullName,
        })
        .onConflictDoNothing();
    } else {
      await database
        .insert(issueFeedback)
        .values({
          id: crypto.randomUUID(),
          userId: session.user.id,
          repositoryFullName,
          issueNumber,
          issueUrl,
          reason,
        })
        .onConflictDoNothing();
    }

    return Response.json({ success: true });
  } catch {
    return Response.json({ error: 'Failed to save feedback.' }, { status: 500 });
  }
}