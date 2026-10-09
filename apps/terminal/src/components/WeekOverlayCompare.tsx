import {useEffect,useMemo,useState} from 'react';

const DAY_MS=86400000;
const HOUR_MS=3600000;
const HOURS_PER_WEEK=168;
const CHART={left:63,right:1094,top:18,bottom:260};
type RawHour={at:number;open:number;high:number;low:number;close:number;volume:number};
type Week={
  from:number;to:number;startOpen:number;endClose:number;
  netPct:number;rangePct:number;volume:number;
  trajectory:number[];returns:number[];
};
type Comparison={symbol:string;previous:Week;recent:Week;hourlyCorrelation:number|null};
type Loading={key:string;status:'loading'|'ready'|'error';comparison?:Comparison};

function parseWeeks(list:unknown[],symbol:string,startUtc:number):Comparison|undefined{
  const sorted:RawHour[]=[];
  if(!Array.isArray(list))return;
  for(const row of list){
    if(!Array.isArray(row)||row.length<6)continue;
    const hour=Number(row[0]);
    if(!Number.isFinite(hour)||hour<startUtc||hour>=startUtc+14*DAY_MS)continue;
    const o=Number(row[1]),h=Number(row[2]),l=Number(row[3]),c=Number(row[4]),v=Number(row[5]);
    if(![o,h,l,c,v].every(Number.isFinite)||l<=0||h<l||o<l||o>h||c<l||c>h||v<0)return;
    sorted.push({at:hour,open:o,high:h,low:l,close:c,volume:v});
  }
  sorted.sort((x,y)=>x.at-y.at);
  if(sorted.length!==2*HOURS_PER_WEEK)return;
  for(let i=0;i<sorted.length;i++){
    if(sorted[i].at!==startUtc+i*HOUR_MS)return;
  }
  const makeWeek=(bars:RawHour[],from:number):Week=>{
    const startOpen=bars[0].open,endClose=bars[bars.length-1].close;
    const trajectory=[0,...bars.map(b=>(b.close/startOpen-1)*100)];
    const returns=bars.map((b,i)=>(b.close/(i?bars[i-1].close:b.open)-1)*100);
    const maxHigh=Math.max(...bars.map(b=>b.high));
    const minLow=Math.min(...bars.map(b=>b.low));
    return {from,to:from+7*DAY_MS,startOpen,endClose,
      netPct:(endClose/startOpen-1)*100,rangePct:(maxHigh-minLow)/startOpen*100,
      volume:bars.reduce((s,b)=>s+b.volume,0),trajectory,returns};
  };
  const previous=makeWeek(sorted.slice(0,HOURS_PER_WEEK),startUtc);
  const recent=makeWeek(sorted.slice(HOURS_PER_WEEK),startUtc+7*DAY_MS);
  const first=previous.returns,second=recent.returns;
  const ma=first.reduce((s,v)=>s+v,0)/first.length;
  const mb=second.reduce((s,v)=>s+v,0)/second.length;
  let cov=0,da=0,db=0;
  for(let i=0;i<HOURS_PER_WEEK;i++){
    const a=first[i]-ma,b=second[i]-mb;
    cov+=a*b;da+=a*a;db+=b*b;
  }
  const hourlyCorrelation=da>0&&db>0?cov/Math.sqrt(da*db):null;
  return {symbol,previous,recent,hourlyCorrelation};
}

function dateLabel(time:number){
  return new Date(time).toLocaleDateString('ru-RU',{
    timeZone:'UTC',day:'2-digit',month:'2-digit'
  });
}
function pct(value:number){return (value>0?'+':'')+value.toFixed(2)+'%'}
function volume(value:number){
  return new Intl.NumberFormat('ru-RU',{notation:'compact',maximumFractionDigits:2}).format(value);
}

