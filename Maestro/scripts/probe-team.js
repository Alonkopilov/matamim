// A team, found by TEAM (its id) or by USER (the team that user hosts or
// belongs to). Pass the other as an empty string. Sets:
//   output.teamExists               true or false
//   output.teamId, teamTitle, teamHost
//   output.teamMembers              members' user ids by joined_at (the host
//                                   is not one), joined by "|"
//   output.teamInviteCodes          unexpired invites' codes, joined by "|"
//   output.teamInviteSecondsLeft    the first unexpired invite's seconds
//                                   left, -1 when there is none
//   output.teamInviteRows           every invite row, expired ones included
const query = TEAM ? "id=" + TEAM : "user=" + USER;
const body = json(http.get("http://127.0.0.1:54399/team?" + query).body);
if (body.error) throw new Error("probe: " + body.error);
output.teamExists = body.exists;
output.teamId = body.id || "";
output.teamTitle = body.title || "";
output.teamHost = body.host_id || "";
output.teamMembers = body.members.join("|");
output.teamInviteCodes = body.invites.map((invite) => invite.code).join("|");
output.teamInviteSecondsLeft = body.invites.length ? body.invites[0].seconds_left : -1;
output.teamInviteRows = body.invite_rows;
console.log(
  "Team: " + (body.exists ? output.teamTitle + ", " + body.members.length + " members" : "none"),
);
