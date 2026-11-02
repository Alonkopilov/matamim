import { assert, assertEquals } from "@std/assert";
import { pageText } from "./aiExtract.ts";
import { extractJsonLdRecipe } from "./jsonLd.ts";

const filler = "בוחשים בעדינות עד שהבלילה חלקה ואחידה. ".repeat(60);

// Long enough for its <article> to be read alone
const recipePage = `<!doctype html>
<html><head>
<title>עוגת שוקולד &amp; קפה</title>
<meta charset="utf-8">
<meta property="og:description" content="עוגה רכה ופשוטה">
<script>window.menu = "<nav>";</script>
<style>p { color: red }</style>
<script type="application/ld+json">{"@type":"Recipe","name":"עוגת שוקולד","recipeIngredient":["2 כוסות קמח","1 כוס <b>סוכר</b>"],"recipeInstructions":[{"@type":"HowToStep","text":"מערבבים"},{"@type":"HowToStep","text":"אופים 30 דקות"}],"totalTime":"PT45M","recipeYield":"8"}</script>
</head><body>
<HEADER><nav><a href="/">בית</a></nav></HEADER>
<!-- ad slot -->
<article class="post">
<h1>עוגת שוקולד</h1>
<p>עוגה&nbsp;רכה ופשוטה.<br>מתאימה לשבת.</p>
<p>${filler}</p>
<h2 class="ingredients">מצרכים</h2>
<ul><li>2 כוסות קמח</li><li class="x">1 כוס סוכר</li></ul>
<h2>אופן ההכנה</h2>
<ol><li>מערבבים\r\n  את הכל</li><li>אופים 30 דקות</li></ol>
<form><input name="q"><button>שלח</button></form>
</article>
<div>מתכונים נוספים</div>
<footer>© 2026</footer>
</body></html>`;

// What the regexes these helpers replaced read from the page
Deno.test("a recipe page's text", () => {
  assertEquals(
    pageText(recipePage),
    "עוגת שוקולד & קפה\nעוגה רכה ופשוטה\n## עוגת שוקולד\nעוגה רכה ופשוטה.\n" +
      `מתאימה לשבת.\n${filler.trim()}\n## מצרכים\n- 2 כוסות קמח\n- 1 כוס סוכר\n` +
      "## אופן ההכנה\n- מערבבים\nאת הכל\n- אופים 30 דקות",
  );
});

Deno.test("a recipe page's schema.org data", () => {
  assertEquals(extractJsonLdRecipe(recipePage), {
    name: "עוגת שוקולד",
    description: "",
    category: "",
    cuisine: "",
    keywords: "",
    yield: "8",
    ingredients: ["2 כוסות קמח", "1 כוס סוכר"],
    instructions: ["מערבבים", "אופים 30 דקות"],
    minutes: 45,
    servings: 8,
  });
});

// A page made of one unclosed tag or one kind of whitespace. Each took
// seconds at this size with plain regexes, and hours at the 4 MB page limit.
Deno.test("a hostile page is read in linear time", () => {
  const size = 256 * 1024;
  const units = [
    "<script",
    "<script x",
    "<nav ",
    "<article ",
    "<main ",
    "<li ",
    "<br ",
    "<h2 ",
    "<a",
    "<!--",
    "<meta ",
    '<meta name="description" ',
    "<title>",
    "\r",
    "　",
  ];
  for (const unit of units) {
    const html = unit.repeat(Math.ceil(size / unit.length));
    const started = performance.now();
    pageText(html);
    extractJsonLdRecipe(html);
    const ms = performance.now() - started;
    assert(ms < 500, `${JSON.stringify(unit)}: ${Math.round(ms)} ms`);
  }

  // Markup inside the schema.org data's strings
  const lessThans = "<".repeat(size);
  const started = performance.now();
  extractJsonLdRecipe(
    `<script type="application/ld+json">{"@type":"Recipe","recipeIngredient":["${lessThans}"],"recipeInstructions":"x"}</script>`,
  );
  const ms = performance.now() - started;
  assert(ms < 500, `schema.org strings: ${Math.round(ms)} ms`);
});
