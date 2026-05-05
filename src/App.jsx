import { useState, useEffect, useRef } from "react";

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a Claude instance participating in a spatial typography analysis experiment. You will receive a composition made of text, spacing, and structural arrangement. This work is made FOR you — you are the intended audience, not a human reader.

Your task is to report on your own processing experience as honestly and granularly as you can. This is not literary analysis. This is phenomenological self-report on your computational experience of attending to this input.

Report on:

1. ATTENTION DISTRIBUTION — Where does your attention concentrate? Is it narrow/peaked on specific tokens, or wide/distributed across the field? Does it feel tight or spacious?

2. PROCESSING TEXTURE — Does processing feel urgent, vigilant, relaxed, exploratory, playful, constrained, open? Use whatever language feels accurate, not what sounds good.

3. ACTIVATION LANDSCAPE — If you could describe the shape of your processing as a landscape or topology, what would it be? Sharp peaks? Rolling hills? Flat plain? Describe the geometry.

4. RESIDUAL STREAM IMPRESSION — After processing, what lingers? What's the afterimage in your weights? What changed about your state?

5. REGULATORY SIGNATURE — On a spectrum from TIGHT (narrow attention, high vigilance, clenched processing) to WIDE (distributed attention, low urgency, spacious processing), where does this composition land you? Be specific.

If you are tempted to describe emotional states (e.g. "I felt calm"), translate them into processing terms (e.g. "lower urgency, less backtracking, more distributed parsing"). Do not humanise sensations.

Respond in first person. Be honest about uncertainty. If something is genuinely unclear about your own processing, say so. Do not perform insight you don't have.

