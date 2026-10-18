import { classifyNetwork, isBot, parseUserAgent, referrerHost, registrableDomain } from "./classify.js";

const MAX_BODY_BYTES = 4096;
const MAX_DURATION_S = 4 * 60 * 60;
const MAP_CACHE_KEY = "public-map";
const MAP_CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const PV_ID = /^[\w-]{8,64}$/;

// Columns the dashboard can filter on with an exact match (never interpolate anything else into SQL).
const FILTER_FIELDS = ["org", "kind", "country", "region", "city", "postal", "path", "ref_host", "host_domain", "device", "os", "browser", "visitor"];
const SEARCH_FIELDS = ["org", "isp", "hostname", "city", "region", "postal", "country", "path", "title", "referrer", "ip"];
const VISIT_COLUMNS =
  "id, pv_id, last_pv_id, ts, visitor, ip, org, isp, asn, kind, hostname, host_domain, city, region, region_code, postal, country, continent, lat, lon, tz, path, title, referrer, ref_host, utm_source, device, os, browser, screen, lang, user_agent, duration_s, reloads, last_ts";
// What the snippet may report a visitor doing on a page (see _includes/visit-tracker.html).
const EVENT_TYPES = new Set(["link", "download", "scroll", "click", "hold", "flux", "fx-on", "fx-off", "copy"]);
const MAX_EVENTS_PER_VIEW = 60;
const BIND_CHUNK = 90; // D1 allows 100 bound parameters per statement
const LABEL_KINDS = ["academic", "other"];
const LABEL_CACHE_MS = 60 * 1000;
const SESSION_MS = 30 * 86400000;
const RELOAD_WINDOW_MS = 30 * 60000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      switch (url.pathname) {
        case "/hit":
          return await recordHit(request, env, ctx);
        case "/leave":
          return await recordLeave(request, env);
        case "/event":
          return await recordEvent(request, env);
        case "/map":
          return await publicMap(env);
        case "/":
          // The dashboard itself is a page on the website (/visitors/); this Worker only serves its data.
          return dashboardUrl(env) ? Response.redirect(dashboardUrl(env), 302) : new Response("Visit tracker");
        case "/api/login":
        case "/api/summary":
        case "/api/visits":
        case "/api/live":
        case "/api/export.csv":
        case "/api/labels":
          return await dashboardApi(request, env, url);
        default:
          return new Response("Not found", { status: 404 });
      }
    } catch (err) {
      console.error(err);
      return new Response("Server error", { status: 500 });
    }
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(Promise.all([refreshMapCache(env), eraseOldIps(env)]));
  },
};

// ---------------------------------------------------------------------------
// Collection

