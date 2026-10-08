import {useEffect,useState} from 'react';

const DAY_MS=86400000;
const HALF_HOUR=1800000;
const HOUR_MS=3600000;
const ROWS=7;
type Bar={t:number;open:number;high:number;low:number;close:number};
type HistoryPoint={t:number;value:number};
type RatioPoint={t:number;long:number;short:number};
type Tpo={poc:number;vah:number;val:number;count:number};
type CvdWindow={buy:number;sell:number;from:number;to:number;trades:number};
type ResearchData={
  candles:Bar[]|null;oi:HistoryPoint[]|null;ratio:RatioPoint[]|null;cvd:CvdWindow|null;
  errors:string[];
};
type Row={
  day:number;price06:number;price08:number;change08to10:number;
  profile:Tpo;position:'выше VAH'|'ниже VAL'|'в Value Area';
  oiChange?:number;longRatio?:number;ratioChange?:number;
};

const money=(v:number)=>v.toLocaleString('en-US',{maximumFractionDigits:v>=1000?2:4});
const per=(v:number)=>((v>0?'+':'')+v.toFixed(2)+'%');
const pct=(v:number)=>v.toFixed(1)+'%';
const dayLabel=(ms:number)=>new Date(ms).toLocaleDateString('ru-RU',{timeZone:'UTC',day:'2-digit',month:'2-digit'});
const hourText=(ms:number)=>new Date(ms).toLocaleTimeString('ru-RU',{timeZone:'UTC',hour:'2-digit',minute:'2-digit'});

function parseBars(rows:unknown[],start:number,end:number):Bar[]|null{
  const map=new Map<number,Bar>();
  for(const row of rows){
    if(!Array.isArray(row)||row.length<5)continue;
    const t=Number(row[0]),open=Number(row[1]),high=Number(row[2]),low=Number(row[3]),close=Number(row[4]);
    if(t<start||t>=end||!Number.isFinite(t))continue;
    if([open,high,low,close].some(v=>!Number.isFinite(v))||low<=0||high<low)return null;
    map.set(t,{t,open,high,low,close});
  }
  const bars=[...map.values()].sort((a,b)=>a.t-b.t);
  if(bars.length!==ROWS*48)return null;
  for(let i=0;i<bars.length;i++){
    if(bars[i].t!==start+i*HALF_HOUR)return null;
  }
  return bars;
}

/**
 * 30m TPO price-range approximation: one price-bin opportunity per bracket.
 * This is NOT a tick-based market profile or a volume profile.
 */
export function calculateTpo(brackets:Bar[]):Tpo|undefined{
  if(!brackets.length)return;
  const low=Math.min(...brackets.map(b=>b.low)),high=Math.max(...brackets.map(b=>b.high));
  if(!(high>low))return;
  const count=48,width=(high-low)/count;
  const visits=Array.from({length:count},()=>0);
  for(const b of brackets){
    const left=Math.max(0,Math.min(count-1,Math.floor((b.low-low)/width)));
    const right=Math.max(left,Math.min(count-1,Math.floor((b.high-low)/width)));
    for(let i=left;i<=right;i++)visits[i]++;
  }
  const total=visits.reduce((s,v)=>s+v,0);
  if(!total)return;
  let pocIndex=0;
  for(let i=1;i<count;i++)if(visits[i]>visits[pocIndex])pocIndex=i;
  let start=pocIndex,end=pocIndex,acc=visits[pocIndex];
  const target=total*.70;
  while(acc<target&&(start>0||end<count-1)){
    const lo=start>0?visits[start-1]:-1;
    const hi=end<count-1?visits[end+1]:-1;
    if(hi>lo){end++;acc+=visits[end]}else{start--;acc+=visits[start]}
  }
  return {poc:low+(pocIndex+.5)*width,val:low+start*width,
    vah:low+(end+1)*width,count:brackets.length};
}
function historicRows(data:ResearchData,weekStart:number):Row[]{
  if(!data.candles)return [];
  const result:Row[]=[];
  for(let d=0;d<ROWS;d++){
    const day=weekStart+d*DAY_MS;
    const c=data.candles.filter(b=>b.t>=day&&b.t<day+DAY_MS);
    if(c.length!==48)continue;
    const profile=calculateTpo(c.slice(0,12));
    if(!profile)continue;
    const price06=c[11].close,price08=c[15].close,price10=c[19].close;
    const oi06=data.oi?.find(p=>p.t===day+5*HOUR_MS)?.value;
    const oi08=data.oi?.find(p=>p.t===day+7*HOUR_MS)?.value;
    const rat06=data.ratio?.find(p=>p.t===day+5*HOUR_MS);
    const rat08=data.ratio?.find(p=>p.t===day+7*HOUR_MS);
    result.push({day,price06,price08,profile,
      position:price08>profile.vah?'выше VAH':price08<profile.val?'ниже VAL':'в Value Area',
      change08to10:(price10/price08-1)*100,
      oiChange:oi06&&oi08?(oi08/oi06-1)*100:undefined,
      longRatio:rat08?rat08.long*100:undefined,
      ratioChange:rat06&&rat08?(rat08.long-rat06.long)*100:undefined});
  }
  return result;
}

