const http = require("http");
const url = require("url");

const transactions = new Map();

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const parsedUrl = url.parse(req.url, true);

    if (req.method === "POST" && parsedUrl.pathname === "/transaction/initialize") {
      const data = JSON.parse(body);
      console.log("=== PAYSTACK INIT ===", JSON.stringify(data));
      transactions.set(data.reference, { ...data, status: "success" });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: true,
          message: "Authorization URL created",
          data: {
            authorization_url: `http://localhost:4002/fake-checkout/${data.reference}`,
            access_code: "mock_access_code",
            reference: data.reference,
          },
        })
      );
      return;
    }

    if (req.method === "GET" && parsedUrl.pathname.startsWith("/transaction/verify/")) {
      const reference = decodeURIComponent(parsedUrl.pathname.split("/").pop());
      const tx = transactions.get(reference);
      console.log("=== PAYSTACK VERIFY ===", reference, "found:", Boolean(tx));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: true,
          data: {
            status: tx ? "success" : "failed",
            reference,
            amount: tx?.amount ?? 0,
            metadata: tx?.metadata ?? null,
          },
        })
      );
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });
});

const port = process.env.PORT || 4002;
server.listen(port, () => console.log(`Mock Paystack API listening on :${port}`));
