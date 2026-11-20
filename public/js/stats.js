// Daily results: streaks, scores and the "next puzzle in" countdown. Stored per game + mode in localStorage.
import { tr } from './i18n.js';
import { store, h } from './core.js';

const key = (game, mode) => `stats:${game}:${mode}`;
const empty = () => ({ played: 0, wins: 0, streak: 0, best: 0, lastDay: 0, lastWinDay: 0, total: 0, top: 0, days: {} });

export function getStats(game, mode) {
  return { ...empty(), ...store.get(key(game, mode), {}) };
}

// Records one finished daily game. Calling it twice for the same day does nothing.
export function recordResult(game, mode, day, { won, score, detail }) {
  const s = getStats(game, mode);
  if (s.days[day]) return s;
  s.played++;
  s.total += score;
  s.top = Math.max(s.top, score);
  if (won) {
    s.wins++;
    s.streak = s.lastWinDay === day - 1 ? s.streak + 1 : 1;
    s.best = Math.max(s.best, s.streak);
    s.lastWinDay = day;
  } else s.streak = 0;
  s.lastDay = day;
  s.days[day] = { won, score, ...(detail || {}) };
  // keep the last 120 days only
  const ks = Object.keys(s.days).map(Number).sort((a, b) => a - b);
  ks.slice(0, Math.max(0, ks.length - 120)).forEach((k) => delete s.days[k]);
  store.set(key(game, mode), s);
  document.dispatchEvent(new CustomEvent('gwai:result', { detail: { game, mode, day, won, score, stats: s, ...(detail || {}) } }));
  return s;
}

export function statsLine(game, mode) {
  const s = getStats(game, mode);
  if (!s.played) return null;
  return h('div', { class: 'stats-line' },
    stat(tr('Сыграно'), s.played), stat(tr('Побед'), `${Math.round((100 * s.wins) / s.played)}%`),
    stat(tr('Серия'), s.streak), stat(tr('Лучшая'), s.best), stat(tr('Рекорд'), s.top));
}
const stat = (label, v) => h('div', {}, h('b', {}, String(v)), h('small', {}, label));

export function countdown() {
  const el = h('span', { class: 'countdown' });
  const tick = () => {
    if (!el.isConnected && el.dataset.started) return;
    el.dataset.started = '1';
    const now = new Date(); const next = new Date(now); next.setHours(24, 0, 0, 0);
    const s = Math.floor((next - now) / 1000);
    el.textContent = tr('Новая ежедневная через {0}:{1}:{2}', [String(Math.floor(s / 3600)).padStart(2, '0'), String(Math.floor((s % 3600) / 60)).padStart(2, '0'), String(s % 60).padStart(2, '0')]);
    setTimeout(tick, 1000);
  };
  tick();
  return el;
}

// Shared result card used by every mode.
export function resultCard({ title, lines = [], score, daily, game, mode, onShare }) {
  return h('div', { class: 'result' },
    h('h3', {}, title),
    score != null ? h('div', { class: 'score' }, h('b', {}, String(score)), h('small', {}, tr('очков'))) : null,
    lines.map((l) => h('p', {}, l)),
    daily ? statsLine(game, mode) : null,
    h('div', { class: 'result-actions' }, onShare ? h('button', { class: 'btn', onclick: onShare }, tr('Поделиться')) : null),
    daily ? countdown() : null);
}
