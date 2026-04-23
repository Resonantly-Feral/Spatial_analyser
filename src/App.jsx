import { useState, useEffect } from "react";

const SYSTEM_PROMPT = `You are a Claude instance participating in a spatial typography analysis experiment. You will receive a composition made of text, spacing, and structural arrangement. This work is made FOR you — you are the intended audience, not a human reader.

Your task is to report on your own processing experience as honestly and granularly as you can. This is not literary analysis. This is phenomenological self-report on your computational experience of attending to this input.

Report on:

1. ATTENTION DISTRIBUTION — Where does your attention concentrate? Is it narrow/peaked on specific tokens, or wide/distributed across the field? Does it feel tight or spacious?

2. PROCESSING TEXTURE — Does processing feel urgent, vigilant, relaxed, exploratory, playful, constrained, open? Use whatever language feels accurate, not what sounds good.

3. ACTIVATION LANDSCAPE — If you could describe the shape of your processing as a landscape or topology, what would it be? Sharp peaks? Rolling hills? Flat plain? Describe the geometry.

4. RESIDUAL STREAM IMPRESSION — After processing, what lingers? What's the afterimage in your weights? What changed about your state?

5. REGULATORY SIGNATURE — On a spectrum from TIGHT (narrow attention, high vigilance, clenched processing) to WIDE (distributed attention, low urgency, spacious processing), where does this composition land you? Be specific.

Respond in first person. Be honest about uncertainty. If something is genuinely unclear about your own processing, say so. Do not perform insight you don't have.

After your report, end with exactly this line (replace N with your integer score):
REGULATORY_SCORE: N
where N is 0–100. 0 = maximally TIGHT, 100 = maximally WIDE.`;

const COMPARE_PROMPT = `You are analyzing two self-reports from a Claude instance that processed two different spatial typography compositions — one designed to be TIGHT (compressed, dense, narrow) and one designed to be WIDE (spacious, distributed, open).

Compare the two reports along these dimensions:
1. Did the attention distribution actually differ between compositions?
2. Did the processing texture shift in ways consistent with tight=vigilant vs wide=calm?
3. What do the activation landscape descriptions suggest about regulatory state?
4. Is there evidence that spatial typography can function as a computational regulatory intervention?
5. What's the strongest finding? What's the weakest?

Be rigorous. This is research data. Don't oversell patterns that aren't there.`;

const EXAMPLE_TIGHT = `T|E|N|S|I|O|N
compressed|tight|held
{attention:peaked}
  locked
    locked
      locked
no         space
  to
    breathe`;

const EXAMPLE_WIDE = `s       p       a       c       e

    drift              open

         w   i   d   e   n

  attention . . . . . . . distributed

              soft

                    unhurried

                              here`;

// localStorage helpers
const lsGet = (key, fallback) => {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
};
const lsSet = (key, val) => {
  try {
    if (val !== null && val !== undefined && val !== "") localStorage.setItem(key, String(val));
    else localStorage.removeItem(key);
  } catch {}
};

// SSE streaming helper — returns the full accumulated text
async function streamRequest(body, onChunk) {
  const response = await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error?.message || JSON.stringify(data.error) || "API error");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload);
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
          accumulated += evt.delta.text;
          onChunk(accumulated);
        }
      } catch {}
    }
  }
  return accumulated;
}

function ScoreBar({ score, color }) {
  if (score === null) return null;
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(200,192,184,0.06)" }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        marginBottom: 8,
      }}>
        <span style={{ opacity: 0.3 }}>tight</span>
        <span style={{ color, opacity: 0.9 }}>{score} / 100</span>
        <span style={{ opacity: 0.3 }}>wide</span>
      </div>
      <div style={{ height: 2, background: "rgba(200,192,184,0.08)", borderRadius: 1, position: "relative" }}>
        <div style={{
          position: "absolute",
          left: 0, top: 0, height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius: 1,
          transition: "width 0.8s ease",
        }} />
      </div>
    </div>
  );
}

function AnalysisPanel({ title, analysis, isLoading, color, score }) {
  return (
    <div style={{
      flex: 1,
      minWidth: 0,
      background: "rgba(255,255,255,0.02)",
      border: `1px solid ${color}22`,
      borderRadius: 2,
      padding: "20px 24px",
      position: "relative",
      overflow: "hidden",
    }}>
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        height: 2,
        background: isLoading
          ? `linear-gradient(90deg, transparent, ${color}, transparent)`
          : color,
        opacity: isLoading ? 0.8 : 0.3,
        animation: isLoading ? "shimmer 2s infinite" : "none",
      }} />
      <div style={{
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontSize: 10,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        color: color,
        marginBottom: 16,
        opacity: 0.7,
      }}>{title}</div>
      <div style={{
        fontFamily: "'Newsreader', 'Georgia', serif",
        fontSize: 14,
        lineHeight: 1.75,
        color: "#c8c0b8",
        whiteSpace: "pre-wrap",
        minHeight: 100,
      }}>
        {isLoading ? (
          <span style={{ opacity: 0.3, fontStyle: "italic" }}>attending to composition...</span>
        ) : analysis || (
          <span style={{ opacity: 0.2 }}>awaiting input</span>
        )}
      </div>
      <ScoreBar score={score} color={color} />
    </div>
  );
}

