import { connect } from "./cdp.mjs";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
const ADBEXE = "C:/Users/bunjm/AppData/Local/Android/Sdk/platform-tools/adb.exe";
const back = () => execFileSync(ADBEXE, ["-s", "R5CN80AJCRW", "shell", "input", "keyevent", "KEYCODE_BACK"]);
const OUT = process.env.OUT;
const HOME = "https://community.nac.social/server/01KTD1MYDTQ0SSXXH7C93BCHET/channel/01M26JD06GH6M0F2GFZ669PG6D";
const c = await connect();
// is some leaf element with exactly this text visible inside the viewport?
const vis = (t) => c.eval(`(()=>{const T=${JSON.stringify(t)};for(const e of document.querySelectorAll('body *')){if(e.children.length||e.textContent.trim()!==T)continue;const b=e.getBoundingClientRect(),s=getComputedStyle(e);if(b.width>0&&b.height>0&&b.right>0&&b.left<innerWidth&&b.bottom>0&&b.top<innerHeight&&s.visibility!=='hidden'&&+s.opacity>0)return true}return false})()`);
const ph = (re) => c.eval(`[...document.querySelectorAll('input,textarea')].some(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&${re}.test(e.placeholder||'')&&b.bottom>0&&b.top<innerHeight})`);
const LAYERS = {
  // (search is a full-screen takeover with no "outside", tested separately)
  drawer: { open: [28, 28],  detect: () => vis("Naked as Created"), outside: [370, 400] },
  gif:    { open: [268, 765], detect: () => vis("Trending GIFs"),   outside: [200, 150] },
  emoji:  { open: [310, 765], detect: () => vis("Default"), outside: [200, 150] },
};
async function reset() {
  await c.send("Page.navigate", { url: HOME });
  await c.sleep(3500);
  const here = (await c.eval("location.pathname")).endsWith("F2GFZ669PG6D");
  if (!here) throw new Error("reset failed, not on Announcements");
}
const results = [];
for (const [name, L] of Object.entries(LAYERS)) {
  for (const dismiss of ["outside-tap", "back-button"]) {
    await reset();
    const pre = await L.detect();
    await c.tap(...L.open); await c.sleep(900);
    const opened = await L.detect();
    await c.screenshot(`${OUT}/r-${name}-${dismiss}-open.png`);
    let after = null, path0 = await c.eval("location.pathname");
    if (opened) {
      if (dismiss === "outside-tap") await c.tap(...L.outside); else back();
      await c.sleep(900);
      after = await L.detect();
    }
    const path1 = await c.eval("location.pathname");
    await c.screenshot(`${OUT}/r-${name}-${dismiss}-after.png`);
    const row = { layer: name, dismiss, validPrecondition: !pre, opened, closedAfter: opened ? !after : "n/a", navigatedAway: path0 !== path1 };
    results.push(row);
    console.log(JSON.stringify(row));
  }
}
await reset();
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
c.close();
