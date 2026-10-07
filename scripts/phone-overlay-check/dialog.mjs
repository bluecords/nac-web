import { connect } from "./cdp.mjs";
import { execFileSync } from "node:child_process";
const ADBEXE = "C:/Users/bunjm/AppData/Local/Android/Sdk/platform-tools/adb.exe";
const back = () => execFileSync(ADBEXE, ["-s", "R5CN80AJCRW", "shell", "input", "keyevent", "KEYCODE_BACK"]);
const c = await connect();
const open = () => c.eval(`[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Continue'&&b.getBoundingClientRect().width>0)`);
const dlgWidth = () => c.eval(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Close');if(!b)return null;let e=b;while(e&&e.getBoundingClientRect().width>=innerWidth-8&&e.parentElement)e=e.parentElement;const r=b.closest('div[class]');let p=b;for(let i=0;i<6&&p.parentElement;i++){p=p.parentElement;const w=p.getBoundingClientRect().width;if(w>200&&w<innerWidth)return Math.round(w)+'px of '+innerWidth}return 'n/a'})()`);
const reopen = async () => { await c.tap(200, 380); await c.sleep(900); return open(); };
const res = { path: (await c.eval("location.pathname")).split("/").pop() };
res.openedByTap = await open() || await reopen();
res.width = await dlgWidth();
back(); await c.sleep(900); res["Back closes dialog"] = !(await open());
await reopen(); await c.tap(200, 120); await c.sleep(800); res["tap outside closes"] = !(await open());
await reopen(); await c.tap(200, 470); await c.sleep(800); // blank spot inside the dialog, between the checkbox row and the buttons
res["press inside dialog (blank area) keeps it open"] = await open();
await c.tap(234, 500); await c.sleep(800); res["Close button closes"] = !(await open());   // 'Close' only, never 'Continue'
console.log(JSON.stringify(res, null, 1));
c.close();
