// Minimal CDP helper for driving a real phone browser (Edge/Chrome over adb).
// Real touches via Input.dispatchTouchEvent, because `adb shell input tap` is
// not a faithful finger (see nac-server .claude/rules/environment.md).
//
//   adb -s <serial> forward tcp:9445 localabstract:chrome_devtools_remote
//   node cdp.mjs <script.mjs>   (script imports { connect } from this file)

export async function connect(port = 9445, urlIncludes = "community.nac.social") {
  const list = await (await fetch(`http://localhost:${port}/json/list`)).json();
  const page = list.find((t) => t.type === "page" && t.url.includes(urlIncludes));
  if (!page) throw new Error("no NAC tab found; is the app foregrounded?");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      const { res, rej } = pending.get(d.id);
      pending.delete(d.id);
      d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const api = {
    send,
    sleep,
    close: () => ws.close(),
    /** evaluate JS in the page, return the value */
    async eval(expression) {
      const r = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description ?? ""));
      return r.result.value;
    },
    async touch(type, x, y) {
      await send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }],
      });
    },
    /** a real finger tap */
    async tap(x, y, hold = 60) {
      await api.touch("touchStart", x, y);
      await sleep(hold);
      await api.touch("touchEnd", x, y);
    },
    /** a real long-press */
    async longPress(x, y, ms = 650) {
      await api.tap(x, y, ms);
    },
    async screenshot(path) {
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      const fs = await import("node:fs");
      fs.writeFileSync(path, Buffer.from(data, "base64"));
    },
  };
  await send("Runtime.enable");
  await send("Page.enable");
  return api;
}
