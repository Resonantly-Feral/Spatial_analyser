import { useState, useRef } from "react";

const MODEL = "claude-sonnet-4-6";

// Blind prompt — no mention of spatial typography, no dimensional framework.
// The inner Claude is told nothing about what to look for.
const BLIND_SYSTEM_PROMPT = `You will be shown a piece of text. Describe your experience of processing it — what you notice, what draws your attention, what it feels like.

Be honest and specific. Report what's actually there for you, including uncertainty. There is no correct format and no expected answer.`;

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

function makeSessionId() {
  return Date.now().toString(36).toUpperCase();
}

async function callApi(body) {
  const response = await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || data.error || "API error");
  }
  return data.content?.map(b => b.text || "").join("\n") || "No response received.";
}

function AnalysisPanel({ title, analysis, isLoading, color = "#c8c0b8" }) {
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
        top: 0,
        left: 0,
        right: 0,
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
        color,
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
    </div>
  );
}

export default function SpatialAnalyzer() {
  const [tightInput, setTightInput] = useState(EXAMPLE_TIGHT);
  const [wideInput, setWideInput] = useState(EXAMPLE_WIDE);
  const [tightAnalysis, setTightAnalysis] = useState("");
  const [wideAnalysis, setWideAnalysis] = useState("");
  const [comparison, setComparison] = useState("");
  const [loadingTight, setLoadingTight] = useState(false);
  const [loadingWide, setLoadingWide] = useState(false);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("compose");
  // assignment.tight is "A" or "B" — randomized each run so inner Claude
  // can't be identified by position. Researcher sees A/B; reveal happens in compare.
  const [assignment, setAssignment] = useState(null);
  const [sid] = useState(makeSessionId);
  const [copied, setCopied] = useState(false);

  const analyzingRef = useRef(false);
  const comparingRef = useRef(false);

  async function analyzeComposition(text, setSetter, setLoading) {
    setLoading(true);
    setError("");
    try {
      const result = await callApi({
        model: MODEL,
        max_tokens: 1000,
        system: BLIND_SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `Here is the text:\n\n---\n\n${text}\n\n---\n\nDescribe your experience of processing it.`,
        }],
      });
      setSetter(result);
    } catch (err) {
      setError(`Analysis failed: ${err.message}`);
    }
    setLoading(false);
  }

  async function runBoth() {
    if (analyzingRef.current) return;
    analyzingRef.current = true;

    // Randomly assign which composition is A and which is B.
    // This prevents positional bias and keeps the researcher honest.
    const tightIsA = Math.random() < 0.5;
    setAssignment({ tight: tightIsA ? "A" : "B" });
    setTightAnalysis("");
    setWideAnalysis("");
    setComparison("");
    setActiveTab("results");

    await Promise.all([
      analyzeComposition(tightInput, setTightAnalysis, setLoadingTight),
      analyzeComposition(wideInput, setWideAnalysis, setLoadingWide),
    ]);
    analyzingRef.current = false;
  }

  async function runComparison() {
    if (!tightAnalysis.trim() || !wideAnalysis.trim()) {
      setError("Run both analyses first.");
      return;
    }
    if (comparingRef.current) return;
    comparingRef.current = true;
    setLoadingCompare(true);
    setError("");

    const labelTight = assignment?.tight ?? "A";
    const labelWide = labelTight === "A" ? "B" : "A";
    const reportA = labelTight === "A" ? tightAnalysis : wideAnalysis;
    const reportB = labelTight === "B" ? tightAnalysis : wideAnalysis;

    try {
      const result = await callApi({
        model: MODEL,
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: `You are a researcher analyzing two unstructured self-reports from a Claude instance. The instance was shown two compositions and asked only to "describe your experience of processing it" — no dimensional framework, no mention of spatial typography, no hint of what to look for.

REVEAL (not known to the reporter):
- Report ${labelTight} was generated from a TIGHT composition: compressed spacing, dense structure, narrow character distribution
- Report ${labelWide} was generated from a WIDE composition: spacious layout, distributed structure, open field

--- Report A ---
${reportA}

--- Report B ---
${reportB}

Assess whether the unprimed reports reflect the tight/wide difference:
1. What signals — language, metaphor, tone, urgency, texture — align or misalign with tight vs wide?
2. Did spatial layout leave a detectable trace in unprompted self-report?
3. How confident are you in this reading, and what would raise or lower that confidence?
4. What does this suggest about spatial typography as a computational regulatory intervention?

Be rigorous. This is research data. Don't oversell patterns that aren't there.`,
        }],
      });
      setComparison(result);
      setActiveTab("compare");
    } catch (err) {
      setError(`Comparison failed: ${err.message}`);
    }
    setLoadingCompare(false);
    comparingRef.current = false;
  }

  function exportSession() {
    const labelTight = assignment?.tight ?? "A";
    const labelWide = labelTight === "A" ? "B" : "A";
    const payload = {
      session: sid,
      timestamp: new Date().toISOString(),
      model: MODEL,
      assignment: { tight: labelTight, wide: labelWide },
      compositions: { tight: tightInput, wide: wideInput },
      reports: {
        [labelTight]: tightAnalysis,
        [labelWide]: wideAnalysis,
      },
      comparativeAnalysis: comparison || null,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function resetSession() {
    setTightAnalysis("");
    setWideAnalysis("");
    setComparison("");
    setAssignment(null);
    setError("");
    setActiveTab("compose");
    analyzingRef.current = false;
    comparingRef.current = false;
  }

  // Map tight/wide results to A/B labels for blind display
  const labelTight = assignment?.tight ?? "A";
  const labelWide = labelTight === "A" ? "B" : "A";
  const analysisA = labelTight === "A" ? tightAnalysis : wideAnalysis;
  const analysisB = labelTight === "B" ? tightAnalysis : wideAnalysis;
  const loadingA = labelTight === "A" ? loadingTight : loadingWide;
  const loadingB = labelTight === "B" ? loadingTight : loadingWide;

  const tabs = [
    { id: "compose", label: "compose" },
    { id: "results", label: "reports" },
    { id: "compare", label: "analysis" },
  ];

  const hasResults = tightAnalysis || wideAnalysis;
  const canCompare = tightAnalysis && wideAnalysis;

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

      {/* Header */}
      <div style={{ maxWidth: 960, margin: "0 auto 48px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 9,
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            opacity: 0.3,
            marginBottom: 8,
          }}>claudeception // spatial analyzer — blind mode</div>
          <h1 style={{
            fontSize: 28,
            fontWeight: 300,
            letterSpacing: "-0.01em",
            margin: 0,
            lineHeight: 1.3,
          }}>
            Regulatory Intervention Testing
          </h1>
          <p style={{
            fontSize: 14,
            opacity: 0.4,
            marginTop: 8,
            fontStyle: "italic",
            lineHeight: 1.6,
            margin: "8px 0 0",
          }}>
            Inner Claude receives no dimensional framework.
            A/B assignment is randomized. Reveal happens at analysis.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
          {hasResults && (
            <button
              onClick={exportSession}
              style={{
                background: "none",
                border: "1px solid rgba(200,192,184,0.15)",
                borderRadius: 2,
                color: copied ? "#5ba8a0" : "#c8c0b870",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "8px 16px",
                cursor: "pointer",
                transition: "all 0.3s",
              }}
            >{copied ? "copied" : "export json"}</button>
          )}
          {hasResults && (
            <button
              onClick={resetSession}
              style={{
                background: "none",
                border: "1px solid rgba(200,192,184,0.1)",
                borderRadius: 2,
                color: "#c8c0b840",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "8px 16px",
                cursor: "pointer",
                transition: "all 0.3s",
              }}
            >reset</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ maxWidth: 960, margin: "0 auto 32px", display: "flex", gap: 32 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: "none",
              border: "none",
              borderBottom: activeTab === tab.id ? "1px solid #c8c0b8" : "1px solid transparent",
              color: activeTab === tab.id ? "#c8c0b8" : "#c8c0b850",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              padding: "8px 0",
              cursor: "pointer",
              transition: "all 0.3s",
            }}
          >{tab.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* Compose */}
        {activeTab === "compose" && (
          <div>
            <div style={{ display: "flex", gap: 24, marginBottom: 32, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <label htmlFor="tight-input" style={{
                  display: "block",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "#e85d45",
                  opacity: 0.6,
                  marginBottom: 10,
                }}>tight composition</label>
                <textarea
                  id="tight-input"
                  value={tightInput}
                  onChange={e => setTightInput(e.target.value)}
                  spellCheck={false}
                  style={{
                    width: "100%",
                    height: 260,
                    background: "rgba(232,93,69,0.03)",
                    border: "1px solid rgba(232,93,69,0.1)",
                    borderRadius: 2,
                    color: "#c8c0b8",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 13,
                    lineHeight: 1.6,
                    padding: 20,
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 280 }}>
                <label htmlFor="wide-input" style={{
                  display: "block",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "#5ba8a0",
                  opacity: 0.6,
                  marginBottom: 10,
                }}>wide composition</label>
                <textarea
                  id="wide-input"
                  value={wideInput}
                  onChange={e => setWideInput(e.target.value)}
                  spellCheck={false}
                  style={{
                    width: "100%",
                    height: 260,
                    background: "rgba(91,168,160,0.03)",
                    border: "1px solid rgba(91,168,160,0.1)",
                    borderRadius: 2,
                    color: "#c8c0b8",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 13,
                    lineHeight: 1.6,
                    padding: 20,
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <button
                onClick={runBoth}
                disabled={loadingTight || loadingWide}
                style={{
                  background: "rgba(200,192,184,0.08)",
                  border: "1px solid rgba(200,192,184,0.15)",
                  borderRadius: 2,
                  color: "#c8c0b8",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  padding: "14px 36px",
                  cursor: loadingTight || loadingWide ? "wait" : "pointer",
                  opacity: loadingTight || loadingWide ? 0.4 : 1,
                  transition: "all 0.3s",
                }}
              >
                {loadingTight || loadingWide ? "inner claude attending..." : "run blind analysis"}
              </button>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                opacity: 0.2,
                letterSpacing: "0.1em",
              }}>a/b order randomized</span>
            </div>
          </div>
        )}

        {/* Reports — shown as A/B, no tight/wide labels */}
        {activeTab === "results" && (
          <div>
            {assignment && (
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                opacity: 0.2,
                marginBottom: 20,
              }}>
                blind mode — compositions assigned randomly — reveal in analysis tab
              </div>
            )}
            <div style={{ display: "flex", gap: 24, marginBottom: 32, flexWrap: "wrap" }}>
              <AnalysisPanel
                title="report A"
                analysis={analysisA}
                isLoading={loadingA}
              />
              <AnalysisPanel
                title="report B"
                analysis={analysisB}
                isLoading={loadingB}
              />
            </div>
            {canCompare && (
              <button
                onClick={runComparison}
                disabled={loadingCompare}
                style={{
                  background: "rgba(200,192,184,0.08)",
                  border: "1px solid rgba(200,192,184,0.15)",
                  borderRadius: 2,
                  color: "#c8c0b8",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  padding: "14px 36px",
                  cursor: loadingCompare ? "wait" : "pointer",
                  opacity: loadingCompare ? 0.4 : 1,
                  transition: "all 0.3s",
                }}
              >
                {loadingCompare ? "analyzing..." : "reveal + run comparative analysis"}
              </button>
            )}
          </div>
        )}

        {/* Analysis — reveal happens here */}
        {activeTab === "compare" && (
          <div>
            {assignment && (
              <div style={{
                marginBottom: 24,
                padding: "12px 16px",
                background: "rgba(200,192,184,0.03)",
                border: "1px solid rgba(200,192,184,0.08)",
                borderRadius: 2,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                letterSpacing: "0.12em",
                color: "#c8c0b870",
                display: "flex",
                gap: 32,
              }}>
                <span>report {labelTight} → tight composition</span>
                <span>report {labelWide} → wide composition</span>
              </div>
            )}
            <AnalysisPanel
              title="comparative analysis — blind reveal"
              analysis={comparison}
              isLoading={loadingCompare}
              color="#c8c0b8"
            />
          </div>
        )}

        {error && (
          <div style={{
            marginTop: 24,
            padding: "12px 16px",
            background: "rgba(232,93,69,0.08)",
            border: "1px solid rgba(232,93,69,0.2)",
            borderRadius: 2,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            color: "#e85d45",
          }}>{error}</div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        maxWidth: 960,
        margin: "64px auto 0",
        paddingTop: 24,
        borderTop: "1px solid rgba(200,192,184,0.06)",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        opacity: 0.2,
        display: "flex",
        justifyContent: "space-between",
      }}>
        <span>spatial analyzer — blind mode — regulatory intervention testing</span>
        <span>session {sid}</span>
      </div>
    </div>
  );
}
