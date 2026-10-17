/* ASCEND GLOBAL TREND V1: read-only market context, NOT an entry signal.
 * All input data must carry its actual venue and market provenance.
 * With MEXC futures and reversal-radar breadth this is a PROXY, not a global spot index.
 */
(function (root, factory) {
  const api=factory();
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  root.ASCEND_GLOBAL_TREND_V1=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const W=Object.freeze({BTC_USDT:.50,ETH_USDT:.30,SOL_USDT:.20});
  const CONFIRM=2;
  const TF=Object.freeze({'5m':300,'15m':900,'30m':1800,'1h':3600});
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const sign=n=>n>0?1:n<0?-1:0;
  const bound=(n,a,b)=>Math.max(a,Math.min(b,n));
  function candles(raw,seconds,asOf) {
    if (!Array.isArray(raw)||!finite(asOf)||!TF||!seconds) return [];
    const byTime=new Map();
    for(const value of raw){
      const time=Number(value.time),open=Number(value.open),high=Number(value.high),
            low=Number(value.low),close=Number(value.close),volume=Number(value.volume);
      if(![time,open,high,low,close,volume].every(finite) ||
         !Number.isInteger(time)||time%seconds!==0||time+seconds>asOf||
         low<=0||volume<0||low>high||open<low||open>high||close<low||close>high)continue;
      byTime.set(time,{time,open,high,low,close,volume});
    }
    const sorted=[...byTime.values()].sort((a,b)=>a.time-b.time);
    // A gap breaks the reliable structural history. Never bridge missing bars.
    let start=0;
    for(let i=1;i<sorted.length;i++)if(sorted[i].time-sorted[i-1].time!==seconds)start=i;
    return sorted.slice(start);
  }
  function structure(raw,seconds,asOf) {
    const bars=candles(raw,seconds,asOf);
    const last=bars.at(-1),age=last?asOf-(last.time+seconds):Infinity;
    if(!last||bars.length<36||age>seconds*2+60)
      return {status:'NO_DATA',reason:'Недостаточно свежих последовательных закрытых свечей',
        bars:bars.length,ageSeconds:finite(age)?age:null};
    const highs=[],lows=[];
    for(let i=CONFIRM;i<bars.length-CONFIRM;i++){
      const row=bars[i],neighbors=bars.slice(i-CONFIRM,i).concat(bars.slice(i+1,i+CONFIRM+1));
      const knownAt=bars[i+CONFIRM].time+seconds;
      if(knownAt>asOf)continue;
      if(neighbors.every(x=>x.high<row.high))highs.push({price:row.high,at:row.time,knownAt});
      if(neighbors.every(x=>x.low>row.low))lows.push({price:row.low,at:row.time,knownAt});
    }
    const h=highs.slice(-2),l=lows.slice(-2);
    let shape='MIXED',dir=0;
    if(h.length>=2&&l.length>=2){
      if(h[1].price>h[0].price&&l[1].price>l[0].price){shape='HH/HL';dir=1}
      if(h[1].price<h[0].price&&l[1].price<l[0].price){shape='LH/LL';dir=-1}
    }
    const prior=bars.slice(-7,-1),momentum=sign(last.close-prior[0].close);
    const lastHigh=highs.at(-1),lastLow=lows.at(-1);
    const confirmedBOS=lastHigh&&last.close>lastHigh.price&&
      lastHigh.knownAt<=last.time?'UP':lastLow&&last.close<lastLow.price&&
      lastLow.knownAt<=last.time?'DOWN':'NONE';
    const phase=dir===1&&momentum<0?'CORRECTION':
      dir===-1&&momentum>0?'CORRECTION':
      dir===0?'BALANCE':'TREND';
    return {status:'READY',dir,shape,phase,momentum,bos:confirmedBOS,close:last.close,
      asOf:last.time+seconds,bars:bars.length,source:'CLOSED_OHLCV'};
  }
  function breadth(raw){
    if(!raw||raw.source==='fallback'||raw.running===false)
      return {status:'NO_DATA',reason:'Ширина рынка не подтверждена'};
    const l=Number(raw.long),s=Number(raw.short),n=Number(raw.neutral),total=Number(raw.available);
    if(![l,s,n,total].every(Number.isInteger)||Math.min(l,s,n)<0||
       total<50||l+s+n!==total)
      return {status:'NO_DATA',reason:'Недостаточная или несогласованная выборка'};
    return {status:'READY',score:bound((l-s)/total*100,-100,100),total,
      source:'REVERSAL_RADAR_PROXY',long:l,short:s,neutral:n};
  }
  function leaders(input,asOf) {
    const bySymbol={},all=[];
    let enough=true,disagreement=false;
    for(const symbol of Object.keys(W)){
      const frames=input?.[symbol]||{};
      const h=structure(frames['1h'],3600,asOf),m=structure(frames['30m'],1800,asOf);
      const valid=h.status==='READY'&&m.status==='READY';
      if(!valid)enough=false;
      const value=valid?(h.dir*.65+m.dir*.35)*100:null;
      if(valid&&h.dir!==0&&m.dir!==0&&h.dir!==m.dir)disagreement=true;
      bySymbol[symbol]={h1:h,m30:m,status:valid?'READY':'NO_DATA',score:value};
      if(valid)all.push(value*W[symbol]);
    }
    const score=enough?all.reduce((a,b)=>a+b,0):null;
    const m30=enough?Object.keys(W).reduce((sum,s)=>sum+W[s]*bySymbol[s].m30.dir,0):null;
    const h1=enough?Object.keys(W).reduce((sum,s)=>sum+W[s]*bySymbol[s].h1.dir,0):null;
    return {status:enough?'READY':'NO_DATA',score,m30,h1,disagreement,bySymbol,
      source:'MEXC_FUTURES_SINGLE_VENUE'};
  }
  function coinState(frames,asOf) {
    const context=structure(frames?.['30m'],1800,asOf),
          local=structure(frames?.['15m'],900,asOf),
          trigger=structure(frames?.['5m'],300,asOf);
    if(context.status!=='READY'||local.status!=='READY')
      return {status:'NO_DATA',label:'NO DATA',context,local,trigger};
    let label='BALANCE';
    if(context.dir!==0&&local.dir===context.dir)
      label=context.dir>0?'BULLISH':'BEARISH';
    else if(context.dir!==0&&local.dir===-context.dir)
      label='CORRECTION';
    else if(context.dir!==0&&local.phase==='CORRECTION')label='CORRECTION';
    else if(context.dir===0&&local.dir!==0)label='SHIFTING';
    return {status:'READY',label,context,local,trigger,
      source:'MEXC_FUTURES_SELECTED_CONTRACT'};
  }
  function alignment(global,coin) {
    if(global.state==='NO_DATA'||coin.status!=='READY')
      return {state:'NO_DATA',text:'Ожидаем подтверждённые данные'};
    if(['BALANCE','NO_DATA'].includes(global.state)||coin.label==='BALANCE')
      return {state:'NEUTRAL',text:'Направление не согласовано'};
    if(global.state==='SHIFTING'||coin.label==='CORRECTION'||coin.label==='SHIFTING')
      return {state:'SHIFTING',text:'Рынок и монета находятся в переходной фазе'};
    const equal=(global.state==='BULLISH'&&coin.label==='BULLISH')||
      (global.state==='BEARISH'&&coin.label==='BEARISH');
    return equal?{state:'ALIGNED',text:'Рынок и монета движутся вместе'}:
      {state:'CONFLICT',text:'Монета движется против глобального контекста'};
  }
  function evaluate(input){
    const asOf=Number(input?.asOf);
    if(!finite(asOf))return {status:'NO_DATA',reason:'Нет времени оценки'};
    const major=leaders(input.leaders,asOf),br=breadth(input.breadth);
    const spot=input.spot;
    const validSpot=spot&&finite(spot.score)&&Math.abs(spot.score)<=100&&
      finite(spot.asOf)&&asOf-spot.asOf>=0&&asOf-spot.asOf<=900&&
      spot.multiVenue===true&&spot.source==='SPOT_TRADE_CVD';
    const available=(major.status==='READY'?.55:0)+(br.status==='READY'?.30:0)+(validSpot?.15:0);
    const score=available>=.55&&major.status==='READY'?
      bound((major.score*.55+
        (br.status==='READY'?br.score*.30:0)+(validSpot?spot.score*.15:0))/available,-100,100):null;
    const conflict=major.status==='READY'&&
      ((major.m30*major.h1<0) || major.disagreement ||
        (br.status==='READY'&&Math.abs(major.score)>25&&Math.abs(br.score)>25&&sign(major.score)!==sign(br.score)));
    const state=score===null?'NO_DATA':conflict?'SHIFTING':
      score>=35?'BULLISH':score<=-35?'BEARISH':'BALANCE';
    const market={state,score,coverage:available,source:'SINGLE_VENUE_PROXY',
      status:score===null?'NO_DATA':available<1?'PARTIAL':'PROXY',
      reason:score===null?'Нужны свежие 1h и 30m свечи BTC, ETH, SOL':
        available<1?'Спотовый CVD и/или breadth отсутствуют; не глобальный индекс':
        'Данные одной фьючерсной биржи не равны всему рынку'};
    const coin=coinState(input.coin,asOf);
    return {asOf,market,leaders:major,breadth:br,spot:validSpot?spot:null,
      coin,alignment:alignment(market,coin),isTradingSignal:false};
  }
  return Object.freeze({evaluate,structure,candles,breadth,coinState,alignment,VERSION:'1.0-proxy',isTradingSignal:false});
});