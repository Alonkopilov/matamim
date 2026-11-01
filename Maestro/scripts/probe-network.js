// Cuts the device off from local Supabase (STATE=off) or reconnects it (on)
const response = http.post("http://127.0.0.1:54399/network?state=" + STATE, {
  body: "",
});
const body = json(response.body);
if (body.error) throw new Error("probe: " + body.error);
