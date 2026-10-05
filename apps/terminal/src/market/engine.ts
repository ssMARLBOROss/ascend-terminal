import type { AscendEvent, Candle, SessionName, SessionState } from '@ascend/contracts';

export type DisplayLevel={
  id:string;
  label:string;
  price:number;
  status:'FROZEN'|'LIVE';
  role:'SUPPORT'|'RESISTANCE'|'REFERENCE';
  availableFrom:number;
};

export type LiveMarketContext={
  sessions:SessionState[];
  levels:DisplayLevel[];
  chronology:AscendEvent[];
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

const SESSION_WINDOWS:Array<{name:SessionName;start:number;end:number}>=[
  {name:'ASIA',start:0,end:8},
  {name:'LONDON',start:7,end:16},
  {name:'NEW_YORK',start:13,end:22}
];

function makeEvent(
  instrument:string,seq:number,candle:Candle,type:AscendEvent['type'],level:DisplayLevel,direction:'LONG'|'SHORT'|'NEUTRAL',
  explanation:string,nextExpected:string,payload:Record<string,unknown>
):AscendEvent{
  return{
    eventId:`live-${instrument}-${level.id}-${candle.timestamp}-${type}`,
    sequenceId:seq,instrument,timeframe:'15m',type,timestamp:candle.timestamp,
    price:candle.close,level:`${level.label} ${level.price.toLocaleString('en-US',{maximumFractionDigits:4})}`,
    direction,explanation,nextExpected,payload
  };
}

export function deriveLiveMarketContext(instrument:string,context:Candle[],chart:Candle[],now=Date.now()):LiveMarketContext{
  // Do not fabricate levels from a single websocket candle when historical REST is unavailable.
  // We need roughly two days of 15m context before YH/YL, session and ON/RTH/IB levels are trusted.
  if(context.length<192)return{sessions:[],levels:[],chronology:[]};
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

  // Market-level chronology is intentionally evaluated on closed 15m context candles.
  // Lower-TF structure will be a separate Core layer so raw breaks do not masquerade as entries.
  const closed=context.slice(-160,-1);
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

      if(sweptHigh)chronology.push(makeEvent(instrument,seq++,c,'SWEEP',level,'SHORT','Цена сняла ликвидность выше уровня и закрылась обратно ниже. Sweep не является самостоятельным входом.','Ждём reclaim/structure confirmation.',{high:c.high,close:c.close,sweepDepthPct:(c.high/p-1)*100}));
      else if(sweptLow)chronology.push(makeEvent(instrument,seq++,c,'SWEEP',level,'LONG','Цена сняла ликвидность ниже уровня и закрылась обратно выше. Sweep не является самостоятельным входом.','Ждём reclaim/structure confirmation.',{low:c.low,close:c.close,sweepDepthPct:(1-c.low/p)*100}));
      else if(acceptUp)chronology.push(makeEvent(instrument,seq++,c,'ACCEPT',level,'LONG','Две закрытые свечи удержались выше замороженного уровня: фиксируем acceptance above.','Ждём ретест или продолжение структуры.',{close:c.close}));
      else if(acceptDown)chronology.push(makeEvent(instrument,seq++,c,'ACCEPT',level,'SHORT','Две закрытые свечи удержались ниже замороженного уровня: фиксируем acceptance below.','Ждём ретест или продолжение структуры.',{close:c.close}));
      else if(reclaimDown&&a.close<=p)chronology.push(makeEvent(instrument,seq++,c,'RECLAIM',level,'SHORT','После выхода выше цена вернулась под уровень.','Нужна структурная реакция.',{close:c.close}));
      else if(reclaimUp&&a.close>=p)chronology.push(makeEvent(instrument,seq++,c,'RECLAIM',level,'LONG','После выхода ниже цена вернулась над уровень.','Нужна структурная реакция.',{close:c.close}));
      else if(crossedUp)chronology.push(makeEvent(instrument,seq++,c,'BREAK',level,'LONG','Свеча закрылась выше замороженного уровня. Пробой зафиксирован в хронологии.','Проверяем acceptance/retest.',{close:c.close,breakPct:(c.close/p-1)*100}));
      else if(crossedDown)chronology.push(makeEvent(instrument,seq++,c,'BREAK',level,'SHORT','Свеча закрылась ниже замороженного уровня. Пробой поддержки зафиксирован в хронологии.','Проверяем acceptance/retest.',{close:c.close,breakPct:(1-c.close/p)*100}));
    }
  }

  chronology.sort((a,b)=>a.timestamp-b.timestamp);
  const deduped=chronology.filter((e,i,arr)=>i===0||!(e.timestamp===arr[i-1].timestamp&&e.type===arr[i-1].type&&e.level===arr[i-1].level)).slice(-30);

  const levelPriority=['ONH','ONL','RTH_HIGH','RTH_LOW','IBH','IBL','YH','YL','VWAP','OPEN'];
  levels.sort((a,b)=>{const ai=levelPriority.indexOf(a.id),bi=levelPriority.indexOf(b.id);return(ai<0?99:ai)-(bi<0?99:bi)});

  const recent=chart.slice(-21);
  const avg=recent.slice(0,-1).reduce((s,c)=>s+c.volume,0)/Math.max(1,recent.length-1);
  const volumeRatio=avg>0&&recent.length?recent[recent.length-1].volume/avg:undefined;

  return{sessions,levels,chronology:deduped,vwap,open,yHigh:yr?.high,yLow:yr?.low,activeSession,volumeRatio};
}

function formatCountdown(ms:number){
  const total=Math.max(0,Math.floor(ms/1000));
  const h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
