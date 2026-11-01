// USER's rows in every table that references a user, Auth's included, and
// USER's files in Storage. Sets output.userRowsTotal, one output.rows_<table>
// per table ("public.recipes" is output.rows_public_recipes), and
// output.userRowsUncovered: foreign keys to a user the probe doesn't count
// yet, joined by ",", empty when every one is counted
const body = json(http.get("http://127.0.0.1:54399/user-rows?user=" + USER).body);
if (body.error) throw new Error("probe: " + body.error);
output.userRowsTotal = body.total;
output.userRowsUncovered = body.uncovered.join(",");
const found = [];
for (const table in body.rows) {
  output["rows_" + table.replace(".", "_")] = body.rows[table];
  if (body.rows[table] > 0) found.push(table + "=" + body.rows[table]);
}
console.log("Rows of " + USER + ": " + (found.join(", ") || "none"));
