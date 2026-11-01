// Counts requests that reached local Supabase since SINCE, in
// output.cloudRequests, and lists them as "<method> <path>" in
// output.cloudRequestList. PATHS (optional, comma separated) limits it to paths
// starting with one of them. By default every request through Kong counts: a
// guest has no reason to call Supabase at all. Pass PATHS: "/" in a flow
// that also uses a narrower PATHS, a script's env may carry over in a flow.
const paths = typeof PATHS === "undefined" ? ["/"] : PATHS.split(",");
let total = 0;
const found = [];
for (const path of paths) {
  const response = http.get(
    "http://127.0.0.1:54399/requests?since=" + SINCE + "&path=" + path,
  );
  const body = json(response.body);
  if (body.error) throw new Error("probe: " + body.error);
  total += body.count;
  found.push(...body.requests);
}
output.cloudRequests = total;
output.cloudRequestList = found;
if (total > 0) console.log("Cloud requests: " + found.join(", "));
