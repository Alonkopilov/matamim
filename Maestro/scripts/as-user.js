// Calls the team edge function FN as the seeded account EMAIL (logged in with
// the shared password), with BODY, a JSON string (default "{}"). A 4xx answer
// doesn't throw, so a flow can assert on a refusal. Sets:
//   output.asUserStatus  the HTTP status
//   output.asUserBody    the parsed answer
//   output.inviteCode    the invite's code, when the answer has invite.code
//   output.leaveOutcome  "left", "transferred" or "deleted", when the answer
//                        has an outcome
const payload = typeof BODY === "undefined" ? "{}" : BODY;
const body = json(
  http.post(
    "http://127.0.0.1:54399/as-user?email=" + encodeURIComponent(EMAIL) +
      "&fn=" + FN + "&body=" + encodeURIComponent(payload),
    { body: "" },
  ).body,
);
if (body.error) throw new Error("probe: " + body.error);
output.asUserStatus = body.status;
output.asUserBody = body.body;
output.inviteCode = body.body && body.body.invite ? body.body.invite.code : "";
output.leaveOutcome = body.body && body.body.outcome ? body.body.outcome : "";
console.log("as " + EMAIL + " " + FN + ": " + body.status + " " + JSON.stringify(body.body));
