import { connect } from "./cdp.mjs";
import { execFileSync } from "node:child_process";
const ADBEXE = "C:/Users/bunjm/AppData/Local/Android/Sdk/platform-tools/adb.exe";
const back = () => execFileSync(ADBEXE, ["-s", "R5CN80AJCRW", "shell", "input", "keyevent", "KEYCODE_BACK"]);
const OUT = process.env.OUT;
const HOME = "https://community.nac.social/server/01KTD1MYDTQ0SSXXH7C93BCHET/channel/01M26JD06GH6M0F2GFZ669PG6D";
const c = await connect();
const text = () => c.eval(`(document.getElementById('floating').textContent||'').trim()`);
const cardOpen = async () => /Roles/.test(await text()) && /Joined/.test(await text());
const menuText = async () => (await text()).replace(/Ryan Ash.*?Dev-Invite.*?Naked as Created.*?2026/s, "").slice(0, 80);
async function fresh() { await c.send("Page.navigate", { url: HOME }); await c.sleep(3500); await c.tap(201, 602); await c.sleep(900); return cardOpen(); }
const res = {};
// A: press INSIDE the card on plain text (Roles heading)
res.opened = await fresh();
await c.tap(250, 300); await c.sleep(700); res["A press inside card (on the name; the Roles tile opens a dialog by design)"] = (await cardOpen()) ? "stays open (ok)" : "CLOSED";
// B: tap OUTSIDE (message text above the card)
await fresh(); await c.tap(150, 120); await c.sleep(700); res["B tap outside"] = (await cardOpen()) ? "STAYS OPEN" : "closes (ok)";
// C: Back button
await fresh(); back(); await c.sleep(900); res["C Back button"] = (await cardOpen()) ? "STAYS OPEN" : "closes (ok)";
// D: open the card's three-dot menu (open only, choose nothing)
await fresh(); await c.tap(374, 369); await c.sleep(900);
const afterDots = await text();
res["D three-dot menu"] = { cardStillOpen: /Roles/.test(afterDots), extraMenuText: (await menuText()) || "(none found)" };
await c.screenshot(`${OUT}/card-dots.png`);
// E: with the menu open, press inside the menu's own blank area is unknowable; tap outside everything
await c.tap(150, 120); await c.sleep(700); res["E tap outside with menu+card open"] = { cardOpen: await cardOpen(), floatingText: (await text()).slice(0, 40) || "(empty)" };
// F: card + its three-dot menu open, ONE Back press: only the top (menu) should close
await fresh(); await c.tap(374, 369); await c.sleep(900);
back(); await c.sleep(900);
const t = await text();
res["F card+menu, one Back"] = { cardOpen: /Joined/.test(t), menuOpen: /Kick member|Ban member/.test(t) };
console.log(JSON.stringify(res, null, 1));
c.close();
