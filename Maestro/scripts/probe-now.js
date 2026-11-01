// Marks the start of a stretch to check requests for, in output.since
const response = http.get("http://127.0.0.1:54399/now");
output.since = json(response.body).now;
