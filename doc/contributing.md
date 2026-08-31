# Development and contributing

## Workflow

Create a focused branch from the latest default branch and keep unrelated changes out of the pull request. The repository commonly uses names such as:

```text
feature/descriptiveFeatureName
bugfix/descriptiveBugName
fix/descriptiveFixName
```

Before submitting a change, run:

```bash
npm run lint
npm test
npm run test:coverage
npm run build
```

The test suite uses Vitest. Coverage thresholds are configured in `vitest.config.ts`, and SonarQube Cloud consumes `coverage/lcov.info`.

## Project structure

| Path | Responsibility |
| --- | --- |
| `src/app/` | App Router pages, metadata, and API routes |
| `src/components/` | Shared application and UI components |
| `src/features/issues/` | Issue-search UI, ranking, persistence, types, and GitHub integration |
| `src/lib/` | Authentication, database client, and database schema |
| `db/migrations/` | Ordered Turso SQL migrations |
| `src/app/api/cron/` | Protected scheduled jobs |
| `tests/` | Unit, component, and route-handler tests |

## Database changes

Database changes must update the Drizzle schema, architecture documentation,
and a new ordered SQL migration. Migrations may be public because they describe
structure, not credentials. Never include tokens, secrets, or production records
in them.

## Testing guidance

Test meaningful behavior: validation, authorization, data transformation, error handling, and user actions. Exclude only declarative framework wiring or generated code that contains no application decisions. Keep Vitest and Sonar coverage exclusions aligned.

## Pull requests

Use a concise summary, list behavior and database changes, include verification results, and link the relevant issue with `Closes #<number>` when appropriate. Signed and SSH/GPG-verified commits can be created with:

```bash
git commit -s -S -m "type: concise description"
```
