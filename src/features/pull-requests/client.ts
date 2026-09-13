export class PullRequestClientError extends Error {
  constructor(
    message: string,
    public retryAfter: number | null = null,
  ) {
    super(message);
  }
}

export async function fetchPullRequestData<T>(
  url: string,
  options: RequestInit,
): Promise<T> {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    const retryAfter =
      response.status === 429
        ? Math.max(1, Number(payload.retryAfter ?? 60) || 60)
        : null;
    throw new PullRequestClientError(
      payload.error ?? "Unable to load GitHub data.",
      retryAfter,
    );
  }
  return payload as T;
}
