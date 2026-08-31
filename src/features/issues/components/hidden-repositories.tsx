import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type HiddenRepo = { id: string; repositoryFullName: string; createdAt: string };

export function HiddenRepositories() {
  const [repos, setRepos] = useState<HiddenRepo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/hidden-repositories')
      .then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          if (!cancelled) setRepos(data.repositories);
        }
      })
      .catch((error) => console.error(error))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUnhide(repoName: string) {
    try {
      const response = await fetch(`/api/hidden-repositories?repositoryFullName=${encodeURIComponent(repoName)}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setRepos(repos.filter(r => r.repositoryFullName !== repoName));
      }
    } catch (e) {
      console.error(e);
    }
  }

  if (loading) return <div>Loading...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hidden Repositories</CardTitle>
      </CardHeader>
      <CardContent>
        {repos.length === 0 ? (
          <p className='text-sm text-muted-foreground'>You have not hidden any repositories.</p>
        ) : (
          <ul className='space-y-4'>
            {repos.map(repo => (
              <li key={repo.id} className='flex items-center justify-between border-b pb-2 last:border-0 last:pb-0'>
                <span className='font-medium'>{repo.repositoryFullName}</span>
                <Button variant='outline' size='sm' onClick={() => handleUnhide(repo.repositoryFullName)}>Unhide</Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