async function getBybit(path:string,params:Record<string,string>,signal:AbortSignal):Promise<unknown[]>{
  const query=new URLSearchParams({category:'linear',...params});
  const response=await fetch('/market-api/v5/market/'+path+'?'+query,{
    signal,cache:'no-store'
  });
  if(!response.ok)throw new Error(path+': HTTP '+response.status);
  const json=await response.json();
  if(json.retCode!==0||!Array.isArray(json.result?.list))
    throw new Error(path+': '+String(json.retMsg??'неверный ответ'));
  return json.result.list;
}
function parseOpenInterest(list:unknown[],start:number,end:number){
  const values:HistoryPoint[]=[];
  for(const point of list){
    const p=point as Record<string,unknown>;
    const t=Number(p?.timestamp),value=Number(p?.openInterest);
    if(t>=start&&t<end&&Number.isFinite(t)&&Number.isFinite(value)&&value>0)
      values.push({t,value});
  }
  return values.sort((a,b)=>a.t-b.t);
}
function parseAccounts(list:unknown[],start:number,end:number){
  const values:RatioPoint[]=[];
  for(const point of list){
    const p=point as Record<string,unknown>;
    const t=Number(p?.timestamp),long=Number(p?.buyRatio),short=Number(p?.sellRatio);
    if(t>=start&&t<end&&Number.isFinite(t)&&
      Number.isFinite(long)&&Number.isFinite(short)&&long>=0&&long<=1&&short>=0&&short<=1)
      values.push({t,long,short});
  }
  return values.sort((a,b)=>a.t-b.t);
}
function parseRecentTrades(list:unknown[]):CvdWindow|null{
  const seen=new Set<string>();
  let buy=0,sell=0,from=Infinity,to=-Infinity,count=0;
  for(const raw of list){
    const x=raw as Record<string,unknown>;
    const id=String(x?.execId??''),t=Number(x?.time),size=Number(x?.size);
    if(!id||seen.has(id)||!Number.isFinite(t)||!Number.isFinite(size)||size<=0)continue;
    if(x.side!=='Buy'&&x.side!=='Sell')continue;
    seen.add(id);
    if(x.side==='Buy')buy+=size;else sell+=size;
    from=Math.min(t,from);to=Math.max(t,to);count++;
  }
  return count?{buy,sell,from,to,trades:count}:null;
}
async function research(symbol:string,start:number,end:number,signal:AbortSignal):Promise<ResearchData>{
  const errors:string[]=[];
  const requests:Promise<unknown[]>[]=[
    getBybit('kline',{symbol,interval:'30',start:String(start),end:String(end-1),limit:'400'},signal),
    getBybit('open-interest',{symbol,intervalTime:'1h',startTime:String(start),endTime:String(end-1),limit:'200'},signal),
    getBybit('account-ratio',{symbol,period:'1h',startTime:String(start),endTime:String(end-1),limit:'200'},signal),
    getBybit('recent-trade',{symbol,limit:'1000'},signal)
  ];
  const [k,o,l,trades]=await Promise.allSettled(requests);
  function valid(result:PromiseSettledResult<unknown[]>,name:string):unknown[]|null{
    if(result.status==='fulfilled')return result.value;
    errors.push(name+': '+String(result.reason));
    return null;
  }
  const candlesRaw=valid(k,'TPO'),oiRaw=valid(o,'OI'),accountsRaw=valid(l,'Long/Short'),tradesRaw=valid(trades,'CVD');
  const candles=candlesRaw?parseBars(candlesRaw,start,end):null;
  if(candlesRaw&&!candles)errors.push('TPO: история 30m неполная');
  const oi=oiRaw?parseOpenInterest(oiRaw,start,end):null;
  const ratio=accountsRaw?parseAccounts(accountsRaw,start,end):null;
  const cvd=tradesRaw?parseRecentTrades(tradesRaw):null;
  return {candles,oi,ratio,cvd,errors};
}

