/* ASCEND Liquidity Map V1 — visual-only overlay. No trade execution. */
(function (root) {
  'use strict';
  function zone(level, atr, factor) {
    if (!Number.isFinite(level) || !Number.isFinite(atr) || atr <= 0) return null;
    const width = atr * (factor == null ? 0.3 : factor);
    return { low: level - width / 2, high: level + width / 2 };
  }
  function pct(price, level) { return Number.isFinite(price) && level > 0 ? (price / level - 1) * 100 : null; }
  function classify(level, candles, direction) {
    if (!Number.isFinite(level) || !Array.isArray(candles) || !candles.length) return 'WAIT';
    const closed = candles.filter(c => c.closed !== false);
    const last = closed[closed.length - 1];
    if (!last) return 'WAIT';
    const swept = closed.some(c => direction === 'upper' ? c.high > level : c.low < level);
    if (!swept) return 'FROZEN';
    const reclaimed = direction === 'upper' ? last.close < level : last.close > level;
    return reclaimed ? 'RECLAIM' : 'ACCEPTANCE';
  }
  function build(input) {
    const { price, atr, levels = {}, candles = [], atrFactor = 0.3 } = input || {};
    const uppers = ['YH','ONH','RTH_H','IBH'].filter(k => Number.isFinite(levels[k]))
      .map(k => ({ key:k, level:levels[k], distancePct:pct(price,levels[k]), zone:zone(levels[k],atr,atrFactor), state:classify(levels[k],candles,'upper') }));
    const lowers = ['YL','ONL','RTH_L','IBL'].filter(k => Number.isFinite(levels[k]))
      .map(k => ({ key:k, level:levels[k], distancePct:pct(price,levels[k]), zone:zone(levels[k],atr,atrFactor), state:classify(levels[k],candles,'lower') }));
    const upper = uppers.filter(x => x.level >= price).sort((a,b)=>a.level-b.level)[0] || uppers.sort((a,b)=>Math.abs(a.level-price)-Math.abs(b.level-price))[0];
    const lower = lowers.filter(x => x.level <= price).sort((a,b)=>b.level-a.level)[0] || lowers.sort((a,b)=>Math.abs(a.level-price)-Math.abs(b.level-price))[0];
    return { upper, lower, all: { uppers, lowers } };
  }
  function draw(ctx, bounds, priceToY, map) {
    if (!ctx || !map || typeof priceToY !== 'function') return;
    const { left=0, right=ctx.canvas.width } = bounds || {};
    for (const [item,color] of [[map.upper,'rgba(244,86,86,0.15)'],[map.lower,'rgba(35,196,146,0.15)']]) {
      if (!item || !item.zone) continue;
      const y1=priceToY(item.zone.high), y2=priceToY(item.zone.low);
      if (!Number.isFinite(y1)||!Number.isFinite(y2)) continue;
      ctx.save();ctx.fillStyle=color;ctx.fillRect(left,Math.min(y1,y2),right-left,Math.abs(y2-y1));
      ctx.strokeStyle=color.replace('0.15','0.85');ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(left,priceToY(item.level));ctx.lineTo(right,priceToY(item.level));ctx.stroke();
      ctx.setLineDash([]);ctx.fillStyle=item===map.upper?'#ff9898':'#6ee7bd';ctx.font='12px sans-serif';
      const distance=Number.isFinite(item.distancePct)?' '+item.distancePct.toFixed(2)+'%':'';
      ctx.fillText(item.key+' · '+item.state+distance,left+8,Math.max(14,Math.min(y1,y2)-5));ctx.restore();
    }
  }
  root.AscendLiquidityMap = Object.freeze({ zone,pct,classify,build,draw });
})(typeof window !== 'undefined' ? window : globalThis);
