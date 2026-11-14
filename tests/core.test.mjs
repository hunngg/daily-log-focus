import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blank, validate, parseBackup, settle, pause, resume, extend, convertV2 } from '../core.js';
const timer = () => ({id:'x', day:'2026-11-14', category:'鋼琴', goal:'', state:'running', totalMs:600000, remainingMs:600000, elapsedMs:0, startedAt:1000});
test('pause and reload exclude paused time; expired foreground caps at planned time', () => {
 const t=timer(); pause(t,61000); assert.equal(t.elapsedMs,60000); assert.equal(t.remainingMs,540000);
 settle(t,9999999); assert.equal(t.elapsedMs,60000);
 const x=validate({...blank(),timer:JSON.parse(JSON.stringify(t))}).timer;
 resume(x,10000000);settle(x,10030000);assert.equal(x.elapsedMs,90000);
 settle(x,20000000);assert.equal(x.elapsedMs,600000);assert.equal(x.state,'ready');
 extend(x,20000000);assert.equal(x.remainingMs,900000);assert.equal(x.totalMs,1500000);
 settle(x,20900000);assert.equal(x.elapsedMs,1500000);assert.equal(x.state,'ready');
});
test('backwards clock never subtracts elapsed time',()=>{const t=timer();settle(t,500);assert.equal(t.elapsedMs,0);assert.equal(t.remainingMs,600000)});
test('reject invalid backup, invalid calendar day, duplicate IDs, and inconsistent timer',()=>{
 for(const x of [null,[],{}, {version:3,days:[],tasks:[],sessions:[],timer:null}, {...blank(),days:{'2026-02-30':{}}}, {...blank(),timer:{...timer(),remainingMs:1}}])assert.throws(()=>validate(x));
 assert.throws(()=>parseBackup('{}')); assert.throws(()=>parseBackup('broken'));
 const task={id:'a',name:'報告',precision:'month',when:'2026-12',next:'',done:false};
 assert.throws(()=>validate({...blank(),tasks:[task,task]}));
 assert.throws(()=>validate({...blank(),tasks:[{...task,when:'2026-13'}]}));
 assert.equal(parseBackup(JSON.stringify({app:'dailylog-life',backupVersion:1,data:{...blank(),tasks:[task]}})).tasks[0].when,'2026-12');
});
test('v2 conversion preserves month precision; excludes unreliable elapsed sessions',()=>{
 const old={days:{'2026-11-14':{category:'🎹 鋼琴',reflection:'比較有壓力'}},tasks:[{id:'a',name:'文件',month:'2026-12',date:'',next:'找資料',done:false}],sessions:[{elapsedMinutes:100}]};
 const before=JSON.stringify(old),x=convertV2(old); assert.equal(x.tasks[0].precision,'month');assert.equal(x.days['2026-11-14'].reflection,'比較困難');assert.equal(x.sessions.length,0);assert.equal(JSON.stringify(old),before);
});
