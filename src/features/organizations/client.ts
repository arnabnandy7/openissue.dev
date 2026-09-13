export class OrganizationClientError extends Error {
  retryAfter: number | null;

  constructor(message: string, retryAfter: number | null = null) {
    super(message);
    this.name = "OrganizationClientError";
    this.retryAfter = retryAfter;
  }
}

export async function fetchOrganizationData<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const retryHeader = response.headers.get("Retry-After");
    const retryAfter = retryHeader ? Number.parseInt(retryHeader, 10) : null;
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Use fallback
    }
    throw new OrganizationClientError(message, retryAfter);
  }
  return response.json() as Promise<T>;
}
