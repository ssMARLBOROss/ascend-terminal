import type {Candle} from '@ascend/contracts';

export type RadarGroup='0.5–3%'|'3–12%'|'12%+'|'<0.5%';
export type RadarStage='BUILDING'|'SCANNING'|'WATCH'|'SWEEP'|'SHIFTING'|'CHECK 1M'|'NO DATA';
export type RadarDirection='LONG'|'SHORT'|'NEUTRAL';
export type RadarOnSide='ONH'|'ONL'|'NONE';
export type RadarOnEvent='FORMING'|'APPROACH'|'TOUCH'|'SWEEP'|'RECLAIM'|'ACCEPTANCE'|'AWAY'|'NONE';
export type RadarOnState='LIVE'|'FROZEN'|'NO DATA';
export const ON_WATCH_DISTANCE_PCT=0.5;
export const ON_HOT_DISTANCE_PCT=0.2;
export type RadarTicker={
  symbol:string;price:number;change24h:number;turnover24h:number;
};
export type RadarObservation={
  symbol:string;price:number;change24h:number;turnover24h:number;group:RadarGroup;
  stage:RadarStage;direction:RadarDirection;reason:string;
  rsi?:number;zone:'RC30'|'RC70'|'MID'|'UNAVAILABLE';
  onh?:number;onl?:number;distancePct?:number;
  onSide:RadarOnSide;onEvent:RadarOnEvent;onState:RadarOnState;
  levelPrice?:number;touchAt?:number;sweepAt?:number;resolutionAt?:number;
  eventAt?:number;observedAt?:number;volumeRatio?:number;
  integrity:'COMPLETE'|'INCOMPLETE';
};
export const FIVE=300000, DAY=86400000;

export function groupMove(percent:number):RadarGroup{
  const abs=Math.abs(percent);
  return abs>=12?'12%+':abs>=3?'3–12%':abs>=.5?'0.5–3%':'<0.5%';
}

export function parseRadarTickers(payload:unknown):RadarTicker[]{
  const body=payload as {retCode?:number;result?:{list?:unknown[]}};
  if(body?.retCode!==0||!Array.isArray(body.result?.list))throw Error('Bybit tickers unavailable');
  const unique=new Map<string,RadarTicker>();
  for(const raw of body.result.list){
    const row=raw as Record<string,unknown>;
    const symbol=row?.symbol;
    const price=Number(row?.lastPrice),fraction=Number(row?.price24hPcnt),
      turnover=Number(row?.turnover24h);
    if(typeof symbol!=='string'||!/^([A-Z0-9]+)USDT$/.test(symbol)||
      !Number.isFinite(price)||price<=0||!Number.isFinite(fraction)||
      !Number.isFinite(turnover)||turnover<1000000)continue;
    unique.set(symbol,{symbol,price,change24h:fraction*100,turnover24h:turnover});
  }
  return [...unique.values()];
}

/** Balanced fixed-size sample, NOT a claim of whole-market candle coverage. */
export function selectRadarUniverse(tickers:RadarTicker[],limit=20):RadarTicker[]{
  const preferred=['BTCUSDT','ETHUSDT','SOLUSDT','ZECUSDT'];
  const selected:RadarTicker[]=[],used=new Set<string>();
  for(const symbol of preferred){
    const item=tickers.find(t=>t.symbol===symbol);
    if(item&&selected.length<limit){selected.push(item);used.add(item.symbol)}
  }
  const ranks=['0.5–3%','3–12%','12%+'] as RadarGroup[];
  const buckets=ranks.map(group=>tickers
    .filter(t=>groupMove(t.change24h)===group&&!used.has(t.symbol))
    .sort((a,b)=>b.turnover24h-a.turnover24h));
  const quota=Math.floor((limit-selected.length)/3);
  for(const items of buckets)for(const item of items.slice(0,quota)){
    if(used.has(item.symbol))continue;
    selected.push(item);used.add(item.symbol);
  }
  const remainder=tickers.filter(t=>!used.has(t.symbol))
    .sort((a,b)=>b.turnover24h-a.turnover24h);
  for(const item of remainder){
    if(selected.length>=limit)break;
    selected.push(item);used.add(item.symbol);
  }
  return selected.slice(0,limit);
}

