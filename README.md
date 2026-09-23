# ASCEND Terminal

Отдельный веб-интерфейс ASCEND. Торговая логика основного бота этим репозиторием не изменяется.

## BASE CORE V1

Основная цепочка терминала:

1D → 4H → 1H TREND → KEY SUPPORT/RESISTANCE → WAIT PRICE AT LEVEL → PRICE REACTION → PIN BAR / ENGULFING / DOJI-context → VOLUME → SMA20/50/200 → BREAK + CLOSE + RETEST (если пробой) → CONFIRMATION → STRUCTURAL SL → NEXT KEY LEVEL TP → R:R ≥ 1:2 → ENTER / WAIT-CHANGE / SKIP.

Frontend получает реальные свечи MEXC через Railway API. Для BASE CORE V1 API поддерживает 5m, 1H, 4H и 1D. Старые MAGNET / SWEEP / CVD / Shadow V2 не участвуют в решении BASE CORE V1.
