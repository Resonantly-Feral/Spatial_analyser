import express from "express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const API_KEY = process.env.ANTHROPIC_API_KEY || "";

app.post("/api/anthropic", async (req, res) => {
  if (!API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set" });
  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
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
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

const distPath = join(__dirname, "dist");
if (existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (_, res) => res.sendFile(join(distPath, "index.html")));
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`server listening on :${PORT}`));
