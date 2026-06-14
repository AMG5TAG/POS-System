import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'fs';
const BASE='http://localhost:5199';
const mig=JSON.parse(fs.readFileSync('/tmp/migration.final.json','utf8'));
const SHELL='/home/runner/workspace/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell';
const MERCHANT={ id:1, email:'admin@koastal.com.au', businessName:'Koastal Test', ownerName:'Test Owner',
  currency:'AUD', createdAt:'2024-01-01T00:00:00Z', staffRole:'owner', emailVerified:true, onboardingCompleted:true, isDemoAccount:false };

// launch chromium with a CDP port ourselves (pipe transport hangs in this sandbox)
const proc=spawn(SHELL,['--no-sandbox','--headless','--disable-gpu','--disable-dev-shm-usage',
  '--remote-debugging-port=9466','--user-data-dir=/tmp/pw-cdp'],{stdio:'ignore'});
async function waitWs(){ for(let i=0;i<60;i++){ try{ const r=await fetch('http://localhost:9466/json/version'); const j=await r.json(); if(j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl; }catch{} await new Promise(r=>setTimeout(r,500)); } throw new Error('no ws'); }
const ws=await waitWs();
const browser=await chromium.connectOverCDP('http://localhost:9466');
const ctx=browser.contexts()[0];
await ctx.route('**/api/auth/me', r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(MERCHANT)}));
await ctx.route('**/api/**', r=> r.request().url().includes('/api/auth/me') ? r.fallback()
  : r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],data:[],results:[]})}));
const page=await ctx.newPage();
await page.setViewportSize({width:1400,height:900});
const settle=async()=>{ try{await page.waitForLoadState('networkidle',{timeout:4000});}catch{} await page.waitForTimeout(200); };
const pn=async()=>page.evaluate(()=>location.pathname);
const bt=async()=>(await page.evaluate(()=>document.body.innerText||'')).slice(0,400);

await page.goto(BASE+'/dashboard',{waitUntil:'commit'}); await settle();
console.log('WARMUP /dashboard ->',await pn());

const newPaths=[...new Set(Object.values(mig).filter(p=>!p.includes(':')))];
const redirects=Object.entries(mig).filter(([o])=>!o.includes(':'));
let rp=0, rf=[], dp=0, df=[];
for(const np of newPaths){
  await page.goto(BASE+np,{waitUntil:'commit'}); await settle();
  const got=await pn(); const t=await bt();
  const is404=t.includes('Page Not Found')||/\b404\b/.test(t); const login=got==='/login';
  if(got===np && !is404 && !login) rp++; else rf.push(`${np} -> got=${got} 404=${is404} login=${login}`);
}
for(const [o,n] of redirects){
  await page.goto(BASE+o,{waitUntil:'commit'}); await settle();
  const got=await pn(); if(got===n) dp++; else df.push(`${o} => want ${n} got ${got}`);
}
await page.goto(BASE+'/service-jobs/42',{waitUntil:'commit'}); await settle();
const svc=await pn();
await page.goto(BASE+'/management/marketing-reports/online-store',{waitUntil:'commit'}); await settle();
await page.screenshot({path:'/tmp/shot-online-store.png'});
await page.goto(BASE+'/inventory/products',{waitUntil:'commit'}); await settle();
await page.screenshot({path:'/tmp/shot-inventory.png'});

console.log('\n=== NEW ROUTES RENDER:',rp,'/',newPaths.length,'==='); if(rf.length) console.log(rf.join('\n'));
console.log('\n=== LEGACY REDIRECTS:',dp,'/',redirects.length,'==='); if(df.length) console.log(df.join('\n'));
console.log('\nPARAM /service-jobs/42 ->',svc,svc==='/services/42'?'OK':'FAIL');
await browser.close(); proc.kill();
