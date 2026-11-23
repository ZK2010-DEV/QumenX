// Minimal Chrome DevTools Protocol client using Node 26 built-in WebSocket.
// Usage: node cdp.mjs "<javascript expression>"
//        node cdp.mjs --screenshot [path]
import fs from 'node:fs';

const port = 9222;
const args = process.argv.slice(2);

async function main() {
  const listRes = await fetch(`http://localhost:${port}/json/list`);
  const targets = await listRes.json();
  const page = targets.find(t => t.type === 'page' && t.url.includes('localhost:5173')) || targets.find(t => t.type === 'page');
  if (!page) {
    console.error('No page target found. Targets:', JSON.stringify(targets, null, 2));
    process.exit(1);
  }
  console.error('Target:', page.title, page.url);

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  function send(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = ++id;
      pending.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  if (args[0] === '--screenshot') {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const data = r.result?.data;
    if (!data) { console.error('Screenshot failed', JSON.stringify(r)); process.exit(1); }
    const out = args[1] || 'app-screenshot.png';
    fs.writeFileSync(out, Buffer.from(data, 'base64'));
    console.log('Screenshot saved:', out);
  } else if (args[0] === '--console') {
    const r = await send('Runtime.evaluate', { expression: `JSON.stringify(window.__cdpLogs || [])`, returnByValue: true });
    console.log(r.result?.result?.value);
  } else if (args[0] === '--file') {
    const expr = fs.readFileSync(args[1], 'utf8');
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) {
      console.error('Exception:', JSON.stringify(r.result.exceptionDetails, null, 2));
      process.exit(1);
    }
    console.log(typeof r.result?.result?.value === 'string' ? r.result.result.value : JSON.stringify(r.result?.result?.value, null, 2));
  } else {
    const expr = args.join(' ') || 'document.title';
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) {
      console.error('Exception:', JSON.stringify(r.result.exceptionDetails, null, 2));
      process.exit(1);
    }
    console.log(typeof r.result?.result?.value === 'string' ? r.result.result.value : JSON.stringify(r.result?.result?.value, null, 2));
  }
  ws.close();
}
main().catch(e => { console.error(e); process.exit(1); });
