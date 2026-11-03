const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = __dirname; const types = { '.html':'text/html', '.js':'application/javascript', '.json':'application/json', '.bin':'application/octet-stream', '.wasm':'application/wasm' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
srv.listen(8765, async () => {
  const b0 = await chromium.launch();
  if (false)
  { const ctx = await b0.newContext(); const p = await ctx.newPage(); await p.goto('http://127.0.0.1:8765/index.html');
    const par = await p.evaluate(() => window.runParity()); fs.writeFileSync(path.join(root, 'parity_tfjs.json'), JSON.stringify(par)); console.log('parity n', par.length); await ctx.close(); }
  await b0.close();
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const res = [];
  for (const [throttle, backend] of [[1,'wasm'],[4,'wasm'],[6,'wasm']]) {
    const ctx = await b.newContext(); const p = await ctx.newPage(); const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    await p.goto('http://127.0.0.1:8765/index.html');
    try { const r = await p.evaluate(([bk]) => window.runBench(bk, 10), [backend]); res.push({ throttle, ...r }); console.log(JSON.stringify({ throttle, ...r })); fs.writeFileSync(path.join(root, 'bench_results_wasm.json'), JSON.stringify(res, null, 1)); }
    catch (e) { console.log(JSON.stringify({ throttle, backend, error: String(e).slice(0, 120) })); }
    await ctx.close();
  }
  fs.writeFileSync(path.join(root, 'bench_results_wasm.json'), JSON.stringify(res, null, 1)); await b.close(); srv.close();
});
