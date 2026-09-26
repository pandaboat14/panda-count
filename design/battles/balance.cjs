const fs=require('fs');
eval(fs.readFileSync(__dirname+'/shared/codex-data.js','utf8')+fs.readFileSync(__dirname+'/shared/battle-engine.js','utf8')+';globalThis.CODEX=CODEX;globalThis.Battle=Battle;');
const U={panda:{a:0,d:1},armedPanda:{a:1,d:2},nacam:{a:2,d:0},cam:{a:2,d:2}};
function riskOdds(att,def,ab,db,n=4000){let w=0;let rng=Battle.mulberry(99);const d6=()=>1+Math.floor(rng()*6);
 for(let i=0;i<n;i++){const a={...att},d={...def};const tot=u=>Object.values(u).reduce((x,y)=>x+y,0);
  const order=(u,st)=>Object.keys(u).flatMap(t=>Array(u[t]).fill(t)).sort((x,y)=>U[y][st]-U[x][st]);
  const weak=(u,st)=>Object.keys(u).filter(t=>u[t]>0).sort((x,y)=>U[x][st]-U[y][st])[0];
  let g=0;while(tot(a)>0&&tot(d)>0&&g++<999){const au=order(a,'a').slice(0,3),du=order(d,'d').slice(0,2);
   const ad=au.map(t=>d6()+U[t].a+ab).sort((x,y)=>y-x),dd=du.map(t=>d6()+U[t].d+db).sort((x,y)=>y-x);
   for(let k=0;k<Math.min(ad.length,dd.length);k++){if(ad[k]>dd[k])d[weak(d,'d')]--;else a[weak(a,'a')]--;if(!tot(a)||!tot(d))break;}}
  if(tot(d)===0)w++;}return w/n;}
function sim(name,atk,def,opts={},n=300){let wins=0,rounds=0,aLost=0,dLost=0,aStart=0,dStart=0;
 for(let i=0;i<n;i++){const b=Battle.createBattle({seed:1000+i,terrain:opts.terrain||'iron',place:'X',buildings:opts.buildings||[],atk:{name:'You',squads:atk.map(s=>({...s})),hero:opts.atkHero,goods:{stone:9,iron:9,rice:9,gems:9,bamboo:9,coin:20,pandaCoin:5},bag:opts.atkBag||{}},def:{name:'Mei',native:opts.native,doctrine:opts.doctrine,squads:def.map(s=>({...s})),hero:opts.defHero,goods:{stone:3,iron:3,rice:3,gems:1,bamboo:3,coin:6},bag:opts.defBag||{}}});
  let g=0;while(!b.over&&g++<30)Battle.autoRound(b);if(b.result.winner==='atk')wins++;rounds+=b.round;const sm=Battle.summary(b);
  aLost+=Object.values(sm.atk.lost).reduce((x,y)=>x+y,0);dLost+=Object.values(sm.def.lost).reduce((x,y)=>x+y,0);}
 const cnt=u=>u.reduce((m,s)=>(m[s.unit]=(m[s.unit]||0)+s.count,m),{});
 const risk=riskOdds(cnt(atk),cnt(def),opts.atkHero==='casey'?3:opts.atkHero?1:0,(opts.buildings||[]).includes('fort')?1:0);
 console.log(name.padEnd(46),'new win',(wins/n*100).toFixed(0).padStart(3)+'%','| old Risk',(risk*100).toFixed(0).padStart(3)+'%','| rounds',(rounds/n).toFixed(1),'| lost a/d',(aLost/n).toFixed(1),(dLost/n).toFixed(1));}
sim('5 armed pandas vs 5 pandas (turtle)',[{unit:'armedPanda',count:5}],[{unit:'panda',count:5}],{doctrine:'turtle'});
sim('5 pandas vs 5 pandas (counter)',[{unit:'panda',count:5}],[{unit:'panda',count:5}],{});
sim('4 ogres vs 3 ogre natives (berserk)',[{unit:'nacam',count:4}],[{unit:'nacam',count:3}],{native:'nacams'});
sim('3 ogres vs 2 CAM natives',[{unit:'nacam',count:3}],[{unit:'cam',count:2}],{native:'cams'});
sim('3 CAMs vs 3 ogre natives',[{unit:'cam',count:3}],[{unit:'nacam',count:3}],{native:'nacams'});
sim('Sichuan: 4 AP + 3 ogres vs 5 P + 2 AP natives',[{unit:'armedPanda',count:4},{unit:'nacam',count:3}],[{unit:'panda',count:5},{unit:'armedPanda',count:2}],{native:'pandas',buildings:['sanctuary']});
sim('6 AP vs 4 AP + fort (turtle)',[{unit:'armedPanda',count:6}],[{unit:'armedPanda',count:4}],{doctrine:'turtle',buildings:['fort']});
sim('6 AP vs 4 AP + fort, skewer spears',[{unit:'armedPanda',count:6,gear:['bambooSpear']}],[{unit:'armedPanda',count:4}],{doctrine:'turtle',buildings:['fort']});
sim('8 pandas vs 3 CAMs (counter)',[{unit:'panda',count:8}],[{unit:'cam',count:3}],{});
sim('Casey + 3 AP vs 8 pandas',[{unit:'armedPanda',count:3}],[{unit:'panda',count:8}],{atkHero:'casey',doctrine:'turtle'});
sim('10 mixed vs 10 mixed',[{unit:'armedPanda',count:4},{unit:'nacam',count:3},{unit:'cam',count:3}],[{unit:'panda',count:4},{unit:'armedPanda',count:4},{unit:'cam',count:2}],{doctrine:'counter'});
sim('3 AP vs 1 wild panda',[{unit:'armedPanda',count:3}],[{unit:'panda',count:1}],{native:'wild'});
