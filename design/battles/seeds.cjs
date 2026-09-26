const fs=require('fs');
eval(fs.readFileSync(__dirname+'/shared/codex-data.js','utf8')+fs.readFileSync(__dirname+'/shared/battle-engine.js','utf8')+';globalThis.CODEX=CODEX;globalThis.Battle=Battle;');
const SC = {
  sichuan: { place:'Sichuan', terrain:'bamboo', buildings:['sanctuary','fort'], events:[],
    atk: { name:'Mei', color:'#2b6fd6', doctrine:'counter', squads:[{unit:'armedPanda',count:4,gear:['bambooSpear']},{unit:'nacam',count:3,gear:['spikedClub']}], bag:{luckyGem:1, whetstone:1}, goods:{iron:2, stone:2, coin:6} },
    def: { name:'You', color:'#d64a2b', doctrine:'turtle', squads:[{unit:'panda',count:5,gear:['towerShield']},{unit:'armedPanda',count:2}], traps:['caltrops'], bag:{riceBall:2, luckyGem:1}, goods:{rice:2} } },
  mongolia: { place:'Mongolia', terrain:'stone', buildings:[], events:['caseySale'],
    atk: { name:'Otto', color:'#e0a526', doctrine:'allin', squads:[{unit:'armedPanda',count:3,gear:['towerShield']},{unit:'cam',count:2}], hero:'casey', bag:{riceBall:1}, goods:{stone:3, coin:8} },
    def: { name:'Ogre Nation', native:'nacams', color:'#6f8a3a', squads:[{unit:'nacam',count:8}] } },
  japan: { place:'Japan', terrain:'gems', buildings:['fort'], events:[],
    atk: { name:'🤖 Bot Hard', color:'#8a3fd1', doctrine:'counter', squads:[{unit:'panda',count:6,gear:['gemArrows']},{unit:'cam',count:3,gear:['gemKnuckles']}], catapult:true, bag:{luckyGem:2, gemFocus:1}, goods:{gems:3, stone:3, iron:1, coin:6} },
    def: { name:'Mei', color:'#2b6fd6', doctrine:'counter', squads:[{unit:'armedPanda',count:3,gear:['towerShield']},{unit:'cam',count:3}], hero:'josserkid', bag:{riceBall:2, blessing:1}, goods:{rice:2, gems:1} } },
};
function sim(sc, seed){const b=Battle.createBattle({seed,terrain:sc.terrain,place:sc.place,buildings:sc.buildings,events:sc.events,atk:JSON.parse(JSON.stringify(sc.atk)),def:JSON.parse(JSON.stringify(sc.def))});
 let g=0; let crits=0, supers=0, faints=0, maxhit=0; while(!b.over&&g++<40){Battle.autoRound(b); const L=b.log.at(-1); for(const e of L.events){ if(e.t==='damage'&&e.by){ if(e.crits) crits++; if(e.eff==='super') supers++; maxhit=Math.max(maxhit,e.amount);} if(e.t==='faint') faints++; }}
 return {seed, how:b.result.how, rounds:b.round, crits, supers, faints, maxhit};}
for (const [k, want] of [['sichuan', r=>r.how==='held'&&r.rounds>=5&&r.rounds<=8&&r.crits>=1], ['mongolia', r=>r.how==='won'&&r.rounds>=3&&r.rounds<=6], ['japan', r=>r.how==='held'&&r.rounds>=5&&r.rounds<=7&&r.crits>=2&&r.supers>=1]]) {
  const out=[]; for(let s=1;s<400&&out.length<4;s++){const r=sim(SC[k],s); if(want(r)) out.push(r);} console.log(k, JSON.stringify(out));
  const all=[]; for(let s=1;s<200;s++) all.push(sim(SC[k],s)); console.log('  win rate', (all.filter(r=>r.how==='won').length/all.length).toFixed(2), 'avg rounds', (all.reduce((a,r)=>a+r.rounds,0)/all.length).toFixed(1));
}
