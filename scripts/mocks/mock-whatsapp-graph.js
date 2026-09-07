const http = require("http");

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = body;
    }
    console.log("=== OUTBOUND WHATSAPP MESSAGE ===");
    console.log("URL:", req.url);
    console.log(JSON.stringify(parsed, null, 2));
    console.log("==================================");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id: "mock_wamid_" + Date.now() }] }));
  });
});

const port = process.env.PORT || 4001;
server.listen(port, () => console.log(`Mock Graph API listening on :${port}`));
