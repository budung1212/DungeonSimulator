export const $ = (sel) => document.querySelector(sel);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}

export function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
export function rndInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function chance(pct) { return Math.random() < (pct / 100); }

export function uuid() {
  return (crypto?.randomUUID?.() ?? `id_${Math.random().toString(16).slice(2)}_${Date.now()}`);
}

export function logLine(text) {
  const el = $("#log");
  if (!el) return;
  const prev = el.innerHTML.trim();
  const line = `• ${esc(text)}`;
  el.innerHTML = prev ? `${prev}<br/>${line}` : line;
}
