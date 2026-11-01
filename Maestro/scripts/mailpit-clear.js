// Deletes the local Mailpit's emails to EMAIL, so a code from an earlier run
// can't be read as this run's
const query = encodeURIComponent('to:"' + EMAIL + '"');
const response = http.request(
  "http://127.0.0.1:54324/api/v1/search?query=" + query,
  { method: "DELETE" },
);
if (response.status !== 200) {
  throw new Error("mailpit: delete failed with " + response.status);
}
