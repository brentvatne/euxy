// Minimal Chrome DevTools Protocol client, used from both ends of the probe.
//
//   node cdp.mjs capture <out.json>   — on your Mac, against a Paper launched
//                                        with --remote-debugging-port=9222
//   node cdp.mjs inject  <in.json>    — on the runner, against the headless
//                                        Paper the probe just started
//
// Going through CDP rather than copying the Electron profile solves two
// problems at once: the payload is a few KB instead of ~292 KB (EAS caps secret
// values at 32 KiB), and cookies come out already decrypted by the app itself,
// so macOS Keychain encryption never enters the picture.
//
// Zero dependencies: Node 22 has a global WebSocket.

const PORT = process.env.CDP_PORT ?? '9222';
const ORIGIN = 'https://app.paper.design';
const COOKIE_DOMAIN_SUFFIX = 'paper.design';

// Only the fields Network.setCookies accepts. getAllCookies returns extras
// (size, session) that make setCookies reject the whole batch.
// Analytics identity is not needed to authorize a session, and shipping it to a
// runner would both inflate the blob and attribute CI activity to you. Verified
// against a real capture: dropping these leaves the session cookie intact.
const ANALYTICS_PATTERN = /^ph_phc_|posthog/i;

const COOKIE_FIELDS = [
  'name',
  'value',
  'domain',
  'path',
  'secure',
  'httpOnly',
  'sameSite',
  'expires',
  'priority',
  'sourceScheme',
  'sourcePort',
];

// Paper runs several page targets: a hidden preloader, the desktop app-bar
// chrome, and the actual document window. Injecting into the preloader looked
// like success — title became "euxy · Paper" and the sign-in wall cleared — while
// the visible window still sat on the login screen and MCP still found no canvas.
// Exclude only these two exactly. `/www/desktop/` as a prefix was too greedy —
// the visible sign-in window lives under that path as well, so excluding the
// prefix left zero targets and the navigation silently did nothing.
const UTILITY_PATHS = ['/static/desktop/preloader', '/www/desktop/app-bar'];

const isUtility = (url) => UTILITY_PATHS.some((p) => String(url).includes(p));

async function listPageTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const targets = await res.json();
  return targets.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
}

async function findPageTarget() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const targets = await res.json();
      const pages = targets.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      // Prefer an open document, then any non-utility Paper window.
      const file = pages.find((t) => String(t.url).includes('/file/'));
      if (file) return file;
      const main = pages.find((t) => String(t.url).includes(COOKIE_DOMAIN_SUFFIX) && !isUtility(t.url));
      if (main) return main;
      if (pages.length && Date.now() > deadline - 30_000) return pages[0];
    } catch {
      // Debug port not listening yet.
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`no CDP page target on port ${PORT} after 60s`);
}

function connect(url) {
  const ws = new WebSocket(url);
  const pending = new Map();
  let nextId = 1;

  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', (e) => reject(new Error(`websocket error: ${e.message ?? 'unknown'}`)));
  });

  ws.addEventListener('message', (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    if (msg.error) slot.reject(new Error(`${msg.error.message} (${msg.error.code})`));
    else slot.resolve(msg.result);
  });

  const send = async (method, params = {}) => {
    await ready;
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 30_000);
    });
  };

  return { send, close: () => ws.close() };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(`evaluate failed: ${result.exceptionDetails.text}`);
  }
  return result.result?.value;
}

async function capture(outPath) {
  const target = await findPageTarget();
  process.stderr.write(`target: ${target.url}\n`);
  const cdp = connect(target.webSocketDebuggerUrl);

  await cdp.send('Network.enable');
  const { cookies } = await cdp.send('Network.getAllCookies');
  const scoped = cookies
    .filter((c) => String(c.domain).replace(/^\./, '').endsWith(COOKIE_DOMAIN_SUFFIX))
    .filter((c) => !ANALYTICS_PATTERN.test(c.name))
    .map((c) => Object.fromEntries(COOKIE_FIELDS.filter((f) => c[f] !== undefined).map((f) => [f, c[f]])));

  const local = await evaluate(cdp, 'JSON.stringify(Object.fromEntries(Object.entries(localStorage)))');
  const session = {
    origin: ORIGIN,
    capturedFrom: target.url,
    cookies: scoped,
    localStorage: Object.fromEntries(
      Object.entries(JSON.parse(local ?? '{}')).filter(([k]) => !ANALYTICS_PATTERN.test(k)),
    ),
  };

  const { writeFileSync } = await import('node:fs');
  writeFileSync(outPath, JSON.stringify(session));
  cdp.close();

  // Names only — values are the credential.
  process.stderr.write(`cookies: ${scoped.length} (${scoped.map((c) => c.name).join(', ')})\n`);
  process.stderr.write(`localStorage keys: ${Object.keys(session.localStorage).length}\n`);
  process.stderr.write(`wrote ${outPath}\n`);
}

