import type {Candle} from '@ascend/contracts';

export type LevelSide='UPPER'|'LOWER';
export type ObservedLevel={id:string;price:number;side:LevelSide;availableFrom:number};
export type LevelMoment={kind:'TOUCH'|'SWEEP'|'RECLAIM';at:number;price:number};
export type LevelChronology={id:string;level:number;side:LevelSide;
  touch?:LevelMoment;sweep?:LevelMoment;reclaim?:LevelMoment;events:LevelMoment[]};

/** Uses only complete 1m OHLC after each level became historically knowable.
 * A wick beyond a level and close back inside is labelled SWEEP on candle CLOSE.
 * Intraminute order of events is unknowable from OHLC. Touches are throttled
 * to reduce noise; a reclaim requires a previous CLOSED candle beyond the level.
 * This is observation only, never a tradable CORE confirmation.
 */
export function deriveLevelChronology(
  bars:Candle[],levels:ObservedLevel[],asOf:number
):LevelChronology[]{
  const closed=[...bars].filter(c=>c.timestamp+60000<=asOf&&
    Number.isFinite(c.timestamp)&&Number.isFinite(c.open)&&
    Number.isFinite(c.high)&&Number.isFinite(c.low)&&
    Number.isFinite(c.close)&&c.low>0&&c.high>=c.low&&
    c.open>=c.low&&c.open<=c.high&&c.close>=c.low&&c.close<=c.high)
    .sort((a,b)=>a.timestamp-b.timestamp);
  return levels.filter(l=>Number.isFinite(l.price)&&l.price>0&&
    Number.isFinite(l.availableFrom)).map(level=>{
    const result:LevelChronology={id:level.id,level:level.price,side:level.side,events:[]};
    const rows=closed.filter(c=>c.timestamp>=level.availableFrom);
    let lastTouch=-Infinity;
    for(let i=0;i<rows.length;i++){
      const c=rows[i],prior=rows[i-1];
      // The timestamp is candle CLOSE, not an invented intra-candle contact time.
      const at=c.timestamp+60000,p=level.price;
      const outside=(v:number)=>level.side==='UPPER'?v>p:v<p;
      const wickBeyond=level.side==='UPPER'?c.high>p:c.low<p;
      const rejection=wickBeyond&&!outside(c.close)&&(!prior||!outside(prior.close));
      const reclaim=!!prior&&outside(prior.close)&&!outside(c.close);
      const touching=c.low<=p&&c.high>=p;
      const emit=(kind:LevelMoment['kind'])=>{
        const ev:LevelMoment={kind,at,price:c.close};
        result.events.push(ev);
        if(kind==='TOUCH')result.touch=ev;
        if(kind==='SWEEP')result.sweep=ev;
        if(kind==='RECLAIM')result.reclaim=ev;
      };
      // A wick touch and a sweep can happen on the same CLOSED minute.
      // Both are timestamped at its close, with no invented tick sequence.
      if(touching&&at-lastTouch>=10*60000){emit('TOUCH');lastTouch=at}
      if(reclaim)emit('RECLAIM');
      else if(rejection)emit('SWEEP');
    }
    result.events=result.events.slice(-12);
    return result;
  });
}
