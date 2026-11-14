/* Run: node tests/browser.cjs. Uses Playwright installed in the test environment. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..'), KEY='dailylog.life.v3';
let shellVersion='new';
const artifactDir=process.env.TEST_ARTIFACT_DIR||path.join(require('node:os').tmpdir(),'daily-log-review');
fs.mkdirSync(artifactDir,{recursive:true});
const originalIndex=require('node:child_process').execFileSync('git',['show','329c277:index.html'],{cwd:root,encoding:'utf8'});
const originalSW=require('node:child_process').execFileSync('git',['show','329c277:sw.js'],{cwd:root,encoding:'utf8'});
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost'), prefix='/daily-log-focus/';
 if(!u.pathname.startsWith(prefix)){res.writeHead(404).end();return;}
 const name=decodeURIComponent(u.pathname.slice(prefix.length))||'index.html';
 const file=path.resolve(root,name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'}[path.extname(file)]||'application/octet-stream';
 res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache'});
 res.end(shellVersion==='old'&&name==='index.html'?originalIndex:shellVersion==='old'&&name==='sw.js'?originalSW:fs.readFileSync(file));
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/daily-log-focus/`;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const errors=[], requests=[];
 async function context(options={}){
  const c=await browser.newContext(options);const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));
  await p.addInitScript(()=>{window.chimes=0;window.AudioContext=class{state='running';currentTime=0;destination={};resume(){return Promise.resolve()}createOscillator(){return{type:'',frequency:{value:0},connect(){},disconnect(){},start(){window.chimes++},stop(){}}}createGain(){return{gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}}});
  return {c,p};
 }
 async function ready(p){await p.goto(base);await p.evaluate(()=>navigator.serviceWorker.ready);await p.waitForFunction(()=>!!navigator.serviceWorker.controller);await p.waitForFunction(()=>document.querySelectorAll('#categories button').length===6);}
 const {c,p}=await context({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await ready(p);await p.clock.install();
 await p.evaluate(()=>{localStorage.setItem('dailylog.v1','{"records":[{"day":"2026-11-01","mode":"send"}]}');localStorage.setItem('dailylog.timer.v1','{"deadline":1000,"mode":"send"}');localStorage.setItem('life-focus.v2','{"days":{},"tasks":[],"sessions":[]}')});
 const legacy=await p.evaluate(()=>['dailylog.v1','dailylog.timer.v1','life-focus.v2'].map(k=>localStorage.getItem(k)));
 assert.equal(await p.locator('#planDetails').getAttribute('open'),null);
 await p.getByRole('button',{name:'鋼琴',exact:true}).click();await p.locator('#start').click();assert.equal(await p.locator('#clock').textContent(),'10:00');
 await p.clock.fastForward(60000);await p.locator('#pause').click();assert.equal(await p.locator('#clock').textContent(),'09:00');
 await p.clock.fastForward(300000);assert.equal(await p.locator('#clock').textContent(),'09:00');await p.reload();await p.waitForFunction(()=>document.querySelector('#pause').textContent==='繼續');assert.equal(await p.locator('#clock').textContent(),'09:00');
 await p.locator('#pause').click();await p.clock.fastForward(60000);await p.reload();await p.waitForFunction(()=>document.querySelector('#clock').textContent==='08:00');
 await p.locator('#pause').click();await p.locator('#pause').click();await p.clock.fastForward(480000);assert.equal(await p.locator('#clock').textContent(),'00:00');assert(await p.locator('#timeUp').isVisible());await p.screenshot({path:path.join(artifactDir,'life-focus-timer.png'),fullPage:false});assert.equal(await p.evaluate(()=>window.chimes),1);
 await p.clock.fastForward(20000);assert.equal(await p.evaluate(()=>window.chimes),1);
 await p.locator('#extend').click();assert.equal(await p.locator('#clock').textContent(),'15:00');assert(!(await p.locator('#timeUp').isVisible()));
 await p.clock.fastForward(30000);await p.locator('#finish').click();assert(!(await p.locator('#session').isVisible()));
 let saved=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);assert.equal(saved.sessions.length,1);assert(Math.abs(saved.sessions[0].elapsedMs-630000)<1000);assert.equal(saved.sessions[0].category,'鋼琴');
 await p.getByRole('button',{name:'比較有掌控感',exact:true}).click();await p.locator('#saveReview').click();await p.reload();assert.equal(await p.getByRole('button',{name:'比較有掌控感',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await p.locator('.day').count(),14);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 console.log('PASS mobile: minimal plan, start/pause/resume/reload, excluded pauses, expiry visual + one sound request, extension/finish, review persistence, 14 days');
 async function addTask(name,precision,when,next){await p.locator('#taskDetails').evaluate(e=>e.open=true);await p.locator('#taskName').fill(name);await p.locator('#precision').selectOption(precision);if(precision!=='none')await p.locator(precision==='month'?'#taskMonth':'#taskDate').fill(when);await p.locator('#taskNext').fill(next);await p.locator('#taskForm button').click();}
 await addTask('月份報告','month','2026-12','列三個問題');await addTask('日期文件','date','2026-11-30','核對文件');await addTask('未定任務','none','','找資料');
 assert.equal(await p.locator('#upcoming .task').count(),2);assert.equal(await p.locator('#taskList .task').count(),3);assert((await p.locator('#taskList').textContent()).includes('2026 年 12 月（日期未定）'));assert((await p.locator('#taskList').textContent()).includes('2026-11-30'));assert((await p.locator('#taskList').textContent()).includes('日期未定'));
 await p.locator('#upcoming .task').first().getByRole('button',{name:'放進今天'}).click();assert.equal(await p.locator('#goal').inputValue(),'核對文件');assert.equal(await p.locator('#categories button[aria-pressed=true]').count(),0);
 await p.getByRole('button',{name:'其他',exact:true}).click();await p.reload();assert.equal(await p.locator('#goal').inputValue(),'核對文件');
 await p.locator('#upcoming .task').first().getByRole('button',{name:'標記完成'}).click();await p.locator('#allTasks').evaluate(e=>e.open=true);assert.equal(await p.locator('#taskList .done').count(),1);
 p.on('dialog',d=>d.accept());await p.locator('#taskList .task').filter({hasText:'未定任務'}).getByRole('button',{name:'刪除',exact:true}).click();assert.equal(await p.locator('#taskList .task').count(),2);
 await p.locator('#dataDetails').evaluate(e=>e.open=true);
 const download=await Promise.all([p.waitForEvent('download'),p.locator('#export').click()]).then(x=>x[0]);const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(backup.app,'dailylog-life');assert.equal(backup.data.tasks.length,2);assert.equal(backup.legacyRaw['dailylog.v1'],legacy[0]);
 const before=await p.evaluate(k=>localStorage.getItem(k),KEY);
 await p.locator('#importFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"app":"dailylog-life","backupVersion":1,"data":{}}')});await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('格式不符'));assert.equal(await p.evaluate(k=>localStorage.getItem(k),KEY),before);
 backup.data.tasks[0].name='匯入測試';await p.locator('#importFile').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await p.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('已匯入'));assert.equal(await p.evaluate(k=>localStorage.getItem(k+'.before-import'),KEY),before);assert((await p.locator('#taskList').textContent()).includes('匯入測試'));
 assert.deepEqual(await p.evaluate(()=>['dailylog.v1','dailylog.timer.v1','life-focus.v2'].map(k=>localStorage.getItem(k))),legacy);
 console.log('PASS tasks/data: month/date/undated, home <=2, category not inferred, save/complete/delete, export/import validation/recovery copy, legacy unchanged');
 await p.goto(base+'?icon=v3');await p.evaluate(()=>navigator.serviceWorker.ready);await c.setOffline(true);await p.reload();await p.waitForFunction(()=>document.querySelectorAll('#categories button').length===6);assert.equal(await p.title(),'Daily Log｜我的生活重心');await c.setOffline(false);
 await p.reload();await p.waitForFunction(()=>document.querySelectorAll('#categories button').length===6);await p.screenshot({path:path.join(artifactDir,'life-focus-mobile.png'),fullPage:true});
 const desktop=await context({viewport:{width:1280,height:900}});await ready(desktop.p);assert(await desktop.p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await desktop.p.getByRole('button',{name:'休息',exact:true}).click();await desktop.p.getByRole('button',{name:'5 分鐘',exact:true}).click();await desktop.p.locator('#start').click();await desktop.p.locator('#finish').click();assert.equal(await desktop.p.locator('#session').isVisible(),false);await desktop.p.reload();await desktop.p.waitForFunction(()=>document.querySelectorAll('#categories button').length===6);await desktop.p.screenshot({path:path.join(artifactDir,'life-focus-desktop.png'),fullPage:true});
 console.log('PASS PWA: subpath assets, query URL offline reload, desktop controls + no horizontal overflow');
 // Corrupt data and quota errors must never silently replace existing raw records.
 await desktop.p.evaluate(k=>{localStorage.setItem(k,'corrupt-original')},KEY);await desktop.p.reload();assert(await desktop.p.locator('#loadError').isVisible());await desktop.p.getByRole('button',{name:'鋼琴',exact:true}).click();assert.equal(await desktop.p.evaluate(k=>localStorage.getItem(k),KEY),'corrupt-original');
 const quota=await context();await ready(quota.p);await quota.p.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException('full','QuotaExceededError')}});await quota.p.getByRole('button',{name:'休息',exact:true}).click();assert(await quota.p.locator('#storageError').isVisible());assert.equal(await quota.p.evaluate(k=>localStorage.getItem(k),KEY),null);
 console.log('PASS storage failures: corrupt original protected, quota visibly reported');
 // Two tabs: stale writer cannot overwrite a newer completion or repeat it.
 const second=await c.newPage();await second.goto(base);await second.waitForFunction(()=>document.querySelectorAll('#categories button').length===6);await p.getByRole('button',{name:'休息',exact:true}).click();await second.waitForFunction(()=>document.querySelector('#status').textContent.includes('另一個分頁'));const newest=await p.evaluate(k=>localStorage.getItem(k),KEY);await second.getByRole('button',{name:'鋼琴',exact:true}).click();assert.equal(await p.evaluate(k=>localStorage.getItem(k),KEY),newest);
 console.log('PASS multi-tab: stale writer cannot overwrite another tab');
 // Genuine upgrade from deployed v3 to new SW, then controlled offline shell.
 shellVersion='old';const upgrade=await context();await upgrade.p.goto(base);await upgrade.p.evaluate(()=>navigator.serviceWorker.register('./sw.js'));await upgrade.p.evaluate(()=>navigator.serviceWorker.ready);await upgrade.p.waitForFunction(()=>!!navigator.serviceWorker.controller);shellVersion='new';await upgrade.p.reload();await upgrade.p.waitForFunction(()=>document.querySelectorAll('#categories button').length===6);await upgrade.p.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()});await upgrade.p.waitForFunction(()=>!document.querySelector('#updateNotice').classList.contains('hidden'));await upgrade.p.locator('#applyUpdate').click();await upgrade.p.waitForFunction(()=>navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js'));await upgrade.p.waitForFunction(async()=>{const names=await caches.keys();return names.includes('daily-log-life-v4')&&!names.includes('daily-log-v3')});await upgrade.c.setOffline(true);await upgrade.p.goto(base+'?icon=v3');await upgrade.p.waitForFunction(()=>document.querySelectorAll('#categories button').length===6);
 console.log('PASS SW upgrade: real v3 -> waiting v4 -> chosen activation -> old cache cleanup -> new offline shell');
 assert.deepEqual(errors,[]);assert(requests.every(u=>u.startsWith(new URL(base).origin)));console.log('PASS no page errors, no external requests');
 await browser.close();server.close();
})().catch(e=>{console.error(e);server.close();process.exit(1)});
