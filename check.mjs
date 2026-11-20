#!/usr/bin/env node
/* primeposkorea 배포 전 검사 (2026-11-20)
   1) 공용 검사: ../sites-tools/check.mjs
   2) 금액 규칙: 확정 금액(월 9,900원·90,000원·110,000원·0원)은 /wireless-terminal/ 과 llms.txt 에서만.
      그 밖의 페이지는 원래 있던 표현(설치비·가맹비·관리비 "0원", 현금영수증 의무발행 기준 "10만 원")만 허용 — 새 금액이 생기면 실패.
      "월" 없는 9,900원은 어디서든 실패(유선은 매달 내는 방식).
   3) /wireless-terminal/ · 홈 사이트맵 lastmod = 실제 수정일(WT_MAIN.updated/homeUpdated)
   실행: node check.mjs   (실패 시 종료코드 1) */
import fs from "node:fs"; import path from "node:path"; import { execFileSync } from "node:child_process";
const dir = path.dirname(new URL(import.meta.url).pathname), file = path.join(dir, "primeposkorea_worker.js");
let fail = 0; const t = (c, l, d) => { console.log((c ? "\x1b[32mOK  \x1b[0m " : "\x1b[31m실패\x1b[0m ") + l + (d ? " — " + d : "")); if (!c) fail++; };
const shared = path.join(dir, "..", "sites-tools", "check.mjs");
if (fs.existsSync(shared)) { try { execFileSync("node", [shared, file], { stdio: "inherit" }); } catch { fail++; } } else console.log("주의: 공용 검사(../sites-tools/check.mjs) 없음 — 금액 규칙만 봅니다");
console.log("\n\x1b[1m금액 규칙 · 대표 페이지\x1b[0m");
globalThis.caches = { default: { match: async () => undefined, put: async () => {}, delete: async () => false } };
const tmp = path.join(dir, ".check-tmp.mjs"); fs.copyFileSync(file, tmp);
const w = (await import("file://" + tmp + "?" + Date.now())).default; fs.unlinkSync(tmp);
const get = async (p) => { const r = await w.fetch(new Request("https://primeposkorea.com" + p, { headers: { "user-agent": "Mozilla/5.0" } }), {}, { waitUntil() {}, passThroughOnException() {} }); return [r.status, await r.text()]; };
const RE = /(?:월\s?)?[0-9][0-9,]*\s?(?:만\s?)?원/g;   /* 숫자 바로 뒤 "원"은 뒤에 조사가 붙어도(원과·원으로) 금액으로 본다 */
const MAIN_OK = ["월 9,900원", "90,000원", "110,000원", "0원"], OTHER_OK = ["0원", "10만 원"];
const strip = (h) => h.replace(/<style[\s\S]*?<\/style>/g, "");
const [st, wt] = await get("/wireless-terminal/");
t(st === 200, "/wireless-terminal/ 200", String(st));
const bad = (h, ok) => [...strip(h).matchAll(RE)].map((m) => m[0]).filter((x) => !ok.includes(x));
let b = bad(wt, MAIN_OK); t(!b.length, "대표 페이지 금액은 확정 4개만", b.slice(0, 3).join(" / "));
const [, ll] = await get("/llms.txt"); b = bad(ll, MAIN_OK); t(!b.length, "llms.txt 금액은 확정 4개만", b.slice(0, 3).join(" / "));
t(/^# 프라임포스코리아/.test(ll), "llms.txt 첫 줄 # 프라임포스코리아");
const [, sm] = await get("/sitemap.xml"); const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc><lastmod>([^<]+)/g)].map((m) => [m[1].replace("https://primeposkorea.com", ""), m[2]]);
const src = fs.readFileSync(file, "utf8"), up = (src.match(/updated: "(\d{4}-\d{2}-\d{2})", homeUpdated: "(\d{4}-\d{2}-\d{2})"/) || []);
for (const [p, d] of [["/wireless-terminal/", up[1]], ["/", up[2]]]) { const x = locs.find((l) => l[0] === p); t(!!x && x[1] === d, p + " lastmod = 실제 수정일", x ? x[1] + " / " + d : "없음"); }
const sample = [...new Set(["/", "/list", "/region", "/sitemap-regions", ...locs.map((l) => l[0]).filter((p, i) => p.startsWith("/region") && i % 40 === 0)])];
const other = [];
for (const p of sample) { const [, h] = await get(p); for (const x of bad(h, OTHER_OK)) other.push(p + " «" + x + "»"); }
t(!other.length, `다른 페이지(표본 ${sample.length}쪽)에 새 금액 없음`, other.slice(0, 3).join(" / "));
console.log(fail ? `\n\x1b[31m실패 ${fail}건 — 배포 금지\x1b[0m` : "\n\x1b[32m금액·대표 페이지 검사 통과\x1b[0m"); process.exit(fail ? 1 : 0);
