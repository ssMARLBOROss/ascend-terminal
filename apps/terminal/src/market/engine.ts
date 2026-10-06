import type { AscendEvent, Candle, SessionName, SessionState } from '@ascend/contracts';

export type DisplayLevel={
  id:string;
  label:string;
  price:number;
  status:'FROZEN'|'LIVE';
  role:'SUPPORT'|'RESISTANCE'|'REFERENCE';
  availableFrom:number;
};

export type LiquidityClusterStatus='FRESH'|'TESTED'|'UNDER_ATTACK'|'DEPLETED'|'BROKEN';

export type LiquidityCluster={
  id:string;
  side:'UPPER'|'LOWER'|'ACTIVE';
  low:number;
  high:number;
  mid:number;
  members:DisplayLevel[];
  strength:number;
  attack:number;
  pressure:number;
  tests:number;
  rejections:number;
  status:LiquidityClusterStatus;
  distancePct:number;
  availableFrom:number;
};

export type RangeFrame={
  id:'12H'|'SESSION'|'HALF_SESSION';
  label:string;
  low:number;
  high:number;
  mid:number;
  positionPct:number;
};

export type LiveMarketContext={
  sessions:SessionState[];
  levels:DisplayLevel[];
  chronology:AscendEvent[];
  clusters:LiquidityCluster[];
  routeUp:LiquidityCluster[];
  routeDown:LiquidityCluster[];
  ranges:RangeFrame[];
  attackUp:number;
  attackDown:number;
  atr?:number;
  vwap?:number;
  open?:number;
  yHigh?:number;
  yLow?:number;
  activeSession?:SessionName;
  volumeRatio?:number;
};

const dayKey=(ts:number)=>{
  const d=new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
};
const utcDayStart=(ts:number)=>{
  const d=new Date(ts);
  return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
};
const range=(items:Candle[])=>items.length?{
  high:Math.max(...items.map(x=>x.high)),
  low:Math.min(...items.map(x=>x.low)),
  balance:(Math.max(...items.map(x=>x.high))+Math.min(...items.map(x=>x.low)))/2
}:undefined;


const nyFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function nyParts(ts:number){
  const parts=Object.fromEntries(nyFormatter.formatToParts(new Date(ts)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return{date:`${parts.year}-${parts.month}-${parts.day}`,minutes:Number(parts.hour)*60+Number(parts.minute)};
}
function previousDateKey(key:string){
  const[y,m,d]=key.split('-').map(Number);
  const dt=new Date(Date.UTC(y,m-1,d)-86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;
}
function freezeAfter(items:Candle[],fallback:number){
  return items.length?Math.max(...items.map(x=>x.timestamp))+15*60000:fallback;
}


function clamp(value:number,min=0,max=100){return Math.max(min,Math.min(max,value))}
function atr14(items:Candle[]){
  if(items.length<15)return undefined;
  const sample=items.slice(-40);
  const trs:number[]=[];
  for(let i=1;i<sample.length;i++){
    const c=sample[i],p=sample[i-1];
    trs.push(Math.max(c.high-c.low,Math.abs(c.high-p.close),Math.abs(c.low-p.close)));
  }
  const tail=trs.slice(-14);
  return tail.reduce((s,v)=>s+v,0)/Math.max(1,tail.length);
}
function directionalAttack(items:Candle[],direction:'UP'|'DOWN',atr:number|undefined,volumeRatio:number|undefined){
  const closed=items.slice(-13,-1);
  if(closed.length<5)return 0;
  const sign=direction==='UP'?1:-1;
  const net=(closed[closed.length-1].close-closed[0].open)*sign;
  let path=0,bars=0,location=0,body=0;
  for(let i=0;i<closed.length;i++){
    const c=closed[i];
    const prev=i?closed[i-1].close:c.open;
    path+=Math.abs(c.close-prev);
    if((c.close-c.open)*sign>0)bars++;
    const span=Math.max(1e-12,c.high-c.low);
    location+=direction==='UP'?(c.close-c.low)/span:(c.high-c.close)/span;
    body+=Math.abs(c.close-c.open);
  }
  const efficiency=net>0?clamp((net/Math.max(path,1e-12))*100)/100:0;
  const barShare=bars/closed.length;
  const closeLocation=location/closed.length;
  const impulse=atr&&atr>0?clamp((body/closed.length)/atr*100)/100:0;
  const vol=clamp(((volumeRatio??1)/1.8)*100)/100;
  return Math.round(clamp(30*efficiency+20*barShare+20*closeLocation+15*impulse+15*vol));
}
function levelWeight(level:DisplayLevel){
  if(level.id==='YH'||level.id==='YL')return 24;
  if(level.id==='ONH'||level.id==='ONL')return 21;
  if(level.id==='RTH_HIGH'||level.id==='RTH_LOW')return 18;
  if(level.id==='IBH'||level.id==='IBL')return 13;
  if(level.id.endsWith('_H')||level.id.endsWith('_L'))return 11;
  return 6;
}
function countClusterInteractions(items:Candle[],low:number,high:number,availableFrom:number,side:'UPPER'|'LOWER'|'ACTIVE'){
  let tests=0,rejections=0,lastTestIndex=-99;
  for(let i=1;i<items.length;i++){
    const c=items[i];
    if(c.timestamp<availableFrom)continue;
    const touched=c.high>=low&&c.low<=high;
    if(touched&&i-lastTestIndex>2){tests++;lastTestIndex=i}
    if(side==='UPPER'&&c.high>=low&&c.close<low)rejections++;
    if(side==='LOWER'&&c.low<=high&&c.close>high)rejections++;
  }
  return{tests,rejections};
}
function buildClusters(levels:DisplayLevel[],context:Candle[],chart:Candle[],volumeRatio:number|undefined){
  const price=chart.at(-1)?.close??context.at(-1)?.close;
  if(price===undefined)return{clusters:[] as LiquidityCluster[],attackUp:0,attackDown:0,atr:undefined as number|undefined};
  const atr=atr14(context);
  const attackUp=directionalAttack(chart,'UP',atr,volumeRatio);
  const attackDown=directionalAttack(chart,'DOWN',atr,volumeRatio);
  const tolerance=Math.max((atr??price*.002)*.35,price*.0006);
  const pad=Math.max((atr??price*.002)*.08,price*.00012);
  const candidates=levels
    .filter(l=>l.role!=='REFERENCE')
    .slice()
    .sort((a,b)=>a.price-b.price);

  const groups:DisplayLevel[][]=[];
  for(const level of candidates){
    const group=groups.at(-1);
    if(!group){groups.push([level]);continue}
    const max=Math.max(...group.map(x=>x.price));
    if(level.price-max<=tolerance)group.push(level);
    else groups.push([level]);
  }

  const recent=context.slice(-220);
  const clusters:LiquidityCluster[]=groups.map((members,index)=>{
    const rawLow=Math.min(...members.map(m=>m.price));
    const rawHigh=Math.max(...members.map(m=>m.price));
    const low=rawLow-pad,high=rawHigh+pad,mid=(low+high)/2;
    const side:LiquidityCluster['side']=price>high?'LOWER':price<low?'UPPER':'ACTIVE';
    const interaction=countClusterInteractions(recent,low,high,Math.max(...members.map(m=>m.availableFrom)),side);
    const frozenBonus=members.filter(m=>m.status==='FROZEN').length*4;
    const composition=members.reduce((s,m)=>s+levelWeight(m),0);
    const rejectionBonus=Math.min(18,interaction.rejections*4);
    const depletionPenalty=Math.max(0,interaction.tests-2)*7;
    const strength=Math.round(clamp(composition+frozenBonus+rejectionBonus-depletionPenalty));
    const attack=side==='LOWER'?attackDown:side==='UPPER'?attackUp:Math.max(attackUp,attackDown);
    const pressure=Number((attack/Math.max(1,strength)).toFixed(2));
    const lastTwo=recent.slice(-2);
    const broken=side==='UPPER'
      ? lastTwo.length===2&&lastTwo.every(x=>x.close>high)
      : side==='LOWER'
        ? lastTwo.length===2&&lastTwo.every(x=>x.close<low)
        : false;
    const near=Math.abs(price-mid)<=Math.max(tolerance,(atr??0)*.45);
    let status:LiquidityClusterStatus='FRESH';
    if(broken)status='BROKEN';
    else if(near&&attack>=45)status='UNDER_ATTACK';
    else if(interaction.tests>=3)status='DEPLETED';
    else if(interaction.tests>=1)status='TESTED';
    return{
      id:`LC-${index+1}`,side,low,high,mid,members,
      strength,attack,pressure,tests:interaction.tests,rejections:interaction.rejections,status,
      distancePct:Math.abs(mid-price)/Math.max(price,1e-12)*100,
      availableFrom:Math.max(...members.map(m=>m.availableFrom))
    };
  });

  return{clusters,attackUp,attackDown,atr};
}
function makeRangeFrame(id:RangeFrame['id'],label:string,items:Candle[],price:number):RangeFrame|undefined{
  const r=range(items);if(!r)return undefined;
  const span=Math.max(1e-12,r.high-r.low);
  return{id,label,low:r.low,high:r.high,mid:r.balance,positionPct:clamp((price-r.low)/span*100)};
}

const SESSION_WINDOWS:Array<{name:SessionName;start:number;end:number}>=[
  {name:'ASIA',start:0,end:8},
  {name:'LONDON',start:7,end:16},
  {name:'NEW_YORK',start:13,end:22}
];

function makeEvent(
  instrument:string,seq:number,candle:Candle,eventTimeframe:'1m'|'15m',type:AscendEvent['type'],level:DisplayLevel,direction:'LONG'|'SHORT'|'NEUTRAL',
  explanation:string,nextExpected:string,payload:Record<string,unknown>
):AscendEvent{
  return{
    eventId:`live-${instrument}-${level.id}-${candle.timestamp}-${type}`,
    sequenceId:seq,instrument,timeframe:eventTimeframe,type,timestamp:candle.timestamp,
    price:candle.close,level:`${level.label} ${level.price.toLocaleString('en-US',{maximumFractionDigits:4})}`,
    direction,explanation,nextExpected,payload:{levelId:level.id,levelLabel:level.label,levelPrice:level.price,...payload}
  };
}

export function deriveLiveMarketContext(instrument:string,context:Candle[],chart:Candle[],eventCandles:Candle[]=[],now=Date.now()):LiveMarketContext{
  // Do not fabricate levels from a single websocket candle when historical REST is unavailable.
  // We need roughly two days of 15m context before YH/YL, session and ON/RTH/IB levels are trusted.
  if(context.length<192)return{sessions:[],levels:[],chronology:[],clusters:[],routeUp:[],routeDown:[],ranges:[],attackUp:0,attackDown:0};
  const todayStart=utcDayStart(now);
  const yesterdayStart=todayStart-86400000;
  const yesterdayEnd=todayStart;
  const today=context.filter(c=>c.timestamp>=todayStart);
  const yesterday=context.filter(c=>c.timestamp>=yesterdayStart&&c.timestamp<yesterdayEnd);
  const yr=range(yesterday);
  const open=today[0]?.open;

  let weighted=0,volume=0;
  for(const c of today){const typical=(c.high+c.low+c.close)/3;weighted+=typical*c.volume;volume+=c.volume}
  const vwap=volume>0?weighted/volume:undefined;

  const hour=new Date(now).getUTCHours()+new Date(now).getUTCMinutes()/60;
  let activeSession:SessionName|undefined;
  const sessions:SessionState[]=[];
  const levels:DisplayLevel[]=[];

  if(yr){
    levels.push(
      {id:'YH',label:'YH',price:yr.high,status:'FROZEN',role:'RESISTANCE',availableFrom:todayStart},
      {id:'YL',label:'YL',price:yr.low,status:'FROZEN',role:'SUPPORT',availableFrom:todayStart}
    );
  }
  if(open!==undefined)levels.push({id:'OPEN',label:'OPEN',price:open,status:'LIVE',role:'REFERENCE',availableFrom:todayStart});
  if(vwap!==undefined)levels.push({id:'VWAP',label:'VWAP',price:vwap,status:'LIVE',role:'REFERENCE',availableFrom:todayStart});

  for(const session of SESSION_WINDOWS){
    const start=todayStart+session.start*3600000;
    const end=todayStart+session.end*3600000;
    const items=context.filter(c=>c.timestamp>=start&&c.timestamp<Math.min(now,end));
    const r=range(items);
    const live=hour>=session.start&&hour<session.end;
    const frozen=hour>=session.end;
    if(live)activeSession=session.name;
    sessions.push({
      name:session.name,
      status:live?'LIVE':frozen?'FROZEN':'UPCOMING',
      high:r?.high,low:r?.low,balance:r?.balance
    });
    if(r){
      const status=frozen?'FROZEN':'LIVE';
      levels.push(
        {id:`${session.name}_H`,label:`${session.name.replace('_',' ')} H`,price:r.high,status,role:'RESISTANCE',availableFrom:frozen?end:now},
        {id:`${session.name}_L`,label:`${session.name.replace('_',' ')} L`,price:r.low,status,role:'SUPPORT',availableFrom:frozen?end:now}
      );
    }
  }

  const nextAsiaStart=todayStart+(hour<24?24:48)*3600000;
  sessions.push({name:'ASIA',status:'UPCOMING',startsIn:formatCountdown(nextAsiaStart-now)});

  // GG-Levels / US cash-session levels in America/New_York.
  // ON = 17:00–09:29, RTH = 09:30–16:59, IB = 09:30–10:30.
  // We classify each candle in NY local time so DST is handled by Intl rather than fixed UTC offsets.
  const nyNow=nyParts(now);
  const nyPrevDate=previousDateKey(nyNow.date);
  const nyMin=nyNow.minutes;
  let onItems:Candle[]=[];
  let onStatus:'FROZEN'|'LIVE'='LIVE';
  if(nyMin<570){
    onItems=context.filter(c=>{const p=nyParts(c.timestamp);return(p.date===nyPrevDate&&p.minutes>=1020)||(p.date===nyNow.date&&p.minutes<570)});
    onStatus='LIVE';
  }else if(nyMin<1020){
    onItems=context.filter(c=>{const p=nyParts(c.timestamp);return(p.date===nyPrevDate&&p.minutes>=1020)||(p.date===nyNow.date&&p.minutes<570)});
    onStatus='FROZEN';
  }else{
    onItems=context.filter(c=>{const p=nyParts(c.timestamp);return p.date===nyNow.date&&p.minutes>=1020});
    onStatus='LIVE';
  }
  const onRange=range(onItems);
  if(onRange){
    const available=onStatus==='FROZEN'?freezeAfter(onItems,now):now;
    levels.push(
      {id:'ONH',label:'ONH',price:onRange.high,status:onStatus,role:'RESISTANCE',availableFrom:available},
      {id:'ONL',label:'ONL',price:onRange.low,status:onStatus,role:'SUPPORT',availableFrom:available}
    );
  }

  const rthItems=context.filter(c=>{const p=nyParts(c.timestamp);return p.date===nyNow.date&&p.minutes>=570&&p.minutes<1020});
  const rthRange=range(rthItems);
  const rthStatus:'FROZEN'|'LIVE'=nyMin>=1020?'FROZEN':'LIVE';
  if(rthRange){
    const available=rthStatus==='FROZEN'?freezeAfter(rthItems,now):now;
    levels.push(
      {id:'RTH_HIGH',label:'RTH H',price:rthRange.high,status:rthStatus,role:'RESISTANCE',availableFrom:available},
      {id:'RTH_LOW',label:'RTH L',price:rthRange.low,status:rthStatus,role:'SUPPORT',availableFrom:available}
    );
  }

  const ibItems=context.filter(c=>{const p=nyParts(c.timestamp);return p.date===nyNow.date&&p.minutes>=570&&p.minutes<630});
  const ibRange=range(ibItems);
  const ibStatus:'FROZEN'|'LIVE'=nyMin>=630?'FROZEN':'LIVE';
  if(ibRange){
    const available=ibStatus==='FROZEN'?freezeAfter(ibItems,now):now;
    levels.push(
      {id:'IBH',label:'IBH',price:ibRange.high,status:ibStatus,role:'RESISTANCE',availableFrom:available},
      {id:'IBL',label:'IBL',price:ibRange.low,status:ibStatus,role:'SUPPORT',availableFrom:available}
    );
  }

  // Liquidity-event timestamps use closed 1m candles when available.
  // If 1m history is not ready, we fall back to closed 15m context candles.
  // Structure confirmation remains a separate Core layer, so raw liquidity events never become entries.
  const useMicro=eventCandles.length>=120;
  const closed=(useMicro?eventCandles:context).slice(useMicro?-1900:-160,-1);
  const eventTimeframe:'1m'|'15m'=useMicro?'1m':'15m';
  const eventLevels=levels.filter(l=>l.status==='FROZEN');
  const chronology:AscendEvent[]=[];
  let seq=1;
  for(const level of eventLevels){
    for(let i=2;i<closed.length;i++){
      const a=closed[i-2],b=closed[i-1],c=closed[i];
      if(c.timestamp<level.availableFrom)continue;
      const p=level.price;
      const crossedUp=b.close<=p&&c.close>p;
      const crossedDown=b.close>=p&&c.close<p;
      const sweptHigh=c.high>p&&c.open<p&&c.close<p;
      const sweptLow=c.low<p&&c.open>p&&c.close>p;
      const acceptUp=a.close<=p&&b.close>p&&c.close>p;
      const acceptDown=a.close>=p&&b.close<p&&c.close<p;
      const reclaimDown=b.close>p&&c.close<p;
      const reclaimUp=b.close<p&&c.close>p;
      const touched=c.low<=p&&c.high>=p;

      if(sweptHigh)chronology.push(makeEvent(instrument,seq++,c,eventTimeframe,'SWEEP',level,'SHORT','Цена сняла ликвидность выше уровня и закрылась обратно ниже. Sweep не является самостоятельным входом.','Ждём reclaim/structure confirmation.',{high:c.high,close:c.close,sweepDepthPct:(c.high/p-1)*100}));
      else if(sweptLow)chronology.push(makeEvent(instrument,seq++,c,eventTimeframe,'SWEEP',level,'LONG','Цена сняла ликвидность ниже уровня и закрылась обратно выше. Sweep не является самостоятельным входом.','Ждём reclaim/structure confirmation.',{low:c.low,close:c.close,sweepDepthPct:(1-c.low/p)*100}));
      else if(acceptUp)chronology.push(makeEvent(instrument,seq++,c,eventTimeframe,'ACCEPT',level,'LONG','Две закрытые свечи удержались выше замороженного уровня: фиксируем acceptance above.','Ждём ретест или продолжение структуры.',{close:c.close}));
      else if(acceptDown)chronology.push(makeEvent(instrument,seq++,c,eventTimeframe,'ACCEPT',level,'SHORT','Две закрытые свечи удержались ниже замороженного уровня: фиксируем acceptance below.','Ждём ретест или продолжение структуры.',{close:c.close}));
      else if(reclaimDown&&a.close<=p)chronology.push(makeEvent(instrument,seq++,c,eventTimeframe,'RECLAIM',level,'SHORT','После выхода выше цена вернулась под уровень.','Нужна структурная реакция.',{close:c.close}));
      else if(reclaimUp&&a.close>=p)chronology.push(makeEvent(instrument,seq++,c,eventTimeframe,'RECLAIM',level,'LONG','После выхода ниже цена вернулась над уровень.','Нужна структурная реакция.',{close:c.close}));
      else if(crossedUp)chronology.push(makeEvent(instrument,seq++,c,eventTimeframe,'BREAK',level,'LONG','Свеча закрылась выше замороженного уровня. Пробой зафиксирован в хронологии.','Проверяем acceptance/retest.',{close:c.close,breakPct:(c.close/p-1)*100}));
      else if(crossedDown)chronology.push(makeEvent(instrument,seq++,c,eventTimeframe,'BREAK',level,'SHORT','Свеча закрылась ниже замороженного уровня. Пробой поддержки зафиксирован в хронологии.','Проверяем acceptance/retest.',{close:c.close,breakPct:(1-c.close/p)*100}));
      else if(touched)chronology.push(makeEvent(instrument,seq++,c,eventTimeframe,'TOUCH',level,'NEUTRAL','Цена коснулась замороженного уровня без подтверждённого пробоя или sweep. Само касание не является входом.','Ждём реакцию: rejection / break / sweep / reclaim.',{high:c.high,low:c.low,close:c.close}));
    }
  }

  chronology.sort((a,b)=>a.timestamp-b.timestamp);
  const compact:AscendEvent[]=[];
  const lastTouch=new Map<string,number>();
  for(const event of chronology){
    if(event.type==='TOUCH'){
      const key=String(event.level);
      const prev=lastTouch.get(key);
      if(prev!==undefined&&event.timestamp-prev<45*60000)continue;
      lastTouch.set(key,event.timestamp);
    }
    const prev=compact[compact.length-1];
    if(prev&&event.timestamp===prev.timestamp&&event.type===prev.type&&event.level===prev.level)continue;
    compact.push(event);
  }
  const deduped=compact.slice(-60);

  const levelPriority=['ONH','ONL','RTH_HIGH','RTH_LOW','IBH','IBL','YH','YL','VWAP','OPEN'];
  levels.sort((a,b)=>{const ai=levelPriority.indexOf(a.id),bi=levelPriority.indexOf(b.id);return(ai<0?99:ai)-(bi<0?99:bi)});

  const recent=chart.slice(-21);
  const avg=recent.slice(0,-1).reduce((s,c)=>s+c.volume,0)/Math.max(1,recent.length-1);
  const volumeRatio=avg>0&&recent.length?recent[recent.length-1].volume/avg:undefined;

  const clusterState=buildClusters(levels,context,chart,volumeRatio);
  const currentPrice=chart.at(-1)?.close??context.at(-1)?.close??0;
  const routeUp=clusterState.clusters
    .filter(c=>c.side==='UPPER'&&c.status!=='BROKEN')
    .sort((a,b)=>a.mid-b.mid).slice(0,4);
  const routeDown=clusterState.clusters
    .filter(c=>c.side==='LOWER'&&c.status!=='BROKEN')
    .sort((a,b)=>b.mid-a.mid).slice(0,4);

  const twelveH=context.filter(c=>c.timestamp>=now-12*3600000);
  const activeDef=SESSION_WINDOWS.find(s=>s.name===activeSession);
  let sessionItems:Candle[]=[];
  let halfItems:Candle[]=[];
  if(activeDef){
    const sStart=todayStart+activeDef.start*3600000;
    const sEnd=Math.min(now,todayStart+activeDef.end*3600000);
    sessionItems=context.filter(c=>c.timestamp>=sStart&&c.timestamp<sEnd);
    const midpoint=sStart+(todayStart+activeDef.end*3600000-sStart)/2;
    const halfStart=now>=midpoint?midpoint:sStart;
    const halfEnd=now>=midpoint?sEnd:Math.min(midpoint,sEnd);
    halfItems=context.filter(c=>c.timestamp>=halfStart&&c.timestamp<halfEnd);
  }
  const ranges=[
    makeRangeFrame('12H','12H RANGE',twelveH,currentPrice),
    makeRangeFrame('SESSION',activeSession?`${activeSession.replace('_',' ')} RANGE`:'SESSION RANGE',sessionItems,currentPrice),
    makeRangeFrame('HALF_SESSION','HALF SESSION',halfItems,currentPrice)
  ].filter((x):x is RangeFrame=>Boolean(x));

  return{
    sessions,levels,chronology:deduped,
    clusters:clusterState.clusters,routeUp,routeDown,ranges,
    attackUp:clusterState.attackUp,attackDown:clusterState.attackDown,atr:clusterState.atr,
    vwap,open,yHigh:yr?.high,yLow:yr?.low,activeSession,volumeRatio
  };
}

function formatCountdown(ms:number){
  const total=Math.max(0,Math.floor(ms/1000));
  const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
