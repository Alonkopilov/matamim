import { decodeEntities } from "./recipe.ts";
import { fetchHtml, fetchJson, resolveRedirects } from "./safeFetch.ts";

// Social posts keep the recipe in the caption, which the post's page loads
// with JavaScript or hides behind a login. Each platform has a lighter way to
// read it. The video itself isn't read, so a recipe only spoken or shown in it
// can't be imported this way.

const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY");

function siteOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^(www|m)\./, "");
}

function readerFor(url: URL): ((url: URL) => Promise<string>) | null {
  const site = siteOf(url);
  if (site === "tiktok.com" || site.endsWith(".tiktok.com")) return readTikTok;
  if (site === "instagram.com" || site === "instagr.am") return readInstagram;
  if (site === "youtube.com" || site === "youtu.be") return readYouTube;
  return null;
}

/** Whether the link is on TikTok, Instagram or YouTube */
export function isSocialLink(url: URL): boolean {
  return readerFor(url) !== null;
}

/**
 * The caption or description of a TikTok, Instagram or YouTube post.
 * @returns null when the link isn't a post on one of them, "" when it is but
 * its caption couldn't be read.
 */
export async function readSocialCaption(url: URL): Promise<string | null> {
  const read = readerFor(url);
  if (!read) return null;
  const site = siteOf(url);

  try {
    return (await read(url)).trim();
  } catch (err) {
    console.warn("Reading a social caption failed:", site, err);
    return "";
  }
}

// --- TikTok ---

async function readTikTok(url: URL): Promise<string> {
  // Shared links are short ones (vm.tiktok.com/abc) that redirect to the video
  const video = /\/video\/\d+/.test(url.pathname) ? url : await resolveRedirects(url);
  if (!/\/(video|photo)\/\d+/.test(video.pathname)) return "";
  const canonical = `${video.origin}${video.pathname}`;

  // The public oEmbed endpoint returns the caption as the title. It sometimes
  // answers 503 when busy, so it's tried twice before reading the page.
  const oembed = new URL("https://www.tiktok.com/oembed");
  oembed.searchParams.set("url", canonical);
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await fetchJson(oembed) as { title?: unknown } | null;
    if (typeof data?.title === "string" && data.title) return data.title;
  }

  // The video's page embeds its data, caption included, as JSON
  const html = await fetchHtml(new URL(canonical));
  const json = html.match(
    /<script id="api-data"[^>]*>([\s\S]*?)<\/script>/,
  )?.[1];
  if (!json) return "";
  try {
    const desc = JSON.parse(json)?.videoDetail?.itemInfo?.itemStruct?.desc;
    return typeof desc === "string" ? desc : "";
  } catch {
    return "";
  }
}

// --- Instagram ---

async function readInstagram(url: URL): Promise<string> {
  const post = siteOf(url) === "instagr.am" ? await resolveRedirects(url) : url;
  const match = post.pathname.match(/^\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]+)/);
  if (!match) return "";
  const type = match[1] === "reels" ? "reel" : match[1];
  const code = match[2];

  // The embed page shows the caption without a login
  const embed = await fetchHtml(
    new URL(`https://www.instagram.com/${type}/${code}/embed/captioned/`),
  );
  const caption = embed.match(
    /<div class="Caption">([\s\S]*?)<div class="CaptionComments">/,
  )?.[1];
  if (caption) {
    return htmlToText(
      caption.replace(/<a class="CaptionUsername"[\s\S]*?<\/a>/, ""),
    );
  }

  // Otherwise the post's preview text, "123 likes, 4 comments - user on
  // March 1, 2026: "caption"", which may be cut short
  const page = await fetchHtml(new URL(`https://www.instagram.com/${type}/${code}/`));
  const description = metaContent(page, "og:description") ?? "";
  return description.match(/^[^:]*:\s*"([\s\S]*)"\.?\s*$/)?.[1] ?? description;
}

// --- YouTube ---

async function readYouTube(url: URL): Promise<string> {
  const id = youTubeId(url);
  if (!id) return "";

  if (YOUTUBE_API_KEY) {
    const api = new URL("https://www.googleapis.com/youtube/v3/videos");
    api.searchParams.set("part", "snippet");
    api.searchParams.set("id", id);
    api.searchParams.set("key", YOUTUBE_API_KEY);
    const data = await fetchJson(api) as {
      items?: { snippet?: { title?: string; description?: string } }[];
    } | null;
    const snippet = data?.items?.[0]?.snippet;
    if (snippet) return `${snippet.title ?? ""}\n${snippet.description ?? ""}`;
  }

  // The watch page embeds the video's details, description included
  const html = await fetchHtml(new URL(`https://www.youtube.com/watch?v=${id}`));
  const title = jsonString(html, /"videoDetails":\{"videoId":"[\w-]+","title":/);
  const description = jsonString(html, /"shortDescription":/);
  return `${title}\n${description}`;
}

// Videos, Shorts and short links: watch?v=ID, /shorts/ID, youtu.be/ID
function youTubeId(url: URL): string | null {
  const id = siteOf(url) === "youtu.be"
    ? url.pathname.slice(1)
    : url.searchParams.get("v") ??
      url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]+)/)?.[1];
  return id && /^[\w-]{6,20}$/.test(id) ? id : null;
}

// --- Helpers ---

// The JSON string right after a key, e.g. "shortDescription":"..."
function jsonString(html: string, key: RegExp): string {
  const start = html.search(key);
  if (start === -1) return "";
  const rest = html.slice(start).replace(key, "");
  const literal = rest.match(/^"(?:[^"\\]|\\.)*"/)?.[0];
  if (!literal) return "";
  try {
    return JSON.parse(literal);
  } catch {
    return "";
  }
}

function metaContent(html: string, property: string): string | null {
  const tag = html.match(
    new RegExp(`<meta[^>]+(?:property|name)="${property}"[^>]*>`, "i"),
  )?.[0];
  const content = tag?.match(/content="([^"]*)"/i)?.[1];
  return content === undefined ? null : decodeEntities(content);
}

function htmlToText(html: string): string {
  return decodeEntities(
    html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""),
  );
}
