# Owner content revision report (r2)

Review source: `D:\projects\qa3elhamor\.ptah\specs\owner-content\code-logic-review.md` — verdict REVISE.

## Fixes applied

1. ✅ **Pro-Estate Arabic summary typo** — `content/projects.json:11`: changed `"منصة B2S"` to `"منصة B2B"` and `"العلاقات"` to `"إدارة علاقات العملاء"`.
2. ✅ **Khabeer Group tech list** — `content/resume.json:154-158`: tech is now `["AngularJS", "ASP.NET Web API", "Windows services"]`.
3. ✅ **Miramar highlight wording** — `content/resume.json:29`: changed to `"Build and mentor the engineering team behind its AI-native SaaS platforms."`.
4. ✅ **Freelance quip** — `content/resume.json:124`: changed to `"Remote since before remote was a personality."`.
5. ✅ **Voice-neutral quips** — removed third-person pronouns:
   - `content/resume.json:83` Prio quip: `"Left the codebase stricter than it started. The types are grateful."`
   - `content/resume.json:160` Khabeer quip: `"Started before signals existed. Survived anyway."`
6. ✅ **Arabic polish**:
   - `content/site.json:9` headline ar: `"صانع مشاريع مفتوحة المصدر"`
   - `content/site.json:57` backend label ar: `"الخلفية البرمجية"`
   - `content/projects.json:64` Ptah summary ar: `"منصة توجيه برمجة ... تطبيق Electron لسطح المكتب وأداة سطر أوامر (CLI)"`
7. ✅ **Tone — "hit rock bottom" removal**:
   - `content/site.json:16` bio: `"I settled at the bottom, built a NestJS monorepo there..."`
   - `content/site.json:202` `citizenStatusValue.en`: `"Settled at the bottom, and shipped production AI from it:"`
   - The Arabic `citizenStatusValue.ar` already uses `"استقرّ في القاع"` and was left as-is.
8. ✅ **Services price** — `content/services.json:39-42`: `"Priced in kelp, negotiable"` / `"سعرها بالطحالب، قابل للتفاوض"`.
9. ✅ **Skill chip density** — `content/site.json:30-110`: reduced from 59 to 34 total skill chips by keeping the strongest per group and dropping DaisyUI, SASS/LESS, Husky, Commitlint, esbuild, electron-builder, Express, TypeORM, MinIO and other lower-priority items.
10. ✅ **Anubis MCP repo link** — `content/projects.json:141-144`: added `{ "kind": "repo", "url": "https://github.com/Hive-Academy/Anubis-MCP" }`.

## Scope notes

- Edited only `content/*.json` files.
- No schema, code, spec, CMS config, or README changes.
- No phone number added; only email remains `abdallah.khalil.nada@gmail.com`.

## Check results

| Command | Result |
| --- | --- |
| `npx nx run content-data-access:validate --skipSync --skip-nx-cache` | ✅ Pass |
| `npx nx test content-data-access --skipSync --skip-nx-cache` | ✅ Pass (262 tests) |
| `npx nx test web --skipSync --skip-nx-cache` | ✅ Pass (96 tests) |
