// Helpers for reading a page's HTML in linear time. The page is the site's,
// up to 4 MB, and a regex like /<li\b[^>]*>/ searches to the end of it from
// every "<li" that has no ">" after it: a page made of those takes hours, far
// past the function's CPU limit.

export interface HtmlElement {
  // Where "<tag" starts, and where "</tag>" ends
  start: number;
  end: number;
  // "<tag ...>" with its attributes, and what's between it and "</tag>"
  openingTag: string;
  content: string;
}

/**
 * The elements of the given tags, in page order, like the matches of
 * /<(script|style)\b[\s\S]*?<\/\1>/gi. One that's never closed is skipped,
 * and so are the later ones of its tag, since none of them is closed either.
 */
export function findElements(html: string, tags: string[]): HtmlElement[] {
  const open = new RegExp(`<(${tags.join("|")})\\b`, "gi");
  const unclosed = new Set<string>();
  const elements: HtmlElement[] = [];

  for (let match; (match = open.exec(html));) {
    const tag = match[1].toLowerCase();
    if (unclosed.has(tag)) continue;
    const close = new RegExp(`</${tag}>`, "gi");
    close.lastIndex = open.lastIndex;
    if (!close.exec(html)) {
      unclosed.add(tag);
      continue;
    }

    // Always found, the closing tag has a ">" too
    const tagEnd = html.indexOf(">", match.index) + 1;
    const contentEnd = close.lastIndex - tag.length - 3;
    elements.push({
      start: match.index,
      end: close.lastIndex,
      openingTag: html.slice(match.index, tagEnd),
      content: html.slice(tagEnd, Math.max(tagEnd, contentEnd)),
    });
    open.lastIndex = close.lastIndex;
  }
  return elements;
}

/** The HTML with the elements of the given tags replaced by a space */
export function dropElements(html: string, tags: string[]): string {
  let kept = "";
  let from = 0;
  for (const { start, end } of findElements(html, tags)) {
    kept += html.slice(from, start) + " ";
    from = end;
  }
  return kept + html.slice(from);
}

/**
 * From the first "<tag" to the last "</tag>", like /<tag\b[\s\S]*<\/tag>/i,
 * or undefined when there's no such span.
 */
export function outerElement(html: string, tag: string): string | undefined {
  const start = html.search(new RegExp(`<${tag}\\b`, "i"));
  if (start === -1) return undefined;
  let end = -1;
  for (const match of html.matchAll(new RegExp(`</${tag}>`, "gi"))) {
    end = match.index + match[0].length;
  }
  return end > start ? html.slice(start, end) : undefined;
}

/**
 * text.replace(pattern, replacement) for a pattern whose every match ends
 * with `end`, like /<li\b[^>]*>/gi with ">" or /<!--[\s\S]*?-->/g with "-->".
 * Only the text up to the last `end` is searched, where every match attempt
 * finds one.
 */
export function replaceUpToLast(
  text: string,
  end: string,
  pattern: RegExp,
  replacement: string,
): string {
  const last = text.lastIndexOf(end);
  if (last === -1) return text;
  const cut = last + end.length;
  return text.slice(0, cut).replace(pattern, replacement) + text.slice(cut);
}

/** replaceUpToLast() for a tag pattern, which ends with ">" */
export function replaceTags(
  text: string,
  pattern: RegExp,
  replacement: string,
): string {
  return replaceUpToLast(text, ">", pattern, replacement);
}

/** The `<meta>` tags, like the matches of /<meta\b[^>]*>/gi */
export function metaTags(html: string): string[] {
  const cut = html.lastIndexOf(">") + 1;
  const tags = html.slice(0, cut).matchAll(/<meta\b[^>]*>/gi);
  return [...tags].map(([tag]) => tag);
}
