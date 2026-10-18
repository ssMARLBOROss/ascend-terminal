import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../src/',import.meta.url);
const file=(path)=>readFileSync(new URL(path,root),'utf8');
test('planned execution exchange uses real accessible selection buttons in Russian',()=>{
 const ui=file('StableMarketApp.tsx');
 assert.match(ui,/БИРЖА ДЛЯ СДЕЛКИ/);
 assert.match(ui,/asc-planned-venue-options/);
 assert.match(ui,/PLANNED_VENUES\.map\(venue=><button/);
 assert.match(ui,/aria-pressed=\{plannedVenue===venue\}/);
 assert.match(ui,/onClick=\{\(\)=>setPlannedVenue\(venue\)\}/);
 assert.match(ui,/ascend\.planned\.venue\.v1/);
 assert.doesNotMatch(ui,/<select id="asc-planned-venue"/);
 assert.match(ui,/График не переключается/);
});
test('trading plan venue appears near core decision without modifying calculations',()=>{
 const ui=file('components/FocusDecisionPanel.tsx');
 const pos=ui.indexOf('asc-focus-decision-lead');
 const matrix=ui.indexOf('asc-confirmation-13');
 const venue=ui.indexOf('className="asc-planned-decision-venue"');
 assert.ok(pos>=0&&venue>pos&&matrix>venue);
 assert.equal(ui.split('className="asc-planned-decision-venue"').length-1,1);
 assert.match(ui,/decision\.checks\.filter\(c=>c\.state==='OK'\)\.length/);
 assert.match(ui,/decision\.status==='ENTRY READY'/);
});
test('live spread displays paired executable quote values, not demo values',()=>{
 const spread=file('components/FocusStudiesStrip.tsx');
 assert.match(spread,/spread\.buyAsk/);
 assert.match(spread,/spread\.sellBid/);
 assert.match(spread,/spread\.grossPct/);
 assert.match(spread,/spread\.grossUsdtPerCoin/);
 assert.match(spread,/НЕТ ДАННЫХ/);
 assert.doesNotMatch(spread,/81[ ,]517[,\.]3/);
 assert.match(spread,/Без комиссий и проскальзывания/);
});
test('responsive compact panel styles and Russian session labels exist',()=>{
 const css=file('ascend-focus-v1.css');
 assert.match(css,/asc-planned-venue-option\.active/);
 assert.match(css,/asc-focus-decision-lead/);
 assert.match(css,/asc-focus-spread-prices/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(file('components/FocusSessionStrip.tsx'),/ТОРГОВЫЕ СЕССИИ/);
});