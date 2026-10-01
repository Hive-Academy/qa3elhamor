# Code Logic Review — owner-content

Scope: `git diff -- content/` (site, resume, projects, services, credits, README) against `.ptah/owner-profile.md` and `.ptah/handoff.md` (Prio claims at line 164). Consumer checked: `apps/web/src/app/overlays/citizenship-card/citizenship-card.tsx`. Validation: `npx nx run content-data-access:validate --skipSync` exits clean (Nx cache hit, 1/1; the report also claims 262 and 96 tests passing, which I did not re-run).

| Metric | Value |
| --- | --- |
| Score | 7/10 |
| Verdict | REVISE (small, text-only fixes) |

## Checks

1. Factual fidelity. Employers, dates, roles, numbers (400K LOC, 146 projects, 75 models, 12 subagents, 23 suites, 68 projects, ~40 tools, 14 namespaces, 9 agents) all trace to the profile. There are no Anubis star or install figures and no invented awards or clients. The Prio claims "architected the SaaS platform and onboarded the Egyptian team" trace to handoff line 164. Exceptions are listed as D1-D4 below.
2. Privacy. Grep finds no phone number, no `tel:` and no work email. The only address is `abdallah.khalil.nada@gmail.com` (`content/site.json:~118`).
3. Rendering fit. No sample or "Your Name" text remains. `content/site.json:260` "Your name" is a form label, which is allowed. The card renders all 6 skill groups, which is about 62 chips (`citizenship-card.tsx:133-147`), so it will be long and scroll.
4. Tone. The humour stays light and there is no SpongeBob branding. Services are priced in jokes only. Details are in D7 and D8.
5. Validation passes.

## Defects

1. **Typo in Arabic, `content/projects.json:8` (Pro-Estate `summary.ar`).** It says "منصة B2S" and should say B2B. Fix: replace `منصة B2S متعددة الوكلاء` with `منصة B2B متعددة الوكلاء`. Bidi risk: a Latin token in the middle of Arabic is fine, but add a space on each side as it already has.
2. **Unconfirmed facts published without owner confirmation.** The profile flags each of these with ⚠.
   - `content/projects.json` Ptah `links[0].url` is `https://ptah.live`. Either remove the link until confirmed, or keep it and make sure the owner confirms before launch. Recommended: keep it as a launch-checklist blocker.
   - The LinkedIn slug (`content/site.json` links[1]) is flagged as OCR-uncertain. The email spelling is flagged the same way.
   - `https://getprio.com` in `content/resume.json:~58` was taken from the handoff only. The profile never gives it. Keep it, but add it to the confirmation list (the report already does).
   These are not code defects, but add them to the launch checklist as hard gates before the first publish.
3. **Inference stated as fact, `content/resume.json` Khabeer `tech`.** The "MS SQL Server" and "C#" entries are not in the profile for that role. The profile says only AngularJS and ASP.NET Web API plus Windows services. Fix: `"tech": ["AngularJS", "ASP.NET Web API", "Windows services"]`.
4. **Inference stated as fact, `content/resume.json` Miramar highlight 3.** "Mentor the engineering team behind Pro-Estate and other AI-native products" is an inference. The profile says "building and mentoring the engineering team behind its AI-native SaaS platforms". Fix: `"Build and mentor the engineering team behind its AI-native SaaS platforms."` Related: the Miramar quip "built the robots that argue with the team" is flavour, not fact, which is acceptable. The Freelance quip "Worked in every timezone" is an unsupported claim. Fix: `"Remote since before remote was a personality."`
5. **Voice inconsistency.** `site.json` bio is first person ("I specialise"). The resume `quip` strings are third person ("his career", "Left the codebase stricter than when he found it"). The `complaintIntro` copy says "Abdallah's desk". Pick one voice. Recommended: keep the third-person quips, since they read as municipal-file annotations, and leave the bio in first person.
6. **Arabic quality, minor.**
   - `site.json` headline `ar` "منشئ مفتوح المصدر" is awkward. Fix: `صانع مشاريع مفتوحة المصدر`.
   - Backend label "الخوادم" should be `الخلفية البرمجية`.
   - `projects.json` Ptah `summary.ar` reads "تطبيق Electron سطح مكتب وCLI". Fix: `تطبيق Electron لسطح المكتب وأداة سطر أوامر (CLI)`. This also keeps the Latin tokens space-separated, which is bidi-safe.
   - Pro-Estate `summary.ar` says "العلاقات" for CRM. Fix: `إدارة علاقات العملاء`.
   - Most `description`, `highlights`, `summary` and `bio` strings have no `ar`. This is schema-legal and the locale is hard-coded `en` today, but `i18n-bilingual` (batch 5) will need it. Log it as a follow-up for the owner.
7. **Joke wording, `site.json` bio[1].** "I hit rock bottom" reads as a personal low to a recruiter. Suggested softer text: `Registered resident of Qaa El-Hamour: I settled at the bottom, built a NestJS monorepo there, and kept the sardines as stakeholders.` The card status line already uses "settled in" in HEAD's wording. The new `citizenStatusValue` ("Hit rock bottom, and shipped production AI from it:") should also use the softer form: `Settled at the bottom, and shipped production AI from it:`, with the matching Arabic `استقرّ في القاع، وأطلق ذكاءً اصطناعيًا منه:` (already correct).
8. **Service prices.** The jokes are clearly not offers. "Market price" (`services.json` saas-platform-architecture) is the only literal-sounding one. Fix: `"Priced in kelp, negotiable"`.
9. **Card density, moderate.** About 62 skill chips on the Citizenship Card, and a 74-character headline in a `dd` (`citizenship-card.tsx:77`). Trim for the card or let it scroll. Suggested cut: drop the `DaisyUI`, `SASS/LESS`, `Husky`, `Commitlint`, `Stryker` and `esbuild` chips. This is a judgement call.
10. **Missing Anubis link.** `projects.json` Anubis `links` is `[]`, so there is no outbound link on a featured open-source project. Add once the repo URL is confirmed (owner action).
11. **Unrelated data.** `citizenStatusMotto.en` is Arabic text ("بقينا في القاع"). It is unchanged from HEAD and intentional, since the motto is the same in both locales.

## Five logic questions

- **Silent failure.** Unconfirmed values (email, LinkedIn, ptah.live) validate fine but could be wrong. The validator can't catch that (D2).
- **Unexpected user action.** Switching to Arabic: most Arabic fields fall back to English (D6), which mixes languages.
- **Wrong-answer input.** Khabeer tech and Miramar highlight 3 are inferences (D3, D4).
- **Dependency failure.** None. The data is static JSON and validated at build time.
- **Missing.** No `ar` for long text, no Anubis URL, no avatar (the emblem fallback is used).

## Verdict

REVISE. 7/10. Fix D1, D3, D4 and D6 (text only) and put D2 and D10 in the launch checklist. Nothing else blocks.