async function inject(inPath) {
  const { readFileSync } = await import('node:fs');
  const session = JSON.parse(readFileSync(inPath, 'utf8'));

  const target = await findPageTarget();
  process.stderr.write(`target: ${target.url}\n`);
  const cdp = connect(target.webSocketDebuggerUrl);

  await cdp.send('Network.enable');
  if (session.cookies?.length) {
    await cdp.send('Network.setCookies', { cookies: session.cookies });
    process.stderr.write(`set ${session.cookies.length} cookies\n`);
  }

  const entries = Object.entries(session.localStorage ?? {});
  if (entries.length) {
    // localStorage is origin-scoped, so this only lands if the page is already
    // on the Paper origin. Navigate first when it is not.
    if (!String(target.url).startsWith(session.origin)) {
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url: session.origin });
      await new Promise((r) => setTimeout(r, 5000));
    }
    await evaluate(
      cdp,
      `(() => { const e = ${JSON.stringify(entries)}; for (const [k, v] of e) localStorage.setItem(k, v); return e.length; })()`,
    );
    process.stderr.write(`set ${entries.length} localStorage keys\n`);
  }

  // Land on the document that was open at capture time, not the origin root.
  // The MCP server reports "Could not find Paper. Is it running?" until a real
  // canvas exists, so the file URL is the whole point of this navigation.
  const destination =
    typeof session.capturedFrom === 'string' && session.capturedFrom.includes('/file/')
      ? session.capturedFrom
      : session.origin;

  cdp.close();

  // Cookies are profile-wide, so one setCookies call covers every window. What
  // was missing is navigating the window a human would actually be looking at —
  // so drive every non-utility page to the document, not just the first match.
  const allPages = await listPageTargets();
  // Log every target and its verdict — the missing diagnostic that made two
  // earlier failures look like Paper's fault rather than a filter bug.
  for (const t of allPages) {
    process.stderr.write(`  target ${isUtility(t.url) ? 'SKIP' : 'USE '} ${t.url}\n`);
  }
  const pages = allPages.filter((t) => !isUtility(t.url));
  process.stderr.write(`navigating ${pages.length} of ${allPages.length} page target(s) to ${destination}\n`);

  for (const page of pages) {
    const pageCdp = connect(page.webSocketDebuggerUrl);
    try {
      await pageCdp.send('Page.enable').catch(() => {});
      await pageCdp.send('Page.navigate', { url: destination });
      // Give the canvas time to boot before the caller polls for the MCP port.
      await new Promise((r) => setTimeout(r, 15_000));
      const title = await evaluate(pageCdp, 'document.title').catch(() => null);
      const wall = await evaluate(
        pageCdp,
        '/sign in to paper/i.test(document.body?.innerText ?? "")',
      ).catch(() => null);
      process.stderr.write(`  ${page.url} -> title ${JSON.stringify(title)}, sign-in wall: ${wall}\n`);
    } catch (err) {
      process.stderr.write(`  ${page.url} -> failed: ${err.message}\n`);
    } finally {
      pageCdp.close();
    }
  }
}

// Answers "when does the CI secret go stale?" without printing any values.
async function expiry() {
  const nowMs = Date.now();
  const target = await findPageTarget();
  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.send('Network.enable');
  const { cookies } = await cdp.send('Network.getAllCookies');
  const scoped = cookies
    .filter((c) => String(c.domain).replace(/^\./, '').endsWith(COOKIE_DOMAIN_SUFFIX))
    .filter((c) => !ANALYTICS_PATTERN.test(c.name));

  let soonest = Infinity;
  for (const c of scoped) {
    // expires === -1 marks a session cookie: gone when the app quits.
    if (!c.expires || c.expires <= 0) {
      process.stdout.write(`${c.name}: session cookie (no expiry)\n`);
      continue;
    }
    const ms = c.expires * 1000;
    soonest = Math.min(soonest, ms);
    const days = Math.floor((ms - nowMs) / 86_400_000);
    process.stdout.write(`${c.name}: expires ${new Date(ms).toISOString()} (${days} days)\n`);
  }
  if (soonest < Infinity) {
    process.stdout.write(`\nrefresh the CI secret before ${new Date(soonest).toISOString()}\n`);
  }
  cdp.close();
}

const [command, file] = process.argv.slice(2);
if (command === 'capture' && file) await capture(file);
else if (command === 'inject' && file) await inject(file);
else if (command === 'expiry') await expiry();
else {
  process.stderr.write('usage: node cdp.mjs capture|inject <file.json> | expiry\n');
  process.exit(2);
}
