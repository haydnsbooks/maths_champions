/**
 * API — the only file that talks to the server.
 * API.call(action, data) -> Promise of the server's response (throws Error with .code on failure).
 * In DEMO mode the real server code is loaded into the page and run against a fake sheet in localStorage.
 */
(function () {
  var C = window.APP_CONFIG;
  var DEMO = !C.API_URL || C.API_URL === 'DEMO';
  var offset = 0, bestRtt = Infinity, ready = null;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function ensureReady() {
    if (!DEMO) return Promise.resolve();
    if (!ready) {
      ready = ['js/demo/mock-gas.js', 'server/Config.js', 'server/Store.js', 'server/Fluency.js', 'server/Rooms.js', 'server/Code.js']
        .reduce(function (p, src) { return p.then(function () { return loadScript(src); }); }, Promise.resolve())
        .then(function () { window.MockGas.seedDemo(); });
    }
    return ready;
  }

  async function call(action, data) {
    await ensureReady();
    var body = Object.assign({ action: action }, data || {});
    var t0 = Date.now(), res;
    if (DEMO) {
      await sleep(60 + Math.random() * 120);
      res = JSON.parse(JSON.stringify(window.handleRequest(body)));
    } else {
      var r;
      try {
        r = await fetch(C.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
      } catch (e) { var ne = new Error('No connection to the game server.'); ne.network = true; throw ne; }
      if (!r.ok) { var he = new Error('Server error (' + r.status + ')'); he.network = true; throw he; }
      res = await r.json();
    }
    var rtt = Date.now() - t0;
    // Keep the clock estimate from the fastest round trip (most accurate).
    if (res.now && rtt <= bestRtt * 1.5) { bestRtt = Math.min(bestRtt, rtt); offset = res.now - (t0 + rtt / 2); }
    if (!res.ok) { var e = new Error(res.error || 'Something went wrong'); e.code = res.error; throw e; }
    return res;
  }

  /** Like call() but retries network failures (used for saving results). */
  async function callRetry(action, data, tries) {
    tries = tries || 5;
    for (var i = 0; ; i++) {
      try { return await call(action, data); }
      catch (e) { if (!e.network || i >= tries - 1) throw e; await sleep(1000 * (i + 1) + Math.random() * 1000); }
    }
  }

  window.API = {
    call: call,
    callRetry: callRetry,
    now: function () { return Date.now() + offset; },   // server clock
    demo: DEMO,
    storage: DEMO ? window.sessionStorage : window.localStorage // demo: each tab can be a different student
  };
})();
