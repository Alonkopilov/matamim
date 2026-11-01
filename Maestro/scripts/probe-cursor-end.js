// Moves the cursor of the focused field to the end of its line
const response = http.post("http://127.0.0.1:54399/cursor-end", { body: "" });
const body = json(response.body);
if (body.error) throw new Error("probe: " + body.error);
