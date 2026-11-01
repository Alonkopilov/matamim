// Reads the local Mailpit's emails to EMAIL. Sets output.emailCount, and
// output.code to the 6 digit code in the newest one (empty if none)
const query = encodeURIComponent('to:"' + EMAIL + '"');
const search = json(
  http.get("http://127.0.0.1:54324/api/v1/search?query=" + query).body,
);
output.emailCount = search.messages.length;
output.code = "";
if (search.messages.length > 0) {
  // Newest first
  const message = json(
    http.get("http://127.0.0.1:54324/api/v1/message/" + search.messages[0].ID)
      .body,
  );
  const match = message.Text.match(/\b\d{6}\b/);
  if (match) output.code = match[0];
}
