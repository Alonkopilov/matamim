// Rows in a local public table (TABLE) that the seed didn't add, so the rows
// the app created, in output.rowCount
const response = http.get("http://127.0.0.1:54399/count?table=" + TABLE);
const body = json(response.body);
if (body.error) throw new Error("probe: " + body.error);
output.rowCount = body.count;
