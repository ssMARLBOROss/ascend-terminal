import type {Candle} from '@ascend/contracts';
import {computeFvgContext} from './fvgContextEngine';
import type {PreviousDayLevels} from './usePreviousDayLevels';
import {SESSION_WINDOWS} from '../components/SessionClock';

const M=60000,H=3600000,D=86400000;
const OVERNIGHT_TO=6; // Research protocol: 00:00–06:00 UTC, frozen at 06:00.
export type StepStatus='WAIT'|'OK'|'BLOCKED'|'NODATA';
export type StructureStep={status:StepStatus;detail:string;at?:number};
export type StructureDirection='LONG'|'SHORT';
export type StructureReport={
  symbol:string;dayStart:number;asOf:number;onh?:number;onl?:number;
  direction?:StructureDirection;phase:'WATCH'|'SHIFTING'|'CONFIRMED'|'ENTRY READY';
  steps:{sweep:StructureStep;resolution:StructureStep;choch:StructureStep;bos:StructureStep;
    retest:StructureStep;micro:StructureStep;session:StructureStep;entry:StructureStep};
  entry?:number;sl?:number;tp?:number;rr?:number;
};
const wait=(detail:string):StructureStep=>({status:'WAIT',detail});
const ok=(detail:string,at:number):StructureStep=>({status:'OK',detail,at});
const blocked=(detail:string):StructureStep=>({status:'BLOCKED',detail});
const missing=(detail:string):StructureStep=>({status:'NODATA',detail});

function aggregate(bars:Candle[],minutes:number):Candle[]{
  const span=minutes*M,groups=new Map<number,Candle[]>();
  for(const b of bars){
    const start=Math.floor(b.timestamp/span)*span;
    const array=groups.get(start)??[];
    array.push(b);groups.set(start,array);
  }
  const output:Candle[]=[];
  for(const [start,rows] of [...groups].sort((a,b)=>a[0]-b[0])){
    if(rows.length!==minutes||rows.some((r,i)=>r.timestamp!==start+i*M))continue;
    output.push({timestamp:start,open:rows[0].open,high:Math.max(...rows.map(r=>r.high)),
      low:Math.min(...rows.map(r=>r.low)),close:rows.at(-1)!.close,
      volume:rows.reduce((v,r)=>v+r.volume,0)});
  }
  return output;
}
// Pivot known only once right-hand candles have CLOSED. Never use the pivot
// before its confirmation timestamp. A directional CLOSE is required for BOS.
function confirmedBreak(bars:Candle[],after:number,direction:StructureDirection,left=2,right=2){
  let lastPivot:{price:number;at:number}|undefined;
  for(let i=left+right+1;i<bars.length;i++){
    const pivotIndex=i-right-1;
    const candidate=bars[pivotIndex];
    if(pivotIndex>=left){
      const before=bars.slice(pivotIndex-left,pivotIndex);
      const afterPivot=bars.slice(pivotIndex+1,pivotIndex+right+1);
      if(before.length===left&&afterPivot.length===right){
        const p=direction==='LONG'?candidate.high:candidate.low;
        if([...before,...afterPivot].every(c=>direction==='LONG'?c.high<p:c.low>p))
          lastPivot={price:p,at:bars[pivotIndex+right].timestamp+
            (bars[1]?.timestamp-bars[0]?.timestamp||M)};
      }
    }
    const b=bars[i],tf=bars[1]?.timestamp-bars[0]?.timestamp||M;
    const closeAt=b.timestamp+tf;
    if(closeAt<=after||!lastPivot||lastPivot.at> b.timestamp)continue;
    if(direction==='LONG'&&b.close>lastPivot.price||
       direction==='SHORT'&&b.close<lastPivot.price)
      return {at:closeAt,price:lastPivot.price,close:b.close};
  }
  return undefined;
}
function windowAt(at:number){
  const utcHour=(at%D)/H;
  return SESSION_WINDOWS.filter(s=>utcHour>=s.from&&utcHour<s.to).map(s=>s.name);
}

