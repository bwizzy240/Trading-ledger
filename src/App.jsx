import React, { useState, useEffect, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Plus, Trash2, Check } from "lucide-react";

const COLORS = {
  bg: "#1C2620",
  panel: "#232E27",
  panelAlt: "#1F2923",
  ink: "#E8E4D8",
  muted: "#8B9A8E",
  faint: "#4B584F",
  rule: "#3A453D",
  profit: "#5FAE7F",
  loss: "#C06A57",
  brass: "#D4A94A",
};

const SERIF = "'Fraunces', Georgia, serif";
const MONO = "'JetBrains Mono', 'Courier New', monospace";

const PRESETS = {
  ES: { name: "E-mini S&P 500", tick: 0.25, tickValue: 12.5 },
  MES: { name: "Micro E-mini S&P 500", tick: 0.25, tickValue: 1.25 },
  NQ: { name: "E-mini Nasdaq-100", tick: 0.25, tickValue: 5 },
  MNQ: { name: "Micro E-mini Nasdaq-100", tick: 0.25, tickValue: 0.5 },
  CL: { name: "Crude Oil", tick: 0.01, tickValue: 10 },
  GC: { name: "Gold", tick: 0.1, tickValue: 10 },
  YM: { name: "E-mini Dow", tick: 1, tickValue: 5 },
  MYM: { name: "Micro E-mini Dow", tick: 1, tickValue: 0.5 },
  CUSTOM: { name: "Custom instrument", tick: 0.25, tickValue: 5 },
};

