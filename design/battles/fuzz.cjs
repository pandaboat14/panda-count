const fs=require('fs');
eval(fs.readFileSync(__dirname+'/shared/codex-data.js','utf8')+fs.readFileSync(__dirname+'/shared/battle-engine.js','utf8')+';globalThis.CODEX=CODEX;globalThis.Battle=Battle;');
const C=CODEX; let rng=Battle.mulberry(7); const pick=a=>a[Math.floor(rng()*a.length)];
const units=['panda','armedPanda','nacam','cam'], heroes=[null,null,'casey','ping','cockpenis','piecer','josserkid'];
const terrains=Object.keys(C.TERRAIN), items=Object.keys(C.ITEMS);
let battles=0, rounds=0, errors=0; const kinds={};
for(let i=0;i<3000;i++){
  const mkSide=(native)=>{const n=1+Math.floor(rng()*3);const sq=[];const used=new Set();for(let k=0;k<n;k++){const u=pick(units);if(used.has(u))continue;used.add(u);const fits=Object.entries(C.WEAPONS).filter(([id,w])=>w.fits.includes(u));const gear=[];if(rng()<0.5&&fits.length){const w=pick(fits.filter(([,w])=>w.slot==='weapon').length?fits.filter(([,w])=>w.slot==='weapon'):fits);gear.push(w[0]);}if(rng()<0.3&&fits.some(([,w])=>w.slot==='armor'))gear.push(pick(fits.filter(([,w])=>w.slot==='armor'))[0]);sq.push({unit:u,count:1+Math.floor(rng()*8),gear});}
    const bag={};for(const it of items) if(rng()<0.3) bag[it]=1+Math.floor(rng()*2);
    return {name:native?'N':'P'+i,native,squads:sq,hero:native?null:pick(heroes),bag,goods:{bamboo:3,stone:3,iron:3,rice:3,gems:3,coin:12,pandaCoin:4,camCoin:2},catapult:rng()<0.2,doctrine:pick(Object.keys(C.DOCTRINES)),traps:rng()<0.2?['caltrops']:[]};};
  const native=rng()<0.3?pick(['pandas','nacams','cams','wild']):null;
  const cfg={seed:i,terrain:pick(terrains),place:'Fuzzland',buildings:['fort','sanctuary','gym','market'].filter(()=>rng()<0.3),events:['blight','gondolaStrike','mercMarket','caseySale'].filter(()=>rng()<0.2),atk:mkSide(null),def:mkSide(native)};
  try{
    const b=Battle.createBattle(cfg); battles++;
    let g=0;
    while(!b.over&&g++<40){
      const choose=(key)=>{const gr=Battle.actionsFor(b,key);const all=[...gr.attack,...gr.defend,...gr.tactics,...gr.signature,...gr.bag.filter(x=>x.when==='action'),...gr.squads,...(key==='atk'&&rng()<0.05?gr.retreat:[])].filter(x=>x.enabled);
        if(!all.length||rng()<0.3) return Battle.aiAction(b,key);
        const a=pick(all);const act=a.kind==='move'?{kind:'move',id:a.id}:a.kind==='item'?{kind:'item',id:a.id}:a.kind==='switch'?{kind:'switch',to:a.to}:{kind:'retreat'};
        const preps=gr.bag.filter(x=>x.when==='prep'&&x.enabled); if(act.kind==='move'&&preps.length&&rng()<0.3) act.prep=pick(preps).id; return act;};
      const P=Battle.beginRound(b,choose('atk'),choose('def'));
      if(!P.done){for(const k of ['atk','def']){const r=Battle.reactionsFor(b,k);if(r.length&&rng()<0.5){const x=pick(r);Battle.react(b,k,x.id,Math.floor(rng()*P.dice[k].length));}}}
      const ev=Battle.finishRound(b); rounds++;
      for(const e of ev){kinds[e.t]=(kinds[e.t]||0)+1; if(e.t==='damage'&&!(e.amount>=0)) throw new Error('bad damage '+JSON.stringify(e));}
      for(const k of ['atk','def']) for(const s of b.sides[k].squads){
        if(!(s.hp>=0)||Number.isNaN(s.hp)) throw new Error('hp '+JSON.stringify(s));
        const want=s.hp<=0?0:Math.ceil(s.hp/s.hpPer); if(want!==s.count) throw new Error('count mismatch '+JSON.stringify(s));
        if(s.hp>s.maxCount*s.hpPer+1e-9) throw new Error('overheal '+JSON.stringify(s));
        for(const g of Object.keys(b.sides[k].goods)) if(b.sides[k].goods[g]<0) throw new Error('negative goods '+g);
        for(const it of Object.keys(b.sides[k].bag)) if(b.sides[k].bag[it]<0) throw new Error('negative bag '+it);
      }
      if(!b.over&&!b.sides.atk.squads.some(s=>s.hp>0)) throw new Error('attacker dead but not over');
    }
    if(!b.over) throw new Error('did not end in 40 rounds');
    if(b.round>C.RULES.roundLimit) throw new Error('exceeded round limit '+b.round);
    Battle.summary(b);
  }catch(e){errors++; if(errors<6) console.log('ERR seed',i,e.message, e.stack.split('\n')[1]);}
}
console.log({battles,rounds,errors}); console.log(JSON.stringify(kinds));
