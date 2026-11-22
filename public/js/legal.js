// Fills the operator details (name, email, address) on the legal pages from legal/operator.json, so they are edited in one place.
fetch('legal/operator.json', { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({})).then((op) => {
  const parts = [op.name, op.address, op.country].filter(Boolean).join(', ');
  document.querySelectorAll('[data-op]').forEach((el) => {
    const k = el.dataset.op;
    if (k === 'full') el.textContent = parts || '—';
    else if (k === 'email' && op.email) { const a = document.createElement('a'); a.href = 'mailto:' + op.email; a.textContent = op.email; el.replaceChildren(a); }
    else el.textContent = op[k] || '—';
  });
});
