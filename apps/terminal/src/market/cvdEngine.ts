/**
 * ASCEND CVD Engine — exact aggressor classification of PUBLIC websocket fills.
 * Completeness is ONLY guaranteed inside one uninterrupted, subscribed session.
 * Every reconnect opens a fresh segment. Never bridge unknown trade gaps.
 */
export type CvdInterval='1m'|'5m'|'15m';
export type CvdHealth='CONNECTING'|'LIVE'|'GAP'|'STALE';
export type CvdTrade={id:string;symbol:string;time:number;price:number;quantity:number;side:'Buy'|'Sell'};
export type CvdBar={
  start:number;buyVolume:number;sellVolume:number;
  buyNotional:number;sellNotional:number;trades:number;
  openPrice:number;closePrice:number;firstTradeAt:number;lastTradeAt:number;
};
export type CvdSegment={
  id:string;symbol:string;startedAt:number;lastTradeAt:number;
  lastReceivedAt:number;health:CvdHealth;gapReason?:string;
  buyVolume:number;sellVolume:number;buyNotional:number;sellNotional:number;
  trades:number;bars:CvdBar[];trimmedDelta:number;
};
export type CvdSnapshot=CvdSegment&{
  volumeDelta:number;notionalDelta:number;
  interval:CvdInterval;points:CvdPoint[];
  signal:'PRICE_UP_DELTA_DOWN'|'PRICE_DOWN_DELTA_UP'|'ALIGNED'|'NO_DATA';
};
export type CvdPoint={
  time:number;delta:number;cumulative:number;buyVolume:number;sellVolume:number;
  trades:number;openPrice:number;closePrice:number;isClosed:boolean;
};

