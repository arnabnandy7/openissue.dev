# GitHub language names

`languages.json` is a snapshot of canonical names and aliases from
[GitHub Linguist's languages.yml](https://github.com/github-linguist/linguist/blob/main/lib/linguist/languages.yml),
retrieved September 13, 2026 (835 languages, 1,269 names and aliases).

Keys are lowercase names/aliases; values are canonical GitHub language names.
Canonical names take precedence over aliases. Existing framework mappings remain
topic searches. The bundled lookup adds no dependency or runtime network request.

To refresh, parse the upstream YAML, map each alias to its language, then map all
canonical names and sort the resulting object by key. GitHub Linguist is
[MIT licensed](https://github.com/github-linguist/linguist/blob/main/LICENSE).