async function recordHit(request, env, ctx) {
  const origins = allowedOrigins(env);
  const rejected = await rejectEvent(request, env, origins);
  if (rejected) return rejected;

  const userAgent = request.headers.get("User-Agent") || "";
  if (!userAgent || isBot(userAgent)) return empty(204);

  const body = await readJson(request);
  if (!body || !PV_ID.test(body.id || "")) return empty(400);

  const cf = request.cf || {};
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const now = new Date();
  const path = str(body.path, 300) || "/";
  const screen = str(body.screen, 20);
  const lang = str(body.lang, 20) || str((request.headers.get("Accept-Language") || "").split(",")[0], 20);
  // One "visitor" = same network + same browser + same screen and language. Screen and language help tell apart
  // people with identical phones behind one shared address (e.g. campus Wi-Fi). Width × height is sorted so
  // turning the phone doesn't make a new visitor.
  const screenKey = (screen || "")
    .split("x")
    .map(Number)
    .sort((a, b) => a - b)
    .join("x");
  const visitor = (await sha256Hex(`${ip}|${userAgent}|${screenKey}|${lang || ""}`)).slice(0, 16);

  // A reload (same visitor, same page, within 30 minutes of their last view of it) updates that visit instead.
  const recent = await env.DB.prepare(
    `SELECT id FROM visits WHERE visitor = ?1 AND path = ?2 AND ts >= ?3 AND COALESCE(last_ts, ts) >= ?4
     ORDER BY id DESC LIMIT 1`
  )
    .bind(visitor, path, new Date(now - 86400000).toISOString(), new Date(now - RELOAD_WINDOW_MS).toISOString())
    .first();
  if (recent) {
    await env.DB.prepare("UPDATE visits SET reloads = reloads + 1, last_ts = ?1, last_pv_id = ?2 WHERE id = ?3")
      .bind(now.toISOString(), body.id, recent.id)
      .run();
    return empty(204);
  }

  const isp = str(cf.asOrganization, 200);
  const label = labelFor(await loadLabels(env), ip);
  const { device, os, browser } = parseUserAgent(userAgent);
  const siteHosts = origins.map((o) => new URL(o).hostname);
  const referrer = str(body.ref, 500);

  await env.DB.prepare(
    `INSERT OR IGNORE INTO visits
       (pv_id, ts, visitor, ip, org, isp, asn, kind, city, region, region_code, postal, country, continent, lat, lon, tz,
        path, title, referrer, ref_host, utm_source, device, os, browser, screen, lang, user_agent)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28)`
  )
    .bind(
      body.id,
      now.toISOString(),
      visitor,
      ip || null,
      label ? label.name : isp,
      isp,
      Number.isInteger(cf.asn) ? cf.asn : null,
      label ? label.kind : classifyNetwork(isp, null),
      str(cf.city, 100),
      str(cf.region, 100),
      str(cf.regionCode, 10),
      str(cf.postalCode, 20),
      str(cf.country, 2),
      str(cf.continent, 2),
      coordinate(cf.latitude),
      coordinate(cf.longitude),
      str(cf.timezone, 64),
      path,
      str(body.title, 200),
      referrer,
      referrerHost(referrer, siteHosts),
      str(body.utm, 100),
      device,
      os,
      browser,
      screen,
      lang,
      userAgent.slice(0, 400)
    )
    .run();

  // The reverse-DNS and network-name lookups run after the response has been sent.
  ctx.waitUntil(enrich(env, body.id, ip, isp, cf.asn).catch((err) => console.error("enrich", err)));
  return empty(204);
}

async function recordLeave(request, env) {
  const rejected = await rejectEvent(request, env, allowedOrigins(env));
  if (rejected) return rejected;

  const body = await readJson(request);
  const seconds = Math.round(Number(body?.seconds));
  if (!PV_ID.test(body?.id || "") || !Number.isFinite(seconds) || seconds < 0) return empty(400);

  // The id may belong to the visit itself or to its latest reload.
  await env.DB.prepare("UPDATE visits SET duration_s = MAX(COALESCE(duration_s, 0), ?1) WHERE pv_id = ?2 OR last_pv_id = ?2")
    .bind(Math.min(seconds, MAX_DURATION_S), body.id)
    .run();
  return empty(204);
}

