# Visitor analytics

The site can send a small set of cookieless events to a hosted analytics provider, so you can
see whether visitors actually reach the deeper landmarks. It is **off by default**: a fork
sends nothing and loads no third-party script until it sets `VITE_ANALYTICS_PROVIDER`.

Code: `libs/telemetry/domain` (event catalogue, allow-list, milestone tracker, dedupe rules),
`libs/telemetry/data-access` (provider adapters, lazy script loading, page lifecycle),
`apps/web/src/app/telemetry.ts` (wiring).

## Choosing a provider

| | Plausible | Umami |
| --- | --- | --- |
| Hosting | Plausible Cloud (paid) or self-hosted | Umami Cloud (free tier) or self-hosted |
| Cookies | None, no cookie mode exists | None |
| Custom event properties | Yes (`props`), shown under the goal's breakdown | Yes (`data`), shown under Events |
| Setup | Add the site, then add each event name below as a custom-event goal | Add the website, copy its UUID |

Both are cookieless and do not store personal data, which keeps the site out of cookie-banner
territory. Pick whichever dashboard you prefer; the event data is identical.

## Configuration

Set these at **build time** (Vite inlines them). On Netlify, set them as site environment
variables so they are present during the build; locally put them in `.env` (see
`.env.example`).

| Variable | Used by | Value |
| --- | --- | --- |
| `VITE_ANALYTICS_PROVIDER` | all | `plausible`, `umami` or `none` (default) |
| `VITE_ANALYTICS_DOMAIN` | Plausible | The domain registered in Plausible, e.g. `example.org` (comma-separated list for roll-ups; lowercased, as Plausible matches it exactly) |
| `VITE_ANALYTICS_WEBSITE_ID` | Umami | The website UUID from the Umami dashboard |
| `VITE_ANALYTICS_SCRIPT_SRC` | optional | `https://` URL of a self-hosted script. Default: the official URL |

Anything missing or malformed (unknown provider, missing domain, a website id that is not a
UUID, a non-https script URL) resolves to `none`, so a misconfiguration sends nothing rather
than something wrong. Plain `http://` is accepted only for `localhost`.

Default script URLs (pinned):

- Plausible: `https://plausible.io/js/script.js` (the classic script, configured by
  `data-domain`). Exit events go to `https://plausible.io/api/event`.
- Umami Cloud: `https://cloud.umami.is/script.js` (configured by `data-website-id`). Exit
  events without the script go to `https://cloud.umami.is/api/send`.

With `VITE_ANALYTICS_SCRIPT_SRC`, the collection endpoint is derived from that script's
origin (`<origin>/api/event` or `<origin>/api/send`).

## Content Security Policy origins

For `security-hardening`: allow the provider origin in both `script-src` (the tracker script)
and `connect-src` (the events it sends). Only the configured provider needs to be listed.

| Provider | `script-src` | `connect-src` |
| --- | --- | --- |
| Plausible Cloud | `https://plausible.io` | `https://plausible.io` |
| Umami Cloud | `https://cloud.umami.is` | `https://cloud.umami.is` (recent Umami Cloud trackers may post to a gateway host such as `https://api-gateway.umami.dev`; check the Network tab after deploy and add it if present) |
| Self-hosted | origin of `VITE_ANALYTICS_SCRIPT_SRC` | same origin |

The script tag is injected with `async`, no inline code and no `crossorigin`, so no
`'unsafe-inline'` or nonce is needed for analytics.

## What is collected

Every event passes an allow-list before it is sent (`sanitizeEvent` in the domain library):
an unknown event name, a missing or extra property, or a value outside its rule drops the
whole event. Ids must be content slugs: lowercase `a-z`, `0-9`, `-`, `_`, at most 64
characters. No free text, no URL parameters, nothing a visitor types.