const ms:Record<CvdInterval,number>={'1m':60000,'5m':300000,'15m':900000};
export function createCvdSegment(symbol:string,at:number,reason?:string):CvdSegment{
  return {symbol,id:symbol+':'+at,startedAt:at,lastTradeAt:0,lastReceivedAt:0,
    health:'CONNECTING',gapReason:reason,buyVolume:0,sellVolume:0,
    buyNotional:0,sellNotional:0,trades:0,bars:[],trimmedDelta:0};
}
export function parseTradeFrame(body:unknown,symbol:string):CvdTrade[]{
  const frame=body as {topic?:unknown;data?:unknown};
  if(frame?.topic!=='publicTrade.'+symbol||!Array.isArray(frame.data))return [];
  return frame.data.flatMap((raw:unknown)=>{
    const x=raw as Record<string,unknown>;
    const id=x?.i,side=x?.S,time=Number(x?.T),price=Number(x?.p),quantity=Number(x?.v);
    if(x?.s!==symbol||typeof id!=='string'||!id||side!=='Buy'&&side!=='Sell'||
      !Number.isSafeInteger(time)||time<=0||!Number.isFinite(price)||price<=0||
      !Number.isFinite(quantity)||quantity<=0)return [];
    return [{id,symbol,time,price,quantity,side:side as 'Buy'|'Sell'}];
  }).sort((a:CvdTrade,b:CvdTrade)=>a.time-b.time||a.id.localeCompare(b.id));
}
/** Mutable engine core, called only from a websocket handler. State snapshots cloned for React. */
export class CvdAccumulator{
  segment:CvdSegment;
  private seen=new Map<string,number>();
  private lastTime=0;
  constructor(symbol:string,startedAt:number,reason?:string){
    this.segment=createCvdSegment(symbol,startedAt,reason);
  }
  add(trades:CvdTrade[],receivedAt:number){
    let applied=0;
    for(const tr of trades){
      if(tr.symbol!==this.segment.symbol||this.seen.has(tr.id)||tr.time>receivedAt+30000)continue;
      // Delayed packets > 2s behind the latest processed timestamp break
      // temporal correctness; mark a gap rather than reordering historic bars.
      if(this.lastTime&&tr.time<this.lastTime-2000){
        this.segment.health='GAP';
        this.segment.gapReason='OUT_OF_ORDER_TRADES';
        break;
      }
      this.seen.set(tr.id,tr.time);
      if(this.seen.size>25000){
        const old=this.seen.keys().next().value;
        if(old!==undefined)this.seen.delete(old);
      }
      const index=Math.floor(tr.time/60000)*60000;
      const last=this.segment.bars.at(-1);
      if(last&&index<last.start){
        // Late event within a 2s reorder tolerance may belong to the previous
        // minute; do not silently corrupt the cumulative bar totals.
        this.segment.health='GAP';
        this.segment.gapReason='MINUTE_ORDER_UNCERTAIN';
        break;
      }
      let bar:CvdBar;
      if(!last||last.start!==index){
        bar={start:index,buyVolume:0,sellVolume:0,buyNotional:0,
          sellNotional:0,trades:0,openPrice:tr.price,closePrice:tr.price,
          firstTradeAt:tr.time,lastTradeAt:tr.time};
        this.segment.bars.push(bar);
      }else{
        bar=last;
      }
      bar.closePrice=tr.price;
      bar.lastTradeAt=Math.max(bar.lastTradeAt,tr.time);
      bar.trades++;
      const notional=tr.quantity*tr.price;
      if(tr.side==='Buy'){
        bar.buyVolume+=tr.quantity;bar.buyNotional+=notional;
        this.segment.buyVolume+=tr.quantity;this.segment.buyNotional+=notional;
      }else{
        bar.sellVolume+=tr.quantity;bar.sellNotional+=notional;
        this.segment.sellVolume+=tr.quantity;this.segment.sellNotional+=notional;
      }
      this.segment.trades++;
      this.lastTime=Math.max(this.lastTime,tr.time);
      this.segment.lastTradeAt=this.lastTime;
      applied++;
      // Retain ~8 hours of fine-grain bars, but not enough to imply 24/7 history.
      if(this.segment.bars.length>480){
        const removed=this.segment.bars.splice(0,this.segment.bars.length-480);
        this.segment.trimmedDelta+=removed.reduce(
          (sum,b)=>sum+b.buyVolume-b.sellVolume,0);
      }
    }
    if(applied>0){
      this.segment.lastReceivedAt=receivedAt;
      if(this.segment.health==='CONNECTING')this.segment.health='LIVE';
    }
    return applied;
  }
  gap(reason:string){
    this.segment.health='GAP';
    this.segment.gapReason=reason;
  }
  snapshot(interval:CvdInterval,now:number):CvdSnapshot{
    const copy=this.segment;
    const size=ms[interval],bars:Map<number,CvdPoint>=new Map();
    // Since the accumulator truncates old 1m bars, raw volume totals are still
    // valid for the full segment but plotted cumulatives must be tagged "visible".
    let cumulative=copy.trimmedDelta;
    for(const b of copy.bars){
      const t=Math.floor(b.start/size)*size;
      let p=bars.get(t);
      if(!p){
        p={time:t,delta:0,cumulative:0,buyVolume:0,sellVolume:0,trades:0,
          openPrice:b.openPrice,closePrice:b.closePrice,
          // The first bucket starts partway through a stream connection.
          // A partially observed bucket cannot validate any divergence.
          isClosed:t+size<=now&&t>=Math.ceil(copy.startedAt/size)*size};
        bars.set(t,p);
      }
      p.buyVolume+=b.buyVolume;p.sellVolume+=b.sellVolume;p.trades+=b.trades;
      p.delta=p.buyVolume-p.sellVolume;
      p.closePrice=b.closePrice;
    }
    const points=[...bars.values()].sort((a,b)=>a.time-b.time);
    for(const p of points){cumulative+=p.delta;p.cumulative=cumulative;}
    const lastTwo=points.filter(p=>p.isClosed).slice(-2);
    let signal:CvdSnapshot['signal']='NO_DATA';
    if(lastTwo.length===2&&lastTwo[1].time-lastTwo[0].time===size){
      const priceChange=lastTwo[1].closePrice-lastTwo[0].closePrice;
      const deltaTrend=lastTwo[1].delta-lastTwo[0].delta;
      if(priceChange>0&&deltaTrend<0)signal='PRICE_UP_DELTA_DOWN';
      else if(priceChange<0&&deltaTrend>0)signal='PRICE_DOWN_DELTA_UP';
      else if(priceChange!==0&&deltaTrend!==0)signal='ALIGNED';
    }
    const health=copy.health==='LIVE'&&
      copy.lastReceivedAt&&now-copy.lastReceivedAt>90000?'STALE':copy.health;
    return {...copy,health,bars:copy.bars.slice(),points,interval,
      volumeDelta:copy.buyVolume-copy.sellVolume,
      notionalDelta:copy.buyNotional-copy.sellNotional,signal};
  }
}
