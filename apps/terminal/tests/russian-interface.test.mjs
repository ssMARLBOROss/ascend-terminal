import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ruStatus,ruExplanation} from '../src/market/ruInterface.ts';

const root=new URL('../',import.meta.url);
const file=(name)=>readFileSync(new URL('src/'+name,root),'utf8');
test('Russian is the default language and trading identifiers stay machine-readable',()=>{
 const index=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(index,/<html lang="ru">/);
 assert.match(index,/ASCEND — Торговый терминал/);
 assert.equal(ruStatus('SHIFTING'),'СМЕНА ФАЗЫ');
 assert.equal(ruStatus('BULLISH'),'РОСТ');
 assert.equal(ruStatus('BEARISH'),'ПАДЕНИЕ');
 assert.equal(ruStatus('ALIGNED'),'СОВПАДАЮТ');
 assert.equal(ruStatus('ENTRY READY'),'ВХОД ПОДТВЕРЖДЁН');
 assert.equal(ruStatus('WAIT'),'ОЖИДАНИЕ');
 assert.equal(ruStatus('NO_DATA'),'НЕТ ДАННЫХ');
 assert.equal(ruStatus('UNKNOWN_LABEL'),'UNKNOWN_LABEL');
 assert.match(ruExplanation('WAIT after SWEEP / RECLAIM'),/ОЖИДАНИЕ after СНЯТИЕ ЛИКВИДНОСТИ/);
});
test('visible Russian labels exist on the main page, decision, and market context',()=>{
 assert.match(file('StableMarketApp.tsx'),/ФОКУС · 1 ЭКРАН/);
 assert.match(file('StableMarketApp.tsx'),/ПОДРОБНО · АНАЛИТИКА/);
 assert.match(file('StableMarketApp.tsx'),/БИРЖА ДЛЯ СДЕЛКИ/);
 assert.match(file('components/MarketBiasOverlay.tsx'),/ruStatus\(data.market\)/);
 assert.match(file('components/MarketBiasOverlay.tsx'),/ruStatus\(data.coin\)/);
 assert.match(file('components/MarketBiasOverlay.tsx'),/ruStatus\(data.alignment\)/);
 const decision=file('components/FocusDecisionPanel.tsx');
 assert.match(decision,/ТОРГОВОЕ РЕШЕНИЕ/);
 assert.match(decision,/ПОДТВЕРЖДЕНИЕ · 13 ПЕРИОДОВ/);
 assert.match(decision,/ruStatus\(decision.status\)/);
});
test('research and metrics headings are understandable Russian texts',()=>{
 assert.match(file('components/FocusStudiesStrip.tsx'),/ОТКРЫТЫЙ ИНТЕРЕС/);
 assert.match(file('components/FocusStudiesStrip.tsx'),/СПРЕД/);
 assert.match(file('components/RadarView.tsx'),/УМНЫЙ РАДАР/);
 assert.match(file('components/LiquidityDecisionPanel.tsx'),/КАРТА ЛИКВИДНОСТИ/);
 assert.match(file('components/TrendStructurePanel.tsx'),/СТРУКТУРА · ТРЕНД · НАПРАВЛЕНИЕ/);
 assert.match(file('components/MexcWorkspace.tsx'),/БЕССРОЧНЫЕ ФЬЮЧЕРСЫ/);
});