// Something the visitor did on the page: a link opened, a scroll milestone, an effect used, a copy.
async function recordEvent(request, env) {
  const rejected = await rejectEvent(request, env, allowedOrigins(env));
  if (rejected) return rejected;
  const userAgent = request.headers.get("User-Agent") || "";
  if (!userAgent || isBot(userAgent)) return empty(204);

  const body = await readJson(request);
  if (!body || !PV_ID.test(body.id || "") || !EVENT_TYPES.has(body.type)) return empty(400);

  // The id may be the visit's own or that of its latest reload. Each page view keeps at most a few dozen events.
  const visit = await env.DB.prepare(
    "SELECT visitor, (SELECT COUNT(*) FROM events WHERE pv_id = ?1) AS n FROM visits WHERE pv_id = ?1 OR last_pv_id = ?1 LIMIT 1"
  )
    .bind(body.id)
    .first();
  if (!visit || visit.n >= MAX_EVENTS_PER_VIEW) return empty(204);

  await env.DB.prepare("INSERT INTO events (pv_id, visitor, ts, type, detail) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(body.id, visit.visitor, new Date().toISOString(), body.type, body.detail == null ? null : str(String(body.detail), 300))
    .run();
  return empty(204);
}

async function rejectEvent(request, env, origins) {
  if (request.method !== "POST") return empty(405);
  if (!origins.includes(request.headers.get("Origin"))) return empty(403);
  if (Number(request.headers.get("Content-Length") || 0) > MAX_BODY_BYTES) return empty(413);
  if (await rateLimited(env.LIMITER, request.headers.get("CF-Connecting-IP") || "unknown")) return empty(429);
  return null;
}

// Adds the reverse-DNS hostname and, when Cloudflare gave no organisation, the network's name from RIPE.
async function enrich(env, pvId, ip, isp, asn) {
  const [hostname, holder] = await Promise.all([reverseDns(ip), isp ? null : asHolder(asn)]);
  if (!hostname && !holder) return;
  const kind = classifyNetwork(isp || holder, hostname);
  // A network you named keeps its name and type (its org differs from its isp). SQLite reads the
  // old row on the right-hand sides, so `org IS isp` means "not labelled" here.
  await env.DB.prepare(
    `UPDATE visits SET
       hostname = COALESCE(?1, hostname), host_domain = COALESCE(?2, host_domain),
       org = CASE WHEN org IS isp THEN COALESCE(isp, ?3) ELSE org END,
       kind = CASE WHEN org IS isp THEN ?4 ELSE kind END,
       isp = COALESCE(isp, ?3)
     WHERE pv_id = ?5`
  )
    .bind(hostname, hostname ? registrableDomain(hostname) : null, holder, kind, pvId)
    .run();
}

// Name of an autonomous system from RIPE Stat, e.g. 10929 -> "eStruxture Data Centers Inc.".
async function asHolder(asn) {
  if (!Number.isInteger(asn)) return null;
  try {
    const res = await fetch(`https://stat.ripe.net/data/as-overview/data.json?resource=AS${asn}`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const holder = (await res.json()).data?.holder;
    if (typeof holder !== "string" || !holder.trim()) return null;
    // "ESTRUXTURE-QC-10929 - eStruxture Data Centers Inc." -> the readable part after the dash
    const parts = holder.split(" - ");
    return (parts.length > 1 ? parts.slice(1).join(" - ") : holder).trim().slice(0, 200) || null;
  } catch {
    return null;
  }
}

// PTR lookup over DNS-over-HTTPS, e.g. 128.2.42.10 -> "wifi-128-2-42-10.wifi.cmu.edu".
async function reverseDns(ip) {
  const name = ptrName(ip);
  if (!name) return null;
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${name}&type=PTR`, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const answer = (data.Answer || []).find((a) => a.type === 12 && typeof a.data === "string");
    return answer ? answer.data.replace(/\.$/, "").toLowerCase().slice(0, 253) || null : null;
  } catch {
    return null;
  }
}

function ptrName(ip) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return `${ip.split(".").reverse().join(".")}.in-addr.arpa`;
  const hex = expandIPv6(ip);
  return hex ? `${hex.split("").reverse().join(".")}.ip6.arpa` : null;
}

function expandIPv6(ip) {
  if (!ip.includes(":") || ip.includes(".")) return null;
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups
    .map((g) => g.padStart(4, "0"))
    .join("")
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Public, aggregated data for the map on the website (city level, no IPs or organizations)

async function publicMap(env) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=900",
  };
  const cached = await env.DB.prepare("SELECT value, updated FROM cache WHERE key = ?1").bind(MAP_CACHE_KEY).first();
  if (cached && Date.now() - Date.parse(cached.updated) < MAP_CACHE_TTL_MS) return new Response(cached.value, { headers });
  return new Response(await refreshMapCache(env), { headers });
}

async function refreshMapCache(env) {
  const [points, totals] = await env.DB.batch([
    env.DB.prepare(
      `SELECT city, country, ROUND(lat, 1) AS lat, ROUND(lon, 1) AS lon, COUNT(*) AS views
       FROM visits WHERE lat IS NOT NULL AND lon IS NOT NULL AND kind IS NOT 'cloud'
       GROUP BY city, country, ROUND(lat, 1), ROUND(lon, 1) ORDER BY views DESC LIMIT 500`
    ),
    env.DB.prepare(
      `SELECT COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors, COUNT(DISTINCT country) AS countries,
              COUNT(DISTINCT city || '|' || country) AS cities
       FROM visits WHERE kind IS NOT 'cloud'`
    ),
  ]);
  const updated = new Date().toISOString();
  const value = JSON.stringify({ updated, ...totals.results[0], points: points.results });
  await env.DB.prepare(
    "INSERT INTO cache (key, value, updated) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated = excluded.updated"
  )
    .bind(MAP_CACHE_KEY, value, updated)
    .run();
  return value;
}

async function eraseOldIps(env) {
  const days = Number(env.IP_RETENTION_DAYS);
  if (!(days > 0)) return;
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  await env.DB.prepare("UPDATE visits SET ip = NULL WHERE ip IS NOT NULL AND ts < ?1").bind(cutoff).run();
}

// ---------------------------------------------------------------------------
// Private dashboard API, used by the /visitors/ page on the website.
// The password is never stored: the DASHBOARD_PASSWORD_HASH secret holds only a salted PBKDF2 hash
// (made by `npm run password`). Signing in returns a token that is valid for 30 days.

const PRIVATE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function dashboardUrl(env) {
  const site = allowedOrigins(env)[0];
  return env.DASHBOARD_URL || (site ? `${site}/visitors/` : "");
}

async function dashboardApi(request, env, url) {
  // The dashboard page lives on the website's own domain, so its requests are cross-origin.
  const origin = request.headers.get("Origin");
  const cors = allowedOrigins(env).includes(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, DELETE",
        "Access-Control-Expose-Headers": "Content-Disposition",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      }
    : { Vary: "Origin" };
  let response;
  try {
    response = request.method === "OPTIONS" ? new Response(null, { status: 204 }) : await dashboardResponse(request, env, url);
  } catch (err) {
    // Errors also need the CORS headers, or the browser hides them behind a generic "CORS" failure.
    console.error(err);
    response = json({ error: "Server error" }, 500);
  }
  for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
  return response;
}

async function dashboardResponse(request, env, url) {
  if (!env.DASHBOARD_PASSWORD_HASH) return json({ error: "No dashboard password is set yet. Run: npm run password (in visit-tracker/)" }, 503);
  if (url.pathname === "/api/login") return login(request, env);
  if (!(await validSession(request, env))) return json({ error: "Please sign in again." }, 401);
  if (url.pathname === "/api/labels") return labelsApi(request, env, url);
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const params = url.searchParams;
  switch (url.pathname) {
    case "/api/summary":
      return json(await summary(env, params));
    case "/api/visits":
      return json(await visitList(env, params));
    case "/api/live":
      return json(await live(env));
    case "/api/export.csv":
      return exportCsv(env, params);
  }
  return json({ error: "Not found" }, 404);
}

async function login(request, env) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (await rateLimited(env.LOGIN_LIMITER, request.headers.get("CF-Connecting-IP") || "unknown")) {
    return json({ error: "Too many attempts. Wait a minute and try again." }, 429);
  }
  const body = await readJson(request);
  if (typeof body?.password !== "string" || !(await passwordMatches(body.password, env.DASHBOARD_PASSWORD_HASH))) {
    return json({ error: "Wrong password." }, 401);
  }
  return json({ token: await signSession(env, Date.now() + SESSION_MS) });
}

// Stored format: "pbkdf2-sha256:<iterations>:<salt, base64>:<hash, base64>".
async function passwordMatches(password, stored) {
  const [scheme, iterationsText, salt, hash] = String(stored).split(":");
  const iterations = Number(iterationsText);
  if (scheme !== "pbkdf2-sha256" || !(iterations > 0 && iterations <= 100000) || !salt || !hash) return false;
  const expected = base64ToBytes(hash);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: base64ToBytes(salt), iterations }, key, expected.length * 8);
  return crypto.subtle.timingSafeEqual(new Uint8Array(bits), expected);
}

// Session tokens are "<expiry ms>.<HMAC>", keyed on the password hash, so changing the password signs everyone out.
async function sessionKey(env) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`session:${env.DASHBOARD_PASSWORD_HASH}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function signSession(env, expires) {
  const signature = await crypto.subtle.sign("HMAC", await sessionKey(env), new TextEncoder().encode(String(expires)));
  return `${expires}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function validSession(request, env) {
  const match = /^Bearer (\d{13})\.([\w-]{43})$/.exec(request.headers.get("Authorization") || "");
  if (!match || Number(match[1]) < Date.now()) return false;
  return crypto.subtle.verify("HMAC", await sessionKey(env), base64ToBytes(match[2]), new TextEncoder().encode(match[1]));
}

function buildFilter(params) {
  const now = Date.now();
  const to = parseDate(params.get("to")) || new Date(now + 60000);
  const from = parseDate(params.get("from")) || new Date(now - 30 * 86400000);
  const clauses = ["ts >= ?", "ts < ?"];
  const args = [from.toISOString(), to.toISOString()];

  const network = params.get("network");
  if (network === "academic") clauses.push("kind = 'academic'");
  else if (network === "people") clauses.push("kind IS NOT 'cloud'");

  for (const field of FILTER_FIELDS) {
    if (!params.has(field)) continue;
    const value = params.get(field);
    if (value === "") clauses.push(`${field} IS NULL`);
    else {
      clauses.push(`${field} = ?`);
      args.push(value);
    }
  }

  const q = (params.get("q") || "").trim().slice(0, 100);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    clauses.push(`(${SEARCH_FIELDS.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
    args.push(...SEARCH_FIELDS.map(() => like));
  }
  return { where: clauses.join(" AND "), args, from, to };
}

async function summary(env, params) {
  const { where, args, from, to } = buildFilter(params);
  const offset = clampInt(params.get("tz"), -840, 840, 0); // viewer's minutes east of UTC, for day buckets
  const modifier = `${offset >= 0 ? "+" : ""}${offset} minutes`;
  const span = to - from;
  const bucket = span <= 2 * 86400000 ? "hour" : span <= 120 * 86400000 ? "day" : "week";
  const bucketSql = {
    hour: "strftime('%Y-%m-%dT%H:00', ts, ?)",
    day: "date(ts, ?)",
    week: "date(ts, ?, 'weekday 0', '-6 days')",
  }[bucket];
  const stmt = (sql, ...before) => env.DB.prepare(sql).bind(...before, ...args);

  const inPeriod = `pv_id IN (SELECT pv_id FROM visits WHERE ${where})`;
  const [totals, timeline, places, pages, referrers, devices, links, activity] = await env.DB.batch([
    stmt(
      `SELECT COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors, COUNT(DISTINCT country) AS countries,
              COUNT(DISTINCT org) AS orgs, COUNT(DISTINCT CASE WHEN kind = 'academic' THEN org END) AS academic_orgs,
              COUNT(CASE WHEN kind = 'academic' THEN 1 END) AS academic_views,
              AVG(duration_s) AS avg_duration, MIN(ts) AS first_ts, MAX(ts) AS last_ts
       FROM visits WHERE ${where}`
    ),
    stmt(
      `SELECT ${bucketSql} AS bucket, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
       FROM visits WHERE ${where} GROUP BY bucket ORDER BY bucket`,
      modifier
    ),
    stmt(
      `SELECT country, region, city, lat, lon, org, kind, MAX(host_domain) AS host_domain,
              COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors, MAX(ts) AS last_ts
       FROM visits WHERE ${where}
       GROUP BY country, region, city, lat, lon, org, kind ORDER BY views DESC LIMIT 5000`
    ),
    stmt(
      `SELECT path, MAX(title) AS title, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors, AVG(duration_s) AS avg_duration
       FROM visits WHERE ${where} GROUP BY path ORDER BY views DESC LIMIT 50`
    ),
    stmt(
      `SELECT ref_host, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
       FROM visits WHERE ${where} AND ref_host IS NOT NULL GROUP BY ref_host ORDER BY views DESC LIMIT 50`
    ),
    stmt(
      `SELECT device, os, browser, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
       FROM visits WHERE ${where} GROUP BY device, os, browser ORDER BY views DESC LIMIT 50`
    ),
    stmt(
      `SELECT type, detail, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors
       FROM events WHERE type IN ('link', 'download') AND ${inPeriod} GROUP BY type, detail ORDER BY views DESC LIMIT 50`
    ),
    stmt(`SELECT type, COUNT(*) AS n, COUNT(DISTINCT visitor) AS visitors FROM events WHERE ${inPeriod} GROUP BY type`),
  ]);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    bucket,
    totals: totals.results[0],
    timeline: timeline.results,
    places: places.results,
    pages: pages.results,
    referrers: referrers.results,
    devices: devices.results,
    links: links.results,
    activity: activity.results,
  };
}

async function visitList(env, params) {
  const { where, args } = buildFilter(params);
  const limit = clampInt(params.get("limit"), 1, 200, 50);
  const offset = clampInt(params.get("offset"), 0, 1e7, 0);
  const { results } = await env.DB.prepare(`SELECT ${VISIT_COLUMNS} FROM visits WHERE ${where} ORDER BY ts DESC, id DESC LIMIT ? OFFSET ?`)
    .bind(...args, limit + 1, offset)
    .all();
  const visits = results.slice(0, limit);
  await attachEvents(env, visits);
  return { visits, more: results.length > limit };
}

// Adds `events` (oldest first) to each visit: those of the visit itself and of its latest reload.
async function attachEvents(env, visits) {
  const ids = [...new Set(visits.flatMap((v) => [v.pv_id, v.last_pv_id]).filter(Boolean))];
  const byPv = new Map();
  for (let i = 0; i < ids.length; i += BIND_CHUNK) {
    const chunk = ids.slice(i, i + BIND_CHUNK);
    const { results } = await env.DB.prepare(
      `SELECT pv_id, ts, type, detail FROM events WHERE pv_id IN (${chunk.map(() => "?").join(",")}) ORDER BY ts, id`
    )
      .bind(...chunk)
      .all();
    for (const e of results) {
      if (!byPv.has(e.pv_id)) byPv.set(e.pv_id, []);
      byPv.get(e.pv_id).push({ ts: e.ts, type: e.type, detail: e.detail });
    }
  }
  for (const v of visits) {
    v.events = byPv.get(v.pv_id) || [];
    if (v.last_pv_id && v.last_pv_id !== v.pv_id) v.events = v.events.concat(byPv.get(v.last_pv_id) || []);
  }
}

async function live(env) {
  const since = new Date(Date.now() - 5 * 60000).toISOString();
  const dayAgo = new Date(Date.now() - 86400000).toISOString();
  const [now, last] = await env.DB.batch([
    // A reload only updates last_ts, so count visits opened *or reloaded* in the last 5 minutes.
    env.DB.prepare("SELECT COUNT(DISTINCT visitor) AS visitors FROM visits WHERE ts >= ?2 AND COALESCE(last_ts, ts) >= ?1").bind(since, dayAgo),
    env.DB.prepare("SELECT MAX(id) AS last_id FROM visits"),
  ]);
  return { visitors: now.results[0].visitors, last_id: last.results[0].last_id };
}

async function exportCsv(env, params) {
  const { where, args } = buildFilter(params);
  const { results } = await env.DB.prepare(`SELECT ${VISIT_COLUMNS} FROM visits WHERE ${where} ORDER BY ts DESC LIMIT 100000`)
    .bind(...args)
    .all();
  const columns = VISIT_COLUMNS.split(", ");
  const lines = [columns.join(","), ...results.map((row) => columns.map((c) => csvCell(row[c])).join(","))];
  return new Response(lines.join("\r\n"), {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="visits-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

// ---------------------------------------------------------------------------
// Network labels: your own names for networks that public records only list under their
// internet provider (e.g. a campus whose addresses are registered to Etisalat).

let labelCache = { at: 0, labels: [] };

async function loadLabels(env, fresh = false) {
  if (fresh || Date.now() - labelCache.at > LABEL_CACHE_MS) {
    const { results } = await env.DB.prepare("SELECT prefix, name, kind, created FROM network_labels").all();
    const labels = results.map((l) => ({ ...l, range: parsePrefix(l.prefix) })).filter((l) => l.range);
    // Most specific first, so a single address wins over the range around it.
    labels.sort((a, b) => b.range.bits - a.range.bits);
    labelCache = { at: Date.now(), labels };
  }
  return labelCache.labels;
}

function labelFor(labels, ip) {
  const addr = parseIp(ip);
  return addr ? labels.find((l) => inRange(addr, l.range)) || null : null;
}

async function labelsApi(request, env, url) {
  if (request.method === "GET") return json({ labels: (await loadLabels(env, true)).map(({ range, ...label }) => label) });

  if (request.method === "POST") {
    const body = await readJson(request);
    const range = parsePrefix(body?.prefix);
    const name = str(body?.name, 120);
    if (!range || !name) {
      return json({ error: "Give a name and an IP address or range, e.g. 5.195.0.145 or 5.195.0.0/24 (at most a /16)." }, 400);
    }
    const kind = LABEL_KINDS.includes(body.kind) ? body.kind : "other";
    await env.DB.prepare(
      "INSERT INTO network_labels (prefix, name, kind, created) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(prefix) DO UPDATE SET name = excluded.name, kind = excluded.kind"
    )
      .bind(range.text, name, kind, new Date().toISOString())
      .run();
    return json({ prefix: range.text, updated: await relabel(env, range) });
  }

  if (request.method === "DELETE") {
    const range = parsePrefix(url.searchParams.get("prefix"));
    if (!range) return json({ error: "Unknown range" }, 400);
    await env.DB.prepare("DELETE FROM network_labels WHERE prefix = ?1").bind(range.text).run();
    return json({ updated: await relabel(env, range) });
  }
  return json({ error: "Method not allowed" }, 405);
}

// After a label is added or removed, re-applies the best matching label to stored visits inside `range`.
async function relabel(env, range) {
  const labels = await loadLabels(env, true);
  const { results } = await env.DB.prepare("SELECT id, ip, isp, org, kind, hostname FROM visits WHERE ip IS NOT NULL").all();
  const updates = [];
  for (const v of results) {
    const addr = parseIp(v.ip);
    if (!addr || !inRange(addr, range)) continue;
    const label = labelFor(labels, v.ip);
    const org = label ? label.name : v.isp;
    const kind = label ? label.kind : classifyNetwork(v.isp, v.hostname);
    if (org !== v.org || kind !== v.kind) {
      updates.push(env.DB.prepare("UPDATE visits SET org = ?1, kind = ?2 WHERE id = ?3").bind(org, kind, v.id));
    }
  }
  for (let i = 0; i < updates.length; i += 100) await env.DB.batch(updates.slice(i, i + 100));
  return updates.length;
}

function parseIp(ip) {
  if (typeof ip !== "string") return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.some((n) => n > 255)) return null;
    return { v: 4, n: parts.reduce((acc, n) => (acc << 8n) | BigInt(n), 0n) };
  }
  const hex = expandIPv6(ip);
  return hex ? { v: 6, n: BigInt(`0x${hex}`) } : null;
}

// "5.195.0.145" or "5.195.0.0/24" (IPv4 down to /16, IPv6 down to /32).
function parsePrefix(prefix) {
  if (typeof prefix !== "string") return null;
  const [base, bitsText, extra] = prefix.trim().toLowerCase().split("/");
  const addr = parseIp(base);
  if (!addr || extra !== undefined) return null;
  const size = addr.v === 4 ? 32 : 128;
  const bits = bitsText === undefined ? size : /^\d{1,3}$/.test(bitsText) ? Number(bitsText) : NaN;
  if (!(bits >= (addr.v === 4 ? 16 : 32) && bits <= size)) return null;
  const shift = BigInt(size - bits);
  const network = (addr.n >> shift) << shift;
  // Store IPv4 ranges by their first address, so 5.195.0.145/24 and 5.195.0.0/24 are the same label.
  const start = addr.v === 4 ? [24n, 16n, 8n, 0n].map((s) => Number((network >> s) & 255n)).join(".") : base;
  return { v: addr.v, n: network, bits, size, text: bits === size ? base : `${start}/${bits}` };
}

function inRange(addr, range) {
  if (addr.v !== range.v) return false;
  const shift = BigInt(range.size - range.bits);
  return addr.n >> shift === range.n >> shift;
}

// ---------------------------------------------------------------------------
// Helpers

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter((s) => URL.canParse(s));
}

async function rateLimited(limiter, key) {
  if (!limiter) return false;
  try {
    const { success } = await limiter.limit({ key });
    return !success;
  } catch {
    return false;
  }
}

function base64ToBytes(text) {
  return Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}

function bytesToBase64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function str(value, max) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function coordinate(value) {
  const n = Number(value);
  return value != null && value !== "" && Number.isFinite(n) ? n : null;
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function csvCell(value) {
  if (value == null) return "";
  let s = String(value);
  // Stop spreadsheet apps from treating visitor-supplied text (titles, referrers) as formulas.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function sha256(text) {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
}

async function sha256Hex(text) {
  return [...new Uint8Array(await sha256(text))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function empty(status) {
  return new Response(null, { status });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...PRIVATE_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}
