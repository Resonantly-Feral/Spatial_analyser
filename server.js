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

app.post("/api/anthropic", async (req, res) => {
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

    // Fix A: bail out cleanly on upstream errors before touching SSE headers
    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(upstream.status).send(errText);
    }

    if (req.body.stream) {
      // Fix B: flush headers immediately + disable proxy buffering
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      res.write(":\n\n"); // initial SSE comment — kicks the stream for buffering proxies
      for await (const chunk of upstream.body) {
        res.write(chunk);
      }
      res.end();
    } else {
      // Fix C: send raw text so we're not double-parsing JSON through intermediaries
      const text = await upstream.text();
      res.status(upstream.status).send(text);
    }
  } catch (err) {
    if (err.name === "AbortError") {
      if (!res.headersSent) res.status(504).json({ error: "Request to upstream API timed out." });
      else res.end();
    } else {
      console.error("Upstream fetch error:", err);
      if (!res.headersSent) res.status(500).json({ error: "Internal server error." });
      else res.end();
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