export function computeStructureReport(
  symbol:string,closedOneMinute:Candle[],now:number,previousDay?:PreviousDayLevels
):StructureReport{
  const dayStart=Math.floor(now/D)*D;
  const steps={
    sweep:wait('Ожидаем снятие ONH/ONL закрытой 5m свечой'),
    resolution:wait('Ожидаем reclaim или два закрытия за уровнем'),
    choch:wait('10m: закрытие за подтверждённым pivot'),
    bos:wait('5m: пробой нового подтверждённого pivot'),
    retest:wait('3m: FVG сформирован и протестирован после BOS'),
    micro:wait('1m: подтверждённый micro-BOS после ретеста'),
    session:wait('Проверяем активную сессию'),
    entry:blocked('Входы заблокированы до полного подтверждения')
  };
  const latest=closedOneMinute.at(-1);
  const report:StructureReport={symbol,dayStart,asOf:latest?latest.timestamp+M:0,
    phase:'WATCH',steps};
  const activeNow=windowAt(now);
  steps.session=activeNow.length?ok(activeNow.join(' + '),now):
    blocked('Сессии ASCEND завершены · новые входы запрещены');
  const bars=closedOneMinute.filter(c=>c.timestamp>=dayStart&&c.timestamp<dayStart+D);
  const freezeAt=dayStart+OVERNIGHT_TO*H;
  if(now<freezeAt){steps.sweep=wait('ONH/ONL LIVE · 00:00–06:00 UTC, ещё не заморожены');
    steps.session=ok(windowAt(now).join(' + ')||'Вне заданных окон',now);
    return report;}
  if(bars.length<OVERNIGHT_TO*60||
    bars.slice(0,OVERNIGHT_TO*60).some((b,i)=>b.timestamp!==dayStart+i*M)){
    steps.sweep=missing('Нет полных 360 закрытых 1m свечей 00:00–06:00 UTC');
    return report;
  }
  const overnight=bars.slice(0,OVERNIGHT_TO*60);
  const onh=Math.max(...overnight.map(c=>c.high)),
    onl=Math.min(...overnight.map(c=>c.low));
  report.onh=onh;report.onl=onl;
  const five=aggregate(bars,5),ten=aggregate(bars,10),
    three=aggregate(bars,3),one=bars;
  const afterFreeze=five.filter(c=>c.timestamp>=freezeAt);
  type Sweep={side:'HIGH'|'LOW';at:number;price:number;extreme:number;barIndex:number};
  const sweeps:Sweep[]=[];
  for(let i=0;i<afterFreeze.length;i++){
    const c=afterFreeze[i];
    const high=c.high>onh,low=c.low<onl;
    if(high&&low)continue; // ambiguous two-sided wick; intrabar ordering unknown
    const prior=afterFreeze[i-1];
    if(high&&(!prior||prior.close<=onh))
      sweeps.push({side:'HIGH',at:c.timestamp+5*M,price:onh,extreme:c.high,barIndex:i});
    if(low&&(!prior||prior.close>=onl))
      sweeps.push({side:'LOW',at:c.timestamp+5*M,price:onl,extreme:c.low,barIndex:i});
  }
  if(!sweeps.length){steps.sweep=wait('ONH '+onh.toFixed(2)+' / ONL '+onl.toFixed(2)+
    ' · пока нет 5m снятия');return report;}
  // Latest sweep supersedes older candidates. Requiring resolution later prevents
  // hindsight selection of the most profitable historical setup.
  const sweep=sweeps.at(-1)!;
  steps.sweep=ok(sweep.side+' · '+sweep.price.toFixed(2)+' → '+sweep.extreme.toFixed(2),sweep.at);
  let direction:StructureDirection|undefined,kind:string|undefined,resolveAt=0;
  for(let i=sweep.barIndex;i<Math.min(afterFreeze.length,sweep.barIndex+7);i++){
    const bar=afterFreeze[i],prev=afterFreeze[i-1];
    if(sweep.side==='HIGH'){
      if(bar.close<onh){direction='SHORT';kind='RECLAIM BELOW ONH';resolveAt=bar.timestamp+5*M;break}
      if(prev&&i>sweep.barIndex&&bar.close>onh&&prev.close>onh){
        direction='LONG';kind='ACCEPT ABOVE ONH';resolveAt=bar.timestamp+5*M;break}
    }else{
      if(bar.close>onl){direction='LONG';kind='RECLAIM ABOVE ONL';resolveAt=bar.timestamp+5*M;break}
      if(prev&&i>sweep.barIndex&&bar.close<onl&&prev.close<onl){
        direction='SHORT';kind='ACCEPT BELOW ONL';resolveAt=bar.timestamp+5*M;break}
    }
  }
  if(!direction){steps.resolution=wait('Sweep есть, но 5m reclaim/acceptance ещё нет');
    report.phase='WATCH';return report;}
  steps.resolution=ok(kind!,resolveAt);report.direction=direction;report.phase='SHIFTING';
  const choch=confirmedBreak(ten,resolveAt,direction);
  if(!choch)return report;
  steps.choch=ok('10m '+direction+' · close за '+choch.price.toFixed(2),choch.at);
  // BOS must use a NEW pivot whose candle follows the 10m change.
  const postShift=five.filter(c=>c.timestamp+5*M>choch.at);
  const bos=confirmedBreak(postShift,choch.at,direction);
  if(!bos)return report;
  steps.bos=ok('5m '+direction+' · '+bos.price.toFixed(2),bos.at);
  report.phase='CONFIRMED';
  const fvgs=computeFvgContext(three,symbol,'3m',
    {atrLength:14,fillMode:'wick',minGapPercent:.02},[],report.asOf);
  const matching=fvgs.filter(z=>z.side===(direction==='LONG'?'bull':'bear')&&
    z.formedAt>=choch.at&&z.firstTouchAt!==undefined&&z.firstTouchAt>=bos.at&&
    z.firstTouchAt<=report.asOf&&z.firstTouchAt-z.formedAt<=2*H&&
    z.status!=='FILLED'&&z.status!=='INVALID')
    .sort((a,b)=>(b.firstTouchAt??0)-(a.firstTouchAt??0));
  if(!matching.length)return report;
  const gap=matching[0],retestAt=gap.firstTouchAt!;
  steps.retest=ok('3m '+direction+' FVG '+gap.low.toFixed(2)+'–'+gap.high.toFixed(2),retestAt);
  const postRetest=one.filter(b=>b.timestamp>=retestAt);
  const micro=confirmedBreak(postRetest,retestAt,direction,2,2);
  if(!micro)return report;
  steps.micro=ok('1m micro-BOS '+direction+' · '+micro.price.toFixed(2),micro.at);
  const sessions=windowAt(now),eventSessions=windowAt(micro.at-1);
  if(!sessions.length||!eventSessions.length){
    steps.session=blocked('Вне ASCEND Session Window на момент 1m confirmation / сейчас');
    return report;
  }
  steps.session=ok(sessions.join(' + ')+' · 1m подтверждение внутри окна',micro.at);
  const last=one.at(-1);
  if(!last||last.timestamp+M!==report.asOf||
     now-report.asOf>2*M||report.asOf-micro.at>2*M){
    steps.entry=blocked('Подтверждение устарело; новое 1m требуется');
    return report;
  }
  // Structural invalidation and next frozen liquidity target are mandatory;
  // do not invent an Entry Ready if no defensible 1:2 target exists.
  const sinceSweep=one.filter(x=>x.timestamp+M>=sweep.at&&x.timestamp+M<=report.asOf);
  const entry=last.close;
  const sl=direction==='LONG'?Math.min(...sinceSweep.map(x=>x.low)):
    Math.max(...sinceSweep.map(x=>x.high));
  if(!(direction==='LONG'?sl<entry:sl>entry)){
    steps.entry=blocked('Нет корректного структурного SL');return report;
  }
  const candidates=[onh,onl];
  if(previousDay?.symbol===symbol&&previousDay.dayStartUtc+D===dayStart)
    candidates.push(previousDay.high,previousDay.low);
  const targets=candidates.filter(p=>direction==='LONG'?p>entry:p<entry)
    .sort((a,b)=>direction==='LONG'?a-b:b-a);
  const tp=targets[0];
  if(!tp){steps.entry=blocked('Нет следующей известной зоны TP');return report;}
  const rr=Math.abs(tp-entry)/Math.abs(entry-sl);
  report.entry=entry;report.sl=sl;report.tp=tp;report.rr=rr;
  if(rr<2){steps.entry=blocked('R:R '+rr.toFixed(2)+' < 2.00 · вход запрещён');
    return report;}
  steps.entry=ok('ТОЛЬКО RESEARCH · Entry '+entry.toFixed(2)+' / SL '+
    sl.toFixed(2)+' / TP '+tp.toFixed(2)+' / R:R '+rr.toFixed(2),micro.at);
  report.phase='ENTRY READY';
  return report;
}
