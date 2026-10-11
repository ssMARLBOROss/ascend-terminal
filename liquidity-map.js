/* ASCEND Liquidity Map V1 — price-display only; no order routing. */
(function (root) {
  'use strict';
  const DAY=86400;
  const UPPER=['YH','ONH','RTH_H','IBH'],LOWER=['YL','ONL','RTH_L','IBL'];
  const valid=v=>Number.isFinite(Number(v))&&Number(v)>0;
  const zone=(level,atr,factor=.3)=>{
    if(!valid(level)||!valid(atr))return null;
    const half=Number(atr)*factor/2;
    return {low:Number(level)-half,high:Number(level)+half};
  };
  const pct=(price,level)=>valid(price)&&valid(level)?(Number(price)/Number(level)-1)*100:null;
  const rowsIn=(rows,from,to,interval)=>{
    const relevant=(rows||[]).filter(x=>Number(x.time)>=from&&Number(x.time)<to)
      .sort((a,b)=>Number(a.time)-Number(b.time));
    if(relevant.length!==(to-from)/interval||
      relevant.some((x,i)=>Number(x.time)!==from+i*interval))return null;
    return relevant;
  };
  const extreme=(rows,side)=>side==='upper'?
    Math.max(...rows.map(x=>Number(x.high))):Math.min(...rows.map(x=>Number(x.low)));
  function newYorkCash(dayUtc){
    const noon=new Date((dayUtc+12*3600)*1000);
    const hour=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',
      hour:'2-digit',hourCycle:'h23'}).formatToParts(noon)
      .find(x=>x.type==='hour')?.value;
    if(hour===undefined)return null;
    const offset=12-Number(hour);
    const open=dayUtc+(offset+9.5)*3600;
    return {open,ibEnd:open+3600,close:dayUtc+(offset+16)*3600};
  }
  function levelsFromHistory(rows15,rows5,asOf,previousDay){
    const last=Number(asOf),day=Math.floor(last/DAY)*DAY;
    const older=(rows15||[]).filter(x=>Number(x.time)+900<=last);
    const data={},meta={};
    function add(key,start,end,side){
      const until=Math.min(end,Math.floor(last/900)*900);
      if(until<=start)return;
      const range=rowsIn(older,start,until,900);
      if(!range)return;
      data[key]=extreme(range,side);
      meta[key]={freezeAt:end};
    }
    const prior=rowsIn(older,day-DAY,day,900);
    if(prior){
      data.YH=extreme(prior,'upper');data.YL=extreme(prior,'lower');
      meta.YH={freezeAt:day};meta.YL={freezeAt:day};
    }
    add('ONH',day,day+6*3600,'upper');
    add('ONL',day,day+6*3600,'lower');
    const ny=newYorkCash(day);
    if(ny){
      add('RTH_H',ny.open,ny.close,'upper');
      add('RTH_L',ny.open,ny.close,'lower');
      add('IBH',ny.open,ny.ibEnd,'upper');
      add('IBL',ny.open,ny.ibEnd,'lower');
    }
    // A complete 5m Wilder ATR(14), not a partial currently forming bar.
    const five=(rows5||[]).filter(x=>Number(x.time)+300<=last).sort((a,b)=>a.time-b.time);
    const tail=five.slice(-90);
    let atr=null;
    if(tail.length>=15&&tail.every((x,i)=>i===0||Number(x.time)===Number(tail[i-1].time)+300)){
      const trs=tail.map((x,i)=>{
        const prev=i?Number(tail[i-1].close):Number(x.open);
        return Math.max(Number(x.high)-Number(x.low),
          Math.abs(Number(x.high)-prev),Math.abs(Number(x.low)-prev));
      });
      atr=trs.slice(0,14).reduce((a,b)=>a+b,0)/14;
      for(let i=14;i<trs.length;i++)atr=(atr*13+trs[i])/14;
      if(!valid(atr))atr=null;
    }
    return {levels:data,meta,atr,day,ny,asOf:last};
  }
  function classify(level,candles,direction,freezeAt,asOf){
    const result={state:Number(asOf)<Number(freezeAt)?'LIVE':'FROZEN'};
    if(result.state==='LIVE'||!valid(level))return result;
    const closed=(candles||[]).filter(x=>Number(x.time)+60>freezeAt&&
      Number(x.time)+60<=asOf).sort((a,b)=>Number(a.time)-Number(b.time));
    let consecutive=0,sweepObserved=false;
    for(const c of closed){
      const high=Number(c.high),low=Number(c.low),close=Number(c.close);
      if(![high,low,close].every(Number.isFinite))continue;
      const beyond=direction==='upper'?high>level:low<level;
      const inside=direction==='upper'?close<level:close>level;
      const time=Number(c.time)+60;
      if(beyond&&!sweepObserved){
        sweepObserved=true;result.sweepAt=time;result.state='SWEEP';
        result.sweepExtreme=direction==='upper'?high:low;consecutive=0;
      }
      if(sweepObserved){
        if(direction==='upper'?high>result.sweepExtreme:low<result.sweepExtreme){
          result.sweepExtreme=direction==='upper'?high:low;
          result.deepestAt=time;
        }
        if(inside){
          consecutive=0;
          if(result.state!=='RECLAIM'){
            result.state='RECLAIM';result.reclaimAt=time;
          }
        }else{
          consecutive++;
          if(consecutive>=2&&result.state!=='ACCEPTANCE'){
            result.state='ACCEPTANCE';result.acceptanceAt=time;
          }
        }
      }
    }
    if(sweepObserved){
      result.sweepDepthPct=Math.abs(result.sweepExtreme-level)/level*100;
      result.deepestAt??=result.sweepAt;
    }
    return result;
  }
  function build(input){
    const {price,atr,levels={},meta={},candles=[],atrFactor=.3,asOf=0}=input||{};
    const asLevel=(key,direction)=>{
      const level=Number(levels[key]),freezeAt=Number(meta[key]?.freezeAt||0);
      if(!valid(level)||!freezeAt)return null;
      return {key,level,distancePct:pct(price,level),zone:zone(level,atr,atrFactor),
        side:direction,...classify(level,candles,direction,freezeAt,asOf)};
    };
    const uppers=UPPER.map(k=>asLevel(k,'upper')).filter(Boolean);
    const lowers=LOWER.map(k=>asLevel(k,'lower')).filter(Boolean);
    const upper=uppers.filter(x=>x.level>=price).sort((a,b)=>a.level-b.level)[0]||
      [...uppers].sort((a,b)=>Math.abs(a.level-price)-Math.abs(b.level-price))[0];
    const lower=lowers.filter(x=>x.level<=price).sort((a,b)=>b.level-a.level)[0]||
      [...lowers].sort((a,b)=>Math.abs(a.level-price)-Math.abs(b.level-price))[0];
    return {upper,lower,all:{uppers,lowers},asOf};
  }
  function draw(ctx,bounds,priceToY,map){
    if(!ctx||!map||typeof priceToY!=='function')return;
    const {left=0,right=ctx.canvas.width}=bounds||{};
    const unique=[...map.all.uppers,...map.all.lowers];
    ctx.save();ctx.font='700 11px system-ui,sans-serif';
    for(const item of unique){
      const y=priceToY(item.level);if(!Number.isFinite(y))continue;
      const color=item.side==='upper'?'rgba(244,108,126,.58)':'rgba(59,211,154,.56)';
      ctx.strokeStyle=color;ctx.lineWidth=1;ctx.setLineDash(item.state==='LIVE'?[2,5]:[5,5]);
      ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
    }
    ctx.setLineDash([]);
    for(const [item,color] of [[map.upper,'rgba(247,77,104,.17)'],
                                [map.lower,'rgba(29,207,137,.16)']]){
      if(!item)continue;
      const p1=item.zone&&priceToY(item.zone.high),p2=item.zone&&priceToY(item.zone.low);
      const y=priceToY(item.level);
      if(!Number.isFinite(y))continue;
      if(Number.isFinite(p1)&&Number.isFinite(p2)){
        ctx.fillStyle=color;
        ctx.fillRect(left,Math.min(p1,p2),right-left,Math.max(4,Math.abs(p2-p1)));
      }
      ctx.strokeStyle=item.side==='upper'?'#ff788c':'#64e8b2';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();
      const label=(item.side==='upper'?'BSL ':'SSL ')+item.key+' · '+item.state+
        ' · '+(item.distancePct>=0?'+':'')+item.distancePct.toFixed(2)+'%';
      ctx.font='800 12px system-ui,sans-serif';
      const tw=ctx.measureText(label).width+12;
      const x=Math.max(left+6,right-tw-9),atY=Math.max(18,y-10);
      ctx.fillStyle='rgba(4,17,27,.92)';ctx.fillRect(x,atY-13,tw,19);
      ctx.fillStyle=item.side==='upper'?'#ffa0ac':'#9bf2c9';
      ctx.fillText(label,x+6,atY,Math.max(20,right-x-13));
      if(Number.isFinite(item.sweepDepthPct)){
        const d='SWEEP '+item.sweepDepthPct.toFixed(2)+'% · '+
          new Date(item.sweepAt*1000).toISOString().slice(11,16)+' UTC';
        ctx.font='700 11px system-ui,sans-serif';ctx.fillText(d,x+6,atY+16);
      }
    }
    ctx.restore();
  }
  root.AscendLiquidityMap=Object.freeze({
    zone,pct,newYorkCash,levelsFromHistory,classify,build,draw
  });
})(typeof window!=='undefined'?window:globalThis);