export default function WeekOverlayCompare({symbol}:{symbol:string}){
  const[dayStart,setDayStart]=useState(()=>Math.floor(Date.now()/DAY_MS)*DAY_MS);
  const key=symbol+':'+dayStart;
  const[state,setState]=useState<Loading>({key:'',status:'loading'});
  useEffect(()=>{
    const update=()=>setDayStart(Math.floor(Date.now()/DAY_MS)*DAY_MS);
    const timer=window.setInterval(update,30000);
    document.addEventListener('visibilitychange',update);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',update)};
  },[]);
  useEffect(()=>{
    const abort=new AbortController();
    const request=async()=>{
      setState({key,status:'loading'});
      try{
        const start=dayStart-14*DAY_MS;
        const params=new URLSearchParams({
          category:'linear',symbol,interval:'60',limit:'350',
          start:String(start),end:String(dayStart-1)
        });
        const response=await fetch('/market-api/v5/market/kline?'+params,{
          signal:abort.signal,cache:'no-store'
        });
        if(!response.ok)throw new Error('Bybit '+response.status);
        const body=await response.json();
        if(body.retCode!==0||!Array.isArray(body.result?.list))throw new Error('Нет часовой истории');
        const comparison=parseWeeks(body.result.list,symbol,start);
        if(!comparison)throw new Error('Недостаточно полных часовых свечей');
        if(!abort.signal.aborted)setState({key,status:'ready',comparison});
      }catch{
        if(!abort.signal.aborted)setState({key,status:'error'});
      }
    };
    void request();
    return()=>abort.abort();
  },[key,symbol,dayStart]);

  const comparison=state.key===key?state.comparison:undefined;
  const graph=useMemo(()=>{
    if(!comparison)return undefined;
    const both=[...comparison.previous.trajectory,...comparison.recent.trajectory,0];
    const minimum=Math.min(...both),maximum=Math.max(...both);
    const range=Math.max(.4,maximum-minimum);
    const floor=minimum-range*.12,ceil=maximum+range*.12;
    const x=(hour:number)=>CHART.left+hour/HOURS_PER_WEEK*(CHART.right-CHART.left);
    const y=(value:number)=>CHART.bottom-(value-floor)/(ceil-floor)*(CHART.bottom-CHART.top);
    const line=(values:number[])=>values.map((value,i)=>
      (i===0?'M':'L')+x(i).toFixed(2)+','+y(value).toFixed(2)
    ).join(' ');
    return {x,y,floor,ceil,previous:line(comparison.previous.trajectory),
      recent:line(comparison.recent.trajectory)};
  },[comparison]);
  return <section className="asc-week-comparison" aria-label="Наложение семи суток на предыдущие семь суток">
    <div className="asc-week-legend">
      <span className="asc-week-key previous">ПРЕДЫДУЩИЕ 7 ДНЕЙ</span>
      <span className="asc-week-key recent">ПОСЛЕДНИЕ 7 ДНЕЙ</span>
      <small>Обе линии: 0% в начале периода · 1 час на точку · UTC</small>
    </div>
    {!comparison||!graph?<p className="asc-week-message" role="status">
      {state.key===key&&state.status==='error'?
        'Не удалось получить 336 полных часовых свечей Bybit. Неполную историю не показываем.':
        'Загружаем 14 закрытых торговых суток Bybit…'}
    </p>:<>
      <div className="asc-week-summary">
        {[{week:comparison.previous,kind:'previous',name:'ПРЕДЫДУЩАЯ НЕДЕЛЯ'},
           {week:comparison.recent,kind:'recent',name:'ПОСЛЕДНЯЯ НЕДЕЛЯ'}].map(({week,kind,name})=>
          <div key={kind} className={'asc-week-stat '+kind}>
            <div><b>{name}</b><small>{dateLabel(week.from)}–{dateLabel(week.to-DAY_MS)} UTC</small></div>
            <strong className={week.netPct>=0?'positive':'negative'}>{pct(week.netPct)}</strong>
            <span>Диапазон {week.rangePct.toFixed(2)}% · Объём {volume(week.volume)} {symbol.replace(/USDT$/,'')}</span>
          </div>)}
      </div>
      <div className="asc-week-graph-wrap">
        <svg className="asc-week-graph" viewBox="0 0 1130 305"
          role="img" aria-label="Совмещённые по часам движения двух семидневных периодов в процентах">
          {Array.from({length:5},(_,i)=>{
            const value=graph.floor+(graph.ceil-graph.floor)*i/4;
            const yy=graph.y(value);
            return <g key={i}>
              <line x1={CHART.left} x2={CHART.right} y1={yy} y2={yy}
                stroke="rgba(127,157,180,.24)" strokeWidth={Math.abs(value)<.15?1.6:1}/>
              <text x={CHART.left-9} y={yy+4} textAnchor="end" fill="#91adc1" fontSize="13">
                {pct(value)}
              </text>
            </g>;
          })}
          {Array.from({length:7},(_,day)=><g key={day}>
            <rect x={graph.x(day*24+6)} y={CHART.top}
              width={graph.x(day*24+8)-graph.x(day*24)} height={CHART.bottom-CHART.top}
              fill="rgba(237,183,93,.07)"/>
            <text x={graph.x(day*24+7)} y={CHART.top+13} textAnchor="middle"
              fill="#ccaf77" fontSize="10">06–08</text>
          </g>)}
          {Array.from({length:8},(_,day)=><g key={day}>
            <line x1={graph.x(day*24)} x2={graph.x(day*24)}
              y1={CHART.top} y2={CHART.bottom} stroke="rgba(116,153,184,.2)"/>
            <text x={graph.x(day*24)} y={CHART.bottom+26}
              textAnchor={day===0?'start':day===7?'end':'middle'}
              fill="#9bb7c9" fontSize="13">Д{day+1>7?'7':day+1}</text>
          </g>)}
          <line x1={CHART.left} x2={CHART.right}
            y1={graph.y(0)} y2={graph.y(0)} stroke="#b3c4d2"
            strokeWidth="1.3" strokeDasharray="3 6"/>
          <path d={graph.previous} fill="none" stroke="#bc95df" strokeWidth="2.5"
            strokeDasharray="9 6" strokeLinejoin="round" strokeLinecap="round"/>
          <path d={graph.recent} fill="none" stroke="#53d7e1" strokeWidth="3"
            strokeLinejoin="round" strokeLinecap="round"/>
        </svg>
      </div>
      <div className="asc-week-footer">
        <span>Корреляция часовых изменений: <b>{comparison.hourlyCorrelation===null?'—':
          comparison.hourlyCorrelation.toFixed(2)}</b></span>
        <span>Наложение показывает сходство истории, <b>не прогноз</b>.</span>
      </div>
    </>}
  </section>;
}
