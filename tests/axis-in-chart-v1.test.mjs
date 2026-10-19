import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');
const block = html.match(/<script id="ascAxisChartScriptV1">([\s\S]*?)<\/script>/);
assert.ok(block,'Integrated chart script must be embedded in index.html');
const js=block[1];

test('embedded chart module is syntactically valid',()=>{
  assert.doesNotThrow(()=>new vm.Script(js));
});
test('all 20 research categories live inside the existing chart without duplicates',()=>{
  const ids=[...js.matchAll(/\{id:'([^']+)',group:'([^']+)'/g)];
  assert.equal(ids.length,20);
  assert.equal(new Set(ids.map(x=>x[1])).size,20);
  assert.deepEqual([...new Set(ids.map(x=>x[2]))],
    ['Рынок','График','Поток','Позиции','Капитал','Риск']);
  assert.match(js,/\$\('chartShell'\)/);
  assert.match(js,/\$\('tfBar'\)/);
  assert.match(js,/dock\.hidden=true/);
});
test('no import from AXIS or trading engine modification',()=>{
  assert.match(js,/ASCEND_GLOBAL_BIAS_LAST/);
  assert.match(js,/ASCEND_SMC_UI_V1/);
  assert.match(js,/\/api\/v2\/research\/market-participation\?symbol=/);
  assert.doesNotMatch(js,/\b(?:POST|PUT|PATCH|DELETE)\b/);
  assert.doesNotMatch(js,/\/api\/v2\/admin\//);
  assert.doesNotMatch(js,/\b(?:ENTER_READY|executeOrder|sendOrder|placeOrder)\s*\(/);
  assert.match(js,/NO DATA/);
  assert.match(js,/90000/);
  assert.match(js,/if\(!opened\|\|busy\|\|document\.hidden/);
});
test('initialization has no side effects on trade engine',()=>{
  const listeners=[];
  const context={document:{readyState:'loading',addEventListener:(e,cb)=>listeners.push([e,cb])},window:{}};
  vm.runInNewContext(js,context,{timeout:1000});
  assert.equal(listeners.length,1);
  assert.equal(listeners[0][0],'DOMContentLoaded');
});


test('source passport preserves data quality and avoids false real-time claims',()=>{
  assert.match(js,/function sourcePassport\(item,f\)/);
  assert.match(js,/function appendSourcePassport\(detail,item,f\)/);
  assert.match(js,/appendSourcePassport\(detail,selected,f\)/);
  assert.match(js,/ПАСПОРТ ИСТОЧНИКА/);
  assert.match(js,/Источник \(описание\)/);
  assert.match(js,/Покрытие/);
  assert.match(js,/Время обновления/);
  assert.match(js,/получено терминалом/);
  assert.match(js,/метка события источника не подтверждена/);
  assert.match(js,/Временная метка источника не предоставлена/);
  assert.match(js,/Не измерена/);
  assert.match(js,/нет подтверждённого ряда/);
  assert.match(js,/частичные наблюдения, неполная история/);
  assert.match(js,/f\.status!=='NO DATA'&&!!freshFeed\(\)/);
});

test('source passport stays within read-only chart renderer',()=>{
  const passport=js.slice(js.indexOf(' function sourcePassport('),js.indexOf(' function el(tag,klass,text)'));
  assert.ok(passport.length>100);
  assert.doesNotMatch(passport,/\b(?:POST|PUT|PATCH|DELETE)\b/);
  assert.doesNotMatch(passport,/\b(?:fetch|executeOrder|sendOrder|placeOrder)\s*\(/);
  assert.match(passport,/detail\.appendChild\(card\)/);
});
