import { ImportError } from "./errors.ts";

const MAX_REDIRECTS = 5;
// Per attempt, including reading the page. A failed connection is retried
// once, since the first connection to some sites stalls while the next one
// answers right away. Slow sites (e.g. foody.co.il) can take over 8s to render.
const FETCH_TIMEOUT_MS = 12_000;
const FETCH_ATTEMPTS = 2;
const MAX_HTML_BYTES = 4 * 1024 * 1024;

// Deno's HTTP/2 client fails against some sites that browsers load fine (e.g.
// athome.starbucks.com), and one page doesn't gain anything from HTTP/2
let http1Client: Deno.HttpClient | undefined;
try {
  http1Client = Deno.createHttpClient({ http2: false });
} catch (err) {
  console.warn("HTTP/1.1 client unavailable, using the default:", err);
}

// Query parameters that only track where the click came from. Anything else
// is kept, since some sites use the query to pick the page (e.g. ?p=123).
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "igshid",
  // Instagram's and YouTube's share links
  "igsh",
  "si",
  "mc_cid",
  "mc_eid",
  "yclid",
  "_ga",
  "_gl",
  "ref",
  "ref_src",
  "share",
]);

function isTrackingParam(key: string): boolean {
  const name = key.toLowerCase();
  return name.startsWith("utm_") || TRACKING_PARAMS.has(name);
}

/**
 * Parses a user-supplied URL into the address to fetch, without its tracking
 * parameters. They're removed before the fetch, not only from the cache key:
 * a site that serves another page for one (e.g. ?share=) would otherwise have
 * that page saved as the recipe of the link without it. The rest is kept as
 * shared so the site doesn't have to redirect it (e.g. WordPress adds the
 * trailing slash).
 */
export function parseUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new ImportError(400, "INVALID_URL");
  }

  assertPublicUrlShape(url);
  url.hash = "";
  // Rewriting the query re-encodes it, so it's only done when needed
  if ([...url.searchParams.keys()].some(isTrackingParam)) {
    url.search = new URLSearchParams(
      [...url.searchParams].filter(([key]) => !isTrackingParam(key)),
    ).toString();
  }
  return url;
}

/**
 * Evens out what doesn't change the page (the parameters' order, a trailing
 * slash), so the same recipe shared from different places maps to one cache
 * entry. Takes a URL from parseUrl(), which is what gets fetched.
 */
