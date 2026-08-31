import { eq, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { hiddenRepository } from '@/lib/auth-schema';

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const database = getDatabase();
  try {
    const repos = await database
      .select({
        id: hiddenRepository.id,
        repositoryFullName: hiddenRepository.repositoryFullName,
        createdAt: hiddenRepository.createdAt,
      })
      .from(hiddenRepository)
      .where(eq(hiddenRepository.userId, session.user.id));
      
    return Response.json({ repositories: repos });
  } catch {
    return Response.json({ error: 'Failed to fetch hidden repositories.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const repoName = url.searchParams.get('repositoryFullName');

  if (!repoName) {
    return Response.json({ error: 'Missing repositoryFullName parameter.' }, { status: 400 });
  }

  const database = getDatabase();
  try {
    await database
      .delete(hiddenRepository)
      .where(
        and(
          eq(hiddenRepository.userId, session.user.id),
          eq(hiddenRepository.repositoryFullName, repoName)
        )
      );
      
    return Response.json({ success: true });
  } catch {
    return Response.json({ error: 'Failed to unhide repository.' }, { status: 500 });
  }
}
