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
      setSaveError("
