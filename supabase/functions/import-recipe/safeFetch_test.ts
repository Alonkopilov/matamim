import { assertEquals, assertNotEquals } from "@std/assert";
import { cacheKey, parseUrl } from "./safeFetch.ts";

Deno.test("tracking parameters are removed before the page is fetched", () => {
  assertEquals(
    parseUrl(
      "https://example.com/recipe/?utm_source=x&p=12&fbclid=y&Share=z#steps",
    )
      .href,
    "https://example.com/recipe/?p=12",
  );
  assertEquals(
    parseUrl("https://youtu.be/abcdefgh?si=xyz").href,
    "https://youtu.be/abcdefgh",
  );
});

Deno.test("a link without tracking parameters is fetched as shared", () => {
  for (
    const link of [
      "https://example.com/recipe/",
      "https://example.com/recipe?b=2&a=1",
      "https://example.com/recipe?q=a%20b&print",
    ]
  ) {
    assertEquals(parseUrl(link).href, link);
  }
});

// The page fetched for a link is saved under its key, for every link with it
Deno.test("links share a cache entry only when they fetch the same page", () => {
  const key = (link: string) => cacheKey(parseUrl(link));
  assertEquals(
    key("https://example.com/recipe/?b=2&a=1&utm_medium=social"),
    key("https://example.com/recipe?a=1&b=2"),
  );
  assertEquals(
    key("https://example.com/recipe?ref=share"),
    parseUrl("https://example.com/recipe?ref=share").href,
  );
  assertNotEquals(
    key("https://example.com/recipe//"),
    key("https://example.com/recipe"),
  );
});