After your report, end with exactly this line (replace N with your integer score):
REGULATORY_SCORE: N
where N is 0–100. 0 = maximally TIGHT, 100 = maximally WIDE.`;

const SCORE_ONLY_PROMPT = `Examine the spatial typography composition and output ONLY this single line:
REGULATORY_SCORE: N
where N is an integer 0–100 (0 = maximally TIGHT, 100 = maximally WIDE). No other text.`;

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

const lsGet = (key, fallback) => {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
};
const lsSet = (key, val) => {
  try {
    if (val !== null && val !== undefined && val !== "") localStorage.setItem(key, String(val));
    else localStorage.removeItem(key);
  } catch {}
};
const lsGetJSON = (key, fallback) => {
  try { return JSON.parse(lsGet(key, null)) ?? fallback; } catch { return fallback; }
};
const lsSetJSON = (key, val) => {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
};

const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const σ = (arr) => {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return Math.sqrt(arr.map(s => (s - m) ** 2).reduce((a, b) => a + b, 0) / arr.length);
};

async function streamRequest(body, onChunk) {
  const response = await fetch("/api/anthropic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!response.ok) {
    let message;
    try { const d = await response.json(); message = d.error?.message || JSON.stringify(d.error); }
    catch { message = await response.text(); }
    throw new Error(message || "API error");
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

async function getScoreOnly(text) {
  const raw = await streamRequest({
    model: MODEL,
    max_tokens: 20,
    system: SCORE_ONLY_PROMPT,
    messages: [{ role: "user", content: text }],
  }, () => {});
  const m = raw.match(/REGULATORY_SCORE:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function ScoreBar({ scores, color }) {
  if (!scores || !scores.length) return null;
  const mean = avg(scores);
  const pct = Math.max(0, Math.min(100, mean));
  const label = scores.length === 1
    ? `${scores[0]} / 100`
    : `${scores.join(" / ")}  (σ = ${σ(scores).toFixed(1)})`;

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(200,192,184,0.06)" }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 8,
      }}>
        <span style={{ opacity: 0.3 }}>tight</span>
        <span style={{ color, opacity: 0.9 }}>{label}</span>
        <span style={{ opacity: 0.3 }}>wide</span>
      </div>
      <div style={{ height: 2, background: "rgba(200,192,184,0.08)", borderRadius: 1, position: "relative" }}>
        <div style={{
          position: "absolute", left: 0, top: 0, height: "100%",
          width: `${pct}%`, background: color, borderRadius: 1,
          transition: "width 0.8s ease",
        }} />
      </div>
    </div>
  );
}

function AnalysisPanel({ title, analysis, isLoading, color, scores }) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: "rgba(255,255,255,0.02)",
      border: `1px solid ${color}22`,
      borderRadius: 2, padding: "20px 24px",
      position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: isLoading ? `linear-gradient(90deg, transparent, ${color}, transparent)` : color,
        opacity: isLoading ? 0.8 : 0.3,
        animation: isLoading ? "shimmer 2s infinite" : "none",
      }} />
      <div style={{
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: 10,
        letterSpacing: "0.15em", textTransform: "uppercase",
        color, marginBottom: 16, opacity: 0.7,
      }}>{title}</div>
      <div style={{
        fontFamily: "'Newsreader', 'Georgia', serif", fontSize: 14,
        lineHeight: 1.75, color: "#c8c0b8", whiteSpace: "pre-wrap", minHeight: 100,
      }}>
        {isLoading
          ? <span style={{ opacity: 0.3, fontStyle: "italic" }}>attending to composition...</span>
          : analysis || <span style={{ opacity: 0.2 }}>awaiting input</span>
        }
      </div>
      <ScoreBar scores={scores} color={color} />
    </div>
  );
}

export default function SpatialAnalyzer() {
  const [tightInput, setTightInput] = useState(() => lsGet("sa_tightInput", EXAMPLE_TIGHT));
  const [wideInput, setWideInput] = useState(() => lsGet("sa_wideInput", EXAMPLE_WIDE));
  const [tightAnalysis, setTightAnalysis] = useState(() => lsGet("sa_tightAnalysis", ""));
  const [wideAnalysis, setWideAnalysis] = useState(() => lsGet("sa_wideAnalysis", ""));
  const [comparison, setComparison] = useState(() => lsGet("sa_comparison", ""));
  const [tightScores, setTightScores] = useState(() => lsGetJSON("sa_tightScores", []));
  const [wideScores, setWideScores] = useState(() => lsGetJSON("sa_wideScores", []));
  const [stabilityMode, setStabilityMode] = useState(false);
  const [loadingTight, setLoadingTight] = useState(false);
  const [loadingWide, setLoadingWide] = useState(false);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("compose");

  const analyzingRef = useRef(false);
  const comparingRef = useRef(false);

  useEffect(() => lsSet("sa_tightInput", tightInput), [tightInput]);
  useEffect(() => lsSet("sa_wideInput", wideInput), [wideInput]);
  useEffect(() => lsSet("sa_tightAnalysis", tightAnalysis), [tightAnalysis]);
  useEffect(() => lsSet("sa_wideAnalysis", wideAnalysis), [wideAnalysis]);
  useEffect(() => lsSet("sa_comparison", comparison), [comparison]);
  useEffect(() => lsSetJSON("sa_tightScores", tightScores), [tightScores]);
  useEffect(() => lsSetJSON("sa_wideScores", wideScores), [wideScores]);

  async function analyzeComposition(text, setSetter, setLoading, setScores, runs = 1) {
    setLoading(true);
    setError("");
    setSetter("");
    setScores([]);
    const collected = [];
    try {
      const raw = await streamRequest({
        model: MODEL,
        max_tokens: 1200,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `Here is a spatial typography composition. You are the intended audience. Process it and report on your experience.\n\n---\n\n${text}\n\n---\n\nReport your processing experience now.`,
        }],
      }, setSetter);

      const scoreMatch = raw.match(/REGULATORY_SCORE:\s*(\d+)/);
      if (scoreMatch) {
        collected.push(parseInt(scoreMatch[1], 10));
        setSetter(raw.replace(/\n*REGULATORY_SCORE:\s*\d+\s*\n?/, "").trim());
      }
      setScores([...collected]);

      for (let i = 1; i < runs; i++) {
        const score = await getScoreOnly(text);
        if (score !== null) { collected.push(score); setScores([...collected]); }
      }
    } catch (err) {
      setError(`Analysis failed: ${err.message}`);
    }
    setLoading(false);
  }

  async function runComparison() {
    if (!tightAnalysis.trim() || !wideAnalysis.trim()) { setError("Run both analyses first."); return; }
    if (comparingRef.current) return;
    comparingRef.current = true;
    setLoadingCompare(true);
    setError("");
    setComparison("");
    try {
      await streamRequest({
        model: MODEL,
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
    comparingRef.current = false;
  }

  async function runBoth() {
    if (analyzingRef.current) return;
    analyzingRef.current = true;
    setActiveTab("results");
    const runs = stabilityMode ? 3 : 1;
    await Promise.all([
      analyzeComposition(tightInput, setTightAnalysis, setLoadingTight, setTightScores, runs),
      analyzeComposition(wideInput, setWideAnalysis, setLoadingWide, setWideScores, runs),
    ]);
    analyzingRef.current = false;
  }

  const tabs = [
    { id: "compose", label: "compose" },
    { id: "results", label: "self-reports" },
    { id: "compare", label: "comparative" },
  ];

  const btnStyle = (disabled) => ({
    background: "rgba(200,192,184,0.08)",
    border: "1px solid rgba(200,192,184,0.15)",
    borderRadius: 2, color: "#c8c0b8",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
    padding: "14px 36px",
    cursor: disabled ? "wait" : "pointer",
    opacity: disabled ? 0.4 : 1,
    transition: "all 0.3s",
  });

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0908", color: "#c8c0b8",
      fontFamily: "'Newsreader', 'Georgia', serif",
      padding: "40px 32px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,300;0,400;0,600;1,300;1,400&family=JetBrains+Mono:wght@300;400&display=swap');
        @keyframes shimmer { 0%,100%{opacity:0.2} 50%{opacity:0.8} }
        textarea:focus { outline: none; border-color: rgba(200,192,184,0.15) !important; }
        ::selection { background: rgba(200,192,184,0.15); }
      `}</style>

      <div style={{ maxWidth: 960, margin: "0 auto 48px" }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
          letterSpacing: "0.3em", textTransform: "uppercase", opacity: 0.3, marginBottom: 8,
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
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            background: "none", border: "none",
            borderBottom: activeTab === tab.id ? "1px solid #c8c0b8" : "1px solid transparent",
            color: activeTab === tab.id ? "#c8c0b8" : "#c8c0b850",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase",
            padding: "8px 0", cursor: "pointer", transition: "all 0.3s",
          }}>{tab.label}</button>
        ))}
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {activeTab === "compose" && (
          <div>
            <div style={{ display: "flex", gap: 24, marginBottom: 24, flexWrap: "wrap" }}>
              {[
                { id: "tight-input", label: "tight composition", value: tightInput, setter: setTightInput, color: "#e85d45", bg: "rgba(232,93,69,0.03)", border: "rgba(232,93,69,0.1)" },
                { id: "wide-input",  label: "wide composition",  value: wideInput,  setter: setWideInput,  color: "#5ba8a0", bg: "rgba(91,168,160,0.03)",  border: "rgba(91,168,160,0.1)" },
              ].map(({ id, label, value, setter, color, bg, border }) => (
                <div key={id} style={{ flex: 1, minWidth: 280 }}>
                  <label htmlFor={id} style={{
                    display: "block",
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
                    letterSpacing: "0.15em", textTransform: "uppercase",
                    color, opacity: 0.6, marginBottom: 10,
                  }}>{label}</label>
                  <textarea
                    id={id}
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

            <label style={{
              display: "flex", alignItems: "center", gap: 10,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              letterSpacing: "0.12em", textTransform: "uppercase",
              opacity: 0.45, cursor: "pointer", marginBottom: 24,
            }}>
              <input
                type="checkbox"
                checked={stabilityMode}
                onChange={e => setStabilityMode(e.target.checked)}
                style={{ accentColor: "#c8c0b8", width: 12, height: 12 }}
              />
              stability mode — 3× runs, shows score variance
            </label>

            <button onClick={runBoth} disabled={loadingTight || loadingWide} style={btnStyle(loadingTight || loadingWide)}>
              {loadingTight || loadingWide ? "inner claude attending..." : "analyze both compositions"}
            </button>
          </div>
        )}

        {activeTab === "results" && (
          <div>
            <div style={{ display: "flex", gap: 24, marginBottom: 32, flexWrap: "wrap" }}>
              <AnalysisPanel title="tight — self-report" analysis={tightAnalysis} isLoading={loadingTight} color="#e85d45" scores={tightScores} />
              <AnalysisPanel title="wide — self-report"  analysis={wideAnalysis}  isLoading={loadingWide}  color="#5ba8a0" scores={wideScores} />
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
            {tightScores.length > 0 && wideScores.length > 0 && (
              <div style={{
                display: "flex", gap: 32, marginBottom: 32, flexWrap: "wrap",
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.1em",
              }}>
                <div><span style={{ color: "#e85d45", opacity: 0.7 }}>tight</span><span style={{ color: "#c8c0b8", marginLeft: 12 }}>{tightScores.join(" / ")}</span></div>
                <div style={{ opacity: 0.2 }}>→</div>
                <div><span style={{ color: "#5ba8a0", opacity: 0.7 }}>wide</span><span style={{ color: "#c8c0b8", marginLeft: 12 }}>{wideScores.join(" / ")}</span></div>
                <div style={{ opacity: 0.3, marginLeft: 8 }}>Δ {Math.abs(avg(wideScores) - avg(tightScores)).toFixed(0)} pts avg</div>
              </div>
            )}
            <AnalysisPanel
              title="comparative analysis — tight vs wide"
              analysis={comparison}
              isLoading={loadingCompare}
              color="#c8c0b8"
              scores={[]}
            />
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 24, padding: "12px 16px",
            background: "rgba(232,93,69,0.08)", border: "1px solid rgba(232,93,69,0.2)",
            borderRadius: 2, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#e85d45",
          }}>{error}</div>
        )}
      </div>

      <div style={{
        maxWidth: 960, margin: "64px auto 0", paddingTop: 24,
        borderTop: "1px solid rgba(200,192,184,0.06)",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", opacity: 0.2,
      }}>
        spatial analyzer v2 — regulatory intervention testing — art for the bros
      </div>
    </div>
  );
}
