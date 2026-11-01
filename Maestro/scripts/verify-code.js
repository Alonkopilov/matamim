// Tries CODE for EMAIL straight against local Auth's /verify, with TYPE
// ("email", "email_change", ...). Sets output.verifyStatus: 200 accepted,
// 403 refused (wrong, used or expired)
const response = http.post(
  "http://127.0.0.1:54399/verify-code?email=" + encodeURIComponent(EMAIL) +
    "&code=" + CODE + "&type=" + TYPE,
  { body: "" },
);
const body = json(response.body);
if (body.error) throw new Error("probe: " + body.error);
output.verifyStatus = body.status;
