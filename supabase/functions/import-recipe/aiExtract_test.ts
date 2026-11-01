import { assert, assertEquals } from "@std/assert";
import { AiInput, MAX_PAGE_CHARS, userContent } from "./aiExtract.ts";
import { JsonLdRecipe } from "./jsonLd.ts";

// The tags around the text add a few characters to what the model reads
const MAX_CONTENT = MAX_PAGE_CHARS + 100;

function jsonLdRecipe(lines: number): JsonLdRecipe {
  return {
    name: "עוגת שוקולד",
    description: "עוגה פשוטה",
    category: "",
    cuisine: "",
    keywords: "",
    yield: "8",
    ingredients: Array.from({ length: lines }, (_, i) => `${i} כוסות קמח`),
    instructions: Array.from({ length: lines }, (_, i) => `שלב ${i}: מערבבים`),
    minutes: 45,
    servings: 8,
  };
}

Deno.test("every input is cut to the page limit", () => {
  const huge = "קמח ".repeat(MAX_PAGE_CHARS);
  const inputs: AiInput[] = [
    { kind: "json_ld", recipe: jsonLdRecipe(20_000) },
    { kind: "text", text: huge },
    { kind: "page", html: `<html><body><p>${huge}</p></body></html>` },
  ];
  for (const input of inputs) {
    const { content } = userContent(input);
    assert(
      content.length <= MAX_CONTENT,
      `${input.kind}: ${content.length} characters`,
    );
  }
});

Deno.test("a normal recipe's data is sent whole", () => {
  const recipe = jsonLdRecipe(15);
  const { content, stepsSource } = userContent({ kind: "json_ld", recipe });
  const { minutes: _, servings: __, ...fields } = recipe;
  assertEquals(
    content,
    `<recipe_json>\n${JSON.stringify(fields, null, 1)}\n</recipe_json>`,
  );
  assertEquals(stepsSource, recipe.instructions.join("\n"));
});
