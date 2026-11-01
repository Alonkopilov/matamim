// Whether the device reaches the internet, in output.online
const response = http.get("http://127.0.0.1:54399/online");
output.online = json(response.body).online;
