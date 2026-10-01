# Owner content replacement report

## Files changed

- `D:\projects\qa3elhamor\content\site.json` — owner identity, headline, bio, location, grouped skills, links, and themed copy rewritten to fit the owner.
- `D:\projects\qa3elhamor\content\resume.json` — four experience entries from the owner profile, newest first, with exact periods and condensed bullets.
- `D:\projects\qa3elhamor\content\projects.json` — three featured projects (Pro-Estate, Ptah, Anubis MCP) with factual bullets; no unconfirmed star/install figures.
- `D:\projects\qa3elhamor\content\services.json` — four services derived from the profile skills.
- `D:\projects\qa3elhamor\content\credits.json` — only the owner credit (`site-design.author`) was changed; library/inspiration credits remain intact.
- `D:\projects\qa3elhamor\content\README.md` — sample-content note updated.

No phone number was added. The only email used is `abdallah.khalil.nada@gmail.com`. No avatar path is present, so the emblem fallback will be used.

## Owner confirmations needed

1. ⚠ **Email spelling** — `abdallah.khalil.nada@gmail.com` is used as transcribed; the résumé OCR read `abdallah.khall.nada` and needs confirmation.
2. ⚠ **LinkedIn slug** — `https://www.linkedin.com/in/abdallah-khalil-nada` is used as transcribed; the OCR read `abddlah-khalil-nada` and needs confirmation.
3. ⚠ **Ptah URL** — `https://ptah.live` is included but explicitly flagged in the profile as unconfirmed.
4. ⚠ **Anubis MCP metrics** — no star count or install figure is published. The profile says the 125k/7k/120 figures are unconfirmed, so they were omitted entirely.
5. ⚠ **Anubis MCP repository URL** — no project link was included because the exact repository slug could not be verified (`Abdallah-khalil/anubis-mcp` does not resolve). Add the real URL once confirmed.
6. ⚠ **Prio company URL** — `https://getprio.com` was added from the project handoff background; confirm it is the correct public URL.
7. ⚠ **Service wording and themed copy** — the four service menu names, descriptions, prices and the light Qaa El-Hamour jokes in `site.json` were drafted in the trend's spirit; confirm they match the owner's tone.
8. ⚠ **Condensed experience bullets** — highlights were paraphrased from the profile; confirm accuracy.

## Schema gaps

None. All owner data fit the existing domain types (`site-profile.ts`, `resume-entry.ts`, `project-item.ts`, `service-item.ts`, `credit.ts`, `localized-text.ts`). No schema changes were made.

## Check results

| Command | Result |
| --- | --- |
| `npx nx run content-data-access:validate --skipSync` | ✅ Pass |
| `npx nx test content-data-access --skipSync` | ✅ Pass (262 tests) |
| `npx nx test web --skipSync` | ✅ Pass (96 tests) |
