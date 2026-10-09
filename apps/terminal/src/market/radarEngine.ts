import type {Candle} from '@ascend/contracts';

export type RadarGroup='0.5–3%'|'3–12%'|'12%+'|'<0.5%';
export type RadarStage='BUILDING'|'SCANNING'|'WATCH'|'SWEEP'|'SHIFTING'|'CHECK 1M'|'NO DATA';
export type RadarDirection='LONG'|'SHORT'|'NEUTRAL';
export type RadarTicker={
  symbol:string;price:number;change24h:number;turnover24h:number;
};
export type RadarObservation={
  symbol:string;price:number;change24h:number;turnover24h:number;group:RadarGroup;
  stage:RadarStage;direction:RadarDirection;reason:string;
  rsi?:number;zone:'RC30'|'RC70'|'MID'|'UNAVAILABLE';
  onh?:number;onl?:number;distancePct?:number;
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
  const preferred=['BTCUSDT','ETHUSDT','SOLUSDT'];
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
    zone:'UNAVAILABLE',integrity:'INCOMPLETE'
  };
  const day=bars.filter(b=>b.timestamp>=dayStart&&b.timestamp<=latestClosed);
  const expected=Math.max(0,Math.floor((latestClosed-dayStart)/FIVE)+1);
  if(!expected||day.length!==expected||day.some((b,i)=>b.timestamp!==dayStart+i*FIVE))
    return {...base,reason:'Неполная непрерывная история 5m UTC'};
  const rsi=rsi14(day);
  const zone=rsi===undefined?'UNAVAILABLE':rsi<=30?'RC30':rsi>=70?'RC70':'MID';
  const last=day[day.length-1];
  const pre=day.slice(-21,-1);
  const meanVolume=pre.length>=10?pre.reduce((s,b)=>s+b.volume,0)/pre.length:0;
  const volumeRatio=meanVolume>0?last.volume/meanVolume:undefined;
  const common={...base,integrity:'COMPLETE' as const,rsi,zone,
    observedAt:last.timestamp+FIVE,volumeRatio};
  const finish=dayStart+6*3600000;
  if(now<finish)return {...common,stage:'BUILDING',reason:
    'ONH/ONL 00:00–06:00 UTC формируются; не заморожены · '+sessionName(now)};
  if(day.length<72)return {...common,stage:'NO DATA',
    reason:'Не хватает 72 закрытых 5m свечей для диапазона ONH/ONL'};
  const range=day.slice(0,72),onh=Math.max(...range.map(c=>c.high)),
    onl=Math.min(...range.map(c=>c.low));
  const distance=Math.min(Math.abs(last.close/onh-1),Math.abs(last.close/onl-1))*100;
  const context={...common,onh,onl,distancePct:distance};
  const post=day.slice(72),sweeps:{i:number;side:'HIGH'|'LOW';at:number}[]=[];
  for(let i=0;i<post.length;i++){
    const b=post[i],prev=post[i-1];
    if(b.high>onh&&b.low<onl)continue; // unknown intrabar ordering
    if(b.high>onh&&(!prev||prev.close<=onh))
      sweeps.push({i,side:'HIGH',at:b.timestamp+FIVE});
    if(b.low<onl&&(!prev||prev.close>=onl))
      sweeps.push({i,side:'LOW',at:b.timestamp+FIVE});
  }
  const s=sweeps.at(-1);
  if(!s){
    if(distance<=.5||zone==='RC30'||zone==='RC70')
      return {...context,stage:'WATCH',reason:distance<=.5?
        'Подход к замороженному ONH/ONL · '+distance.toFixed(2)+'%':
        zone+' · без снятия ONH/ONL'};
    return {...context,stage:'SCANNING',reason:'Нет снятия/подхода к ONH/ONL'};
  }
  const signal=post[s.i];
  let dir:RadarDirection='NEUTRAL',resolutionAt:number|undefined;
  for(let i=s.i;i<Math.min(post.length,s.i+7);i++){
    const b=post[i],prev=post[i-1];
    if(s.side==='HIGH'){
      if(b.close<onh){dir='SHORT';resolutionAt=b.timestamp+FIVE;break}
      if(prev&&i>s.i&&b.close>onh&&prev.close>onh){
        dir='LONG';resolutionAt=b.timestamp+FIVE;break}
    }else{
      if(b.close>onl){dir='LONG';resolutionAt=b.timestamp+FIVE;break}
      if(prev&&i>s.i&&b.close<onl&&prev.close<onl){
        dir='SHORT';resolutionAt=b.timestamp+FIVE;break}
    }
  }
  const age=now-s.at;
  if(!resolutionAt)return {...context,stage:age<=90*60000?'SWEEP':'SCANNING',
    reason:s.side==='HIGH'?'ONH снят · ожидаем закрытие / acceptance':
      'ONL снят · ожидаем закрытие / acceptance',eventAt:s.at};
  if(now-resolutionAt>2*3600000)
    return {...context,stage:'SCANNING',direction:dir,
      reason:'Старое подтверждение: требуется новый setup',eventAt:resolutionAt};
  const after=post.filter(b=>b.timestamp+FIVE>=resolutionAt);
  const breakAt=pivotBreak(after,dir,resolutionAt);
  return {...context,direction:dir,stage:breakAt?'CHECK 1M':'SHIFTING',
    reason:breakAt?'5m pivot пробит · полный 10m/3m/1m Core ещё не проверен':
      '5m reclaim/acceptance · ждём подтверждение структуры',
    eventAt:breakAt??resolutionAt};
}