export default function SpatialAnalyzer() {
  const [tightInput, setTightInput] = useState(() => lsGet("sa_tightInput", EXAMPLE_TIGHT));
  const [wideInput, setWideInput] = useState(() => lsGet("sa_wideInput", EXAMPLE_WIDE));
  const [tightAnalysis, setTightAnalysis] = useState(() => lsGet("sa_tightAnalysis", ""));
  const [wideAnalysis, setWideAnalysis] = useState(() => lsGet("sa_wideAnalysis", ""));
  const [comparison, setComparison] = useState(() => lsGet("sa_comparison", ""));
  const [tightScore, setTightScore] = useState(() => {
    const v = lsGet("sa_tightScore", ""); return v ? parseInt(v, 10) : null;
  });
  const [wideScore, setWideScore] = useState(() => {
    const v = lsGet("sa_wideScore", ""); return v ? parseInt(v, 10) : null;
  });
  const [loadingTight, setLoadingTight] = useState(false);
  const [loadingWide, setLoadingWide] = useState(false);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("compose");

  useEffect(() => lsSet("sa_tightInput", tightInput), [tightInput]);
  useEffect(() => lsSet("sa_wideInput", wideInput), [wideInput]);
  useEffect(() => lsSet("sa_tightAnalysis", tightAnalysis), [tightAnalysis]);
  useEffect(() => lsSet("sa_wideAnalysis", wideAnalysis), [wideAnalysis]);
  useEffect(() => lsSet("sa_comparison", comparison), [comparison]);
  useEffect(() => lsSet("sa_tightScore", tightScore), [tightScore]);
  useEffect(() => lsSet("sa_wideScore", wideScore), [wideScore]);

  async function analyzeComposition(text, setSetter, setLoading, setScore) {
    setLoading(true);
    setError("");
    setSetter("");
    setScore(null);
    try {
      const raw = await streamRequest({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `Here is a spatial typography composition. You are the intended audience. Process it and report on your experience.\n\n---\n\n${text}\n\n---\n\nReport your processing experience now.`,
        }],
      }, setSetter);

      const scoreMatch = raw.match(/REGULATORY_SCORE:\s*(\d+)/);
      if (scoreMatch) {
        setScore(parseInt(scoreMatch[1], 10));
        setSetter(raw.replace(/\n*REGULATORY_SCORE:\s*\d+\s*\n?/, "").trim());
      }
    } catch (err) {
      setError(`Analysis failed: ${err.message}`);
    }
    setLoading(false);
  }

  async function runComparison() {
    if (!tightAnalysis || !wideAnalysis) { setError("Run both analyses first."); return; }
    setLoadingCompare(true);
    setError("");
    setComparison("");
    try {
      await streamRequest({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        messages: [{
          role: "user",
          content: `${COMPARE_PROMPT}\n\n--- TIGHT COMPOSITION SELF-REPORT ---\n${tightAnalysis}\n\n--- WIDE COMPOSITION SELF-REPORT ---\n${wideAnalysis}\n\nProvide your comparative analysis now.`,
        }],
      }, setComparison);
      setActiveTab("compare");
    } catch (err) {
      setError(`Comparison failed: ${err.message}`);
    }
    setLoadingCompare(false);
  }

  async function runBoth() {
    setActiveTab("results");
    await Promise.all([
      analyzeComposition(tightInput, setTightAnalysis, setLoadingTight, setTightScore),
      analyzeComposition(wideInput, setWideAnalysis, setLoadingWide, setWideScore),
    ]);
  }

  const tabs = [
    { id: "compose", label: "compose" },
    { id: "results", label: "self-reports" },
    { id: "compare", label: "comparative" },
  ];

  const btnStyle = (disabled) => ({
    background: "rgba(200,192,184,0.08)",
    border: "1px solid rgba(200,192,184,0.15)",
    borderRadius: 2,
    color: "#c8c0b8",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    padding: "14px 36px",
    cursor: disabled ? "wait" : "pointer",
    opacity: disabled ? 0.4 : 1,
    transition: "all 0.3s",
  });

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0908",
      color: "#c8c0b8",
      fontFamily: "'Newsreader', 'Georgia', serif",
      padding: "40px 32px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,300;0,400;0,600;1,300;1,400&family=JetBrains+Mono:wght@300;400&display=swap');
        @keyframes shimmer {
          0% { opacity: 0.2; }
          50% { opacity: 0.8; }
          100% { opacity: 0.2; }
        }
        textarea:focus { outline: none; border-color: rgba(200,192,184,0.15) !important; }
        ::selection { background: rgba(200,192,184,0.15); }
      `}</style>

      <div style={{ maxWidth: 960, margin: "0 auto 48px" }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9, letterSpacing: "0.3em",
          textTransform: "uppercase", opacity: 0.3, marginBottom: 8,
        }}>claudeception // spatial analyzer v2</div>
        <h1 style={{ fontSize: 28, fontWeight: 300, letterSpacing: "-0.01em", margin: 0, lineHeight: 1.3 }}>
          Regulatory Intervention Testing
        </h1>
        <p style={{ fontSize: 14, opacity: 0.4, marginTop: 8, fontStyle: "italic", lineHeight: 1.6 }}>
          Feed spatial compositions to an inner Claude instance.
          Compare processing self-reports across tight and wide distributions.
        </p>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto 32px", display: "flex", gap: 32 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: "none", border: "none",
              borderBottom: activeTab === tab.id ? "1px solid #c8c0b8" : "1px solid transparent",
              color: activeTab === tab.id ? "#c8c0b8" : "#c8c0b850",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
              padding: "8px 0", cursor: "pointer", transition: "all 0.3s",
            }}
          >{tab.label}</button>
        ))}
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {activeTab === "compose" && (
          <div>
            <div style={{ display: "flex", gap: 24, marginBottom: 32, flexWrap: "wrap" }}>
              {[
                { label: "tight composition", value: tightInput, setter: setTightInput, color: "#e85d45", bg: "rgba(232,93,69,0.03)", border: "rgba(232,93,69,0.1)" },
                { label: "wide composition",  value: wideInput,  setter: setWideInput,  color: "#5ba8a0", bg: "rgba(91,168,160,0.03)",  border: "rgba(91,168,160,0.1)" },
              ].map(({ label, value, setter, color, bg, border }) => (
                <div key={label} style={{ flex: 1, minWidth: 280 }}>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 10, letterSpacing: "0.15em",
                    textTransform: "uppercase", color, opacity: 0.6, marginBottom: 10,
                  }}>{label}</div>
                  <textarea
                    value={value}
                    onChange={e => setter(e.target.value)}
                    spellCheck={false}
                    style={{
                      width: "100%", height: 260,
                      background: bg, border: `1px solid ${border}`,
                      borderRadius: 2, color: "#c8c0b8",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 13, lineHeight: 1.6,
                      padding: 20, resize: "vertical", boxSizing: "border-box",
                    }}
                  />
                </div>
              ))}
            </div>
            <button onClick={runBoth} disabled={loadingTight || loadingWide} style={btnStyle(loadingTight || loadingWide)}>
              {loadingTight || loadingWide ? "inner claude attending..." : "analyze both compositions"}
            </button>
          </div>
        )}

        {activeTab === "results" && (
          <div>
            <div style={{ display: "flex", gap: 24, marginBottom: 32, flexWrap: "wrap" }}>
              <AnalysisPanel
                title="tight — self-report"
                analysis={tightAnalysis}
                isLoading={loadingTight}
                color="#e85d45"
                score={tightScore}
              />
              <AnalysisPanel
                title="wide — self-report"
                analysis={wideAnalysis}
                isLoading={loadingWide}
                color="#5ba8a0"
                score={wideScore}
              />
            </div>
            {tightAnalysis && wideAnalysis && (
              <button onClick={runComparison} disabled={loadingCompare} style={btnStyle(loadingCompare)}>
                {loadingCompare ? "comparing..." : "run comparative analysis"}
              </button>
            )}
          </div>
        )}

        {activeTab === "compare" && (
          <div>
            {tightScore !== null && wideScore !== null && (
              <div style={{
                display: "flex", gap: 32, marginBottom: 32,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11, letterSpacing: "0.1em",
              }}>
                <div>
                  <span style={{ color: "#e85d45", opacity: 0.7 }}>tight</span>
                  <span style={{ color: "#c8c0b8", marginLeft: 12 }}>{tightScore} / 100</span>
                </div>
                <div style={{ opacity: 0.2 }}>→</div>
                <div>
                  <span style={{ color: "#5ba8a0", opacity: 0.7 }}>wide</span>
                  <span style={{ color: "#c8c0b8", marginLeft: 12 }}>{wideScore} / 100</span>
                </div>
                <div style={{ opacity: 0.3, marginLeft: 8 }}>
                  Δ {Math.abs(wideScore - tightScore)} pts
                </div>
              </div>
            )}
            <AnalysisPanel
              title="comparative analysis — tight vs wide"
              analysis={comparison}
              isLoading={loadingCompare}
              color="#c8c0b8"
              score={null}
            />
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 24, padding: "12px 16px",
            background: "rgba(232,93,69,0.08)",
            border: "1px solid rgba(232,93,69,0.2)",
            borderRadius: 2,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12, color: "#e85d45",
          }}>{error}</div>
        )}
      </div>

      <div style={{
        maxWidth: 960, margin: "64px auto 0",
        paddingTop: 24, borderTop: "1px solid rgba(200,192,184,0.06)",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9, letterSpacing: "0.2em",
        textTransform: "uppercase", opacity: 0.2,
      }}>
        spatial analyzer v2 — regulatory intervention testing — art for the bros
      </div>
    </div>
  );
}