export function cacheKey(input: URL): string {
  const url = new URL(input);
  url.hostname = url.hostname.toLowerCase();
  const params = [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = new URLSearchParams(params).toString();
  // One slash only: "/recipe//" may be another page, like the site's 404
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

// Checks that only need the URL itself, before any DNS lookup
function assertPublicUrlShape(url: URL) {
  if (url.protocol !== "https:") {
    throw new ImportError(400, "NOT_HTTPS");
  }
  if (url.username || url.password || (url.port && url.port !== "443")) {
    throw new ImportError(400, "INVALID_URL");
  }

  const host = url.hostname.toLowerCase();
  const isIpLiteral = host.startsWith("[") || /^[\d.]+$/.test(host);
  const isInternalName = !host.includes(".") ||
    host === "localhost" ||
    /\.(localhost|local|internal|intranet|lan|home|corp)$/.test(host);
  if (isIpLiteral || isInternalName) {
    throw new ImportError(400, "PRIVATE_ADDRESS");
  }
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return true;
  const [a, b] = parts;
  return a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224; // multicast and reserved
}

function isPrivateIpv6(ip: string): boolean {
  const addr = ip.toLowerCase();
  if (addr === "::" || addr === "::1") return true;
  // IPv4-mapped (::ffff:10.0.0.1) and NAT64 (64:ff9b::10.0.0.1)
  const embeddedV4 = addr.match(/(?:::ffff:|^64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (embeddedV4) return isPrivateIpv4(embeddedV4[1]);
  return /^f[cd]/.test(addr) || // unique local
    /^fe[89ab]/.test(addr) || // link-local
    addr.startsWith("ff"); // multicast
}

// Resolves the host and rejects it if any of its addresses is internal, so a
// public name pointing at a private address can't reach our network
async function assertPublicHost(host: string) {
  const lookups = await Promise.allSettled([
    Deno.resolveDns(host, "A"),
    Deno.resolveDns(host, "AAAA"),
  ]);
  const v4 = lookups[0].status === "fulfilled" ? lookups[0].value : [];
  const v6 = lookups[1].status === "fulfilled" ? lookups[1].value : [];

  if (v4.length === 0 && v6.length === 0) {
    throw new ImportError(400, "HOST_NOT_FOUND");
  }
  if (v4.some(isPrivateIpv4) || v6.some(isPrivateIpv6)) {
    throw new ImportError(400, "PRIVATE_ADDRESS");
  }
}

function charsetOf(contentType: string, head: Uint8Array): string {
  const fromHeader = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  if (fromHeader) return fromHeader;
  // Older Hebrew sites often declare windows-1255 only in a meta tag
  const start = new TextDecoder("ascii").decode(head.subarray(0, 4096));
  return start.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? "utf-8";
}

async function readLimited(res: Response): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (err) {
      // The fetch's timeout also covers the body
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new ImportError(504, "SITE_TIMEOUT");
      }
      throw new ImportError(502, "SITE_UNREACHABLE");
    }
    const { done, value } = chunk;
    if (done) break;
    size += value.length;
    if (size > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new ImportError(422, "PAGE_TOO_LARGE");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function fetchWithRetry(url: URL, accept: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(url, {
        redirect: "manual",
        client: http1Client,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          // Many recipe sites block requests that don't look like a browser
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36",
          "Accept": accept,
          "Accept-Language": "he-IL,he;q=0.9,en;q=0.8",
        },
      });
    } catch (err) {
      if (attempt < FETCH_ATTEMPTS) continue;
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new ImportError(504, "SITE_TIMEOUT");
      }
      throw new ImportError(502, "SITE_UNREACHABLE");
    }
  }
}

/**
 * Fetches a URL, following redirects by hand so every hop is checked against
 * internal addresses. The caller reads or cancels the body.
 */
async function fetchPublic(
  url: URL,
  accept = "text/html,application/xhtml+xml",
): Promise<{ res: Response; url: URL }> {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertPublicUrlShape(current);
    await assertPublicHost(current.hostname);

    const res = await fetchWithRetry(current, accept);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel();
      if (!location) throw new ImportError(502, "SITE_ERROR");
      current = new URL(location, current);
      continue;
    }
    return { res, url: current };
  }

  throw new ImportError(422, "TOO_MANY_REDIRECTS");
}

/** Downloads a page's HTML, with its size and time capped */
export async function fetchHtml(url: URL): Promise<string> {
  const { res } = await fetchPublic(url);

  if (res.status === 404 || res.status === 410) {
    await res.body?.cancel();
    throw new ImportError(422, "PAGE_NOT_FOUND");
  }
  // 402 is Cloudflare's pay-per-crawl answer to bots
  if ([401, 402, 403, 429].includes(res.status)) {
    await res.body?.cancel();
    throw new ImportError(422, "SITE_BLOCKED");
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw new ImportError(502, "SITE_ERROR");
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml/i.test(contentType)) {
    await res.body?.cancel();
    throw new ImportError(422, "NOT_A_PAGE");
  }

  const bytes = await readLimited(res);
  try {
    return new TextDecoder(charsetOf(contentType, bytes)).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** Where a short link (vm.tiktok.com, instagr.am) ends up */
export async function resolveRedirects(url: URL): Promise<URL> {
  const { res, url: final } = await fetchPublic(url);
  await res.body?.cancel();
  return final;
}

/** A JSON API's answer, null when it fails or isn't JSON */
export async function fetchJson(url: URL): Promise<unknown> {
  const { res } = await fetchPublic(url, "application/json");
  if (!res.ok) {
    await res.body?.cancel();
    return null;
  }
  try {
    return JSON.parse(new TextDecoder().decode(await readLimited(res)));
  } catch {
    return null;
  }
}
