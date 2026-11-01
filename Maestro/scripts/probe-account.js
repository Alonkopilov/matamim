// USER's email and name in Auth and in public.profiles. Sets output.authEmail,
// output.displayName, output.profileEmail and output.profileUsername (empty
// strings when missing)
const body = json(http.get("http://127.0.0.1:54399/account?user=" + USER).body);
if (body.error) throw new Error("probe: " + body.error);
output.authEmail = body.auth_email || "";
output.displayName = body.display_name || "";
output.profileEmail = body.profile_email || "";
output.profileUsername = body.profile_username || "";
console.log(
  "Account " + USER + ": auth " + output.authEmail + " \"" +
    output.displayName + "\", profile " + output.profileEmail + " \"" +
    output.profileUsername + "\"",
);
