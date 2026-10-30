# ASCEND Terminal

Отдельный веб-интерфейс ASCEND. Торговая логика основного бота этим репозиторием не изменяется.

## BASE CORE V1

Основная цепочка терминала:

1D → 4H → 1H TREND → KEY SUPPORT/RESISTANCE → WAIT PRICE AT LEVEL → PRICE REACTION → PIN BAR / ENGULFING / DOJI-context → VOLUME → SMA20/50/200 → BREAK + CLOSE + RETEST (если пробой) → CONFIRMATION → STRUCTURAL SL → NEXT KEY LEVEL TP → R:R ≥ 1:2 → ENTER / WAIT-CHANGE / SKIP.

Frontend получает реальные свечи MEXC через Railway API. Для BASE CORE V1 API поддерживает 5m, 1H, 4H и 1D. Старые MAGNET / SWEEP / CVD / Shadow V2 не участвуют в решении BASE CORE V1.

## SMC Target Liquidit (read-only chart study)

Внутри графика находится единый исследовательский инструмент с тремя переключателями (все OFF по умолчанию):

- Ликвидность: подтверждённые pivot 10 слева / 10 справа, не более пяти не снятых линий. Цвета по окнам Asia 20:00–00:00, London 02:00–05:00, NY AM 08:30–11:00 в **фиксированном UTC−4**. Это исследовательские окна из настроек пользователя, не полные часы сессий; DST не применяется.
- Структура: внутренние swing-pivot 3/3 и внешние 25/25, HH/HL/LH/LL, исследовательские BOS/CHOCH только по закрытым свечам.
- Order Blocks: до десяти **кандидатных** зон последней противоположной свечи перед внешним подтверждённым пробоем; это не точный алгоритм Mxwll.

Данные — уже загруженные свечи MEXC OHLCV выбранной пары и ТФ. Проверяются непрерывность, полное закрытие, актуальность и наличие подтверждающих правых свечей. Недостоверные данные дают NO DATA. У каждого события отделены время экстремума и момент, когда он стал известен.

Это нативный исследовательский аналог, **не копия** Pine Script сторонних индикаторов. Отдельный canvas, никаких изменений Structure Engine, Confirmation, ENTRY READY, SL/TP, PAPER или реальных ордеров.


### Radar zones · nearest confirmed 2–3 (Research V1)

The **SMC Target Liquidit** panel now includes **Радар зон · 2–3 ближайшие · ATR14 (30m)**,
OFF by default, together with the existing three independent visual layers.
The radar uses only already loaded MEXC 30m and 5m closed OHLCV candles;
the 30m series comes from complete 15m aggregation. Strict source validation,
staleness and gaps cause \`NO DATA\` instead of simulated levels.

Candidate levels, and **the earliest time each becomes available**, are:
- 30m confirmed swing highs/lows (3 closed bars on the right; no backdated alerts);
- YH/YL of the fully complete **previous UTC day**;
- high/low of **completed** UTC Asia (00–08), London (07–16) and New York (13–22) windows,
  only when every 30m candle exists.

Nearby same-side levels are grouped (within 0.25 × 30m ATR14); each zone spans
its anchor ±0.25 × ATR14. Only the **nearest up to three** zones appear, with
source, distance, trend alignment and a **descriptive** 1–4 evidence score
(not statistical success probability). The tracking states are:

- ОЖИДАНИЕ (no recent contact);
- ГОРЯЧЕЕ НАБЛЮДЕНИЕ (touch/nearby);
- СНЯТИЕ? · ждём возврата (possible sweep, **not** yet a confirmed reclaim);
- ВОЗВРАТ · проверка структуры (closed 5m candle reclaims the anchor);
- РЕАКЦИЯ ПОДТВЕРЖДЕНА · только анализ (5m closed break after reclaim plus
  reclaim volume ≥1.5× the previous 20 5m candles).

NO state is an order, ENTRY READY, risk change or advice to place a trade.
No promise of coverage when there are fewer than 2 confirmed zones.
Use BingX GOLD(XAU) separately; this radar cannot replace that venue's execution data.
