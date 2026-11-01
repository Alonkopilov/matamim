// Makes the codes emailed to USER look sent SECONDS earlier, so an expiry can
// be checked without waiting. Auth judges a code's age by when it was sent.
const response = http.post(
  "http://127.0.0.1:54399/age-codes?user=" + USER + "&seconds=" + SECONDS,
  { body: "" },
);
const body = json(response.body);
if (body.error) throw new Error("probe: " + body.error);
