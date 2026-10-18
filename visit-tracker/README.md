# Visit tracker

A private visitor log for this site, after Atif Quamar's tracker for al-folio (MIT). It runs on
Cloudflare's free tier: a Worker plus a D1 database. Every page carries a small snippet
(`_includes/visit-tracker.html`) that reports the page view and, when the tab is hidden or closed,
how long the page was on screen. The Worker adds what Cloudflare knows from the IP address:
organisation / network, reverse-DNS hostname, city, region, postcode, country, coordinates, device,
OS and browser. A second table, `events`, holds what was done on the page: outside links and files
opened, scroll depth in quarters, the ASCII effects used (clicks and holds are counted and sent on
leaving), and copies (length only, never the text). Nothing typed is ever recorded. Bots and headless
browsers are dropped. IP addresses are erased after
`IP_RETENTION_DAYS` (wrangler.toml); everything else is kept. No cookies.

The dashboard is at **https://sevendaystoglory.github.io/visitors/** (`pages/visitors.html`). It is
not linked from the site and is marked noindex. Sign in once in every browser you use; signed-in
browsers set a local flag and their visits are not counted.

```
visitor's browser ──POST /hit, /leave──▶ Worker ──▶ D1 (visits table)
/visitors/ page ──password, then bearer token──▶ Worker /api/*
```

| File                          | Purpose                                                          |
| ----------------------------- | ---------------------------------------------------------------- |
| `src/index.js`                | The Worker: collection, reverse DNS, sign-in, dashboard API, CSV |
| `src/classify.js`             | Device/browser parsing, academic/cloud detection, bot filter     |
| `scripts/set-password.mjs`    | Sets the dashboard password (only a salted PBKDF2 hash is kept)  |
| `migrations/`                 | Database schema                                                  |
| `wrangler.toml`               | Worker config: allowed origins, IP retention, rate limits         |

## Commands (run in `visit-tracker/`)

```bash
npm run password      # change the dashboard password; signs every browser out
npm run deploy        # after editing src/ or migrations/
npm run logs          # live request log
npx wrangler d1 execute visits --remote --command \
  "SELECT ts, org, city, country, path, duration_s FROM visits ORDER BY ts DESC LIMIT 20"
```

Dashboard sign-in is blocked for a minute after 5 wrong attempts from one address. The Worker only
accepts events whose `Origin` is in `ALLOWED_ORIGINS`; `http://127.0.0.1:4321` is there so the local
build can be tested against the live Worker.

To switch tracking off, set `visit_tracker_url: ""` in `_config.yml` and push. To delete everything,
`npx wrangler delete` and `npx wrangler d1 delete visits`.

## Naming networks

Many institutions rent their addresses from an internet provider, so a campus Wi-Fi shows up under
the provider. Click **name this network** on a visit, give it a name, and every past and future visit
from that address shows it. Name a single address unless you are sure a whole `/24` is theirs.

## Costs

Free tier: 100,000 Worker requests and 100,000 database writes a day. A page view costs two requests
and up to three writes. If the limit is ever hit, the extra visits that day are not recorded and the
site itself is unaffected.