const DEFAULT_RULES = [
  "Max daily loss hit → done for the day, no exceptions",
  "Risk no more than 1% of account per trade",
  "No trades in the first 2 minutes after the open",
  "No trading through red-folder news events",
  "Two losses in a row → stop and review, don't revenge trade",
  "Every trade has a stop-loss set before entry",
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fmtMoney(n) {
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toFixed(2);
}

function fmtR(n) {
  if (!isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return sign + n.toFixed(2) + "R";
}

const STORAGE_PREFIX = "the-ledger:";

export default function TradingLedger() {
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("journal");
  const [trades, setTrades] = useState([]);
  const [rules, setRules] = useState(DEFAULT_RULES.map((text) => ({ id: uid(), text, checked: false })));
  const [account, setAccount] = useState({ size: 50000, riskPct: 1 });
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    try {
      const t = localStorage.getItem(STORAGE_PREFIX + "trades");
      if (t) setTrades(JSON.parse(t));
    } catch (e) {}
    try {
      const r = localStorage.getItem(STORAGE_PREFIX + "rules");
      if (r) setRules(JSON.parse(r));
    } catch (e) {}
    try {
      const a = localStorage.getItem(STORAGE_PREFIX + "account-settings");
      if (a) setAccount(JSON.parse(a));
    } catch (e) {}
    setLoaded(true);
  }, []);

  function persist(key, value) {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
      setSaveError("");
    } catch (e) {
      setSaveError("Save failed — your browser may be blocking local storage (e.g. private/incognito mode).");
    }
  }

  function addTrade(trade) {
    const next = [trade, ...trades];
    setTrades(next);
    persist("trades", next);
  }
  function deleteTrade(id) {
    const next = trades.filter((t) => t.id !== id);
    setTrades(next);
    persist("trades", next);
  }
  function closeTrade(id, exitPriceRaw) {
    const exit = parseFloat(exitPriceRaw);
    if (isNaN(exit)) return;
    const next = trades.map((t) => {
      if (t.id !== id) return t;
      const preset = PRESETS[t.instrument];
      const riskPerContract = Math.abs(t.entry - t.stop);
      const rewardPerContract = t.direction === "long" ? exit - t.entry : t.entry - exit;
      let rMultiple = riskPerContract === 0 ? 0 : rewardPerContract / riskPerContract;
      rMultiple = Math.round(rMultiple * 100) / 100;
      const ticks = rewardPerContract / preset.tick;
      const dollarPL = Math.round(ticks * preset.tickValue * t.contracts * 100) / 100;
      return { ...t, exit, rMultiple, dollarPL, status: "closed" };
    });
    setTrades(next);
    persist("trades", next);
  }
  function updateRules(next) {
    setRules(next);
    persist("rules", next);
  }
  function updateAccount(next) {
    setAccount(next);
    persist("account-settings", next);
  }

  const stats = useMemo(() => {
    const openCount = trades.filter((t) => t.status === "open").length;
    const closed = trades.filter((t) => t.status !== "open");
    if (closed.length === 0) {
      return { count: 0, winRate: 0, avgR: 0, totalR: 0, netPL: 0, profitFactor: null, curve: [], openCount };
    }
    let wins = 0, totalR = 0, netPL = 0, grossWin = 0, grossLoss = 0, cum = 0;
    const curve = [];
    const chrono = [...closed].reverse();
    chrono.forEach((t, i) => {
      if (t.rMultiple > 0) wins++;
      totalR += t.rMultiple;
      netPL += t.dollarPL;
      if (t.dollarPL >= 0) grossWin += t.dollarPL; else grossLoss += Math.abs(t.dollarPL);
      cum += t.dollarPL;
      curve.push({ n: i + 1, equity: Math.round(cum * 100) / 100 });
    });
    return {
      count: closed.length,
      winRate: (wins / closed.length) * 100,
      avgR: totalR / closed.length,
      totalR,
      netPL,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
      curve,
      openCount,
    };
  }, [trades]);

  if (!loaded) {
    return (
      <div style={{ background: COLORS.bg, color: COLORS.muted, fontFamily: SERIF, minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
        Opening the ledger…
      </div>
    );
  }

  return (
    <div style={{ background: COLORS.bg, color: COLORS.ink, fontFamily: SERIF, minHeight: "100%", padding: "0", borderRadius: 8, overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        .tl-input { background: ${COLORS.panelAlt}; border: 1px solid ${COLORS.rule}; color: ${COLORS.ink}; font-family: ${MONO}; font-size: 13px; padding: 8px 10px; border-radius: 3px; width: 100%; }
        .tl-input:focus { outline: none; border-color: ${COLORS.brass}; }
        .tl-label { font-family: ${SERIF}; font-size: 13px; color: ${COLORS.muted}; margin-bottom: 4px; display: block; }
        .tl-tab { font-family: ${SERIF}; font-size: 15px; padding: 12px 18px; cursor: pointer; border-bottom: 2px solid transparent; color: ${COLORS.muted}; background: none; border-top: none; border-left: none; border-right: none; }
        .tl-tab.active { color: ${COLORS.ink}; border-bottom: 2px solid ${COLORS.brass}; }
        .tl-btn { font-family: ${SERIF}; font-size: 13px; background: ${COLORS.brass}; color: ${COLORS.bg}; border: none; padding: 9px 16px; border-radius: 3px; cursor: pointer; font-weight: 600; }
        .tl-btn-ghost { font-family: ${SERIF}; font-size: 13px; background: none; color: ${COLORS.muted}; border: 1px solid ${COLORS.rule}; padding: 8px 14px; border-radius: 3px; cursor: pointer; }
        .tl-table { width: 100%; border-collapse: collapse; font-family: ${MONO}; font-size: 12.5px; }
        .tl-table th { text-align: left; color: ${COLORS.muted}; font-family: ${SERIF}; font-weight: 400; font-size: 13px; padding: 8px 10px; border-bottom: 1px solid ${COLORS.rule}; }
        .tl-table td { padding: 9px 10px; border-bottom: 1px solid ${COLORS.rule}; }
        select.tl-input { appearance: none; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "24px 28px 0 28px" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <h1 style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, margin: 0, letterSpacing: "0.2px" }}>
            The Ledger
          </h1>
          <span style={{ color: COLORS.faint, fontSize: 12.5, fontFamily: MONO }}>paper trading companion</span>
        </div>
        <div style={{ height: 1, background: COLORS.rule, margin: "16px 0 0 0" }} />
        <div style={{ display: "flex", gap: 4 }}>
          {[
            ["journal", "Journal"],
            ["sizing", "Position sizing"],
            ["rules", "Rules"],
            ["stats", "Stats"],
          ].map(([key, label]) => (
            <button key={key} className={"tl-tab" + (tab === key ? " active" : "")} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Ticker strip */}
      <div style={{ display: "flex", borderTop: `1px solid ${COLORS.rule}`, borderBottom: `1px solid ${COLORS.rule}`, background: COLORS.panelAlt }}>
        {[
          ["Win rate", stats.count ? stats.winRate.toFixed(0) + "%" : "—"],
          ["Avg R", stats.count ? fmtR(stats.avgR) : "—"],
          ["Total R", stats.count ? fmtR(stats.totalR) : "—"],
          ["Net P/L", stats.count ? fmtMoney(stats.netPL) : "—"],
        ].map(([label, value], i) => (
          <div key={label} style={{ flex: 1, padding: "14px 20px", borderLeft: i > 0 ? `1px solid ${COLORS.rule}` : "none" }}>
            <div style={{ fontFamily: MONO, fontSize: 20, color: value.toString().startsWith("-") ? COLORS.loss : COLORS.ink }}>{value}</div>
            <div style={{ fontFamily: SERIF, fontSize: 12.5, color: COLORS.muted, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: "24px 28px 32px 28px" }}>
        {stats.openCount > 0 && (
          <div style={{ color: COLORS.brass, fontSize: 13, marginBottom: 16 }}>
            {stats.openCount} trade{stats.openCount > 1 ? "s" : ""} still open — stats above reflect closed trades only.
          </div>
        )}
        {saveError && (
          <div style={{ background: "#3A2A24", border: `1px solid ${COLORS.loss}`, color: COLORS.loss, fontSize: 13, padding: "8px 12px", borderRadius: 3, marginBottom: 16 }}>
            {saveError}
          </div>
        )}
        {tab === "journal" && <JournalTab trades={trades} addTrade={addTrade} deleteTrade={deleteTrade} closeTrade={closeTrade} />}
        {tab === "sizing" && <SizingTab account={account} updateAccount={updateAccount} />}
        {tab === "rules" && <RulesTab rules={rules} updateRules={updateRules} />}
        {tab === "stats" && <StatsTab stats={stats} tradeCount={trades.length} />}
      </div>
    </div>
  );
}

function JournalTab({ trades, addTrade, deleteTrade, closeTrade }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    instrument: "MES",
    direction: "long",
    entry: "",
    stop: "",
    exit: "",
    contracts: "1",
    setup: "",
    notes: "",
  });
  const [error, setError] = useState("");
  const [closingId, setClosingId] = useState(null);
  const [closingExit, setClosingExit] = useState("");

  function set(field, val) {
    setForm((f) => ({ ...f, [field]: val }));
  }

  function submit() {
    const entry = parseFloat(form.entry);
    const stop = parseFloat(form.stop);
    const contracts = parseInt(form.contracts, 10);
    if ([entry, stop].some((n) => isNaN(n)) || !contracts || contracts < 1) {
      setError("Fill in entry, stop, and contracts as numbers before adding the trade. Exit can stay blank if the trade is still open.");
      return;
    }
    const exitRaw = form.exit.trim();
    const hasExit = exitRaw !== "" && !isNaN(parseFloat(exitRaw));
    const preset = PRESETS[form.instrument];
    let rMultiple = null, dollarPL = null, exit = null;
    if (hasExit) {
      exit = parseFloat(exitRaw);
      const riskPerContract = Math.abs(entry - stop);
      const rewardPerContract = form.direction === "long" ? exit - entry : entry - exit;
      rMultiple = riskPerContract === 0 ? 0 : Math.round((rewardPerContract / riskPerContract) * 100) / 100;
      const ticks = rewardPerContract / preset.tick;
      dollarPL = Math.round(ticks * preset.tickValue * contracts * 100) / 100;
    }

    addTrade({
      id: uid(),
      ...form,
      entry, stop, exit, contracts,
      rMultiple, dollarPL,
      status: hasExit ? "closed" : "open",
    });
    setError("");
    setForm((f) => ({ ...f, entry: "", stop: "", exit: "", setup: "", notes: "" }));
  }

  function startClose(id) {
    setClosingId(id);
    setClosingExit("");
  }
  function confirmClose() {
    if (!closingExit.trim() || isNaN(parseFloat(closingExit))) return;
    closeTrade(closingId, closingExit);
    setClosingId(null);
    setClosingExit("");
  }

  return (
    <div>
      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.rule}`, borderRadius: 4, padding: 20, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <div>
            <label className="tl-label">Date</label>
            <input className="tl-input" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </div>
          <div>
            <label className="tl-label">Instrument</label>
            <select className="tl-input" value={form.instrument} onChange={(e) => set("instrument", e.target.value)}>
              {Object.entries(PRESETS).map(([key, p]) => (
                <option key={key} value={key}>{key} — {p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="tl-label">Direction</label>
            <select className="tl-input" value={form.direction} onChange={(e) => set("direction", e.target.value)}>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </div>
          <div>
            <label className="tl-label">Contracts</label>
            <input className="tl-input" type="number" min="1" value={form.contracts} onChange={(e) => set("contracts", e.target.value)} />
          </div>
          <div>
            <label className="tl-label">Entry price</label>
            <input className="tl-input" type="number" step="any" value={form.entry} onChange={(e) => set("entry", e.target.value)} placeholder="e.g. 5920.25" />
          </div>
          <div>
            <label className="tl-label">Stop price</label>
            <input className="tl-input" type="number" step="any" value={form.stop} onChange={(e) => set("stop", e.target.value)} placeholder="e.g. 5915.00" />
          </div>
          <div>
            <label className="tl-label">Exit price (blank if still open)</label>
            <input className="tl-input" type="number" step="any" value={form.exit} onChange={(e) => set("exit", e.target.value)} placeholder="leave blank if open" />
          </div>
          <div>
            <label className="tl-label">Setup / tag</label>
            <input className="tl-input" type="text" value={form.setup} onChange={(e) => set("setup", e.target.value)} placeholder="e.g. opening range" />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <label className="tl-label">Notes</label>
          <input className="tl-input" type="text" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="What happened, how you felt, what you'd repeat" />
        </div>
        {error && <div style={{ color: COLORS.loss, fontSize: 13, marginTop: 12 }}>{error}</div>}
        <div style={{ marginTop: 16 }}>
          <button className="tl-btn" onClick={submit} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Plus size={14} /> Add trade
          </button>
        </div>
      </div>

      {trades.length === 0 ? (
        <div style={{ color: COLORS.muted, fontSize: 14, padding: "20px 0" }}>
          No trades logged yet. Every entry here sharpens the picture of what's actually working.
        </div>
      ) : (
        <table className="tl-table">
          <thead>
            <tr>
              <th>Date</th><th>Instrument</th><th>Dir</th><th>Entry</th><th>Stop</th><th>Exit</th><th>Contracts</th><th>Setup</th><th>Status</th><th>R / P&amp;L</th><th></th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              const isOpen = t.status === "open";
              return (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>{t.instrument}</td>
                  <td style={{ textTransform: "capitalize" }}>{t.direction}</td>
                  <td>{t.entry}</td>
                  <td>{t.stop}</td>
                  <td>{isOpen ? "—" : t.exit}</td>
                  <td>{t.contracts}</td>
                  <td style={{ color: COLORS.muted }}>{t.setup || "—"}</td>
                  <td style={{ color: isOpen ? COLORS.brass : COLORS.muted }}>{isOpen ? "Open" : "Closed"}</td>
                  <td>
                    {isOpen ? (
                      closingId === t.id ? (
                        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <input
                            className="tl-input"
                            style={{ width: 90 }}
                            type="number"
                            step="any"
                            value={closingExit}
                            onChange={(e) => setClosingExit(e.target.value)}
                            placeholder="exit price"
                          />
                          <button className="tl-btn" style={{ padding: "5px 10px", fontSize: 12 }} onClick={confirmClose}>Confirm</button>
                        </span>
                      ) : (
                        <button className="tl-btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => startClose(t.id)}>Close trade</button>
                      )
                    ) : (
                      <>
                        <span style={{ color: t.rMultiple >= 0 ? COLORS.profit : COLORS.loss }}>{fmtR(t.rMultiple)}</span>
                        {" / "}
                        <span style={{ color: t.dollarPL >= 0 ? COLORS.profit : COLORS.loss }}>{fmtMoney(t.dollarPL)}</span>
                      </>
                    )}
                  </td>
                  <td>
                    <button onClick={() => deleteTrade(t.id)} style={{ background: "none", border: "none", color: COLORS.faint, cursor: "pointer", padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SizingTab({ account, updateAccount }) {
  const [instrument, setInstrument] = useState("MES");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [sizeInput, setSizeInput] = useState(String(account.size));
  const [riskInput, setRiskInput] = useState(String(account.riskPct));

  const preset = PRESETS[instrument];
  const entryN = parseFloat(entry);
  const stopN = parseFloat(stop);
  const size = parseFloat(sizeInput) || 0;
  const riskPct = parseFloat(riskInput) || 0;

  const dollarRisk = (size * riskPct) / 100;
  const priceRisk = isNaN(entryN) || isNaN(stopN) ? null : Math.abs(entryN - stopN);
  const ticksAtRisk = priceRisk !== null ? priceRisk / preset.tick : null;
  const riskPerContract = ticksAtRisk !== null ? ticksAtRisk * preset.tickValue : null;
  const suggestedContracts = riskPerContract && riskPerContract > 0 ? Math.floor(dollarRisk / riskPerContract) : null;

  function saveAccount() {
    updateAccount({ size, riskPct });
  }

  return (
    <div style={{ maxWidth: 620 }}>
      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.rule}`, borderRadius: 4, padding: 20, marginBottom: 20 }}>
        <div style={{ fontFamily: SERIF, fontSize: 15, marginBottom: 14, color: COLORS.muted }}>Account</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label className="tl-label">Account size ($)</label>
            <input className="tl-input" type="number" value={sizeInput} onChange={(e) => setSizeInput(e.target.value)} onBlur={saveAccount} />
          </div>
          <div>
            <label className="tl-label">Risk per trade (%)</label>
            <input className="tl-input" type="number" step="0.1" value={riskInput} onChange={(e) => setRiskInput(e.target.value)} onBlur={saveAccount} />
          </div>
        </div>
      </div>

      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.rule}`, borderRadius: 4, padding: 20 }}>
        <div style={{ fontFamily: SERIF, fontSize: 15, marginBottom: 14, color: COLORS.muted }}>This trade</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <div>
            <label className="tl-label">Instrument</label>
            <select className="tl-input" value={instrument} onChange={(e) => setInstrument(e.target.value)}>
              {Object.entries(PRESETS).map(([key, p]) => (
                <option key={key} value={key}>{key} — {p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="tl-label">Entry price</label>
            <input className="tl-input" type="number" step="any" value={entry} onChange={(e) => setEntry(e.target.value)} />
          </div>
          <div>
            <label className="tl-label">Stop price</label>
            <input className="tl-input" type="number" step="any" value={stop} onChange={(e) => setStop(e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: 20, paddingTop: 20, borderTop: `1px solid ${COLORS.rule}` }}>
          <Row label="Dollar risk allowed" value={dollarRisk ? fmtMoney(dollarRisk) : "—"} />
          <Row label="Risk per contract" value={riskPerContract !== null ? fmtMoney(riskPerContract) : "—"} />
          <Row label="Ticks at risk" value={ticksAtRisk !== null ? ticksAtRisk.toFixed(1) : "—"} />
          <div style={{ marginTop: 14, padding: "14px 16px", background: COLORS.panelAlt, borderRadius: 4, border: `1px solid ${COLORS.brass}` }}>
            <div style={{ fontFamily: SERIF, fontSize: 13, color: COLORS.muted }}>Suggested contracts</div>
            <div style={{ fontFamily: MONO, fontSize: 28, color: COLORS.brass, marginTop: 2 }}>
              {suggestedContracts !== null ? Math.max(suggestedContracts, 0) : "—"}
            </div>
            {suggestedContracts === 0 && (
              <div style={{ color: COLORS.loss, fontSize: 12.5, marginTop: 4 }}>Stop is too wide for this risk budget — tighten the stop or skip the trade.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
      <span style={{ fontFamily: SERIF, fontSize: 13.5, color: COLORS.muted }}>{label}</span>
      <span style={{ fontFamily: MONO, fontSize: 14 }}>{value}</span>
    </div>
  );
}

function RulesTab({ rules, updateRules }) {
  const [newRule, setNewRule] = useState("");

  function toggle(id) {
    updateRules(rules.map((r) => (r.id === id ? { ...r, checked: !r.checked } : r)));
  }
  function remove(id) {
    updateRules(rules.filter((r) => r.id !== id));
  }
  function add() {
    if (!newRule.trim()) return;
    updateRules([...rules, { id: uid(), text: newRule.trim(), checked: false }]);
    setNewRule("");
  }
  function resetAll() {
    updateRules(rules.map((r) => ({ ...r, checked: false })));
  }

  const checkedCount = rules.filter((r) => r.checked).length;

  return (
    <div style={{ maxWidth: 620 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ color: COLORS.muted, fontSize: 13.5 }}>{checkedCount} of {rules.length} confirmed</span>
        <button className="tl-btn-ghost" onClick={resetAll}>Reset checklist</button>
      </div>
      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.rule}`, borderRadius: 4 }}>
        {rules.map((r, i) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: i < rules.length - 1 ? `1px solid ${COLORS.rule}` : "none" }}>
            <button
              onClick={() => toggle(r.id)}
              style={{
                width: 20, height: 20, flexShrink: 0, borderRadius: 3,
                border: `1px solid ${r.checked ? COLORS.profit : COLORS.faint}`,
                background: r.checked ? COLORS.profit : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              }}
            >
              {r.checked && <Check size={13} color={COLORS.bg} />}
            </button>
            <span style={{ flex: 1, fontSize: 14, color: r.checked ? COLORS.muted : COLORS.ink, textDecoration: r.checked ? "line-through" : "none" }}>
              {r.text}
            </span>
            <button onClick={() => remove(r.id)} style={{ background: "none", border: "none", color: COLORS.faint, cursor: "pointer", padding: 4 }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <input className="tl-input" type="text" value={newRule} onChange={(e) => setNewRule(e.target.value)} placeholder="Add a rule" onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="tl-btn" onClick={add}>Add</button>
      </div>
    </div>
  );
}

