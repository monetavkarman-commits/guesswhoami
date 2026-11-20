// The longest overlap of two players' stints on one team: [_, team, fromYear, toYear], toYear 0 while both are still there.
export function bestOverlap(A, B, ok) {
  let best = null; let len = -1;
  for (const [t, s, e] of A) for (const [t2, s2, e2] of B) {
    if (t !== t2) continue;
    const from = Math.max(s, s2); const to = Math.min(e, e2);
    if (!ok(from, to)) continue;
    const l = (Math.floor(to / 100) - Math.floor(from / 100)) * 12 + (to % 100) - (from % 100);
    if (l > len) { len = l; best = [0, t, Math.floor(from / 100), to >= 209900 ? 0 : Math.floor(to / 100)]; }
  }
  return best;
}