| Event | Properties | When | Dedupe |
| --- | --- | --- | --- |
| `dive_depth_reached` | `milestone`: `25` \| `50` \| `75` \| `100` (% of the dive) | The deepest point reached this visit first crosses the milestone (within 0.5%, since the camera spring settles asymptotically) | Once per milestone per visit; scrolling back up never re-fires; a jump past several fires each |
| `landmark_clicked` | `landmarkId`: slug | A landmark is opened, by pointer or keyboard (the kernel's `landmark_open`) | An identical event within 1 s is a double fire and is dropped |
| `overlay_opened` | `overlayKey`: slug (a landmark id, or a fixed key such as `complaints-wall`) | An overlay opens; a landmark open sends this alongside `landmark_clicked` | Same 1 s window |
| `dive_drop_off` | `maxDepthBucket`: `0` \| `25` \| `50` \| `75` \| `100`; `lastWaypointId`: slug or `none` | The page is hidden for navigation, close or bfcache (`pagehide`) | Once per page-hide; re-armed when the page is restored from the bfcache (see below) |
| `quality_tier_resolved` | `tier`: `low` \| `medium` \| `high` | The rendering tier is final at start-up | Once per visit; the first report wins, so it must only be sent with the final tier |

`lastWaypointId` is the last valid waypoint slug the camera neared; an id that is not a
slug is ignored rather than overwriting it.

**Current wiring.** Depth milestones and drop-off come from `<SiteTelemetry />` inside
`<DiveProvider>` (`apps/web/src/app/app.tsx`); landmark opens come from the landmark kernel
through `reportLandmarkEvent` in `apps/web/src/app/landmark-ports.ts`.
`quality_tier_resolved` is sent once, with the final tier, by
`<QualityProvider onSettled={trackQualityTier}>` in `App`. `overlay_opened` for overlays
that are not landmarks (`trackOverlayOpened`) has no caller until the complaints-wall item.

On the exit path with Umami, when the tracker script is not loaded, this code posts the
event directly to `/api/send` with Umami's standard event fields: website id, page
`hostname`, page path (no query or fragment), browser `language` and `screen` size
(`1920x1080`). With Plausible the direct exit payload is the event name, page URL without
query or fragment, the site domain, `referrer: null` and the event props.

The provider script also records its own standard pageview (path, referrer, country from
the IP address which the provider does not store, browser and device class). See each
provider's data policy.

## What is not collected

- No cookies, `localStorage` or other client-side identifiers set by this code or by the
  provider scripts in their default configuration (no cookie mode is enabled).
- No personal data, free text, complaint content, or form input.
- Query strings and fragments are stripped from the URL sent on the exit path.
- Nothing at all from visitors with **Do Not Track** (`navigator.doNotTrack === '1'`) or
  **Global Privacy Control** (`navigator.globalPrivacyControl === true`): the page uses the
  no-op adapter and never loads the provider script. Cookieless analytics does not strictly
  require this, but honouring an explicit signal costs little. Umami's script additionally
  gets `data-do-not-track="true"` as a second guard.
- Nothing if the provider script fails to load (usually a content blocker): the adapter goes
  silent for the rest of the visit, including the exit event.

## Delivery behaviour

- The script is injected lazily on the first idle period after start-up (or after at most
  4 s, 1.5 s where `requestIdleCallback` is unavailable), never blocking the first render.
  Tracking an event never injects it early.
- Events raised before the script loads are queued (up to 50) and sent once it loads.
- On `pagehide`, the drop-off event and anything still queued go out on an unload-safe
  transport: Plausible uses `navigator.sendBeacon` (`text/plain`, as its own script does);
  Umami uses `umami.track` if loaded, otherwise `fetch` with `keepalive: true` and
  `credentials: 'omit'`.
- Adapter errors are swallowed: analytics never breaks the page.

### Drop-off and the back/forward cache

`pagehide` also fires when a page enters the back/forward cache (`event.persisted === true`).
Most such pages are never shown again and are later evicted without any further event, so
the drop-off is sent on **every** `pagehide`, persisted or not; skipping persisted hides
would lose most exits. If the page is restored (`pageshow` with `persisted === true`), the
visit continues: the drop-off is re-armed (depth milestones stay consumed), and the next
`pagehide` sends a fresh drop-off with the depth reached by then.

Reading the dashboard: a visitor who leaves, comes back with the Back button and leaves again
produces two drop-off events. Count drop-offs per bucket for the shape of the funnel, not as
a visitor count; the provider's unique-visitor figure is the denominator.

## Script integrity (SRI)

The injected script has no `integrity` attribute, by decision. The pinned official URLs
(`plausible.io/js/script.js`, `cloud.umami.is/script.js`) are updated in place by the
providers, so a hash would break tracking at their next release. The mitigations are the
pinned https origin and, once `security-hardening` lands, a CSP that allows only that
origin. A fork that self-hosts a versioned script it controls can add SRI in
`libs/telemetry/data-access/src/lib/script-loader.ts`.

## Verifying

1. Build with the provider configured and open the site.
2. **Events land**: dive to the bottom, click a landmark, then close the tab. Within a
   minute the provider dashboard shows the pageview and the events above (Plausible: add the
   event names as custom-event goals first to see them).
3. **No cookies**: in DevTools, Application > Storage > Cookies for the site and for the
   provider origin shows nothing set by analytics; `document.cookie` in the console does not
   change. In the Network tab, the requests to the provider have no `Set-Cookie` response
   header and send no `Cookie` request header.
4. **Opt-out**: enable Global Privacy Control (or Do Not Track) in the browser, reload, and
   confirm no request to the provider origin appears in the Network tab.

## Adding an event

Add it to the union and `TELEMETRY_EVENT_NAMES` in `libs/telemetry/domain/src/lib/events.ts`,
give its properties rules in `EVENT_ALLOW_LIST` and a policy in `DEDUPE_RULES`, then add a
row to the table above. The type system flags every place that must change.
