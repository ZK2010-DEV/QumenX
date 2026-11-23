// Verify visible UI controls respond (sidebar tabs, settings, dialogs).
import fs from 'node:fs';

const port = 9222;
async function main() {
  let targets = [];
  for (let i = 0; i < 60; i++) {
    try { const res = await fetch(`http://localhost:${port}/json/list`); targets = await res.json(); if (targets.some(t => t.type === 'page')) break; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  const page = targets.find(t => t.type === 'page' && t.url.includes('5173')) || targets.find(t => t.type === 'page');
  if (!page) throw new Error('No page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.text); };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  const evalJs = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result?.result?.value; };

  // Wait for full React mount
  for (let i = 0; i < 60; i++) { if ((await evalJs(`document.querySelectorAll('*').length`)) > 100) break; await new Promise(r => setTimeout(r, 300)); }

  const results = {};
  results.mounted = await evalJs(`JSON.stringify({nodes:document.querySelectorAll('*').length, text:document.body.innerText.slice(0,200)})`);

  // Click each sidebar tab and capture the panel heading/content signature
  const labels = ['Media','Audio','Text','Stickers','Effects','Transitions','Filters','Speed','Templates','Settings'];
  results.tabs = [];
  for (const label of labels) {
    const r = await evalJs(`(() => {
      const els = [...document.querySelectorAll('button,[role=tab],div')].filter(e => e.textContent.trim() === ${JSON.stringify(label)} && e.offsetParent !== null);
      if (!els.length) return 'NOT_FOUND';
      els[0].click();
      return 'clicked';
    })()`);
    await new Promise(r2 => setTimeout(r2, 120));
    const panel = await evalJs(`(() => { const t=document.body.innerText; return t.slice(0,260).replace(/\\n/g,'|'); })()`);
    results.tabs.push({ label, click: r, panel: panel });
  }

  results.errors = errors;
  console.log('=== UI RESULTS ===');
  console.log(JSON.stringify(results, null, 2));
  ws.close();
}
main().catch(e => { console.error('UI TEST FAILED:', e); process.exit(1); });
