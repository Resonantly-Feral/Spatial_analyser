import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set — exiting.");
  process.exit(1);
}

app.post("/api/messages", async (req, res) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    if (err.name === "AbortError") {
      res.status(504).json({ error: "Request to upstream API timed out." });
    } else {
      console.error("Upstream fetch error:", err);
      res.status(500).json({ error: "Internal server error." });
    }
  } finally {
    clearTimeout(timeout);
  }
});

const distPath = join(__dirname, "dist");
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (_, res) =>
    res.sendFile(join(distPath, "index.html"), err => {
      if (err) res.status(500).send("Could not serve app.");
    })
  );
}

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => console.log(`server listening on :${PORT}`));

server.on("error", err => {
  console.error("Server error:", err);
  process.exit(1);
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
