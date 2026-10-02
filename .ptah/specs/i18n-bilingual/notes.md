# i18n-bilingual: Arabic and English, one content model, real RTL

Charter: switching locale flips overlay direction correctly, and both locales render from the
same content entries.

## Approach

### Locale state (`apps/web/src/app/i18n/`)

- `locale.ts` (revised in Revision 1: an explicit switch now always pins `?lang=`): resolution order `?lang=ar|en` → `localStorage['qa3elhamor.locale']` →
  `navigator.languages` (first `ar*`/`en*`; `ar-EG` → Arabic) → English. Also `<html lang dir>`
  (`applyDocumentLocale`), `formatNumber` (Arabic-Indic digits in Arabic), and
  `searchWithLocale` (a switch rewrites `?lang=` only when the URL already pins one, so a reload
  keeps the visitor's latest choice; a clean URL stays clean).
- `locale-context.tsx`: `<LocaleProvider>` at the composition root (`app.tsx`), above both the
  dive and the page view; `useLocale()` gives `{ locale, dir, setLocale }`. `<html lang dir>` is
  set in a layout effect, before paint. The only thing stored is the bare locale id; nothing is
  sent anywhere (no telemetry event was added; there is no PII in the feature at all).
- `language-toggle.tsx`: `EN | عربي`, two real `<button>`s with `aria-pressed`, each labelled
  in its own script and `lang`, in a `role="group"` named "Language"/"اللغة". In the dive it
  sits under the Credits button at the inline start (z 35, the credits' layer: the landmark
  stage passes the pointer through to it, and a visit's bubble covers it rather than the other
  way round). In the page view it is in the masthead, beside "قاع الهامور".
- The locale flows into `LandmarkProvider locale`, so every landmark overlay, the nav, the
  stage, the narrated visits (bubble, labels in 3D, panels, full views) and the Bureau re-render
  on a switch; the chrome (scene note, depth gauge, credits, nav label, dialog close/return
  labels) reads `CHROME_COPY`.

### UI strings: typed tables, not `content/site.json` (decision)

Chose **typed `bilingual()` tables** over moving ~90 interface strings into `site.json`:

- They were already per-feature `{ en, ar }` tables; moving them into content would touch the
  closed `SITE_COPY_KEYS` set, the parser, the Decap config and its parity spec, and thread a
  `copy` prop into every component that imports a table statically, while other agents are
  editing content and those components. Interface words (Next, Skip, "Back to the guide") are
  not what an owner edits in the CMS; content is.
- `i18n/ui-strings.ts` exports `bilingual({ en, ar })`: the compiler rejects an `ar` missing a
  key `en` has, or carrying an extra one. Every table now uses it (`NARRATOR_COPY`,
  `PINEAPPLE_/TIKI_/KRUSTY_VISIT_COPY`, `BUREAU_VISIT_COPY`, `IN_WORLD_CARD_COPY`, new
  `CHROME_COPY`); `PAGE_VIEW_COPY` already had the same guarantee through its `PageViewCopy`
  type.
- `i18n/ui-strings.spec.ts` checks every registered table at run time: same keys, nothing
  empty, the same `{placeholders}` in both languages, and the Arabic actually contains Arabic.
  Named entries (`NARRATOR_NAMES`, `FILED_LINES`, `LOCALE_NAMES`) must carry both locales.

### RTL

- `<html dir>` drives everything; component CSS was already mostly logical. Converted the rest:
  scene note and depth gauge (`inset-inline-*`), speech-bubble dots (`margin-inline-end:auto`,
  replacing an `[dir=rtl]` override). The 3D scene does not mirror.
- Speech bubble tail: positioned by the scene in physical pixels at the narrator (`--tail-x`),
  so it always points at the speaker in either direction; the bubble's bias already opens it
  away from the landmark per direction.
- **drei `<Html>` wrappers forced LTR** (`.in-world-card-anchor`, `.visit-hud-anchor`): in an
  RTL document their absolutely positioned boxes took a right-aligned static position, which
  threw the in-world cards (Citizenship Card, Tiki record, menu, Bureau scroll) off screen.
  The content inside sets its own `dir`.
- Untranslated content: `textProps(text, locale)` (`overlays/overlay-copy.ts`) marks a field
  with no Arabic as `lang="en" dir="ltr"` inside an Arabic page (page view, Citizenship Card);
  a wholly untranslated highlights list is marked as one English list so its bullets sit on the
  English side. Visit labels, captions, notes and bubble lines use `dir="auto"` (they are
  strings by then); a `content-parity` spec makes sure no Arabic narration line starts with a
  Latin letter, which `auto` would read as LTR.
- Forms: free-text inputs are `dir="auto"` (an Arabic complaint in an English page and vice
  versa); the email stays `dir="ltr"`. Counters and limits read naturally in Arabic.
- Numbers: the depth gauge shows `−١٧ م` with the signed number in an LTR isolate; the scene
  note uses Arabic-Indic digits.
- Credits dialog: `CreditsDialog` (world-ui, off-limits) hard-codes `lang="en" dir="ltr"`;
  `SiteCredits` passes Arabic words and re-marks the dialog's `lang`/`dir` after render. The
  licence lines stay English (`lang="en"` per item), as the licences word them.

### Arabic font

IBM Plex Sans Arabic 1.1.0 (OFL 1.1), Regular + SemiBold WOFF2, **unmodified** (Plex is a
Reserved Font Name, so no subsetting), in `apps/web/public/fonts/ibm-plex-sans-arabic/` with
`LICENSE.txt` and a README. `@font-face` limits it to the Arabic Unicode ranges, so Latin keeps
the system font and a file downloads only when Arabic is on screen (`font-display: swap`).
`--font-ui` / `--font-paper` in `styles.css` replace the per-component stacks. 72 KB + 76 KB,
not part of the JS/CSS budgets.

### Build gate: pineapple hints ↔ skill groups

`checkSkillHints` in `libs/content/domain/.../parse-narration.ts`, called from `parseContent`
once every file reads cleanly: when the site has skill groups **and** pineapple hints, every
group needs exactly one hint and every hint must name a group. It runs in
`content-data-access:validate`, which `web:build` depends on, and in the CMS preview. Both sides
stay optional on their own (the Decap parity spec requires it).

## Files

Created: `apps/web/src/app/i18n/{locale.ts, locale-context.tsx, language-toggle.tsx,
language-toggle.css, ui-strings.ts}` and specs `{locale.spec.ts, ui-strings.spec.ts,
content-parity.spec.ts, locale-switch.spec.tsx}`; `apps/web/public/fonts/ibm-plex-sans-arabic/*`.

Modified (apps/web): `app.tsx`, `credits.tsx`, `depth-gauge.tsx`, `styles.css`, the copy tables
(`narrators/narrator-copy.ts`, `pineapple/pineapple-copy.ts`, `tiki/tiki-copy.ts`,
`krusty-krab/krusty-copy.ts`, `bureau/bureau-copy.ts`,
`overlays/citizenship-card/citizenship-card-in-world.tsx`, `page-view/page-copy.ts`),
`overlays/overlay-copy.ts` (`textProps`), `page-view/{page-view.tsx, page-view.css,
page-parts.tsx, site-sections.tsx, work-sections.tsx}`,
`overlays/citizenship-card/{citizenship-card.tsx, .css, .spec.tsx, -in-world.css}`,
`overlays/complaint-scroll/complaint-scroll.tsx`, `narrators/{speech-bubble.tsx, .css,
visit-hud.tsx, visit-hud.css, README.md}`, `in-world/in-world-card.css`,
`krusty-krab/services-menu.css`, `tiki/experience-record.css`, `bureau/bureau-scroll.css`.

Modified (content lib): `libs/content/domain/src/lib/parse/{parse-narration.ts,
parse-content.ts, parse-content.spec.ts}`, `libs/content/data-access/src/lib/site-content.spec.ts`
(comment). No schema change, so `config.yml` is untouched.

Content: `content/{narration,site,resume,services,projects}.json`, `ar` only; every English
string is byte-identical (`add-arabic.py` asserts the English it translates).

## Arabic strings added, for owner review

Egyptian where it is the joke (the narrators, reviews, prices), MSA for résumé facts. No new
facts; product and company names stay as they are (Khabeer Group, Prio, Miramar Staffing).

Narration
- pineapple line 3: وآخر حاجة: منصتين ذكاء اصطناعي شغالين فعلًا، برو إستيت وبتاح. أغلبها وكلاء ذكيين وMCP وهندسة سياق.
- pineapple line 4: الفقاعات دي تخصصاته تحت المية. اختار واحدة وأحكيلك عنها باختصار، من غير كلام بياعين.
- hint ai-llm-ops: وكلاء بيتعاونوا مع بعض، وأدوات تشغيل مش فارق معاها أنهي نموذج عليه الوردية: LangChain وLangGraph وMCP وRAG.
- hint architecture: معمارية سداسية وClean Architecture وDDD وتعدد المستأجرين. بيرسم الصناديق الأول، عشان الكود يلاقي مكان يسكن فيه.
- hint backend: السباكة اللي مشغّلة الشعاب: NestJS 11 وTypeScript، مع Prisma وZenStack وطوابير Bull.
- hint databases: لكل تيار سمكة: PostgreSQL وMongoDB وNeo4j وRedis وsqlite-vec.
- hint frontend: حتى القاع يستاهل واجهة حلوة: Angular 21 بالـ signals والـ SSR، جوّه مستودعات Nx موحّدة.
- hint devops-tooling: اللي مش في خط النشر يبقى ما اتشحنش: Docker وKubernetes وGitHub Actions وNx.
- tiki line 2: البداية كانت في Khabeer Group سنة ٢٠١٥، وبعدها سنين شغل حر لشركات ناشئة برّه.
- tiki line 3: بعدها Prio، مهندس برمجيات رائد: شايل المعمارية والـ CI/CD، وبيوجّه مهندسين كبار.
- krusty-krab line 2: الأسامي للهزار. لكن تحتها: معمارية وكلاء ذكاء اصطناعي وMCP، ومنصات SaaS، وقيادة فرق، وتسليم بلغتين.
- krusty-krab line 3: الأسعار باللولي والطحالب ودولارات الرمل. الطلبات الجد بتعدّي على مكتب الشكاوى. ما تسألش.
- bureau line 2: كله بيروح على مكتب عبدالله على انفراد. والرئيس السرديني بيقرا كل واحدة، ولو بعد شوية.
- bureau line 3: سيب عنوان للرد لو عايز إجابة. البلدية شاطرة، بس مش بتشم على ضهر إيدها.

Site profile
- bio 1 (MSA): مهندس برمجيات ومؤسس بخبرة تزيد على ١٢ عامًا في تصميم منصات SaaS قابلة للتوسع وأنظمة ذكاء اصطناعي ذكية. أتخصص في الذكاء الاصطناعي الوكيلي وهندسة السياق وتطبيقات بروتوكول سياق النماذج (MCP)، وأطلقت مؤخرًا منصتين أصليتين للذكاء الاصطناعي في بيئة الإنتاج — برو إستيت وبتاح — مع قيادة فرق هندسية عبر كامل طبقات البرمجيات.
- bio 2: مقيم رسمي في قاع الهامور: استقرّيت في القاع، وبنيت هناك مستودعًا موحّدًا بـ NestJS، وأبقيت السردين من أصحاب المصلحة.

Résumé
- company "Freelance / self-employed": عمل حر
- locations: Remote → عن بُعد; Egypt → مصر; Giza, Egypt → الجيزة، مصر
- summaries (MSA): Miramar — شارك في تأسيس الشركة ويقود توجهها التقني، ويبني الفريق الهندسي وراء منصاتها السحابية القائمة على الذكاء الاصطناعي. / Prio — أدار دورة حياة تطوير البرمجيات لمنتجات مؤسسية رئيسية، مسؤولًا عن المعمارية والنشر. / Freelance — قدّم تطبيقات ويب عالية الأداء وحدّث أنظمة قديمة لشركات ناشئة دولية. / Khabeer — بنى تطبيقات ويب كثيفة البيانات وأتمتة للتتبع اللحظي لأنظمة مؤسسية.
- reviews (quips): Miramar — بنى الفريق، وبعدين بنى الروبوتات اللي بتتخانق مع الفريق. فوضى منتجة. / Prio — ساب الكود أصرم مما استلمه. والأنواع شاكرة فضله. / Freelance — شغّال عن بُعد من قبل ما الشغل عن بُعد يبقى موضة. / Khabeer — ابتدى قبل ما الـ signals تظهر. وعدّاها برضه.
- highlights: left English (long technical bullets; rendered as English inside the Arabic page).

Services
- titles: معمارية وكلاء الذكاء الاصطناعي وMCP / معمارية منصات SaaS / القيادة التقنية وبناء الفرق / تسليم منتجات ثنائية اللغة بالعربية أولًا
- descriptions (MSA), one sentence each: see `content/services.json`.
- prices: تلات حبات لولي وورقة بيضاء / كرسي في مجلس الشعاب / اتنين دولار رمل وقاموس

Projects
- Anubis MCP summary: نظام إرشاد مفتوح المصدر متوافق مع MCP، يوجّه وكلاء الذكاء الاصطناعي (Cursor وClaude) لاتباع أنماط معمارية مُلزِمة.
- descriptions and highlights: left English.

Interface
- New `CHROME_COPY` (switch, scene note, depth, nav, close/return, credits); see `ui-strings.ts`.
- Narrator tag for the Sardine President changed from رئيس السردين to **الرئيس السرديني**, the
  name the content (`site.json`, narration) already uses everywhere.

## Verification

- `npx nx run-many -t lint,typecheck,test,build,validate -p web content-domain content-data-access --skipSync`:
  lint, typecheck, build and validate green on the final code; `test` green on a final
  `--skip-nx-cache` rerun (web 575, content-data-access 315, content-domain 42). One earlier
  run under heavy machine load (~65 node processes from other agents) hit 15 s timeouts in
  unrelated specs; they pass on rerun.
- `npm run perf:budget` (final build): initial JS 414.5 KiB of 450, CSS 10.9 KiB of 20,
  largest chunk 776.4 KiB of 850, models 1272.3 KiB of 1800: OK.
- Visual: `capture.mjs` (Playwright from the npx cache, swiftshader) against `vite preview` on
  127.0.0.1:4417 (server stopped afterwards). `node capture.mjs shots [en|ar|all]
  [desktop|phone|all] 4417 [step]`.
- `add-arabic.py`: the content translation script (idempotent; asserts the English it
  translates).

## Screenshots

60 JPEGs in `shots/`, `<en|ar>-<desktop|phone>-<step>.jpg` (desktop 1440×900, phone 390×844 @2x):
`a-dive-start`, `b-<pineapple|tiki|krusty-krab>-selected` (mid-dialogue, second object picked),
`c-<landmark>-full` (the full view flown out), `d-bureau-talking`, `e-bureau-errors` (empty
stamp), `f-bureau-arabic-typed` (Arabic subject/body/name, malformed email), `g-credits`,
`h..k-page-*` (`?view=page`: top, experience, services, contact).

Glitches found by looking, and fixed:
1. In-world cards (Citizenship Card, Tiki record, menu, Bureau scroll) were off screen in
   Arabic: drei `<Html>` wrappers took an RTL static position. Wrappers pinned `direction: ltr`.
2. The language switch covered the narrator's bubble on a phone (it sat above the stage).
   Moved to the credits' layer, under the stage.
3. Depth read `١٧ م−` (minus after the number). Signed number now in an LTR isolate: `−١٧ م`.
4. English highlight bullets hung outside the Arabic panel/list edge. A wholly English list is
   now one LTR list (`textProps` on the `<ul>`, `dir="auto"` on visit notes lists).
5. Arabic typed into the complaint form rendered in Courier New's unjoined Arabic. Plex now
   leads every `Courier New` stack (form fields, sardine stamp legend, visa-page titles);
   Latin keeps the typewriter face.
6. Mixed digits: scene note now uses Arabic-Indic digits like the depth gauge.
7. "والـ types" in a review read awkwardly in the bubble: reworded to "والأنواع".

## Open issues

- `CreditsList` (world-ui) has a hard-coded visually hidden "Opens in a new tab" hint, and
  `CreditsDialog` hard-codes `lang/dir` (worked around in `SiteCredits`). Both want
  `lang`/`dir`/label props in `libs/world/ui` (off-limits here).
- The in-world credits plaque (`CreditsPlaque`, canvas-drawn) stays English apart from its
  Arabic masthead: canvas text has no bidi layout to rely on.
- The landmark overlay host's title font (libs/landmarks/ui) is `Georgia, 'Times New Roman',
  'Noto Naskh Arabic'`; Arabic titles there render in the system's Arabic serif, not Plex.
- `document.title` and the meta description stay as `index.html` has them (bilingual already).
- Long technical text (résumé highlights, project descriptions and highlights) is English-only
  by design; the owner may translate later field by field, no code change needed.
- `coming-soon-overlay.tsx` is unused outside a spec (pre-existing).
- The moderation console (`moderation.html`) is out of scope and stays English.

## Revision 1 (review: code-review-agy.md, REVISE 7/10)

Serious
1. **Unjoined Arabic in the complaint fields.** The phone shot the review cites was taken
   before the round-0 Plex fix (only desktop had been retaken). Made it robust regardless:
   - `styles.css`: `:lang(ar) { letter-spacing: normal !important; }`. Tracking pulls cursive
     Arabic apart; this covers every component (and library) rule that tracks small caps.
     The passport MRZ is marked `lang="en" dir="ltr"` so it keeps its tracking.
   - `complaint-scroll.css`: fields set `letter-spacing: normal`; in an Arabic scroll the
     free-text fields use `var(--font-paper)` (Georgia + Plex), so even with Plex blocked the
     fallback is not Courier New's unjoined Arabic. The email field keeps the typewriter.
   - Retook `ar-desktop-f-bureau-arabic-typed.jpg` and `ar-phone-f-bureau-arabic-typed.jpg`
     (plus the other ar Bureau shots) on a fresh build: the typed Arabic joins normally, at
     normal spacing, on both.
2. **Clean URL + refused storage lost the choice.** `searchWithLocale` now always writes
   `?lang=` on an explicit switch (other parameters and the hash kept, `replaceState`, no
   history entry). A reload keeps the language without storage, and a copied link opens in it.

Moderate
3. **Blank translation.** `localize` (content-domain) treats a blank `ar` as missing (the
   parser already rejects one; values built in code could still carry it), and `textProps` now
   derives "fell back to English" from `localize` itself, so the two cannot disagree.
4. **Toggle accessible names.** `aria-label` "EN, English" / "عربي، العربية": the full name,
   starting with the visible text (label-in-name).

Cheap minors
- Direction flash: `main.tsx` applies `<html lang dir>` before the first render (no inline
  script is allowed under the CSP; `#root` is empty until then anyway).
- Not changed: datalist matching across hamza/diacritic variants (browser behaviour,
  suggestions only); counter counting tatweel/harakat (the limit is the API's, measured the
  same way server side).

Specs added: `i18n/arabic-text.spec.ts` (textProps on missing/blank/identical translations;
the CSS rules that keep Arabic joined); `locale-switch.spec.tsx` (full accessible names;
`?lang=` pinned with storage refusing writes, other params and hash kept); `locale.spec.ts`
(`searchWithLocale` pins); content-domain `localize` blank case.

Verification: `npx nx run-many -t lint,typecheck,test -p web content-domain content-data-access
--skipSync`: Successfully ran lint, typecheck, test for 3 projects. Preview server on 4417
stopped.

Note for the e2e lane: switching language now writes `?lang=` into the URL; the toggle's
accessible names are "EN, English" and "عربي، العربية".