export default function MarketResearchPanel({symbol}:{symbol:string}){
  const[utcDay,setUtcDay]=useState(()=>Math.floor(Date.now()/DAY_MS)*DAY_MS);
  const[report,setReport]=useState<{key:string;data:ResearchData}|null>(null);
  const[status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  useEffect(()=>{
    const sync=()=>setUtcDay(Math.floor(Date.now()/DAY_MS)*DAY_MS);
    const t=window.setInterval(sync,30000);
    document.addEventListener('visibilitychange',sync);
    return()=>{window.clearInterval(t);document.removeEventListener('visibilitychange',sync)};
  },[]);
  const start=utcDay-ROWS*DAY_MS,key=symbol+':'+start;
  useEffect(()=>{
    const ac=new AbortController();
    setStatus('loading');
    setReport(null);
    research(symbol,start,utcDay,ac.signal).then(data=>{
      if(ac.signal.aborted)return;
      setReport({key,data});
      setStatus(data.candles||data.oi||data.ratio||data.cvd?'ready':'error');
    }).catch(()=>{if(!ac.signal.aborted)setStatus('error')});
    return()=>ac.abort();
  },[symbol,start,utcDay,key]);
  const data=report?.key===key?report.data:null;
  const rows=data?historicRows(data,start):[];
  const latest=rows[rows.length-1];
  const fmtMaybe=(v:number|undefined,format:(v:number)=>string)=>v===undefined?'—':format(v);
  const ratioLatest=latest?.longRatio;
  const oiLast=data?.oi?.at(-1);
  return <section className="asc-research" aria-label="Исследование TPO OI Long Short CVD">
    <div className="asc-research-head">
      <div><strong>TPO · OI · NET L/S · CVD</strong>
        <small>ИССЛЕДОВАТЕЛЬСКИЙ КОНТУР · BYBIT · UTC · БЕЗ АВТОВХОДОВ</small>
      </div>
      <span>{dayLabel(start)}–{dayLabel(utcDay-DAY_MS)} · 7 закрытых суток</span>
    </div>
    {status==='loading'&&<p className="asc-research-wait" role="status">Загружаем профили, открытый интерес и позиционирование…</p>}
    {status==='error'&&<p className="asc-research-wait" role="status">Данные временно недоступны; расчётные значения не подставляются.</p>}
    {data&&<>
      <div className="asc-research-grid">
        <article className="asc-research-card">
          <b>TPO · MARKET PROFILE</b>
          <strong>{fmtMaybe(latest?.profile.poc,money)}</strong>
          <small>POC по диапазонам 30-минутных свечей, 00–06 UTC</small>
          <div className="asc-research-pair">
            <span>VAH {fmtMaybe(latest?.profile.vah,money)}</span>
            <span>VAL {fmtMaybe(latest?.profile.val,money)}</span>
          </div>
          <em>Приближение TPO, Value Area ≈ 70% TPO-отметок, без тиков</em>
        </article>
        <article className="asc-research-card">
          <b>OPEN INTEREST · OI</b>
          <strong>{fmtMaybe(oiLast?.value,v=>v.toLocaleString('en-US',{maximumFractionDigits:2}))}</strong>
          <small>{oiLast?'Исторический срез '+dayLabel(oiLast.t)+' '+hourText(oiLast.t)+' UTC':'История OI недоступна'}</small>
          <div className="asc-research-pair"><span>06→08 UTC: {fmtMaybe(latest?.oiChange,per)}</span></div>
          <em>Открытые контракты; OI не задаёт направление цены</em>
        </article>
        <article className="asc-research-card">
          <b>NET L/S · ACCOUNTS</b>
          <strong>{fmtMaybe(ratioLatest,pct)}</strong>
          <small>Доля long-аккаунтов на последнем исследованном 08:00 UTC</small>
          <div className="asc-research-pair">
            <span>Δ 06→08: {fmtMaybe(latest?.ratioChange,v=>(v>0?'+':'')+v.toFixed(2)+' п.п.')}</span>
          </div>
          <em>Соотношение числа аккаунтов, не чистый объём long/short позиций</em>
        </article>
        <article className="asc-research-card">
          <b>CVD · RECENT TRADES</b>
          <strong>{data.cvd?((data.cvd.buy-data.cvd.sell)>0?'+':'')+
            (data.cvd.buy-data.cvd.sell).toFixed(3):'—'}</strong>
          <small>Σ Buy − Σ Sell в базовой монете · до 1000 последних сделок</small>
          <div className="asc-research-pair">
            <span>{data.cvd?hourText(data.cvd.from)+'–'+hourText(data.cvd.to)+' UTC':'Недоступно'}</span>
            <span>{data.cvd?data.cvd.trades+' сделок':'—'}</span>
          </div>
          <em>Только текущая выборка, НЕ исторический и НЕ непрерывный CVD</em>
        </article>
      </div>
      <div className="asc-research-table-head">
        <strong>BTC / ВЫБРАННАЯ МОНЕТА · ХРОНОЛОГИЯ 06:00 → 08:00 UTC</strong>
        <small>История без look-ahead · TPO фиксирован на 06:00</small>
      </div>
      {rows.length?<div className="asc-research-scroll"><table>
        <thead><tr><th>День</th><th>Цена 06</th><th>Цена 08</th>
          <th>Цена 08 vs VA(06)</th><th>OI Δ 06→08</th><th>Long 08</th>
          <th>08→10 цена</th></tr></thead>
        <tbody>{rows.map(r=><tr key={r.day}>
          <td>{dayLabel(r.day)}</td><td>{money(r.price06)}</td>
          <td>{money(r.price08)}</td><td>{r.position}</td>
          <td>{fmtMaybe(r.oiChange,per)}</td>
          <td>{fmtMaybe(r.longRatio,pct)}</td>
          <td className={r.change08to10>=0?'asc-research-up':'asc-research-down'}>{per(r.change08to10)}</td>
        </tr>)}</tbody>
      </table></div>:<p className="asc-research-wait">Исторические свечи 30m недоступны или неполны.</p>}
      {data.errors.length>0&&<p className="asc-research-errors">Недоступные источники: {data.errors.join(' · ')}</p>}
      <p className="asc-research-disclaimer">
        06 и 08 — моменты анализа, не моменты автоматически открытых сделок. Для OI и Net L/S
        используются последние полностью завершённые часовые интервалы до соответствующего времени.
        Здесь нет валидации Entry/SL/TP, исторической дельты CVD и сигнала стратегии.
      </p>
    </>}
  </section>;
}