function StatsTab({ stats, tradeCount }) {
  if (tradeCount === 0) {
    return <div style={{ color: COLORS.muted, fontSize: 14, padding: "20px 0" }}>Log a few trades in the Journal tab and your stats will build here.</div>;
  }
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <StatCard label="Trades logged" value={stats.count} />
        <StatCard label="Win rate" value={stats.winRate.toFixed(0) + "%"} />
        <StatCard label="Profit factor" value={stats.profitFactor === null ? "—" : stats.profitFactor.toFixed(2)} />
        <StatCard label="Net P/L" value={fmtMoney(stats.netPL)} color={stats.netPL >= 0 ? COLORS.profit : COLORS.loss} />
      </div>
      <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.rule}`, borderRadius: 4, padding: "20px 16px 8px 4px" }}>
        <div style={{ fontFamily: SERIF, fontSize: 14, color: COLORS.muted, margin: "0 0 12px 20px" }}>Equity curve ($, cumulative)</div>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={stats.curve} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid stroke={COLORS.rule} strokeDasharray="3 3" />
            <XAxis dataKey="n" tick={{ fill: COLORS.muted, fontSize: 11, fontFamily: MONO }} label={{ value: "trade #", position: "insideBottom", offset: -3, fill: COLORS.faint, fontSize: 11 }} />
            <YAxis tick={{ fill: COLORS.muted, fontSize: 11, fontFamily: MONO }} />
            <Tooltip contentStyle={{ background: COLORS.panelAlt, border: `1px solid ${COLORS.rule}`, fontFamily: MONO, fontSize: 12 }} labelStyle={{ color: COLORS.muted }} />
            <Line type="monotone" dataKey="equity" stroke={COLORS.brass} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.rule}`, borderRadius: 4, padding: "16px 18px" }}>
      <div style={{ fontFamily: MONO, fontSize: 22, color: color || COLORS.ink }}>{value}</div>
      <div style={{ fontFamily: SERIF, fontSize: 12.5, color: COLORS.muted, marginTop: 4 }}>{label}</div>
    </div>
  );
}
