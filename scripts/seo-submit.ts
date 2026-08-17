#!/usr/bin/env tsx
/**
 * pnpm seo:submit
 *
 * Pushes every URL in the sitemap to IndexNow, which fans out to Bing, Yandex,
 * Seznam and Naver from a single request.
 *
 * ── Why there is no Google equivalent ───────────────────────────────────────
 * Google retired the anonymous `google.com/ping?sitemap=` endpoint, and its
 * Indexing API only accepts JobPosting and BroadcastEvent structured data — it
 * is not a general-purpose submission API. For Google the working mechanism is
 * `app/robots.ts` (which advertises the sitemap) plus a one-time Search Console
 * verification. Anyone claiming otherwise is describing a dead endpoint.
 *
 * Usage:
 *   pnpm seo:submit                      # reads NEXT_PUBLIC_SITE_URL
 *   pnpm seo:submit --url https://x.com  # override
 *   pnpm seo:submit --dry-run            # print what would be sent
 */

import fs from "node:fs";
import path from "node:path";

const ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS = 10_000;

interface Args {
  siteUrl: string | null;
  key: string | null;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | null => {
    const index = argv.indexOf(`--${flag}`);
    if (index === -1) return null;
    const value = argv[index + 1];
    return value && !value.startsWith("--") ? value : null;
  };

  return {
    siteUrl: get("url") ?? process.env.NEXT_PUBLIC_SITE_URL ?? null,
    key: get("key") ?? process.env.INDEXNOW_KEY ?? null,
    dryRun: argv.includes("--dry-run"),
  };
}

/** Reads .env.local without adding a dotenv dependency. */
function loadEnvLocal(): void {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key || rawValue === undefined) continue;
    if (process.env[key]) continue;
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (value && !value.startsWith("TODO_")) process.env[key] = value;
  }
}

/**
 * Pulls URLs from the running/ built sitemap.
 *
 * Fetches /sitemap.xml rather than importing app/sitemap.ts, because that
 * module depends on Next's runtime. Falls back to the content directory when
 * no server is reachable, so the script still works offline.
 */
async function collectUrls(siteUrl: string): Promise<string[]> {
  const sitemapUrl = new URL("/sitemap.xml", siteUrl).toString();

  try {
    const response = await fetch(sitemapUrl);
    if (response.ok) {
      const xml = await response.text();
      const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map((match) => match[1]?.trim())
        .filter((value): value is string => Boolean(value));
      if (urls.length > 0) return urls;
    }
  } catch {
    // Server not running — fall through to the filesystem.
  }

  console.warn(`Could not read ${sitemapUrl}; deriving URLs from content/pages instead.`);

  const contentDir = path.join(process.cwd(), "content", "pages");
  const reserved = new Set(["index", "pricing", "book", "thanks"]);
  const slugs = fs.existsSync(contentDir)
    ? fs
        .readdirSync(contentDir)
        .filter((file) => file.endsWith(".mdx"))
        .map((file) => file.replace(/\.mdx$/, ""))
        .filter((slug) => !reserved.has(slug))
    : [];

  return ["/", ...slugs.map((slug) => `/${slug}`), "/pricing", "/book"].map((route) =>
    new URL(route, siteUrl).toString(),
  );
}

function explain(status: number): string {
  switch (status) {
    case 200:
      return "OK — URLs accepted.";
    case 202:
      return "Accepted — key validation pending. This is a success; the engines will fetch your key file shortly.";
    case 400:
      return "Bad request — the payload was malformed.";
    case 403:
      return "Forbidden — the key file was not found or does not match. Confirm https://<host>/<key>.txt is reachable and contains exactly the key.";
    case 422:
      return "Unprocessable — the URLs do not all belong to the host you declared, or the key does not match the host.";
    case 429:
      return "Rate limited — too many submissions. Wait, then retry.";
    default:
      return "Unexpected response.";
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));

  if (!args.siteUrl) {
    console.error("No site URL. Set NEXT_PUBLIC_SITE_URL in .env.local or pass --url.");
    process.exit(1);
  }
  if (!args.key) {
    console.error(
      "No IndexNow key. Run `pnpm init:launch` to generate one, or pass --key.\n" +
        "The key must also be served at https://<host>/<key>.txt.",
    );
    process.exit(1);
  }

  const host = new URL(args.siteUrl).host;

  if (args.siteUrl.includes("localhost") || host.startsWith("127.")) {
    console.error(
      `Refusing to submit "${args.siteUrl}" — IndexNow needs a public host it can fetch the key file from.`,
    );
    process.exit(1);
  }

  const keyFile = path.join(process.cwd(), "public", `${args.key}.txt`);
  if (!fs.existsSync(keyFile)) {
    console.warn(
      `⚠️  public/${args.key}.txt is missing. Submission will 403 until it is deployed and reachable.`,
    );
  }

  const urls = (await collectUrls(args.siteUrl)).slice(0, MAX_URLS);
  if (urls.length === 0) {
    console.error("No URLs to submit.");
    process.exit(1);
  }

  const payload = {
    host,
    key: args.key,
    keyLocation: new URL(`/${args.key}.txt`, args.siteUrl).toString(),
    urlList: urls,
  };

  console.log(`\nIndexNow → ${host}  (${urls.length} URL${urls.length === 1 ? "" : "s"})`);
  for (const url of urls) console.log(`  · ${url}`);

  if (args.dryRun) {
    console.log("\n--dry-run: nothing sent.\n");
    return;
  }

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });

  const ok = response.status === 200 || response.status === 202;
  console.log(`\n${ok ? "✓" : "✗"} ${response.status} — ${explain(response.status)}\n`);

  if (ok) {
    console.log("Reminder: Google does not participate in IndexNow. It picks these up");
    console.log("via robots.txt + sitemap.xml after Search Console verification.\n");
  } else {
    process.exit(1);
  }
}

void main();
