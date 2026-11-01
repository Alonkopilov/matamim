// Tries EMAIL and PASSWORD as a password login straight against local Auth,
// without the app. Sets output.loginStatus: 200 accepted, 400 refused
const response = http.post(
  "http://127.0.0.1:54399/login-check?email=" + encodeURIComponent(EMAIL) +
    "&password=" + encodeURIComponent(PASSWORD),
  { body: "" },
);
const body = json(response.body);
if (body.error) throw new Error("probe: " + body.error);
output.loginStatus = body.status;
