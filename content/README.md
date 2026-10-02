# Site content

Every word the site shows comes from the JSON files in this folder. To make the site yours,
edit these files and nothing else. They are validated against the content model in
`libs/content/domain` when the tests run and when the site loads; an invalid file fails with a
message naming the file, the field and the problem, for example:

```text
content/resume.json → items[0].period.start: expected a month as YYYY-MM, got "2024-13"
```

The shipped values are the site owner's real profile. **Forking?** Don't edit them in place:
`npm run template:reset` swaps in the neutral sample from `content.example/` (a fictional "Sam
Reef", validated by the tests), then make it yours (`docs/template.md`).

| File              | Holds                                                              |
| ----------------- | ------------------------------------------------------------------ |
| `site.json`       | `profile` (name, headline, bio, location, avatar, skills, links) and `copy` (overlay titles, button labels, the page's `<title>` and description, and the Bureau's lines that name you) |
| `resume.json`     | `items`: experience entries, newest first                          |
| `services.json`   | `items`: services, each with a playful `menuName` and a real `title` |
| `projects.json`   | `items`: work you showcase: `title`, `summary`, optional `description`, `highlights`, `role`, `period`, `tech`, `links` (`repo`, `live`, `case-study`), `media` (`src` + `alt`), `featured`, `order` |
| `credits.json`    | `items`: design, inspiration, font and library credits             |
| `narration.json`  | `landmarks`: what the narrator says at `pineapple`, `tiki`, `krusty-krab` and `bureau`: `lines` (2 to 5, each at most 140 characters in English), optional `hints` (a list of `{ id, text }`; at the pineapple, `id` is a skill group id from `site.json`) and an optional `farewell` |

## Rules

- **Text** fields take either a plain string (English only) or translations:
  `{ "en": "Swim back", "ar": "رجوع" }`. English is required; Arabic falls back to English.
- **Ids** are lowercase slugs (`kelp-shake`) and must be unique within a file. Keep them stable:
  they key the interface and analytics.
- **Months** are `YYYY-MM`. Leave `period.end` out for a current role.
- **URLs** must be absolute `https:` (or `http:`) links; contact links may also be
  `mailto:you@example.com`. An avatar or project `media.src` may be a site path such as
  `/avatar.webp`, with the image placed in `apps/web/public/`.
- **Projects** with an `order` are shown first, lowest number first; the rest follow in file
  order. `featured` defaults to `false`.
- Unknown fields are rejected, so typos are caught. Keys starting with `_` (like `_sample`) are
  editor notes and are ignored; delete them once you have replaced the sample.
- Every key in `site.json` → `copy` is required. The full list is `SITE_COPY_KEYS` in
  `libs/content/domain/src/lib/site-profile.ts`.
- 3D model licence credits are not content: they are generated with the asset manifest in
  `libs/world/domain` and cannot be removed here.

Run `npx nx validate content-data-access` to check your changes. `nx build web` runs the same
check first and fails on invalid content. `package.json` in this folder only makes the files
importable by the site; you never need to edit it.