function rsi14(bars:Candle[]):number|undefined{
  if(bars.length<16)return undefined;
  let gain=0,loss=0;
  for(let i=1;i<=14;i++){
    const move=bars[i].close-bars[i-1].close;
    gain+=Math.max(move,0);loss+=Math.max(-move,0);
  }
  gain/=14;loss/=14;
  for(let i=15;i<bars.length;i++){
    const move=bars[i].close-bars[i-1].close;
    gain=(gain*13+Math.max(move,0))/14;
    loss=(loss*13+Math.max(-move,0))/14;
  }
  if(loss===0)return gain===0?50:100;
  return 100-100/(1+gain/loss);
}
export function parseRadar5mRows(payload:unknown):Candle[]{
  const body=payload as {retCode?:number;result?:{list?:unknown[]}};
  if(body?.retCode!==0||!Array.isArray(body.result?.list))throw Error('Invalid Bybit 5m response');
  return body.result.list.flatMap(raw=>{
    if(!Array.isArray(raw)||raw.length<6)return [];
    const [timestamp,open,high,low,close,volume]=raw.slice(0,6).map(Number);
    return [timestamp,open,high,low,close,volume].every(Number.isFinite)&&
      timestamp>0&&low>0&&high>=low&&open>=low&&open<=high&&
      close>=low&&close<=high&&volume>=0?[{timestamp,open,high,low,close,volume}]:[];
  }).sort((a,b)=>a.timestamp-b.timestamp);
}
const sessionName=(at:number)=>{
  const hour=(at%DAY)/3600000;
  return [hour<8?'ASIA':'',hour>=7&&hour<16?'LONDON':'',
    hour>=13&&hour<22?'NEW YORK':''].filter(Boolean).join(' + ')||'ВНЕ ОКНА';
};
function pivotBreak(candles:Candle[],direction:RadarDirection,after:number):number|undefined{
  if(direction==='NEUTRAL')return;
  let pivot:number|undefined;
  for(let i=4;i<candles.length;i++){
    const c=candles[i-2],neighbor=[candles[i-4],candles[i-3],candles[i-1]];
    const price=direction==='LONG'?c.high:c.low;
    if(neighbor.every(x=>direction==='LONG'?x.high<price:x.low>price))pivot=price;
    const cur=candles[i];
    if(cur.timestamp+FIVE<=after||pivot===undefined)continue;
    if(direction==='LONG'?cur.close>pivot:cur.close<pivot)
      return cur.timestamp+FIVE;
  }
  return;
}
export function observeRadarTicker(ticker:RadarTicker,bars:Candle[],now:number):RadarObservation{
  const dayStart=Math.floor(now/DAY)*DAY;
  const latestClosed=Math.floor(now/FIVE)*FIVE-FIVE;
  const base:RadarObservation={
    ...ticker,group:groupMove(ticker.change24h),stage:'NO DATA',
    direction:'NEUTRAL',reason:'Ожидание полных закрытых 5m свечей',
    zone:'UNAVAILABLE',integrity:'INCOMPLETE',onSide:'NONE',
    onEvent:'NONE',onState:'NO DATA'
  };
  const day=bars.filter(b=>b.timestamp>=dayStart&&b.timestamp<=latestClosed);
  const expected=Math.max(0,Math.floor((latestClosed-dayStart)/FIVE)+1);
  if(!expected||day.length!==expected||day.some((b,i)=>b.timestamp!==dayStart+i*FIVE))
    return {...base,reason:'Неполная непрерывная история 5m UTC'};
  const rsi=rsi14(day);
  const zone:RadarObservation['zone']=rsi===undefined?'UNAVAILABLE':
    rsi<=30?'RC30':rsi>=70?'RC70':'MID';
  const last=day[day.length-1];
  const pre=day.slice(-21,-1);
  const meanVolume=pre.length>=10?pre.reduce((s,b)=>s+b.volume,0)/pre.length:0;
  const volumeRatio=meanVolume>0?last.volume/meanVolume:undefined;
  const common={...base,integrity:'COMPLETE' as const,rsi,zone,
    observedAt:last.timestamp+FIVE,volumeRatio};
  const finish=dayStart+6*3600000;
  if(now<finish){
    const liveHigh=Math.max(...day.map(b=>b.high));
    const liveLow=Math.min(...day.map(b=>b.low));
    return {...common,stage:'BUILDING',onState:'LIVE',onEvent:'FORMING',
      onh:liveHigh,onl:liveLow,
      reason:'ONH/ONL LIVE · до 06:00 UTC уровни изменяются, сигналы запрещены · '+sessionName(now)};
  }
  if(day.length<72)return {...common,stage:'NO DATA',
    reason:'Не хватает 72 закрытых 5m свечей для диапазона ONH/ONL'};
  const range=day.slice(0,72),onh=Math.max(...range.map(c=>c.high)),
    onl=Math.min(...range.map(c=>c.low));
  const nearH=Math.abs(last.close/onh-1)*100;
  const nearL=Math.abs(last.close/onl-1)*100;
  const closest:RadarOnSide=nearH<=nearL?'ONH':'ONL';
  const distance=Math.min(nearH,nearL);
  const context={...common,onh,onl,distancePct:distance,
    onState:'FROZEN' as const,onSide:closest,
    onEvent:'AWAY' as const,levelPrice:closest==='ONH'?onh:onl};
  const post=day.slice(72);
  type Sweep={i:number;side:'HIGH'|'LOW';at:number};
  const sweeps:Sweep[]=[];
  let lastTouchH:number|undefined,lastTouchL:number|undefined;
  for(let i=0;i<post.length;i++){
    const b=post[i],prev=post[i-1],closedAt=b.timestamp+FIVE;
    // Both thresholds in one candle: intrabar event ordering is unknown.
    // Do not register contradictory touches/sweeps from that candle.
    if(b.high>onh&&b.low<onl)continue;
    if(b.low<=onh&&b.high>=onh)lastTouchH=closedAt;
    if(b.low<=onl&&b.high>=onl)lastTouchL=closedAt;
    if(b.high>onh&&(!prev||prev.close<=onh))
      sweeps.push({i,side:'HIGH',at:closedAt});
    if(b.low<onl&&(!prev||prev.close>=onl))
      sweeps.push({i,side:'LOW',at:closedAt});
  }
  const selectedTouch=closest==='ONH'?lastTouchH:lastTouchL;
  const freshTouch=selectedTouch!==undefined&&now-selectedTouch<=30*60000;
  const distanceContext={...context,touchAt:selectedTouch};
  const s=sweeps.at(-1);
  // The radar is ON-first: RSI is explanatory ONLY and never elevates a
  // ticker to WATCH if the frozen ONH/ONL are not nearby.
  if(!s){
    if(distance<=ON_WATCH_DISTANCE_PCT||freshTouch)
      return {...distanceContext,stage:'WATCH',
        onEvent:freshTouch?'TOUCH':'APPROACH',eventAt:freshTouch?selectedTouch:last.timestamp+FIVE,
        reason:(freshTouch?'Касание ':'Подход к ')+closest+' FROZEN · '+
          distance.toFixed(2)+'% · ждём sweep / реакцию'};
    return {...distanceContext,stage:'SCANNING',
      reason:'Нет свежего взаимодействия с ONH/ONL (RSI — только контекст)'};
  }
  const levelSide:RadarOnSide=s.side==='HIGH'?'ONH':'ONL';
  const level=levelSide==='ONH'?onh:onl;
  const levelDistance=Math.abs(last.close/level-1)*100;
  const signalContext={...distanceContext,onSide:levelSide,
    levelPrice:level,distancePct:levelDistance,sweepAt:s.at,
    touchAt:levelSide==='ONH'?lastTouchH:lastTouchL};
  let dir:RadarDirection='NEUTRAL',resolutionAt:number|undefined;
  let resolution:'RECLAIM'|'ACCEPTANCE'|undefined;
  for(let i=s.i;i<Math.min(post.length,s.i+7);i++){
    const b=post[i],prev=post[i-1];
    if(s.side==='HIGH'){
      if(b.close<onh){dir='SHORT';resolution='RECLAIM';resolutionAt=b.timestamp+FIVE;break}
      if(prev&&i>s.i&&b.close>onh&&prev.close>onh){
        dir='LONG';resolution='ACCEPTANCE';resolutionAt=b.timestamp+FIVE;break}
    }else{
      if(b.close>onl){dir='LONG';resolution='RECLAIM';resolutionAt=b.timestamp+FIVE;break}
      if(prev&&i>s.i&&b.close<onl&&prev.close<onl){
        dir='SHORT';resolution='ACCEPTANCE';resolutionAt=b.timestamp+FIVE;break}
    }
  }
  if(!resolutionAt){
    if(now-s.at>90*60000)return {...distanceContext,stage:'SCANNING',
      reason:'Старый sweep '+levelSide+' · ждём новое взаимодействие'};
    return {...signalContext,stage:'SWEEP',onEvent:'SWEEP',eventAt:s.at,
      reason:levelSide+' снят · нет подтверждённого 5m reclaim / acceptance'};
  }
  if(now-resolutionAt>2*3600000)
    return {...distanceContext,stage:'SCANNING',
      reason:'Последний reclaim/acceptance старше 2 часов · ждём новый setup'};
  const after=post.filter(b=>b.timestamp+FIVE>=resolutionAt);
  const breakAt=pivotBreak(after,dir,resolutionAt);
  return {...signalContext,resolutionAt,direction:dir,
    onEvent:resolution??'NONE',stage:breakAt?'CHECK 1M':'SHIFTING',
    reason:levelSide+' '+resolution+' · '+dir+
      (breakAt?' · 5m pivot пробит, 10m/3m/1m Core не проверен':
        ' · ждём подтверждения структуры'),
    eventAt:breakAt??resolutionAt};
}
