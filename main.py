from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes

logging.basicConfig(
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    level=logging.INFO,
)

logger = logging.getLogger("ssmarlboross")

MEXC_BASE_URL = "https://contract.mexc.com"
MEXC_KLINE_URL = MEXC_BASE_URL + "/api/v1/contract/kline/{symbol}"
MEXC_TICKER_URL = MEXC_BASE_URL + "/api/v1/contract/ticker"
MEXC_DEALS_URL = MEXC_BASE_URL + "/api/v1/contract/deals/{symbol}"

SYMBOLS = {
    "BTC_USDT",
    "ETH_USDT",
    "SOL_USDT",
    "XRP_USDT",
    "BNB_USDT",
    "DOGE_USDT",
    "ADA_USDT",
    "SUI_USDT",
    "LINK_USDT",
    "AVAX_USDT",
    "LTC_USDT",
    "TRB_USDT",
}

TIMEFRAMES = {
    "1m": ("Min1", 60),
    "5m": ("Min5", 300),
    "15m": ("Min15", 900),
    "1h": ("Min60", 3600),
}

# HTML is stored and served strictly as UTF-8.
UTF8_BOM = b"\xef\xbb\xbf"

INDEX_HTML = r"""<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1,viewport-fit=cover"
  >
  <meta name="theme-color" content="#090c12">
  <title>ssMarlboross Live</title>

  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script src="https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js"></script>

  <style>
    :root {
      color-scheme: dark;
      --bg: #090c12;
      --card: #141923;
      --card2: #1b2230;
      --line: #2c3546;
      --text: #f4f7fb;
      --muted: #98a2b1;
      --green: #27ca88;
      --red: #ff6175;
      --yellow: #ffbd55;
      --blue: #6ba6ff;
      --purple: #a57aff;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      color: var(--text);
      background:
        radial-gradient(circle at top right, rgba(107,166,255,.12), transparent 32%),
        radial-gradient(circle at top left, rgba(165,122,255,.10), transparent 30%),
        var(--bg);
      font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    button, select { font: inherit; }

    .app {
      max-width: 1500px;
      margin: 0 auto;
      padding: max(12px, env(safe-area-inset-top)) 12px 28px;
    }

    .card {
      background: rgba(20,25,35,.97);
      border: 1px solid var(--line);
      border-radius: 18px;
      box-shadow: 0 14px 36px rgba(0,0,0,.24);
    }

    .header {
      padding: 16px;
      margin-bottom: 12px;
    }

    .brand {
      color: var(--blue);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .14em;
    }

    h1 {
      margin: 6px 0;
      font-size: 30px;
    }

    .subtitle {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }

    .controls {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 14px;
    }

    select, button {
      min-height: 44px;
      color: var(--text);
      background: var(--card2);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 0 10px;
    }

    .direction {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    button.active {
      border-color: var(--blue);
      background: rgba(107,166,255,.15);
    }

    .long.active {
      border-color: var(--green);
      background: rgba(39,202,136,.14);
    }

    .short.active {
      border-color: var(--red);
      background: rgba(255,97,117,.14);
    }

    .tf {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-top: 9px;
    }

    .prices {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-top: 12px;
    }

    .metric {
      padding: 10px;
      background: var(--card2);
      border: 1px solid var(--line);
      border-radius: 13px;
    }

    .metric small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .metric strong {
      font-size: 17px;
    }

    .intelligence-card {
      margin-top: 12px;
      padding: 17px;
      border-radius: 17px;
      border: 1px solid var(--line);
      background:
        radial-gradient(circle at right top, rgba(165,122,255,.13), transparent 34%),
        rgba(20,25,35,.99);
    }

    .intelligence-head {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: center;
    }

    .intelligence-score {
      margin-top: 5px;
      font-size: 40px;
      line-height: 1;
      font-weight: 950;
    }

    .intelligence-trend {
      min-width: 145px;
      padding: 11px;
      text-align: center;
      border-radius: 13px;
      background: var(--card2);
      border: 1px solid var(--line);
    }

    .intelligence-trend small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .intelligence-trend strong {
      font-size: 17px;
    }

    .signal-chart {
      width: 100%;
      height: 90px;
      margin-top: 12px;
      display: block;
      border-radius: 12px;
      background: rgba(0,0,0,.13);
      border: 1px solid var(--line);
    }

    .intelligence-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
      margin-top: 12px;
    }

    .intelligence-component {
      padding: 10px;
      border-radius: 12px;
      background: var(--card2);
      border: 1px solid var(--line);
    }

    .intelligence-component small {
      display: block;
      color: var(--muted);
      margin-bottom: 5px;
    }

    .intelligence-component strong {
      font-size: 15px;
    }

    .component-track {
      height: 7px;
      margin-top: 7px;
      overflow: hidden;
      border-radius: 999px;
      background: #090c12;
      border: 1px solid var(--line);
    }

    .component-track div {
      height: 100%;
      width: 0;
      transition: width .25s ease;
      background: linear-gradient(90deg, var(--red), var(--yellow), var(--green));
    }

    .intelligence-explanation {
      margin-top: 12px;
      padding: 12px;
      border-radius: 12px;
      background: rgba(165,122,255,.06);
      border: 1px solid rgba(165,122,255,.20);
      color: #eee8ff;
      font-size: 13px;
      line-height: 1.55;
    }

    .notification-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
      margin-top: 11px;
    }

    .notification-row span {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }

    .notification-row button {
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid rgba(107,166,255,.35);
      background: rgba(107,166,255,.10);
      color: var(--text);
      font-weight: 900;
      cursor: pointer;
    }

    @media (max-width: 900px) {
      .intelligence-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 620px) {
      .intelligence-head,
      .notification-row {
        grid-template-columns: 1fr;
      }

      .intelligence-grid {
        grid-template-columns: 1fr;
      }
    }

    .pro-decision {
      margin-top: 12px;
      padding: 18px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background:
        radial-gradient(circle at right top, rgba(107,166,255,.12), transparent 34%),
        rgba(20,25,35,.99);
    }

    .pro-decision.allowed-long {
      border-color: rgba(39,202,136,.42);
      background:
        radial-gradient(circle at right top, rgba(39,202,136,.16), transparent 34%),
        rgba(20,25,35,.99);
    }

    .pro-decision.allowed-short {
      border-color: rgba(255,97,117,.42);
      background:
        radial-gradient(circle at right top, rgba(255,97,117,.16), transparent 34%),
        rgba(20,25,35,.99);
    }

    .pro-decision.waiting {
      border-color: rgba(255,189,85,.42);
      background:
        radial-gradient(circle at right top, rgba(255,189,85,.14), transparent 34%),
        rgba(20,25,35,.99);
    }

    .pro-decision.blocked {
      border-color: rgba(255,97,117,.34);
    }

    .pro-title {
      color: var(--muted);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .11em;
    }

    .pro-action {
      margin-top: 7px;
      font-size: 42px;
      line-height: 1;
      font-weight: 950;
    }

    .pro-subtitle {
      margin-top: 9px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.55;
    }

    .pro-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-top: 14px;
    }

    .pro-item {
      padding: 10px;
      border-radius: 12px;
      background: var(--card2);
      border: 1px solid var(--line);
    }

    .pro-item small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .pro-item strong {
      font-size: 16px;
    }

    .risk-stars {
      letter-spacing: 2px;
      color: var(--yellow);
    }

    .guard-list {
      display: grid;
      gap: 7px;
      margin-top: 12px;
    }

    .guard-item {
      padding: 9px 10px;
      border-radius: 11px;
      background: var(--card2);
      border: 1px solid var(--line);
      font-size: 12px;
      line-height: 1.45;
    }

    .voice-card {
      margin-top: 12px;
      padding: 15px;
      border-radius: 15px;
      border: 1px solid rgba(165,122,255,.28);
      background: rgba(165,122,255,.07);
    }

    .voice-card strong {
      display: block;
      margin-bottom: 7px;
    }

    .voice-card p {
      margin: 0;
      color: #eee8ff;
      font-size: 13px;
      line-height: 1.6;
    }

    @media (max-width: 720px) {
      .pro-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .pro-action {
        font-size: 34px;
      }
    }

    .cycle-card {
      margin-top: 12px;
      padding: 16px;
      border-radius: 16px;
      border: 1px solid var(--line);
      background:
        radial-gradient(circle at right top, rgba(39,202,136,.10), transparent 32%),
        rgba(20,25,35,.98);
    }

    .cycle-head {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: center;
    }

    .cycle-status {
      margin-top: 5px;
      font-size: 30px;
      line-height: 1.05;
      font-weight: 950;
    }

    .cycle-step {
      min-width: 120px;
      padding: 10px;
      border-radius: 12px;
      text-align: center;
      background: var(--card2);
      border: 1px solid var(--line);
    }

    .cycle-step small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .cycle-step strong {
      font-size: 18px;
    }

    .cycle-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-top: 12px;
    }

    .cycle-item {
      padding: 10px;
      border-radius: 12px;
      background: var(--card2);
      border: 1px solid var(--line);
    }

    .cycle-item small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .cycle-item strong {
      font-size: 15px;
    }

    .cycle-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 12px;
    }

    .cycle-actions button {
      padding: 12px;
      border-radius: 11px;
      border: 1px solid var(--line);
      background: var(--card2);
      color: var(--text);
      font-weight: 900;
      cursor: pointer;
    }

    .cycle-actions button.primary {
      background: rgba(39,202,136,.12);
      border-color: rgba(39,202,136,.40);
    }

    .cycle-actions button:disabled {
      opacity: .45;
      cursor: not-allowed;
    }

    .cycle-note {
      margin-top: 10px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }

    @media (max-width: 720px) {
      .cycle-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .cycle-head {
        grid-template-columns: 1fr;
      }

      .cycle-actions {
        grid-template-columns: 1fr;
      }
    }

    .signal-lifecycle {
      margin-top: 12px;
      padding: 16px;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: rgba(20,25,35,.98);
    }

    .signal-lifecycle-top {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: center;
    }

    .signal-lifecycle h2 {
      margin: 4px 0 0;
      font-size: 34px;
      line-height: 1.05;
    }

    .signal-timer {
      min-width: 110px;
      text-align: center;
      padding: 11px;
      border-radius: 13px;
      background: var(--card2);
      border: 1px solid var(--line);
    }

    .signal-timer small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .signal-timer strong {
      font-size: 24px;
    }

    .signal-missing {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 7px;
      margin-top: 12px;
    }

    .signal-missing div {
      padding: 9px 10px;
      border-radius: 11px;
      background: var(--card2);
      border: 1px solid var(--line);
      font-size: 12px;
      line-height: 1.4;
    }

    .signal-validity {
      margin-top: 10px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }

    @media (max-width: 720px) {
      .signal-missing {
        grid-template-columns: 1fr;
      }

      .signal-lifecycle-top {
        grid-template-columns: 1fr;
      }

      .signal-timer {
        text-align: left;
      }
    }

    .entry-permission {
      margin-top: 12px;
      padding: 16px;
      border-radius: 16px;
      border: 1px solid var(--line);
      background: rgba(20,25,35,.98);
      text-align: center;
    }

    .entry-permission small {
      color: var(--muted);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .10em;
    }

    .entry-permission strong {
      display: block;
      margin-top: 6px;
      font-size: 34px;
      line-height: 1.05;
    }

    .entry-permission p {
      margin: 8px 0 0;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }

    .entry-permission.allowed {
      border-color: rgba(39,202,136,.38);
      background: rgba(39,202,136,.08);
    }

    .entry-permission.prepare {
      border-color: rgba(255,189,85,.38);
      background: rgba(255,189,85,.08);
    }

    .entry-permission.blocked {
      border-color: rgba(255,97,117,.38);
      background: rgba(255,97,117,.08);
    }

    .terminal-shell {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(360px, 430px);
      gap: 12px;
      align-items: start;
      margin-top: 12px;
    }

    .terminal-main {
      min-width: 0;
    }

    .terminal-side {
      display: grid;
      gap: 12px;
      position: sticky;
      top: 10px;
      align-self: start;
    }

    .terminal-side .card {
      margin: 0;
    }

    .terminal-side .manager-card,
    .terminal-side .scenario-card,
    .terminal-side .brain-card {
      margin-bottom: 0;
    }

    .terminal-main .chart-card {
      min-height: 790px;
    }

    .terminal-main #chart {
      height: 680px;
    }

    .terminal-lower {
      display: grid;
      gap: 12px;
      margin-top: 12px;
    }
.side-compact .manager-inputs {
      grid-template-columns: repeat(2, 1fr);
    }

    .side-compact .manager-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .side-compact .manager-actions {
      grid-template-columns: 1fr;
    }

    .side-compact .manager-actions.three {
      grid-template-columns: 1fr;
    }

    .side-compact .scenario-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    @media (max-width: 1050px) {
      .terminal-shell {
        grid-template-columns: 1fr;
      }

      .terminal-side {
        position: static;
      }

      .terminal-main .chart-card {
        min-height: 680px;
      }

      .terminal-main #chart {
        height: 570px;
      }
    }

    @media (max-width: 680px) {
      .terminal-main #chart {
        height: 470px;
      }

      .side-compact .manager-inputs,
      .side-compact .manager-grid,
      .side-compact .scenario-grid {
        grid-template-columns: 1fr;
      }
    }

    .trade-summary-card {
      padding: 15px;
      margin-bottom: 12px;
    }

    .trade-summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-top: 10px;
    }

    .trade-summary-item {
      padding: 10px;
      border-radius: 12px;
      background: var(--card2);
      border: 1px solid var(--line);
    }

    .trade-summary-item small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .trade-summary-item strong {
      font-size: 15px;
    }

    .journal-table {
      display: grid;
      gap: 7px;
      margin-top: 10px;
    }

    .journal-row {
      display: grid;
      grid-template-columns: 80px 80px 1fr 1fr;
      gap: 8px;
      padding: 9px 10px;
      border-radius: 11px;
      background: var(--card2);
      border: 1px solid var(--line);
      font-size: 12px;
      align-items: center;
    }

    .manager-actions.three {
      grid-template-columns: repeat(3, 1fr);
    }

    @media (max-width: 760px) {
      .trade-summary-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .journal-row {
        grid-template-columns: 1fr 1fr;
      }

      .manager-actions.three {
        grid-template-columns: 1fr;
      }
    }

    .manager-card {
      padding: 15px;
      margin-bottom: 12px;
    }

    .manager-inputs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-top: 10px;
    }

    .manager-inputs label {
      display: grid;
      gap: 5px;
      color: var(--muted);
      font-size: 11px;
    }

    .manager-inputs input {
      width: 100%;
      padding: 10px;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: var(--card2);
      color: var(--text);
      outline: none;
    }

    .manager-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-top: 10px;
    }

    .manager-item {
      padding: 10px;
      border-radius: 12px;
      background: var(--card2);
      border: 1px solid var(--line);
    }

    .manager-item small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .manager-item strong {
      font-size: 16px;
    }

    .manager-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 10px;
    }

    .manager-actions button {
      padding: 11px;
      border-radius: 11px;
      border: 1px solid var(--line);
      background: var(--card2);
      color: var(--text);
      font-weight: 900;
      cursor: pointer;
    }

    .manager-actions button.primary {
      border-color: rgba(39,202,136,.35);
      background: rgba(39,202,136,.10);
    }

    .trade-monitor {
      margin-top: 12px;
      padding: 12px;
      border-radius: 13px;
      background: rgba(107,166,255,.07);
      border: 1px solid rgba(107,166,255,.20);
    }

    .trade-monitor.hidden {
      display: none;
    }

    .progress-track {
      height: 10px;
      overflow: hidden;
      border-radius: 999px;
      background: #090c12;
      border: 1px solid var(--line);
      margin-top: 7px;
    }

    .progress-track div {
      height: 100%;
      width: 0;
      background: linear-gradient(90deg, var(--blue), var(--green));
      transition: width .25s ease;
    }

    .monitor-note {
      margin-top: 10px;
      font-size: 12px;
      line-height: 1.5;
      color: #dceaff;
    }

    .scenario-card {
      padding: 15px;
      margin-bottom: 12px;
    }

    .scenario-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-top: 10px;
    }

    .scenario-item {
      padding: 10px;
      border-radius: 12px;
      background: var(--card2);
      border: 1px solid var(--line);
    }
    .scenario-item small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .scenario-item strong {
      font-size: 15px;
    }

    .scenario-conditions {
      display: grid;
      gap: 7px;
      margin-top: 12px;
    }

    .scenario-condition {
      padding: 9px 10px;
      border-radius: 11px;
      background: var(--card2);
      border: 1px solid var(--line);
      font-size: 12px;
      line-height: 1.45;
    }

    .scenario-progress {
      height: 11px;
      margin-top: 10px;
      overflow: hidden;
      border-radius: 999px;
      background: #090c12;
      border: 1px solid var(--line);
    }

    .scenario-progress div {
      height: 100%;
      width: 0;
      transition: width .25s ease;
      background: linear-gradient(90deg, var(--red), var(--yellow), var(--green));
    }

    .brain-card {
      padding: 18px;
      margin-bottom: 12px;
      border: 1px solid var(--line);
      background:
        radial-gradient(circle at right top, rgba(107,166,255,.14), transparent 34%),
        radial-gradient(circle at left bottom, rgba(165,122,255,.08), transparent 32%),
        rgba(20,25,35,.99);
    }

    .brain-top {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 14px;
      align-items: center;
    }

    .brain-kicker {
      color: var(--muted);
      font-size: 11px;
      font-weight: 900;
      letter-spacing: .12em;
    }

    .brain-action {
      margin-top: 5px;
      font-size: 42px;
      line-height: 1;
      font-weight: 950;
    }

    .brain-score {
      min-width: 110px;
      padding: 12px;
      text-align: center;
      border-radius: 15px;
      background: var(--card2);
      border: 1px solid var(--line);
    }

    .brain-score small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .brain-score strong {
      font-size: 29px;
    }

    .brain-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-top: 13px;
    }

    .brain-item {
      padding: 10px;
      border-radius: 12px;
      background: var(--card2);
      border: 1px solid var(--line);
    }

    .brain-item small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .brain-item strong {
      font-size: 15px;
    }

    .brain-explanation {
      margin-top: 12px;
      padding: 13px;
      border-radius: 13px;
      background: rgba(255,255,255,.025);
      border: 1px solid var(--line);
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-line;
    }

    .brain-progress {
      height: 12px;
      overflow: hidden;
      margin-top: 12px;
      border-radius: 999px;
      background: #090c12;
      border: 1px solid var(--line);
    }

    .brain-progress div {
      height: 100%;
      width: 0;
      transition: width .25s ease;
      background: linear-gradient(90deg, var(--red), var(--yellow), var(--green));
    }

    .strategy-card {
      padding: 15px;
      margin-bottom: 12px;
    }

    .readiness-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: center;
      margin-top: 10px;
    }

    .readiness-number {
      font-size: 32px;
      font-weight: 950;
    }

    .readiness-bar {
      height: 12px;
      margin-top: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: #090c12;
      border: 1px solid var(--line);
    }

    .readiness-bar div {
      width: 0;
      height: 100%;
      background: linear-gradient(90deg, var(--red), var(--yellow), var(--green));
      transition: width .25s ease;
    }

    .strategy-checks {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 7px;
      margin-top: 12px;
    }

    .strategy-check {
      padding: 9px 10px;
      border-radius: 11px;
      background: var(--card2);
      border: 1px solid var(--line);
      font-size: 12px;
      line-height: 1.4;
    }

    .mentor-card {
      padding: 15px;
      margin-bottom: 12px;
      background:
        radial-gradient(circle at right top, rgba(165,122,255,.12), transparent 35%),
        rgba(20,25,35,.98);
    }

    .mentor-speech {
      margin-top: 10px;
      padding: 13px;
      border-radius: 13px;
      background: rgba(165,122,255,.07);
      border: 1px solid rgba(165,122,255,.18);
      color: #eee8ff;
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-line;
    }

    .signal-gate {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 7px;
      margin-top: 10px;
    }

    .signal-gate div {
      padding: 9px;
      border-radius: 11px;
      background: var(--card2);
      border: 1px solid var(--line);
      text-align: center;
      font-size: 11px;
    }

    .market-state-card {
      padding: 14px;
      margin-bottom: 12px;
    }

    .market-state-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-top: 10px;
    }

    .market-state-item {
      padding: 10px;
      border-radius: 12px;
      background: var(--card2);
      border: 1px solid var(--line);
    }

    .market-state-item small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .market-state-item strong {
      font-size: 14px;
    }

    .now-banner {
      padding: 16px;
      margin-bottom: 12px;
      border-radius: 18px;
      border: 1px solid var(--line);
      background:
        radial-gradient(circle at right top, rgba(255,189,85,.14), transparent 38%),
        rgba(20,25,35,.98);
      text-align: center;
    }

    .now-banner small {
      color: var(--muted);
      font-weight: 900;
      letter-spacing: .12em;
    }

    .now-banner strong {
      display: block;
      margin-top: 6px;
      font-size: 40px;
      line-height: 1;
    }

    .now-banner span {
      display: block;
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
    }

    .trade-plan {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-top: 10px;
    }

    .trade-plan-item {
      padding: 10px;
      border-radius: 12px;
      background: var(--card2);
      border: 1px solid var(--line);
    }

    .trade-plan-item small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .trade-plan-item strong {
      font-size: 16px;
    }

    .mentor-steps {
      display: grid;
      gap: 7px;
      margin-top: 10px;
    }

    .mentor-step {
      display: grid;
      grid-template-columns: 28px 1fr;
      gap: 8px;
      align-items: start;
      padding: 9px 10px;
      border-radius: 11px;
      background: var(--card2);
      border: 1px solid var(--line);
      font-size: 12px;
      line-height: 1.45;
    }

    .mentor-step b {
      color: var(--yellow);
    }

    .workspace {
      display: grid;
      gap: 12px;
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
    }

    .command-card {
      padding: 15px;
      position: sticky;
      top: 10px;
    }

    .command-section {
      padding: 11px 0;
      border-top: 1px solid var(--line);
    }

    .command-section:first-child {
      border-top: 0;
      padding-top: 0;
    }

    .command-label {
      color: var(--muted);
      font-size: 11px;
      font-weight: 850;
      letter-spacing: .08em;
      margin-bottom: 6px;
    }

    .command-action {
      font-size: 34px;
      font-weight: 950;
      line-height: 1.05;
    }

    .command-sub {
      margin-top: 6px;
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }

    .command-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 8px;
    }

    .command-stat {
      padding: 9px;
      border: 1px solid var(--line);
      border-radius: 11px;
      background: var(--card2);
    }

    .command-stat small {
      display: block;
      color: var(--muted);
      margin-bottom: 3px;
    }

    .command-list {
      display: grid;
      gap: 6px;
      font-size: 12px;
      line-height: 1.4;
    }

    .collapsed-source {
      margin-top: 12px;
      border-top: 1px solid var(--line);
      padding-top: 10px;
    }

    details summary {
      cursor: pointer;
      color: var(--muted);
      font-weight: 800;
      font-size: 12px;
      user-select: none;
    }

    details[open] summary {
      margin-bottom: 8px;
    }

    @media (min-width: 960px) {
      .workspace {
        grid-template-columns: minmax(0, 1.85fr) minmax(330px, .75fr);
      }

      .chart-card {
        min-height: 760px;
      }

      #chart {
        height: 650px;
      }
    }

    .layout {
      display: grid;
      gap: 12px;
    }

    .chart-card {
      padding: 10px;
    }

    .chart-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 5px 5px 10px;
    }

    .big-price {
      font-size: 25px;
      font-weight: 950;
    }

    .timer {
      text-align: right;
    }

    .timer strong {
      display: block;
      font-size: 22px;
      color: var(--yellow);
    }

    .timer small {
      color: var(--muted);
    }

    #chart {
      height: 470px;
      border-radius: 14px;
      overflow: hidden;
      background: #0d1118;
    }

    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding-top: 9px;
      color: var(--muted);
      font-size: 10px;
    }

    .legend span {
      background: var(--card2);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 5px 7px;
    }

    .side {
      display: grid;
      gap: 12px;
      align-content: start;
    }

    .decision {
      padding: 15px;
    }

    .decision-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .score {
      font-size: 34px;
      font-weight: 950;
    }

    .badge {
      padding: 7px 10px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 900;
      background: rgba(255,189,85,.10);
      color: #ffd89d;
    }

    .progress {
      height: 10px;
      margin: 10px 0;
      overflow: hidden;
      background: #090c12;
      border: 1px solid var(--line);
      border-radius: 999px;
    }

    .progress div {
      height: 100%;
      width: 0;
      background: linear-gradient(90deg, var(--red), var(--yellow), var(--green));
    }

    .wait {
      padding: 12px;
      color: #ffd89d;
      background: rgba(255,189,85,.08);
      border-radius: 13px;
      font-weight: 850;
      line-height: 1.45;
    }

    .levels {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 10px;
    }

    .level {
      padding: 10px;
      background: var(--card2);
      border: 1px solid var(--line);
      border-radius: 12px;
    }

    .level small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .explain-card {
      padding: 15px;
    }

    .explain-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 10px;
    }

    .explain-box {
      padding: 12px;
      background: var(--card2);
      border: 1px solid var(--line);
      border-radius: 13px;
    }

    .explain-box h3 {
      margin: 0 0 8px;
      font-size: 13px;
    }

    .explain-list {
      display: grid;
      gap: 6px;
      font-size: 12px;
      line-height: 1.45;
    }

    .market-voice {
      margin-top: 10px;
      padding: 13px;
      border-radius: 13px;
      background: rgba(39,202,136,.06);
      border: 1px solid rgba(39,202,136,.18);
      color: #d9ffef;
      white-space: pre-line;
      font-size: 12px;
      line-height: 1.55;
    }

    .scenario-line {
      padding: 9px 10px;
      border-radius: 11px;
      background: rgba(255,97,117,.07);
      border: 1px solid rgba(255,97,117,.18);
      font-size: 12px;
    }

    .action-card {
      padding: 16px;
      border: 1px solid var(--line);
      background:
        linear-gradient(145deg, rgba(107,166,255,.08), transparent 45%),
        rgba(20,25,35,.98);
    }

    .action-main {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: center;
    }

    .action-title {
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .08em;
    }

    .action-value {
      margin-top: 4px;
      font-size: 30px;
      font-weight: 950;
    }

    .confidence {
      min-width: 86px;
      text-align: center;
      padding: 10px;
      border-radius: 14px;
      background: var(--card2);
      border: 1px solid var(--line);
    }

    .confidence small {
      display: block;
      color: var(--muted);
    }

    .confidence strong {
      font-size: 24px;
    }

    .action-reason {
      margin-top: 12px;
      padding: 12px;
      border-radius: 13px;
      background: rgba(255,255,255,.025);
      border: 1px solid var(--line);
      font-size: 12px;
      line-height: 1.55;
      white-space: pre-line;
    }

    .next-steps {
      margin-top: 10px;
      display: grid;
      gap: 7px;
    }

    .next-step {
      padding: 9px 10px;
      border-radius: 11px;
      background: var(--card2);
      border: 1px solid var(--line);
      font-size: 12px;
    }

    .reason-list {
      display: grid;
      gap: 6px;
      margin-top: 10px;
      font-size: 12px;
    }

    .flow-card {
      padding: 15px;
    }

    .flow-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      margin-top: 10px;
    }

    .flow-item {
      padding: 10px;
      background: var(--card2);
      border: 1px solid var(--line);
      border-radius: 12px;
    }

    .flow-item small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .flow-item strong {
      font-size: 15px;
    }

    .flow-note {
      margin-top: 10px;
      padding: 11px;
      border-radius: 12px;
      background: rgba(165,122,255,.08);
      color: #e6ddff;
      font-size: 12px;
      line-height: 1.5;
    }

    .smart-card {
      padding: 15px;
    }

    .smart-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 10px;
    }

    .smart-item {
      padding: 10px;
      background: var(--card2);
      border: 1px solid var(--line);
      border-radius: 12px;
    }

    .smart-item small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .smart-item strong {
      font-size: 13px;
    }

    .assistant-box {
      margin-top: 10px;
      padding: 12px;
      border-radius: 13px;
      background: rgba(107,166,255,.08);
      color: #dceaff;
      line-height: 1.5;
      font-size: 12px;
      white-space: pre-line;
    }

    .checklist {
      display: grid;
      gap: 6px;
      margin-top: 10px;
      font-size: 12px;
    }

    .structure-card {
      padding: 15px;
    }

    .structure-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }

    .structure-state {
      padding: 6px 9px;
      border-radius: 10px;
      background: var(--card2);
      border: 1px solid var(--line);
      font-size: 12px;
      font-weight: 900;
    }

    .dual-scores {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 10px;
    }

    .dual-score {
      padding: 10px;
      background: var(--card2);
      border: 1px solid var(--line);
      border-radius: 12px;
    }

    .dual-score small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .dual-score strong {
      font-size: 20px;
    }

    .structure-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 10px;
    }

    .structure-item {
      padding: 10px;
      background: var(--card2);
      border: 1px solid var(--line);
      border-radius: 12px;
    }

    .structure-item small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }

    .structure-item strong {
      font-size: 13px;
    }

    .structure-note {
      margin-top: 9px;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.45;
    }

    .tf-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      padding: 12px;
    }

    .tf-card {
      padding: 11px;
      background: var(--card2);
      border: 1px solid var(--line);
      border-radius: 14px;
    }

    .tf-title {
      display: flex;
      justify-content: space-between;
      font-weight: 900;
    }

    .checks {
      display: grid;
      gap: 5px;
      margin-top: 8px;
      color: var(--muted);
      font-size: 12px;
    }

    .ok { color: var(--green); }
    .bad { color: var(--red); }
    .warn { color: var(--yellow); }

    .error {
      display: none;
      margin-top: 10px;
      padding: 10px;
      color: #ffd0d6;
      background: rgba(255,97,117,.10);
      border: 1px solid rgba(255,97,117,.3);
      border-radius: 12px;
      font-size: 12px;
    }

    @media (min-width: 900px) {
      .controls {
        grid-template-columns: 1fr 1fr 1.4fr;
      }

      .direction {
        grid-column: auto;
      }

      .prices {
        grid-template-columns: repeat(5, 1fr);
      }

      .layout {
        grid-template-columns: minmax(0, 1.6fr) minmax(340px, .75fr);
      }

      .tf-grid {
        grid-template-columns: repeat(4, 1fr);
      }
    }

    @media (max-width: 560px) {
      #chart { height: 420px; }
    }
  </style>
</head>

<body>
<main class="app">
  <section class="card header">
    <div class="brand">SSMARLBOROSS LIVE · v9.0.1 UTF-8 FIX</div>
    <h1>ssMarlboross Command Center</h1>
    <div class="subtitle">
      Реальные цены MEXC, таймер свечи и динамическая сила сигнала, его усиление или ослабление, вклад условий и уведомления.
    </div>

    <div class="controls">
      <select id="symbol">
        <option>BTC_USDT</option>
        <option>ETH_USDT</option>
        <option>SOL_USDT</option>
        <option>XRP_USDT</option>
        <option>BNB_USDT</option>
        <option>DOGE_USDT</option>
        <option>ADA_USDT</option>
        <option>SUI_USDT</option>
        <option>LINK_USDT</option>
        <option>AVAX_USDT</option>
        <option>LTC_USDT</option>
        <option>TRB_USDT</option>
      </select>

      <select id="refresh">
        <option value="5">Обновление 5 сек</option>
        <option value="10" selected>Обновление 10 сек</option>
        <option value="20">Обновление 20 сек</option>
      </select>

      <div class="direction">
        <button class="long active" data-direction="LONG">🟢 LONG</button>
        <button class="short" data-direction="SHORT">🔴 SHORT</button>
      </div>
    </div>

    <div class="tf">
      <button data-tf="1h">1H</button>
      <button data-tf="15m">15M</button>
      <button data-tf="5m" class="active">5M</button>
      <button data-tf="1m">1M</button>
    </div>

    <div class="prices">
      <div class="metric"><small>Последняя цена</small><strong id="last">—</strong></div>
      <div class="metric"><small>Покупатели</small><strong id="bid">—</strong></div>
      <div class="metric"><small>Продавцы</small><strong id="ask">—</strong></div>
      <div class="metric"><small>Справедливая цена</small><strong id="fair">—</strong></div>
      <div class="metric"><small>Индексная цена</small><strong id="index">—</strong></div>
      <div class="metric"><small>Фандинг</small><strong id="funding">—</strong></div>
      <div class="metric"><small>Открытый интерес</small><strong id="openInterest">—</strong></div>
    </div>

    <div id="error" class="error"></div>
  </section>

  <section class="card tf-grid" id="tfGrid"></section>

  

  

  

  

  

  

  
  

  
    

    
    

  </div>

  <section class="intelligence-card">
    <div class="intelligence-head">
      <div>
        <small style="color:var(--muted);font-weight:900;letter-spacing:.10em">
          ДИНАМИЧЕСКИЙ ИНТЕЛЛЕКТ СИГНАЛА
        </small>
        <div class="intelligence-score warn" id="dynamicSignalScore">0%</div>
      </div>

      <div class="intelligence-trend">
        <small>Изменение сигнала</small>
        <strong id="dynamicSignalTrend">СТАБИЛЬНО</strong>
      </div>
    </div>

    <svg
      class="signal-chart"
      id="signalSparkline"
      viewBox="0 0 320 90"
      preserveAspectRatio="none"
      aria-label="История силы сигнала"
    ></svg>

    <div class="intelligence-grid">
      <div class="intelligence-component">
        <small>Тренд</small>
        <strong id="componentTrendValue">0%</strong>
        <div class="component-track"><div id="componentTrendBar"></div></div>
      </div>
      <div class="intelligence-component">
        <small>Структура</small>
        <strong id="componentStructureValue">0%</strong>
        <div class="component-track"><div id="componentStructureBar"></div></div>
      </div>
      <div class="intelligence-component">
        <small>Поток / объём</small>
        <strong id="componentFlowValue">0%</strong>
        <div class="component-track"><div id="componentFlowBar"></div></div>
      </div>
      <div class="intelligence-component">
        <small>Smart Money</small>
        <strong id="componentSmartValue">0%</strong>
        <div class="component-track"><div id="componentSmartBar"></div></div>
      </div>
      <div class="intelligence-component">
        <small>Риск / вход</small>
        <strong id="componentRiskValue">0%</strong>
        <div class="component-track"><div id="componentRiskBar"></div></div>
      </div>
    </div>

    <div class="intelligence-explanation" id="dynamicSignalExplanation">
      Собираем историю сигнала…
    </div>

    <div class="notification-row">
      <span id="notificationStatus">
        Уведомления браузера выключены. Терминал сможет сообщить, когда вход будет разрешён.
      </span>
      <button id="enableNotificationsButton">Включить уведомления</button>
    </div>
  </section>

  <section class="pro-decision blocked" id="proDecisionCard">
    <div class="pro-title">ГЛАВНОЕ РЕШЕНИЕ PRO</div>
    <div class="pro-action bad" id="proDecisionAction">НЕ ВХОДИТЬ</div>
    <div class="pro-subtitle" id="proDecisionSubtitle">
      Система собирает подтверждения.
    </div>

    <div class="pro-grid">
      <div class="pro-item">
        <small>Направление</small>
        <strong id="proDirection">—</strong>
      </div>
      <div class="pro-item">
        <small>Качество</small>
        <strong id="proScore">0%</strong>
      </div>
      <div class="pro-item">
        <small>R:R до TP1</small>
        <strong id="proRr">—</strong>
      </div>
      <div class="pro-item">
        <small>Риск сценария</small>
        <strong class="risk-stars" id="proRiskStars">★★★★★</strong>
      </div>
    </div>

    <div class="guard-list" id="proGuards"></div>

    <div class="voice-card">
      <strong>Наставник говорит</strong>
      <p id="proVoiceText">Пока не входи. Система анализирует рынок.</p>
    </div>
  </section>

  <section class="cycle-card">
    <div class="cycle-head">
      <div>
        <small style="color:var(--muted);font-weight:900;letter-spacing:.10em">
          ПОЛНЫЙ ЦИКЛ СДЕЛКИ
        </small>
        <div class="cycle-status warn" id="cycleStatus">АНАЛИЗ</div>
      </div>

      <div class="cycle-step">
        <small>Этап</small>
        <strong id="cycleStage">1 / 6</strong>
      </div>
    </div>

    <div class="cycle-grid">
      <div class="cycle-item">
        <small>Направление</small>
        <strong id="cycleDirection">—</strong>
      </div>
      <div class="cycle-item">
        <small>Вход</small>
        <strong id="cycleEntry">—</strong>
      </div>
      <div class="cycle-item">
        <small>Стоп</small>
        <strong id="cycleStop">—</strong>
      </div>
      <div class="cycle-item">
        <small>TP1 / TP2</small>
        <strong id="cycleTargets">—</strong>
      </div>
    </div>

    <div class="cycle-actions">
      <button class="primary" id="confirmEntryButton" disabled>
        Подтвердить вход
      </button>
      <button id="resetCycleButton">
        Сбросить цикл
      </button>
    </div>

    <div class="cycle-note" id="cycleNote">
      Система анализирует рынок.
    </div>
  </section>

  <section class="signal-lifecycle">
    <div class="signal-lifecycle-top">
      <div>
        <small style="color:var(--muted);font-weight:900;letter-spacing:.10em">
          ЖИЗНЕННЫЙ ЦИКЛ СИГНАЛА
        </small>
        <h2 class="warn" id="signalLifecycleStatus">СОБИРАЕМ ДАННЫЕ</h2>
      </div>

      <div class="signal-timer">
        <small id="signalTimerLabel">До закрытия свечи</small>
        <strong id="signalTimerValue">—</strong>
      </div>
    </div>

    <div class="signal-missing" id="signalMissingConditions"></div>

    <div class="signal-validity" id="signalValidityText">
      Система ждёт подтверждения закрытой свечой.
    </div>
  </section>

  <section class="entry-permission blocked" id="entryPermission">
    <small>ГЛАВНОЕ РЕШЕНИЕ</small>
    <strong class="bad" id="entryPermissionText">НЕ ВХОДИТЬ</strong>
    <p id="entryPermissionReason">Собираем подтверждения стратегии…</p>
  </section>

  <div class="terminal-shell">
    <div class="terminal-main">
      <section class="card chart-card">
      <div class="chart-head">
        <div>
          <strong id="chartTitle">BTC_USDT · 5M</strong>
          <div class="big-price" id="chartPrice">—</div>
        </div>

        <div class="timer">
          <strong id="candleTimer">00:00</strong>
          <small>до закрытия свечи</small>
        </div>
      </div>

      <div id="chart"></div>

      <div class="legend">
        <span>EMA20</span>
        <span>EMA50</span>
        <span>EMA200</span>
        <span>VWAP</span>
        <span>Supertrend</span>
        <span>Volume</span>
        <span>HH/HL/LH/LL</span>
        <span>BOS/CHoCH</span>
        <span>FVG</span>
        <span>Sweep</span>
        <span>Order Block</span>
      </div>
    </section>

      <div class="terminal-lower">
        <section class="card strategy-card">
    <div class="structure-head">
      <strong>Чек-лист стратегии · 5M</strong>
      <span class="structure-state warn" id="strategyGate">ЖДАТЬ</span>
    </div>

    <div class="readiness-row">
      <div>
        <small style="color:var(--muted)">ГОТОВНОСТЬ СДЕЛКИ</small>
        <div class="readiness-number" id="strategyReadiness">0%</div>
      </div>
      <div style="text-align:right">
        <small style="color:var(--muted)">Направление</small>
        <div style="font-size:20px;font-weight:950" id="strategyDirection">—</div>
      </div>
    </div>

    <div class="readiness-bar">
      <div id="strategyReadinessBar"></div>
    </div>

    <div class="strategy-checks" id="strategyChecks"></div>

    <div class="signal-gate">
      <div id="gateStructure">Структура</div>
      <div id="gateTrigger">Триггер</div>
      <div id="gateRetest">Ретест</div>
    </div>
  </section>
        <section class="card mentor-card">
    <div class="structure-head">
      <strong>Наставник</strong>
      <span class="structure-state warn" id="mentorStatus">АНАЛИЗ</span>
    </div>
    <div class="mentor-speech" id="mentorSpeech">Собираем данные…</div>
  </section>
      </div>
    </div>

    <aside class="terminal-side side-compact">
      <section class="card brain-card">
    <div class="brain-top">
      <div>
        <div class="brain-kicker">МОЗГ СИСТЕМЫ</div>
        <div class="brain-action warn" id="brainAction">ЖДАТЬ</div>
      </div>

      <div class="brain-score">
        <small>Качество сигнала</small>
        <strong id="brainScore">0%</strong>
      </div>
    </div>

    <div class="brain-progress">
      <div id="brainProgress"></div>
    </div>

    <div class="brain-grid">
      <div class="brain-item">
        <small>Направление</small>
        <strong id="brainDirection">—</strong>
      </div>
      <div class="brain-item">
        <small>До готовности</small>
        <strong id="brainCandles">—</strong>
      </div>
      <div class="brain-item">
        <small>Риск сценария</small>
        <strong id="brainRisk">—</strong>
      </div>
      <div class="brain-item">
        <small>Главное препятствие</small>
        <strong id="brainObstacle">—</strong>
      </div>
    </div>

    <div class="brain-explanation" id="brainExplanation">
      Собираем данные…
    </div>
  </section>
      <section class="card scenario-card">
    <div class="structure-head">
      <strong>Автоматический сценарий сделки</strong>
      <span class="structure-state warn" id="scenarioState">ЖДАТЬ</span>
    </div>

    <div class="scenario-grid">
      <div class="scenario-item">
        <small>Направление</small>
        <strong id="scenarioDirection">—</strong>
      </div>
      <div class="scenario-item">
        <small>Готовность</small>
        <strong id="scenarioReadiness">0%</strong>
      </div>
      <div class="scenario-item">
        <small>Уровень входа</small>
        <strong id="scenarioEntry">—</strong>
      </div>
      <div class="scenario-item">
        <small>Стоп</small>
        <strong id="scenarioStop">—</strong>
      </div>
      <div class="scenario-item">
        <small>TP1</small>
        <strong id="scenarioTp1">—</strong>
      </div>
      <div class="scenario-item">
        <small>TP2</small>
        <strong id="scenarioTp2">—</strong>
      </div>
    </div>

    <div class="scenario-progress">
      <div id="scenarioProgress"></div>
    </div>

    <div class="scenario-conditions" id="scenarioConditions"></div>
  </section>
      <section class="card manager-card">
    <div class="structure-head">
      <strong>Управление сделкой</strong>
      <span class="structure-state warn" id="managerState">НЕТ СДЕЛКИ</span>
    </div>

    <div class="manager-inputs">
      <label>
        Депозит, USDT
        <input id="depositInput" type="number" min="1" step="1" value="1000">
      </label>
      <label>
        Риск, %
        <input id="riskInput" type="number" min="0.1" max="10" step="0.1" value="0.5">
      </label>
      <label>
        Плечо
        <input id="leverageInput" type="number" min="1" max="500" step="1" value="20">
      </label>
      <label>
        Комиссия, % за сторону
        <input id="commissionInput" type="number" min="0" max="1" step="0.001" value="0.05">
      </label>
    </div>

    <div class="manager-grid">
      <div class="manager-item">
        <small>Риск в деньгах</small>
        <strong id="riskUsdtValue">—</strong>
      </div>
      <div class="manager-item">
        <small>Размер позиции</small>
        <strong id="positionSizeValue">—</strong>
      </div>
      <div class="manager-item">
        <small>Необходимая маржа</small>
        <strong id="marginValue">—</strong>
      </div>
      <div class="manager-item">
        <small>Количество BTC</small>
        <strong id="quantityValue">—</strong>
      </div>
      <div class="manager-item">
        <small>R:R до TP1</small>
        <strong id="rrTp1Value">—</strong>
      </div>
      <div class="manager-item">
        <small>Комиссия вход + выход</small>
        <strong id="commissionValue">—</strong>
      </div>
    </div>

    <div class="manager-actions">
      <button class="primary" id="startTradeButton">Начать сопровождение</button>
      <button id="closeTradeButton">Завершить сопровождение</button>
    </div>

    <div class="trade-monitor hidden" id="tradeMonitor">
      <div class="manager-grid">
        <div class="manager-item">
          <small>Статус</small>
          <strong id="activeTradeStatus">—</strong>
        </div>
        <div class="manager-item">
          <small>Текущая цена</small>
          <strong id="activeCurrentPrice">—</strong>
        </div>
        <div class="manager-item">
          <small>PnL</small>
          <strong id="activePnl">—</strong>
        </div>
        <div class="manager-item">
          <small>ROI по марже</small>
          <strong id="activeRoi">—</strong>
        </div>
      </div>

      <div style="margin-top:10px;font-size:12px;color:var(--muted)">Прогресс до TP1</div>
      <div class="progress-track"><div id="tp1Progress"></div></div>

      <div style="margin-top:10px;font-size:12px;color:var(--muted)">Прогресс до TP2</div>
      <div class="progress-track"><div id="tp2Progress"></div></div>

      <div class="manager-grid">
        <div class="manager-item">
          <small>До стопа</small>
          <strong id="distanceToStop">—</strong>
        </div>
        <div class="manager-item">
          <small>До TP1</small>
          <strong id="distanceToTp1">—</strong>
        </div>
        <div class="manager-item">
          <small>До TP2</small>
          <strong id="distanceToTp2">—</strong>
        </div>
        <div class="manager-item">
          <small>Реализованный PnL</small>
          <strong id="realizedPnl">0.00 USDT</strong>
        </div>
      </div>

      <div class="manager-actions three">
        <button id="breakEvenButton">Стоп в безубыток</button>
        <button id="partialCloseButton">Закрыть 30%</button>
        <button id="finishTradeButton">Закрыть полностью</button>
      </div>

      <div class="monitor-note" id="monitorNote">—</div>
    </div>
  </section>
    </aside>
  </div>

  <div class="terminal-lower">
    <section class="card trade-summary-card">
    <div class="structure-head">
      <strong>Журнал и статистика</strong>
      <span class="structure-state warn" id="journalState">0 СДЕЛОК</span>
    </div>

    <div class="trade-summary-grid">
      <div class="trade-summary-item">
        <small>Закрытых сделок</small>
        <strong id="journalCount">0</strong>
      </div>
      <div class="trade-summary-item">
        <small>Прибыльных</small>
        <strong id="journalWins">0</strong>
      </div>
      <div class="trade-summary-item">
        <small>WinRate</small>
        <strong id="journalWinRate">0%</strong>
      </div>
      <div class="trade-summary-item">
        <small>Общий PnL</small>
        <strong id="journalTotalPnl">0.00 USDT</strong>
      </div>
    </div>

    <div class="journal-table" id="journalRows"></div>
  </section>

    </div>


  <section class="card" style="margin-top:12px;padding:12px;color:var(--muted);font-size:12px;line-height:1.5">
    v9.0.1 UTF-8 FIX · Кодировка страницы: UTF-8 · Основные решения строятся только по закрытым свечам,
    структуре, BOS, Delta, объёму и ретесту. Терминал не открывает реальные ордера автоматически.
  </section>

</main>

<script>
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const state = {
  symbol: "BTC_USDT",
  direction: "LONG",
  timeframe: "5m",
  refresh: 10,
  data: {},
  metrics: {},
  timer: null,
  markersApi: null,
  deals: new Map(),
  cvdSession: 0,
  currentOi: null,
  previousOi: null,
  tickerData: null,
  tradeLines: {
    entry: null,
    stop: null,
    tp1: null,
    tp2: null,
  },
  activeTrade: null,
  dataHealth: {
    ticker: false,
    klines: false,
    deals: false,
  },
  signalLifecycle: {
    armedAt: null,
    validUntil: null,
    direction: null,
    lastStatus: "WAIT",
  },
  tradeCycle: {
    stage: "ANALYSIS",
    lastCompletion: null,
  },
  signalIntelligence: {
    history: [],
    latest: null,
    peakScore: 0,
    lastAlertKey: null,
    notificationsEnabled: false,
  },
};

const chartNode = document.getElementById("chart");

const chart = LightweightCharts.createChart(chartNode, {
  width: chartNode.clientWidth,
  height: chartNode.clientHeight,
  layout: {
    background: { type: "solid", color: "#0d1118" },
    textColor: "#98a2b1",
    attributionLogo: true,
  },
  grid: {
    vertLines: { color: "rgba(44,53,70,.35)" },
    horzLines: { color: "rgba(44,53,70,.35)" },
  },
  rightPriceScale: {
    borderColor: "#2c3546",
    scaleMargins: { top: 0.08, bottom: 0.24 },
  },
  timeScale: {
    borderColor: "#2c3546",
    timeVisible: true,
    secondsVisible: false,
  },
});

const candles = chart.addSeries(
  LightweightCharts.CandlestickSeries,
  {
    upColor: "#27ca88",
    downColor: "#ff6175",
    wickUpColor: "#27ca88",
    wickDownColor: "#ff6175",
    borderVisible: false,
  }
);

function addLine(color) {
  return chart.addSeries(
    LightweightCharts.LineSeries,
    {
      color,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    }
  );
}

const ema20Series = addLine("#ffcf5b");
const ema50Series = addLine("#6ba6ff");
const ema200Series = addLine("#ff6175");
const vwapSeries = addLine("#a57aff");
const supertrendSeries = addLine("#27ca88");

const volumeSeries = chart.addSeries(
  LightweightCharts.HistogramSeries,
  {
    priceScaleId: "volume",
    priceFormat: { type: "volume" },
    lastValueVisible: false,
    priceLineVisible: false,
  }
);

chart.priceScale("volume").applyOptions({
  scaleMargins: { top: 0.82, bottom: 0 },
  borderVisible: false,
});

new ResizeObserver(entries => {
  const rect = entries[0].contentRect;
  chart.applyOptions({
    width: rect.width,
    height: rect.height,
  });
}).observe(chartNode);

function ema(values, period) {
  const output = [];
  const multiplier = 2 / (period + 1);
  let previous = values[0] || 0;

  values.forEach((value, index) => {
    previous = index === 0
      ? value
      : (value - previous) * multiplier + previous;

    output.push(previous);
  });

  return output;
}

function atr(data, period = 10) {
  const tr = data.map((candle, index) => {
    if (index === 0) {
      return candle.high - candle.low;
    }

    const previousClose = data[index - 1].close;

    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });

  const result = [];
  let previous = tr[0] || 0;

  tr.forEach((value, index) => {
    previous = index === 0
      ? value
      : ((previous * (period - 1)) + value) / period;

    result.push(previous);
  });

  return result;
}

function supertrend(data, period = 10, factor = 3) {
  const atrValues = atr(data, period);
  const output = [];

  let finalUpper = 0;
  let finalLower = 0;
  let direction = 1;

  data.forEach((candle, index) => {
    const midpoint = (candle.high + candle.low) / 2;
    const basicUpper = midpoint + factor * atrValues[index];
    const basicLower = midpoint - factor * atrValues[index];

    if (index === 0) {
      finalUpper = basicUpper;
      finalLower = basicLower;
      direction = candle.close >= midpoint ? 1 : -1;
    } else {
      const previousClose = data[index - 1].close;

      finalUpper = (
        basicUpper < finalUpper ||
        previousClose > finalUpper
      ) ? basicUpper : finalUpper;

      finalLower = (
        basicLower > finalLower ||
        previousClose < finalLower
      ) ? basicLower : finalLower;

      if (direction === -1 && candle.close > finalUpper) {
        direction = 1;
      } else if (
        direction === 1 &&
        candle.close < finalLower
      ) {
        direction = -1;
      }
    }

    output.push({
      time: candle.time,
      value: direction === 1 ? finalLower : finalUpper,
      direction,
    });
  });

  return output;
}

function vwap(data) {
  let currentDay = "";
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;

  return data.map(candle => {
    const day = new Date(
      candle.time * 1000
    ).toISOString().slice(0, 10);

    if (day !== currentDay) {
      currentDay = day;
      cumulativePriceVolume = 0;
      cumulativeVolume = 0;
    }

    const typical = (
      candle.high +
      candle.low +
      candle.close
    ) / 3;

    cumulativePriceVolume += typical * candle.volume;
    cumulativeVolume += candle.volume;

    return {
      time: candle.time,
      value: cumulativeVolume
        ? cumulativePriceVolume / cumulativeVolume
        : candle.close,
    };
  });
}

function pivots(data, width = 3) {
  const highs = [];
  const lows = [];

  for (
    let index = width;
    index < data.length - width;
    index += 1
  ) {
    let isHigh = true;
    let isLow = true;

    for (
      let check = index - width;
      check <= index + width;
      check += 1
    ) {
      if (check === index) continue;

      if (data[check].high >= data[index].high) {
        isHigh = false;
      }

      if (data[check].low <= data[index].low) {
        isLow = false;
      }
    }

    if (isHigh) {
      highs.push({
        index,
        time: data[index].time,
        value: data[index].high,
      });
    }

    if (isLow) {
      lows.push({
        index,
        time: data[index].time,
        value: data[index].low,
      });
    }
  }

  const recent = data.slice(-30);
  const fallbackHighValue = Math.max(
    ...recent.map(item => item.high)
  );
  const fallbackLowValue = Math.min(
    ...recent.map(item => item.low)
  );

  const fallbackHighIndex = data.findIndex(
    item => item.high === fallbackHighValue
  );
  const fallbackLowIndex = data.findIndex(
    item => item.low === fallbackLowValue
  );

  if (!highs.length) {
    highs.push({
      index: fallbackHighIndex,
      time: data[fallbackHighIndex].time,
      value: fallbackHighValue,
    });
  }

  if (!lows.length) {
    lows.push({
      index: fallbackLowIndex,
      time: data[fallbackLowIndex].time,
      value: fallbackLowValue,
    });
  }

  return { highs, lows };
}

function swingLabel(current, previous, highSide) {
  if (!current || !previous) {
    return highSide ? "H" : "L";
  }

  if (highSide) {
    return current.value > previous.value ? "HH" : "LH";
  }

  return current.value > previous.value ? "HL" : "LL";
}

function structureName(highLabel, lowLabel) {
  if (highLabel === "HH" && lowLabel === "HL") {
    return "BULL";
  }

  if (highLabel === "LH" && lowLabel === "LL") {
    return "BEAR";
  }

  return "RANGE";
}

function structureText(metrics) {
  if (metrics.structure === "BULL") {
    return "HH / HL";
  }

  if (metrics.structure === "BEAR") {
    return "LH / LL";
  }

  return `${metrics.highLabel} / ${metrics.lowLabel}`;
}

function eventText(event) {
  return {
    BOS_UP: "BOS ↑",
    BOS_DOWN: "BOS ↓",
    CHOCH_UP: "CHoCH ↑",
    CHOCH_DOWN: "CHoCH ↓",
    NONE: "Нет нового слома",
  }[event] || "—";
}

function analyse(data) {
  const closes = data.map(candle => candle.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const vw = vwap(data);
  const st = supertrend(data);

  const liveIndex = data.length - 1;
  const closedIndex = Math.max(1, data.length - 2);
  const current = data[liveIndex];
  const closed = data[closedIndex];
  const previousClosed = data[closedIndex - 1];

  const confirmedData = data.slice(0, closedIndex + 1);
  const swings = pivots(confirmedData);

  const lastHigh = swings.highs.at(-1);
  const previousHigh = swings.highs.at(-2);
  const lastLow = swings.lows.at(-1);
  const previousLow = swings.lows.at(-2);

  const highLabel = swingLabel(
    lastHigh,
    previousHigh,
    true
  );

  const lowLabel = swingLabel(
    lastLow,
    previousLow,
    false
  );

  const structure = structureName(
    highLabel,
    lowLabel
  );

  const breakUpActive =
    closed.close > lastHigh.value;

  const breakDownActive =
    closed.close < lastLow.value;

  const brokeUpNow = (
    breakUpActive &&
    previousClosed.close <= lastHigh.value
  );

  const brokeDownNow = (
    breakDownActive &&
    previousClosed.close >= lastLow.value
  );

  let event = "NONE";

  if (brokeUpNow) {
    event = structure === "BEAR"
      ? "CHOCH_UP"
      : "BOS_UP";
  } else if (brokeDownNow) {
    event = structure === "BULL"
      ? "CHOCH_DOWN"
      : "BOS_DOWN";
  }

  const fvgs = detectFvg(confirmedData);
  const fvg = latestOpenFvg(
    confirmedData,
    fvgs
  );

  const equal = equalLevels(swings);
  const sweep = detectSweep(
    confirmedData,
    equal
  );

  const orderBlock = detectOrderBlock(
    confirmedData,
    event
  );

  const pivotMarkers = [];

  swings.highs.slice(-6).forEach(point => {
    const fullIndex = swings.highs.indexOf(point);
    const previous = swings.highs[fullIndex - 1];

    pivotMarkers.push({
      time: point.time,
      position: "aboveBar",
      color: "#ffbd55",
      shape: "circle",
      text: swingLabel(point, previous, true),
    });
  });

  swings.lows.slice(-6).forEach(point => {
    const fullIndex = swings.lows.indexOf(point);
    const previous = swings.lows[fullIndex - 1];

    pivotMarkers.push({
      time: point.time,
      position: "belowBar",
      color: "#6ba6ff",
      shape: "circle",
      text: swingLabel(point, previous, false),
    });
  });

  if (event !== "NONE") {
    const up = event.endsWith("_UP");

    pivotMarkers.push({
      time: closed.time,
      position: up ? "belowBar" : "aboveBar",
      color: event.startsWith("CHOCH")
        ? "#a57aff"
        : "#27ca88",
      shape: up ? "arrowUp" : "arrowDown",
      text: eventText(event),
    });
  }

  if (sweep) {
    pivotMarkers.push({      time: sweep.time,
      position: sweep.type === "LOW"
        ? "belowBar"
        : "aboveBar",
      color: "#ffbd55",
      shape: "square",
      text: sweep.type === "LOW"
        ? "Sweep Low"
        : "Sweep High",
    });
  }

  if (fvg) {
    pivotMarkers.push({
      time: fvg.time,
      position: fvg.type === "BULL"
        ? "belowBar"
        : "aboveBar",
      color: "#a57aff",
      shape: "circle",
      text: "FVG",
    });
  }

  if (orderBlock) {
    pivotMarkers.push({
      time: orderBlock.time,
      position: orderBlock.type === "BULL"
        ? "belowBar"
        : "aboveBar",
      color: "#6ba6ff",
      shape: "circle",
      text: "OB",
    });
  }

  pivotMarkers.sort(
    (left, right) => left.time - right.time
  );

  return {
    close: current.close,
    closedClose: closed.close,
    closedTime: closed.time,
    ema20: e20[closedIndex],
    ema50: e50[closedIndex],
    ema200: e200[closedIndex],
    vwap: vw[closedIndex].value,
    supertrend: st[closedIndex].direction,
    high: lastHigh.value,
    low: lastLow.value,
    highLabel,
    lowLabel,
    structure,
    event,
    breakUpActive,
    breakDownActive,
    fvg,
    equal,
    sweep,
    orderBlock,
    pivotMarkers,
    arrays: {
      e20,
      e50,
      e200,
      vw,
      st,
    },
  };
}


function detectFvg(data) {
  const results = [];

  for (let index = 2; index < data.length; index += 1) {
    const first = data[index - 2];
    const third = data[index];

    if (third.low > first.high) {
      results.push({
        type: "BULL",
        from: first.high,
        to: third.low,
        time: third.time,
        index,
      });
    }

    if (third.high < first.low) {
      results.push({
        type: "BEAR",
        from: third.high,
        to: first.low,
        time: third.time,
        index,
      });
    }
  }

  return results;
}

function latestOpenFvg(data, fvgs) {
  for (let index = fvgs.length - 1; index >= 0; index -= 1) {
    const fvg = fvgs[index];
    const later = data.slice(fvg.index + 1);

    const filled = fvg.type === "BULL"
      ? later.some(item => item.low <= fvg.from)
      : later.some(item => item.high >= fvg.to);

    if (!filled) return fvg;
  }

  return null;
}

function equalLevels(swings, tolerancePercent = 0.08) {
  const equalHighs = [];
  const equalLows = [];

  for (let index = 1; index < swings.highs.length; index += 1) {
    const current = swings.highs[index];
    const previous = swings.highs[index - 1];
    const midpoint = (current.value + previous.value) / 2;
    const diffPercent = Math.abs(
      current.value - previous.value
    ) / midpoint * 100;

    if (diffPercent <= tolerancePercent) {
      equalHighs.push({
        value: midpoint,
        time: current.time,
      });
    }
  }

  for (let index = 1; index < swings.lows.length; index += 1) {
    const current = swings.lows[index];
    const previous = swings.lows[index - 1];
    const midpoint = (current.value + previous.value) / 2;
    const diffPercent = Math.abs(
      current.value - previous.value
    ) / midpoint * 100;

    if (diffPercent <= tolerancePercent) {
      equalLows.push({
        value: midpoint,
        time: current.time,
      });
    }
  }

  return {
    high: equalHighs.at(-1) || null,
    low: equalLows.at(-1) || null,
  };
}

function detectSweep(data, levels) {
  const closedIndex = Math.max(1, data.length - 2);
  const candle = data[closedIndex];

  if (
    levels.high &&
    candle.high > levels.high.value &&
    candle.close < levels.high.value
  ) {
    return {
      type: "HIGH",
      level: levels.high.value,
      time: candle.time,
    };
  }

  if (
    levels.low &&
    candle.low < levels.low.value &&
    candle.close > levels.low.value
  ) {
    return {
      type: "LOW",
      level: levels.low.value,
      time: candle.time,
    };
  }

  return null;
}

function detectOrderBlock(data, event) {
  if (event === "BOS_UP" || event === "CHOCH_UP") {
    for (let index = data.length - 3; index >= 1; index -= 1) {
      const candle = data[index];

      if (candle.close < candle.open) {
        return {
          type: "BULL",
          low: candle.low,
          high: candle.high,
          time: candle.time,
        };
      }
    }
  }

  if (event === "BOS_DOWN" || event === "CHOCH_DOWN") {
    for (let index = data.length - 3; index >= 1; index -= 1) {
      const candle = data[index];

      if (candle.close > candle.open) {
        return {
          type: "BEAR",
          low: candle.low,
          high: candle.high,
          time: candle.time,
        };
      }
    }
  }

  return null;
}

function smartMoneyText(metrics) {
  const lines = [];

  if (metrics.sweep?.type === "HIGH") {
    lines.push(
      `Сняли ликвидность сверху у ${formatPrice(metrics.sweep.level)}.`
    );
  } else if (metrics.sweep?.type === "LOW") {
    lines.push(
      `Сняли ликвидность снизу у ${formatPrice(metrics.sweep.level)}.`
    );
  } else {
    lines.push("Свежего sweep на закрытой 5M-свече нет.");
  }

  if (metrics.fvg) {
    lines.push(
      `${metrics.fvg.type === "BULL" ? "Бычий" : "Медвежий"} FVG: ` +
      `${formatPrice(metrics.fvg.from)}–${formatPrice(metrics.fvg.to)}.`
    );
  } else {
    lines.push("Открытого FVG рядом не найдено.");
  }

  if (metrics.orderBlock) {
    lines.push(
      `${metrics.orderBlock.type === "BULL" ? "Бычий" : "Медвежий"} OB: ` +
      `${formatPrice(metrics.orderBlock.low)}–${formatPrice(metrics.orderBlock.high)}.`
    );
  }

  if (metrics.event !== "NONE") {
    lines.push(`${eventText(metrics.event)} уже подтверждён закрытием.`);
  } else {
    lines.push("BOS/CHoCH ещё не подтверждён.");
  }

  return lines.join("\n");
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "—";

  if (value >= 1000) {
    return value.toLocaleString(
      "ru-RU",
      { maximumFractionDigits: 2 }
    );
  }

  return value.toLocaleString(
    "ru-RU",
    { maximumFractionDigits: 6 }
  );
}

function condition(
  metrics,
  name,
  direction = state.direction
) {
  const isLong = direction === "LONG";

  if (name === "ema") {
    return isLong
      ? metrics.ema20 > metrics.ema50
      : metrics.ema20 < metrics.ema50;
  }

  if (name === "ema200") {
    return isLong
      ? metrics.closedClose > metrics.ema200
      : metrics.closedClose < metrics.ema200;
  }

  if (name === "vwap") {
    return isLong
      ? metrics.closedClose > metrics.vwap
      : metrics.closedClose < metrics.vwap;
  }

  if (name === "supertrend") {
    return isLong
      ? metrics.supertrend === 1
      : metrics.supertrend === -1;
  }

  if (name === "structure") {
    return isLong
      ? metrics.structure === "BULL"
      : metrics.structure === "BEAR";
  }

  if (name === "bos") {
    return isLong
      ? metrics.breakUpActive
      : metrics.breakDownActive;
  }

  return false;
}

function directionScore(direction) {
  const timeframeWeights = {
    "1h": 30,
    "15m": 25,
    "5m": 30,
    "1m": 15,
  };

  const checkWeights = {
    ema: 1,
    ema200: 1,
    vwap: 1,
    supertrend: 1,
    structure: 2,
    bos: 1,
  };

  let earned = 0;
  let possible = 0;

  Object.entries(timeframeWeights).forEach(
    ([timeframe, tfWeight]) => {
      const metrics = state.metrics[timeframe];
      if (!metrics) return;

      const totalCheckWeight = Object.values(
        checkWeights
      ).reduce(
        (sum, value) => sum + value,
        0
      );

      let timeframeEarned = 0;

      Object.entries(checkWeights).forEach(
        ([name, weight]) => {
          if (condition(
            metrics,
            name,
            direction
          )) {
            timeframeEarned += weight;
          }
        }
      );

      earned += tfWeight * (
        timeframeEarned / totalCheckWeight
      );

      possible += tfWeight;
    }
  );

  return possible
    ? Math.round((earned / possible) * 100)
    : 0;
}


function signedDealVolume(deal) {
  return deal.side === "BUY"
    ? deal.volume
    : -deal.volume;
}

function deltaFor(seconds) {
  const cutoff = Date.now() - seconds * 1000;
  let total = 0;

  state.deals.forEach(deal => {
    if (deal.time >= cutoff) {
      total += signedDealVolume(deal);
    }
  });

  return total;
}

function formatCompact(value) {
  if (!Number.isFinite(value)) return "—";

  const absolute = Math.abs(value);

  if (absolute >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }

  if (absolute >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }

  if (absolute >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }

  return value.toFixed(0);
}

function flowBias() {
  const delta5 = deltaFor(300);
  const delta15 = deltaFor(900);

  if (delta5 > 0 && delta15 > 0) return "BUY";
  if (delta5 < 0 && delta15 < 0) return "SELL";
  return "MIXED";
}

function volumeSignal() {
  const data = state.data["5m"];
  if (!data || data.length < 22) {
    return { strong: false, ratio: 0 };
  }

  const closedIndex = data.length - 2;
  const current = data[closedIndex].volume;
  const average = data
    .slice(closedIndex - 20, closedIndex)
    .reduce((sum, item) => sum + item.volume, 0) / 20;

  return {
    strong: average > 0 && current >= average * 1.25,
    ratio: average > 0 ? current / average : 0,
  };
}



function blockersFor(direction, metrics) {
  const blockers = [];
  const volume = volumeSignal();
  const bias = flowBias();

  const structureOk = direction === "LONG"
    ? metrics.structure === "BULL"
    : metrics.structure === "BEAR";

  const bosOk = direction === "LONG"
    ? metrics.breakUpActive
    : metrics.breakDownActive;

  const deltaOk = direction === "LONG"
    ? bias === "BUY"
    : bias === "SELL";

  const ema200Ok = direction === "LONG"
    ? metrics.closedClose > metrics.ema200
    : metrics.closedClose < metrics.ema200;

  if (!structureOk) {
    blockers.push(
      direction === "LONG"
        ? "На 5M нет структуры HH / HL."
        : "На 5M нет структуры LH / LL."
    );
  }

  if (!bosOk) {
    blockers.push(
      direction === "LONG"
        ? `Нет закрытия 5M выше ${formatPrice(metrics.high)}.`
        : `Нет закрытия 5M ниже ${formatPrice(metrics.low)}.`
    );
  }

  if (!deltaOk) {
    blockers.push(
      direction === "LONG"
        ? "Delta 5M и 15M не подтверждает покупателя."
        : "Delta 5M и 15M не подтверждает продавца."
    );
  }

  if (!ema200Ok) {
    blockers.push(
      direction === "LONG"
        ? "Цена ниже EMA200."
        : "Цена выше EMA200."
    );
  }

  if (!volume.strong) {
    blockers.push(
      "Объём закрытой 5M-свечи ниже 1.25× среднего."
    );
  }

  if (!metrics.sweep) {
    blockers.push(
      "Свежего снятия ликвидности нет."
    );
  }

  if (!metrics.orderBlock) {
    blockers.push(
      "Order Block ещё не подтверждён."
    );
  }

  if (!metrics.fvg) {
    blockers.push(
      "Нет открытого FVG рядом с текущей ценой."
    );
  }

  return blockers;
}

function invalidationFor(direction, metrics) {
  const lines = [];

  if (direction === "LONG") {
    lines.push(
      `Закрытие 5M ниже ${formatPrice(metrics.low)} отменяет LONG-структуру.`
    );

    lines.push(
      "Delta 5M и 15M становится устойчиво отрицательной."
    );

    lines.push(
      "Цена возвращается ниже EMA200 и не удерживает ретест."
    );
  } else {
    lines.push(
      `Закрытие 5M выше ${formatPrice(metrics.high)} отменяет SHORT-структуру.`
    );

    lines.push(
      "Delta 5M и 15M становится устойчиво положительной."
    );

    lines.push(
      "Цена возвращается выше EMA200 и удерживает ретест."
    );
  }

  if (metrics.fvg) {
    lines.push(
      `Полное поглощение FVG ${formatPrice(metrics.fvg.from)}–${formatPrice(metrics.fvg.to)} ослабляет сценарий.`
    );
  }

  return lines;
}

function marketNarrative(decision) {
  const metrics = state.metrics["5m"];
  const bias = flowBias();
  const volume = volumeSignal();

  if (!metrics) {
    return "Данных пока недостаточно.";
  }

  const parts = [];

  if (metrics.structure === "BULL") {
    parts.push("На 5M формируется бычья структура HH / HL.");
  } else if (metrics.structure === "BEAR") {
    parts.push("На 5M формируется медвежья структура LH / LL.");
  } else {
    parts.push("На 5M структура смешанная.");
  }

  if (metrics.event !== "NONE") {
    parts.push(`${eventText(metrics.event)} подтверждён закрытой свечой.`);
  } else {
    parts.push("Нового BOS/CHoCH пока нет.");
  }

  if (bias === "BUY") {
    parts.push("Поток сделок сейчас за покупателем.");
  } else if (bias === "SELL") {
    parts.push("Поток сделок сейчас за продавцом.");
  } else {
    parts.push("Поток сделок смешанный.");
  }

  if (volume.strong) {
    parts.push(`Объём ${volume.ratio.toFixed(2)}× среднего подтверждает импульс.`);
  } else {
    parts.push("Объём пока не подтверждает сильное продолжение.");
  }

  if (metrics.sweep?.type === "LOW") {
    parts.push("Нижняя ликвидность снята, возможен отскок.");
  } else if (metrics.sweep?.type === "HIGH") {
    parts.push("Верхняя ликвидность снята, возможен откат вниз.");
  }

  if (decision.action === "ИСКАТЬ ВХОД") {
    parts.push("Условия согласованы, но вход нужен только после ретеста.");
  } else if (decision.action === "ГОТОВИТЬСЯ") {
    parts.push("Направление уже видно, но одного подтверждения ещё не хватает.");
  } else if (decision.action === "НЕ ТРОГАТЬ") {
    parts.push("Преимущества одной стороны нет, рынок лучше пропустить.");
  } else {
    parts.push("Сейчас правильнее ждать, а не угадывать движение.");
  }

  return parts.join(" ");
}







function numberInput(id, fallback) {
  const value = Number(
    document.getElementById(id)?.value
  );

  return Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function positionCalculation() {
  const scenario = tradeScenario();
  if (!scenario) return null;

  const deposit = numberInput("depositInput", 1000);
  const riskPercent = numberInput("riskInput", 0.5);
  const leverage = numberInput("leverageInput", 20);
  const commissionPercent = numberInput("commissionInput", 0.05);

  const riskUsdt = deposit * riskPercent / 100;
  const stopDistance = Math.abs(
    scenario.entry - scenario.stop
  );

  if (stopDistance <= 0 || scenario.entry <= 0) {
    return null;
  }

  const stopPercent = stopDistance / scenario.entry;
  const positionSize = riskUsdt / stopPercent;
  const margin = positionSize / leverage;
  const quantity = positionSize / scenario.entry;

  return {
    deposit,
    riskPercent,
    leverage,
    riskUsdt,
    stopPercent,
    positionSize,
    margin,
    quantity,
    commissionPercent,
    totalCommission: positionSize * commissionPercent / 100 * 2,
  };
}

function renderPositionCalculation() {
  const calculation = positionCalculation();

  if (!calculation) {
    return;
  }

  setText("riskUsdtValue", `${calculation.riskUsdt.toFixed(2)} USDT`);

  setText("positionSizeValue", `${calculation.positionSize.toFixed(2)} USDT`);

  setText("marginValue", `${calculation.margin.toFixed(2)} USDT`);

  setText("quantityValue", calculation.quantity.toFixed(6));

  const scenario = tradeScenario();
  if (scenario) {
    const risk = Math.abs(scenario.entry - scenario.stop);
    const reward = Math.abs(scenario.tp1 - scenario.entry);
    const rr = risk > 0 ? reward / risk : 0;

    setText("rrTp1Value", `1:${rr.toFixed(2)}`);
  }

  setText("commissionValue", `${calculation.totalCommission.toFixed(2)} USDT`);
}

function saveActiveTrade() {
  if (state.activeTrade) {
    localStorage.setItem(
      "ssmarlboross_active_trade",
      JSON.stringify(state.activeTrade)
    );
  } else {
    localStorage.removeItem(
      "ssmarlboross_active_trade"
    );
  }
}

function loadActiveTrade() {
  try {
    const raw = localStorage.getItem(
      "ssmarlboross_active_trade"
    );

    state.activeTrade = raw
      ? JSON.parse(raw)
      : null;
  } catch {
    state.activeTrade = null;
  }
}

function startTradeTracking() {
  const scenario = tradeScenario();
  const calculation = positionCalculation();

  if (!scenario || !calculation) {
    return;
  }

  state.activeTrade = {
    symbol: state.symbol,
    direction: scenario.direction,
    entry: scenario.entry,
    stop: scenario.stop,
    tp1: scenario.tp1,
    tp2: scenario.tp2,
    positionSize: calculation.positionSize,
    margin: calculation.margin,
    quantity: calculation.quantity,
    riskUsdt: calculation.riskUsdt,
    commissionPercent: calculation.commissionPercent,
    realizedPnl: 0,
    remainingFraction: 1,
    originalStop: scenario.stop,
    startedAt: Date.now(),
    breakEvenSuggested: false,
  };

  saveActiveTrade();
  renderTradeMonitor();
}

function closeTradeTracking() {
  state.activeTrade = null;
  saveActiveTrade();
  renderTradeMonitor();
}

function tradePnl(trade, currentPrice) {
  const move = trade.direction === "LONG"
    ? currentPrice - trade.entry
    : trade.entry - currentPrice;

  const pnlUsdt = move * trade.quantity;
  const pnlPercent = (
    move / trade.entry
  ) * 100;

  const roi = trade.margin > 0
    ? pnlUsdt / trade.margin * 100
    : 0;

  return {
    pnlUsdt,
    pnlPercent,
    roi,
  };
}

function targetProgress(trade, currentPrice, target) {
  const total = trade.direction === "LONG"
    ? target - trade.entry
    : trade.entry - target;

  const current = trade.direction === "LONG"
    ? currentPrice - trade.entry
    : trade.entry - currentPrice;

  if (total <= 0) return 0;

  return Math.max(
    0,
    Math.min(100, current / total * 100)
  );
}


function tradeDistancePercent(trade, currentPrice, level) {
  if (!Number.isFinite(level) || currentPrice <= 0) return 0;
  return Math.abs(level - currentPrice) / currentPrice * 100;
}

function moveStopToBreakEven() {
  if (!state.activeTrade) return;

  state.activeTrade.stop = state.activeTrade.entry;
  state.activeTrade.breakEvenSuggested = true;
  saveActiveTrade();
  renderTradeMonitor();
}

function partialCloseTrade() {
  const trade = state.activeTrade;
  if (!trade || trade.remainingFraction <= 0.05) return;

  const currentPrice = Number(
    state.tickerData?.last_price || trade.entry
  );

  const closeFraction = Math.min(
    0.30,
    trade.remainingFraction
  );

  const move = trade.direction === "LONG"
    ? currentPrice - trade.entry
    : trade.entry - currentPrice;

  const gross = move * trade.quantity * closeFraction;
  const commission = (
    trade.positionSize *
    closeFraction *
    trade.commissionPercent / 100
  );

  trade.realizedPnl += gross - commission;
  trade.remainingFraction -= closeFraction;

  saveActiveTrade();
  renderTradeMonitor();
}

function appendJournalTrade(trade, currentPrice, reason) {
  const remainingQty = (
    trade.quantity *
    trade.remainingFraction
  );

  const move = trade.direction === "LONG"
    ? currentPrice - trade.entry
    : trade.entry - currentPrice;

  const grossRemaining = move * remainingQty;

  const exitCommission = (
    trade.positionSize *
    trade.remainingFraction *
    trade.commissionPercent / 100
  );

  const entryCommission = (
    trade.positionSize *
    trade.commissionPercent / 100
  );

  const pnl = (
    trade.realizedPnl +
    grossRemaining -
    exitCommission -
    entryCommission
  );

  const journal = loadJournal();

  journal.unshift({
    symbol: trade.symbol,
    direction: trade.direction,
    entry: trade.entry,
    close: currentPrice,
    pnl,
    reason,
    closedAt: Date.now(),
  });

  localStorage.setItem(
    "ssmarlboross_trade_journal",
    JSON.stringify(journal.slice(0, 50))
  );
}

function finishActiveTrade(reason = "Закрыто вручную") {
  const trade = state.activeTrade;
  if (!trade) return;

  const currentPrice = Number(
    state.tickerData?.last_price || trade.entry
  );

  appendJournalTrade(
    trade,
    currentPrice,
    reason
  );

  state.activeTrade = null;
  saveActiveTrade();
  renderTradeMonitor();
  renderJournal();
}

function loadJournal() {
  try {
    const raw = localStorage.getItem(
      "ssmarlboross_trade_journal"
    );

    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function renderJournal() {
  const journal = loadJournal();

  const wins = journal.filter(
    item => Number(item.pnl) > 0
  ).length;

  const totalPnl = journal.reduce(
    (sum, item) => sum + Number(item.pnl || 0),
    0
  );

  const winRate = journal.length
    ? wins / journal.length * 100
    : 0;

  setText("journalCount", journal.length);

  setText("journalWins", wins);

  setText("journalWinRate", `${winRate.toFixed(1)}%`);

  setText("journalTotalPnl", `${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} USDT`);

  const stateElement = document.getElementById("journalState");
  stateElement.textContent = `${journal.length} СДЕЛОК`;
  stateElement.className = (
    totalPnl >= 0
      ? "structure-state ok"
      : "structure-state bad"
  );

  setHtml("journalRows", journal.slice(0, 10).map(item => `
      <div class="journal-row">
        <strong>${item.symbol}</strong>
        <span>${item.direction}</span>
        <span>${new Date(item.closedAt).toLocaleString("ru-RU")}</span>
        <strong class="${item.pnl >= 0 ? "ok" : "bad"}">
          ${item.pnl >= 0 ? "+" : ""}${Number(item.pnl).toFixed(2)} USDT
        </strong>
      </div>
    `).join(""));
}

function renderTradeMonitor() {
  const monitor = document.getElementById(
    "tradeMonitor"
  );

  const badge = document.getElementById(
    "managerState"
  );

  if (!state.activeTrade) {
    monitor.classList.add("hidden");
    badge.textContent = "НЕТ СДЕЛКИ";
    badge.className = "structure-state warn";
    return;
  }
  const trade = state.activeTrade;
  const currentPrice = Number(
    state.tickerData?.last_price
    || state.metrics["5m"]?.close
    || trade.entry
  );

  const pnl = tradePnl(
    trade,
    currentPrice
  );

  const tp1 = targetProgress(
    trade,
    currentPrice,
    trade.tp1
  );

  const tp2 = targetProgress(
    trade,
    currentPrice,
    trade.tp2
  );

  monitor.classList.remove("hidden");

  badge.textContent = "СОПРОВОЖДЕНИЕ";
  badge.className = (
    pnl.pnlUsdt >= 0
      ? "structure-state ok"
      : "structure-state bad"
  );

  document.getElementById(
    "activeTradeStatus"
  ).textContent = `${trade.direction} · АКТИВНА`;

  document.getElementById(
    "activeCurrentPrice"
  ).textContent = formatPrice(currentPrice);

  const pnlElement = document.getElementById(
    "activePnl"
  );

  pnlElement.textContent = (
    `${pnl.pnlUsdt >= 0 ? "+" : ""}` +
    `${pnl.pnlUsdt.toFixed(2)} USDT ` +
    `(${pnl.pnlPercent >= 0 ? "+" : ""}${pnl.pnlPercent.toFixed(2)}%)`
  );

  pnlElement.className = (
    pnl.pnlUsdt >= 0 ? "ok" : "bad"
  );

  const roiElement = document.getElementById(
    "activeRoi"
  );

  roiElement.textContent = (
    `${pnl.roi >= 0 ? "+" : ""}` +
    `${pnl.roi.toFixed(2)}%`
  );

  roiElement.className = (
    pnl.roi >= 0 ? "ok" : "bad"
  );

  document.getElementById(
    "tp1Progress"
  ).style.width = `${tp1}%`;

  document.getElementById(
    "tp2Progress"
  ).style.width = `${tp2}%`;

  let note = "Держать план. Не менять стоп без причины.";

  const stopHit = trade.direction === "LONG"
    ? currentPrice <= trade.stop
    : currentPrice >= trade.stop;

  const tp1Hit = trade.direction === "LONG"
    ? currentPrice >= trade.tp1
    : currentPrice <= trade.tp1;

  const tp2Hit = trade.direction === "LONG"
    ? currentPrice >= trade.tp2
    : currentPrice <= trade.tp2;

  if (stopHit) {
    note = "Стоп достигнут. Сценарий завершён.";
  } else if (tp2Hit) {
    note = "TP2 достигнут. Зафиксировать остаток позиции.";
  } else if (tp1Hit) {
    note = "TP1 достигнут. Рассмотреть частичную фиксацию и перенос стопа в безубыток.";
  } else if (tp1 >= 75) {
    note = "До TP1 осталось немного. Не увеличивать риск и не расширять стоп.";
  } else if (pnl.pnlUsdt < 0) {
    note = "Сделка в минусе, но стоп не достигнут. Не усреднять без нового сигнала.";
  }

  setText("distanceToStop", `${tradeDistancePercent(trade, currentPrice, trade.stop).toFixed(2)}%`);

  setText("distanceToTp1", `${tradeDistancePercent(trade, currentPrice, trade.tp1).toFixed(2)}%`);

  setText("distanceToTp2", `${tradeDistancePercent(trade, currentPrice, trade.tp2).toFixed(2)}%`);

  setText("realizedPnl", `${trade.realizedPnl >= 0 ? "+" : ""}${Number(trade.realizedPnl || 0).toFixed(2)} USDT`);

  document.getElementById(
    "monitorNote"
  ).textContent = note;
}

function tradeScenario() {
  const strategy = strategyChecklist();
  const metrics = state.metrics["5m"];

  if (!strategy || !metrics) {
    return null;
  }

  const isLong = strategy.direction === "LONG";
  const entry = isLong
    ? metrics.high
    : metrics.low;

  const structureRange = Math.max(
    Math.abs(metrics.high - metrics.low),
    metrics.closedClose * 0.002
  );

  const stopBuffer = Math.max(
    structureRange * 0.12,
    metrics.closedClose * 0.0008
  );

  const stop = isLong
    ? metrics.low - stopBuffer
    : metrics.high + stopBuffer;

  const risk = Math.abs(entry - stop);

  const tp1 = isLong
    ? entry + risk * 1.5
    : entry - risk * 1.5;

  const tp2 = isLong
    ? entry + risk * 2.5
    : entry - risk * 2.5;

  const bias = flowBias();
  const volume = volumeSignal();

  const conditions = [
    {
      label: isLong
        ? "Старший тренд подтверждает LONG"
        : "Старший тренд подтверждает SHORT",
      ok: strategy.checks.find(
        item => item.key === "higherTrend"
      )?.ok || false,
    },
    {
      label: isLong
        ? "На 5M структура HH / HL"
        : "На 5M структура LH / LL",
      ok: strategy.checks.find(
        item => item.key === "structure"
      )?.ok || false,
    },
    {
      label: isLong
        ? `Закрытие 5M выше ${formatPrice(entry)}`
        : `Закрытие 5M ниже ${formatPrice(entry)}`,
      ok: strategy.checks.find(
        item => item.key === "bos"
      )?.ok || false,
    },
    {
      label: isLong
        ? "Delta 5M / 15M за покупателем"
        : "Delta 5M / 15M за продавцом",
      ok: isLong ? bias === "BUY" : bias === "SELL",
    },
    {
      label: "Объём закрытой 5M-свечи выше среднего",
      ok: volume.strong,
    },
    {
      label: `Цена вернулась к ретесту ${formatPrice(entry)}`,
      ok: strategy.retestReady,
    },
  ];

  const passed = conditions.filter(item => item.ok).length;
  const readiness = Math.round(
    passed / conditions.length * 100
  );

  let scenarioStatus = "ЖДАТЬ";

  if (
    readiness === 100 &&
    strategy.structureReady &&
    strategy.triggerReady &&
    strategy.retestReady
  ) {
    scenarioStatus = isLong
      ? "ИСКАТЬ LONG"
      : "ИСКАТЬ SHORT";
  } else if (readiness >= 67) {
    scenarioStatus = "ГОТОВИТЬСЯ";
  } else if (readiness < 34) {
    scenarioStatus = "НЕ ТРОГАТЬ";
  }

  return {
    direction: strategy.direction,
    entry,
    stop,
    tp1,
    tp2,
    conditions,
    readiness,
    state: scenarioStatus,
  };
}

function setTradePriceLine(key, price, title, lineStyle) {
  if (!Number.isFinite(price)) return;

  if (state.tradeLines[key]) {
    candles.removePriceLine(
      state.tradeLines[key]
    );
  }

  state.tradeLines[key] = candles.createPriceLine({
    price,
    color: lineStyle.color,
    lineWidth: 2,
    lineStyle: lineStyle.style,
    axisLabelVisible: true,
    title,
  });
}

function renderTradeLines() {
  const scenario = tradeScenario();
  if (!scenario) return;

  setTradePriceLine(
    "entry",
    scenario.entry,
    `Вход ${scenario.direction}`,
    {
      color: "#6ba6ff",
      style: LightweightCharts.LineStyle.Dashed,
    }
  );

  setTradePriceLine(
    "stop",
    scenario.stop,
    "Стоп",
    {
      color: "#ff6175",
      style: LightweightCharts.LineStyle.Solid,
    }
  );

  setTradePriceLine(
    "tp1",
    scenario.tp1,
    "TP1",
    {
      color: "#ffbd55",
      style: LightweightCharts.LineStyle.Dotted,
    }
  );

  setTradePriceLine(
    "tp2",
    scenario.tp2,
    "TP2",
    {
      color: "#27ca88",
      style: LightweightCharts.LineStyle.Dotted,
    }
  );
}

function renderTradeScenario() {
  const scenario = tradeScenario();
  if (!scenario) return;

  setText("scenarioDirection", scenario.direction);

  setText("scenarioReadiness", `${scenario.readiness}%`);

  setText("scenarioEntry", formatPrice(scenario.entry));

  setText("scenarioStop", formatPrice(scenario.stop));

  setText("scenarioTp1", formatPrice(scenario.tp1));

  setText("scenarioTp2", formatPrice(scenario.tp2));

  setWidth("scenarioProgress", `${scenario.readiness}%`);

  const stateElement = document.getElementById(
    "scenarioState"
  );

  stateElement.textContent = scenario.state;
  stateElement.className = (
    scenario.state === "ИСКАТЬ LONG"
      ? "structure-state ok"
      : scenario.state === "ИСКАТЬ SHORT"
        ? "structure-state bad"
        : "structure-state warn"
  );

  setHtml("scenarioConditions", scenario.conditions.map(item => `
      <div class="scenario-condition ${item.ok ? "ok" : "bad"}">
        ${item.ok ? "✅" : "❌"} ${item.label}
      </div>
    `).join(""));
}

function systemBrain() {
  const strategy = strategyChecklist();
  const metrics = state.metrics["5m"];

  if (!strategy || !metrics) {
    return {
      action: "ЖДАТЬ",
      score: 0,
      direction: "—",
      candles: "—",
      risk: "Неизвестен",
      obstacle: "Недостаточно данных",
      explanation: "Система ещё собирает данные по всем таймфреймам.",
      className: "warn",
    };
  }

  const failed = strategy.checks.filter(item => !item.ok);
  const criticalKeys = new Set([
    "higherTrend",
    "structure",
    "bos",
    "delta",
    "volume",
  ]);

  const criticalFailed = failed.filter(item =>
    criticalKeys.has(item.key)
  );

  const optionalFailed = failed.filter(item =>
    !criticalKeys.has(item.key)
  );

  let action = strategy.status;
  let score = strategy.readiness;
  let className = "warn";

  if (action === "ИСКАТЬ LONG") {
    className = "ok";
  } else if (action === "ИСКАТЬ SHORT") {
    className = "bad";
  }

  let candles = "3+ свечи";

  if (strategy.readiness >= 85 && strategy.retestReady) {
    candles = "Готово сейчас";
  } else if (strategy.readiness >= 75) {
    candles = "1–2 свечи";
  } else if (strategy.readiness >= 60) {
    candles = "2–4 свечи";
  }

  let risk = "Высокий";

  if (
    strategy.readiness >= 85 &&
    strategy.structureReady &&
    strategy.triggerReady &&
    strategy.retestReady
  ) {
    risk = "Ниже среднего";
  } else if (
    strategy.readiness >= 70 &&
    strategy.structureReady
  ) {
    risk = "Средний";
  }

  const obstacle = criticalFailed[0]?.label
    || optionalFailed[0]?.label
    || "Критических препятствий нет";

  const explanation = [];

  explanation.push(
    `Сильнее ${strategy.direction}-сценарий. Выполнено ${strategy.passed} из ${strategy.checks.length} условий.`
  );

  if (!strategy.structureReady) {
    explanation.push(
      "Старший тренд и структура 5M не согласованы, поэтому вход запрещён независимо от остальных индикаторов."
    );
  } else {
    explanation.push(
      "Старший тренд и структура согласованы."
    );
  }

  if (!strategy.triggerReady) {
    explanation.push(
      "Нет полного триггера: BOS, Delta и объём должны подтвердиться одновременно."
    );
  } else {
    explanation.push(
      "Импульс подтверждён BOS, Delta и объёмом."
    );
  }

  if (!strategy.retestReady) {
    explanation.push(
      `Цена ещё не вернулась к уровню ретеста ${formatPrice(strategy.retestLevel)}. Догонять движение нельзя.`
    );
  } else {
    explanation.push(
      `Цена находится у уровня ретеста ${formatPrice(strategy.retestLevel)}.`
    );
  }

  if (
    strategy.status === "ИСКАТЬ LONG" ||
    strategy.status === "ИСКАТЬ SHORT"
  ) {
    explanation.push(
      "Система разрешает искать точку входа на 1M, но не открывает сделку автоматически."
    );
  } else if (strategy.status === "ГОТОВИТЬСЯ") {
    explanation.push(
      "Сценарий близок к готовности, но вход пока преждевременный."
    );
  } else if (strategy.status === "НЕ ТРОГАТЬ") {
    explanation.push(
      "Качество сценария низкое — рынок лучше пропустить."
    );
  } else {
    explanation.push(
      "Правильное действие сейчас — ждать выполнения недостающих условий."
    );
  }

  return {
    action,
    score,
    direction: strategy.direction,
    candles,
    risk,
    obstacle,
    explanation: explanation.join("\n\n"),
    className,
  };
}

function renderSystemBrain() {
  const brain = systemBrain();

  const action = document.getElementById("brainAction");
  action.textContent = brain.action;
  action.className = `brain-action ${brain.className}`;

  setText("brainScore", `${brain.score}%`);

  setWidth("brainProgress", `${brain.score}%`);

  setText("brainDirection", brain.direction);

  setText("brainCandles", brain.candles);

  setText("brainRisk", brain.risk);

  setText("brainObstacle", brain.obstacle);

  setText("brainExplanation", brain.explanation);
}

function strategyChecklist() {
  const metrics = state.metrics["5m"];
  const oneHour = state.metrics["1h"];
  const fifteen = state.metrics["15m"];
  const bias = flowBias();
  const volume = volumeSignal();

  if (!metrics || !oneHour || !fifteen) {
    return null;
  }

  const scores = combinedScores();
  const direction = scores.long >= scores.short
    ? "LONG"
    : "SHORT";

  const isLong = direction === "LONG";

  const checks = [
    {
      key: "higherTrend",
      label: "Старший тренд",
      ok: isLong
        ? (
          oneHour.closedClose > oneHour.ema200 &&
          fifteen.closedClose > fifteen.ema200
        )
        : (
          oneHour.closedClose < oneHour.ema200 &&
          fifteen.closedClose < fifteen.ema200
        ),
    },
    {
      key: "structure",
      label: isLong ? "Структура HH / HL" : "Структура LH / LL",
      ok: isLong
        ? metrics.structure === "BULL"
        : metrics.structure === "BEAR",
    },
    {
      key: "ema",
      label: "EMA20 / EMA50",
      ok: isLong
        ? metrics.ema20 > metrics.ema50
        : metrics.ema20 < metrics.ema50,
    },
    {
      key: "ema200",
      label: "Цена относительно EMA200",
      ok: isLong
        ? metrics.closedClose > metrics.ema200
        : metrics.closedClose < metrics.ema200,
    },
    {
      key: "vwap",
      label: "VWAP",
      ok: isLong
        ? metrics.closedClose > metrics.vwap
        : metrics.closedClose < metrics.vwap,
    },
    {
      key: "supertrend",
      label: "Supertrend",
      ok: isLong
        ? metrics.supertrend === 1
        : metrics.supertrend === -1,
    },
    {
      key: "bos",
      label: isLong ? "BOS вверх" : "BOS вниз",
      ok: isLong
        ? metrics.breakUpActive
        : metrics.breakDownActive,
    },
    {
      key: "delta",
      label: "Delta 5M / 15M",
      ok: isLong
        ? bias === "BUY"
        : bias === "SELL",
    },
    {
      key: "volume",
      label: "Объём выше среднего",
      ok: volume.strong,
    },
    {
      key: "liquidity",
      label: "Снятие ликвидности",
      ok: isLong
        ? metrics.sweep?.type === "LOW"
        : metrics.sweep?.type === "HIGH",
    },
    {
      key: "smartMoney",
      label: "FVG или Order Block",
      ok: Boolean(metrics.fvg || metrics.orderBlock),
    },
  ];

  const passed = checks.filter(item => item.ok).length;
  const readiness = Math.round(
    passed / checks.length * 100
  );

  const structureReady = (
    checks.find(item => item.key === "higherTrend")?.ok &&
    checks.find(item => item.key === "structure")?.ok
  );

  const triggerReady = (
    checks.find(item => item.key === "bos")?.ok &&
    checks.find(item => item.key === "delta")?.ok &&
    checks.find(item => item.key === "volume")?.ok
  );

  const currentPrice = metrics.closedClose;
  const retestLevel = isLong ? metrics.high : metrics.low;
  const retestTolerance = Math.max(
    currentPrice * 0.001,
    Math.abs(metrics.high - metrics.low) * 0.08
  );

  const retestReady = Math.abs(
    currentPrice - retestLevel
  ) <= retestTolerance;

  let status = "ЖДАТЬ";

  if (
    readiness >= 85 &&
    structureReady &&
    triggerReady &&
    retestReady
  ) {
    status = isLong
      ? "ИСКАТЬ LONG"
      : "ИСКАТЬ SHORT";
  } else if (
    readiness >= 70 &&
    structureReady
  ) {
    status = "ГОТОВИТЬСЯ";
  } else if (readiness < 45) {
    status = "НЕ ТРОГАТЬ";
  }

  return {
    direction,
    checks,
    passed,
    readiness,
    structureReady,
    triggerReady,
    retestReady,
    retestLevel,
    status,
  };
}

function renderStrategyCore() {
  const strategy = strategyChecklist();
  if (!strategy) return;

  setText("strategyReadiness", `${strategy.readiness}%`);

  setWidth("strategyReadinessBar", `${strategy.readiness}%`);

  setText("strategyDirection", strategy.direction);

  const gate = document.getElementById("strategyGate");
  gate.textContent = strategy.status;
  gate.className = (
    strategy.status === "ИСКАТЬ LONG"
      ? "structure-state ok"
      : strategy.status === "ИСКАТЬ SHORT"
        ? "structure-state bad"
        : "structure-state warn"
  );

  setHtml("strategyChecks", strategy.checks.map(item => `
      <div class="strategy-check ${item.ok ? "ok" : "bad"}">
        ${item.ok ? "✅" : "❌"} ${item.label}
      </div>
    `).join(""));

  const paintGate = (id, ready, text) => {
    const element = document.getElementById(id);
    element.textContent = `${ready ? "✅" : "❌"} ${text}`;
    element.className = ready ? "ok" : "bad";
  };

  paintGate(
    "gateStructure",
    strategy.structureReady,
    "Структура"
  );

  paintGate(
    "gateTrigger",
    strategy.triggerReady,
    "Триггер"
  );

  paintGate(
    "gateRetest",
    strategy.retestReady,
    "Ретест"
  );
}

function mentorMessage() {
  const strategy = strategyChecklist();
  const metrics = state.metrics["5m"];

  if (!strategy || !metrics) {
    return {
      status: "АНАЛИЗ",
      text: "Данных пока недостаточно.",
    };
  }

  const missing = strategy.checks
    .filter(item => !item.ok)
    .map(item => item.label);

  const directionWord = strategy.direction === "LONG"
    ? "лонговый"
    : "шортовый";

  const lines = [];

  lines.push(
    `Сейчас сильнее ${directionWord} сценарий. Готовность сделки — ${strategy.readiness}%.`
  );

  if (strategy.structureReady) {
    lines.push(
      "Старший тренд и структура 5M согласованы."
    );
  } else {
    lines.push(
      "Старший тренд и структура ещё не согласованы — вход запрещён."
    );
  }

  if (strategy.triggerReady) {
    lines.push(
      "BOS, Delta и объём подтверждают импульс."
    );
  } else {
    lines.push(
      "Полного триггера пока нет: нужен BOS, подтверждение Delta и объёма."
    );
  }

  if (strategy.retestReady) {
    lines.push(
      `Цена находится рядом с уровнем ретеста ${formatPrice(strategy.retestLevel)}.`
    );
  } else {
    lines.push(
      `После подтверждения ждём возврат к уровню ${formatPrice(strategy.retestLevel)}. Не догоняем цену.`
    );
  }

  if (missing.length) {
    lines.push(
      `Не хватает: ${missing.slice(0, 4).join(", ")}.`
    );
  }

  if (
    strategy.status === "ИСКАТЬ LONG" ||
    strategy.status === "ИСКАТЬ SHORT"
  ) {
    lines.push(
      "Можно искать точку входа на 1M после реакции от уровня. Стоп — только за структурой."
    );
  } else if (strategy.status === "ГОТОВИТЬСЯ") {
    lines.push(
      "Направление уже видно, но открывать сделку рано."
    );
  } else if (strategy.status === "НЕ ТРОГАТЬ") {
    lines.push(
      "Качество сценария низкое. Этот рынок лучше пропустить."
    );
  } else {
    lines.push(
      "Сейчас правильное действие — ждать выполнения чек-листа."
    );
  }

  return {
    status: strategy.status,
    text: lines.join("\n\n"),
  };
}

function renderMentor() {
  const mentor = mentorMessage();

  setText("mentorSpeech", mentor.text);

  const status = document.getElementById("mentorStatus");
  status.textContent = mentor.status;
  status.className = (
    mentor.status === "ИСКАТЬ LONG"
      ? "structure-state ok"
      : mentor.status === "ИСКАТЬ SHORT"
        ? "structure-state bad"
        : "structure-state warn"
  );
}

function higherTimeframeTrend() {
  const oneHour = state.metrics["1h"];
  const fifteen = state.metrics["15m"];

  if (!oneHour || !fifteen) {
    return "Нет данных";
  }

  const bull = (
    oneHour.closedClose > oneHour.ema200 &&
    oneHour.ema20 > oneHour.ema50 &&
    fifteen.closedClose > fifteen.ema200
  );

  const bear = (
    oneHour.closedClose < oneHour.ema200 &&
    oneHour.ema20 < oneHour.ema50 &&
    fifteen.closedClose < fifteen.ema200
  );

  if (bull) return "Бычий";
  if (bear) return "Медвежий";
  return "Смешанный";
}

function buildTradePlan(decision) {
  const metrics = state.metrics["5m"];

  if (!metrics) {
    return null;
  }

  const direction = decision.dominantDirection || (
    combinedScores().long >= combinedScores().short
      ? "LONG"
      : "SHORT"
  );

  const isLong = direction === "LONG";
  const atrDistance = Math.max(
    Math.abs(metrics.high - metrics.low) * 0.18,
    metrics.closedClose * 0.0012
  );

  const entry = isLong
    ? metrics.high
    : metrics.low;

  const stop = isLong
    ? metrics.low - atrDistance
    : metrics.high + atrDistance;

  const risk = Math.abs(entry - stop);

  const tp1 = isLong
    ? entry + risk * 1.5
    : entry - risk * 1.5;

  const tp2 = isLong
    ? entry + risk * 2.5
    : entry - risk * 2.5;

  return {
    direction,
    entry,
    stop,
    tp1,
    tp2,
    rr1: 1.5,
    rr2: 2.5,
  };
}

function renderMarketState() {
  const metrics = state.metrics["5m"];
  if (!metrics) return;

  const decision = actionDecision();
  const strategy = strategyChecklist();
  if (strategy) {
    decision.action = strategy.status;
    decision.confidence = strategy.readiness;
    decision.dominantDirection = strategy.direction;
  }
  const bias = flowBias();
  const volume = volumeSignal();
  const trend = higherTimeframeTrend();

  setText("higherTrend", trend);

  setText("marketStructureQuick", structureText(metrics));

  setText("marketFlowQuick", bias === "BUY"
      ? "Покупатели"
      : bias === "SELL"
        ? "Продавцы"
        : "Смешанный");

  setText("marketLiquidityQuick", metrics.sweep?.type === "LOW"
      ? "Снята снизу"
      : metrics.sweep?.type === "HIGH"
        ? "Снята сверху"
        : "Не снята");

  setText("marketSmartQuick", metrics.orderBlock
      ? `${metrics.orderBlock.type} Order Block`
      : metrics.fvg
        ? `${metrics.fvg.type} FVG`
        : "Нет подтверждения");

  setText("marketVolumeQuick", volume.ratio
      ? `${volume.ratio.toFixed(2)}× среднего`
      : "Нет данных");

  const badge = document.getElementById("marketStateBadge");
  badge.textContent = decision.dominantDirection || "ЖДАТЬ";
  badge.className = (
    decision.dominantDirection === "LONG"
      ? "structure-state ok"
      : decision.dominantDirection === "SHORT"
        ? "structure-state bad"
        : "structure-state warn"
  );

  const nowAction = document.getElementById("nowAction");
  nowAction.textContent = decision.action;
  nowAction.className = `${decision.className}`;

  setText("nowSubtitle", decision.action === "ИСКАТЬ LONG"
      ? "Чек-лист выполнен. Ищем реакцию на 1M после ретеста."
      : decision.action === "ИСКАТЬ SHORT"
        ? "Чек-лист выполнен. Ищем реакцию на 1M после ретеста."
        : decision.action === "ГОТОВИТЬСЯ"
          ? "Направление есть, ждём последнее подтверждение."
          : decision.action === "НЕ ТРОГАТЬ"
            ? "Рынок неоднозначный — пропускаем."
            : "Не угадываем движение, ждём условия.");
}

function renderTradePlan() {
  const decision = actionDecision();
  const plan = buildTradePlan(decision);

  if (!plan) return;

  setText("planEntry", formatPrice(plan.entry));

  setText("planStop", formatPrice(plan.stop));

  setText("planTp1", formatPrice(plan.tp1));

  setText("planTp2", formatPrice(plan.tp2));

  setText("planRr1", `1:${plan.rr1.toFixed(1)}`);

  setText("planRr2", `1:${plan.rr2.toFixed(1)}`);

  const steps = [
    `Ждём закрытие 5M ${plan.direction === "LONG" ? "выше" : "ниже"} уровня входа ${formatPrice(plan.entry)}.`,
    `После пробоя ждём ретест уровня ${formatPrice(plan.entry)}.`,
    "На ретесте проверяем Delta и объём.",
    `Стоп ставим за структурой: ${formatPrice(plan.stop)}.`,
    `Первую фиксацию делаем у ${formatPrice(plan.tp1)}.`,
    `Остаток сопровождаем к ${formatPrice(plan.tp2)}.`,
  ];

  setHtml("mentorSteps", steps.map((item, index) => `
      <div class="mentor-step">
        <b>${index + 1}</b>
        <span>${item}</span>
      </div>
    `).join(""));
}

function renderCompactCommand() {
  const metrics = state.metrics["5m"];
  if (!metrics) return;

  const decision = actionDecision();
  const scores = combinedScores();
  const direction = decision.dominantDirection || (
    scores.long >= scores.short ? "LONG" : "SHORT"
  );

  const blockers = blockersFor(direction, metrics);
  const invalidation = invalidationFor(direction, metrics);

  const actionEl = document.getElementById("actionValueCompact");  actionEl.textContent = decision.action;
  actionEl.className = `command-action ${decision.className}`;

  setText("actionSummaryCompact", decision.summary);

  setText("actionConfidenceCompact", `${decision.confidence}%`);

  setText("decisionStateCompact", direction);

  setText("longScoreCompact", `${scores.long}%`);

  setText("shortScoreCompact", `${scores.short}%`);

  setHtml("reasonListCompact", decision.reasons.map(item => `
      <div class="${item[0] ? "ok" : "bad"}">
        ${item[0] ? "✅" : "❌"} ${item[1]}
      </div>
    `).join(""));

  setHtml("nextStepsCompact", decision.next.map((item, index) => `
      <div class="next-step">
        ${index + 1}. ${item}
      </div>
    `).join(""));

  setHtml("invalidationCompact", invalidation.map(item => `
      <div class="scenario-line">⚠ ${item}</div>
    `).join(""));

  setText("marketVoiceCompact", marketNarrative(decision));
}

function renderDecisionEngine() {
  const metrics = state.metrics["5m"];
  if (!metrics) return;

  const decision = actionDecision();
  const direction = decision.dominantDirection || (
    directionScore("LONG") >= directionScore("SHORT")
      ? "LONG"
      : "SHORT"
  );

  const blockers = blockersFor(direction, metrics);
  const invalidation = invalidationFor(direction, metrics);

  setHtml("blockersList", (blockers.length ? blockers : ["Нет критических блокирующих условий."])
    .map(item => `
      <div class="${blockers.length ? "bad" : "ok"}">
        ${blockers.length ? "❌" : "✅"} ${item}
      </div>
    `).join(""));

  setHtml("invalidationList", invalidation.map(item => `
      <div class="scenario-line">
        ⚠ ${item}
      </div>
    `).join(""));

  setText("marketVoice", marketNarrative(decision));

  const stateElement = document.getElementById("decisionState");
  stateElement.textContent = direction;
  stateElement.className = (
    direction === "LONG"
      ? "structure-state ok"
      : "structure-state bad"
  );
}

function combinedScores() {
  const longBase = directionScore("LONG");
  const shortBase = directionScore("SHORT");
  const metrics = state.metrics["5m"];
  const bias = flowBias();
  const volume = volumeSignal();

  let longScore = longBase;
  let shortScore = shortBase;

  if (bias === "BUY") {
    longScore += 8;
    shortScore -= 6;
  } else if (bias === "SELL") {
    shortScore += 8;
    longScore -= 6;
  }

  if (volume.strong && bias === "BUY") {
    longScore += 5;
  }

  if (volume.strong && bias === "SELL") {
    shortScore += 5;
  }

  if (metrics?.sweep?.type === "LOW") {
    longScore += 7;
  }

  if (metrics?.sweep?.type === "HIGH") {
    shortScore += 7;
  }

  if (
    metrics?.event === "BOS_UP" ||
    metrics?.event === "CHOCH_UP"
  ) {
    longScore += 8;
  }

  if (
    metrics?.event === "BOS_DOWN" ||
    metrics?.event === "CHOCH_DOWN"
  ) {
    shortScore += 8;
  }

  return {
    long: Math.max(0, Math.min(100, Math.round(longScore))),
    short: Math.max(0, Math.min(100, Math.round(shortScore))),
  };
}

function actionDecision() {
  const metrics = state.metrics["5m"];
  const scores = combinedScores();
  const volume = volumeSignal();
  const bias = flowBias();

  if (!metrics) {
    return {
      action: "ЖДАТЬ",
      confidence: 0,
      className: "warn",
      reasons: [],
      next: ["Дождаться загрузки 1H / 15M / 5M / 1M."],
      summary: "Данных пока недостаточно.",
    };
  }

  const dominantDirection = (
    scores.long > scores.short
      ? "LONG"
      : "SHORT"
  );

  const dominantScore = Math.max(
    scores.long,
    scores.short
  );

  const scoreGap = Math.abs(
    scores.long - scores.short
  );

  const structureMatch = dominantDirection === "LONG"
    ? metrics.structure === "BULL"
    : metrics.structure === "BEAR";

  const bosMatch = dominantDirection === "LONG"
    ? metrics.breakUpActive
    : metrics.breakDownActive;

  const deltaMatch = dominantDirection === "LONG"
    ? bias === "BUY"
    : bias === "SELL";

  const sweepMatch = dominantDirection === "LONG"
    ? metrics.sweep?.type === "LOW"
    : metrics.sweep?.type === "HIGH";

  const reasons = [
    [
      structureMatch,
      `Структура 5M ${structureText(metrics)}`
    ],
    [
      bosMatch,
      dominantDirection === "LONG"
        ? "Закрытие выше swing high"
        : "Закрытие ниже swing low"
    ],
    [
      deltaMatch,
      dominantDirection === "LONG"
        ? "Delta 5M/15M за покупателем"
        : "Delta 5M/15M за продавцом"
    ],
    [
      volume.strong,
      `Объём ${volume.ratio ? volume.ratio.toFixed(2) : "0"}× среднего`
    ],
    [
      Boolean(metrics.fvg),
      "Есть открытый FVG"
    ],
    [
      Boolean(metrics.orderBlock),
      "Есть Order Block"
    ],
    [
      sweepMatch,
      dominantDirection === "LONG"
        ? "Снята нижняя ликвидность"
        : "Снята верхняя ликвидность"
    ],
  ];

  const next = [];

  if (!structureMatch) {
    next.push(
      dominantDirection === "LONG"
        ? "Дождаться структуры HH / HL на 5M."
        : "Дождаться структуры LH / LL на 5M."
    );
  }

  if (!bosMatch) {
    next.push(
      dominantDirection === "LONG"
        ? `Закрытие 5M выше ${formatPrice(metrics.high)}.`
        : `Закрытие 5M ниже ${formatPrice(metrics.low)}.`
    );
  }

  if (!deltaMatch) {
    next.push(
      dominantDirection === "LONG"
        ? "Delta 5M и 15M должна стать положительной."
        : "Delta 5M и 15M должна стать отрицательной."
    );
  }

  if (!volume.strong) {
    next.push(
      "Объём закрытой 5M-свечи должен быть минимум 1.25× среднего."
    );
  }

  if (bosMatch && structureMatch) {
    next.push(
      dominantDirection === "LONG"
        ? `Ждём ретест ${formatPrice(metrics.high)} сверху.`
        : `Ждём ретест ${formatPrice(metrics.low)} снизу.`
    );
  }

  let action = "ЖДАТЬ";
  let className = "warn";
  let summary = (
    `${dominantDirection} сильнее: ` +
    `${dominantDirection === "LONG" ? scores.long : scores.short}% против ` +
    `${dominantDirection === "LONG" ? scores.short : scores.long}%.`
  );

  if (
    dominantScore >= 82 &&
    scoreGap >= 20 &&
    structureMatch &&
    bosMatch &&
    deltaMatch
  ) {
    action = dominantDirection === "LONG" ? "ИСКАТЬ LONG" : "ИСКАТЬ SHORT";
    className = dominantDirection === "LONG" ? "ok" : "bad";
    summary += " Условия согласованы. Вход только после ретеста, не по догоняющей свече.";
  } else if (
    dominantScore >= 70 &&
    structureMatch
  ) {
    action = "ГОТОВИТЬСЯ";
    className = "warn";
    summary += " Направление есть, но подтверждений пока недостаточно.";
  } else if (scoreGap < 12) {
    action = "НЕ ТРОГАТЬ";
    className = "warn";
    summary = "LONG и SHORT почти равны. Рынок неоднозначный.";
  }

  return {
    action,
    confidence: dominantScore,
    className,
    reasons,
    next: next.length ? next : ["Ждать ретест и не догонять цену."],
    summary,
    dominantDirection,
    scores,
  };
}

function renderActionPanel() {
  const decision = actionDecision();

  const actionElement = document.getElementById(
    "actionValue"
  );

  actionElement.textContent = decision.action;
  actionElement.className = `action-value ${decision.className}`;

  document.getElementById(
    "actionConfidence"
  ).textContent = `${decision.confidence}%`;

  document.getElementById(
    "actionReason"
  ).textContent = decision.summary;

  document.getElementById(
    "reasonList"
  ).innerHTML = decision.reasons.map(item => `
    <div class="${item[0] ? "ok" : "bad"}">
      ${item[0] ? "✅" : "❌"} ${item[1]}
    </div>
  `).join("");

  document.getElementById(
    "nextSteps"
  ).innerHTML = decision.next.map(
    (item, index) => `
      <div class="next-step">
        ${index + 1}. ${item}
      </div>
    `
  ).join("");
}

function renderOrderFlow() {
  const d1 = deltaFor(60);
  const d5 = deltaFor(300);
  const d15 = deltaFor(900);
  const d60 = deltaFor(3600);
  const bias = flowBias();
  const volume = volumeSignal();

  const paint = (id, value) => {
    const element = document.getElementById(id);
    element.textContent = `${value >= 0 ? "+" : ""}${formatCompact(value)}`;
    element.className = value > 0 ? "ok" : value < 0 ? "bad" : "warn";
  };

  paint("delta1m", d1);
  paint("delta5m", d5);
  paint("delta15m", d15);
  paint("delta1h", d60);
  paint("cvdSession", state.cvdSession);

  const oiChange = (
    Number.isFinite(state.currentOi) &&
    Number.isFinite(state.previousOi) &&
    state.previousOi !== 0
  )
    ? (state.currentOi - state.previousOi) / state.previousOi * 100
    : null;

  const oiElement = document.getElementById("oiChange");
  oiElement.textContent = oiChange === null
    ? "Накопление…"
    : `${oiChange >= 0 ? "+" : ""}${oiChange.toFixed(3)}%`;
  oiElement.className = oiChange > 0 ? "ok" : oiChange < 0 ? "bad" : "warn";

  setText("volumeConfirm", volume.ratio
      ? `${volume.ratio.toFixed(2)}× среднего`
      : "—");

  setText("fundingFlow", state.tickerData
      ? `${(state.tickerData.funding_rate * 100).toFixed(4)}%`
      : "—");

  const stateElement = document.getElementById("flowState");
  stateElement.textContent = (
    bias === "BUY"
      ? "ПОКУПАТЕЛЬ"
      : bias === "SELL"
        ? "ПРОДАВЕЦ"
        : "СМЕШАННО"
  );
  stateElement.className = (
    bias === "BUY"
      ? "structure-state ok"
      : bias === "SELL"
        ? "structure-state bad"
        : "structure-state warn"
  );

  const metrics = state.metrics["5m"];
  const priceDown = metrics && metrics.closedClose < metrics.ema20;
  const priceUp = metrics && metrics.closedClose > metrics.ema20;

  let message;

  if (priceDown && d5 > 0) {
    message = "Цена ниже EMA20, но Delta 5M положительная: возможное поглощение продаж или подготовка отскока.";
  } else if (priceUp && d5 < 0) {
    message = "Цена выше EMA20, но Delta 5M отрицательная: рост может быть слабым или поглощаться продавцом.";
  } else if (bias === "SELL" && volume.strong) {
    message = "Продавец контролирует поток, объём выше среднего. Медвежий импульс подтверждается.";
  } else if (bias === "BUY" && volume.strong) {
    message = "Покупатель контролирует поток, объём выше среднего. Бычий импульс подтверждается.";
  } else if (bias === "SELL") {
    message = "Delta 5M и 15M отрицательная, но сильного объёмного подтверждения пока нет.";
  } else if (bias === "BUY") {
    message = "Delta 5M и 15M положительная, но сильного объёмного подтверждения пока нет.";
  } else {
    message = "Поток смешанный. Необходимо ждать согласования Delta, структуры и объёма.";
  }

  setText("flowText", message);
}

async function fetchDeals() {
  const response = await fetch(
    `/api/deals?symbol=${encodeURIComponent(state.symbol)}&limit=100`,
    { cache: "no-store" }
  );

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.detail || `Ошибка ${response.status}`);
  }

  payload.deals.forEach(deal => {
    const key = [
      deal.time,
      deal.price,
      deal.volume,
      deal.side
    ].join(":");

    if (!state.deals.has(key)) {
      state.deals.set(key, deal);
      state.cvdSession += signedDealVolume(deal);
    }
  });

  const cutoff = Date.now() - 3600_000;

  state.deals.forEach((deal, key) => {
    if (deal.time < cutoff) {
      state.deals.delete(key);
    }
  });
}

function renderTimeframes() {
  const host = document.getElementById("tfGrid");
  host.innerHTML = "";

  ["1h", "15m", "5m", "1m"].forEach(timeframe => {
    const metrics = state.metrics[timeframe];
    const card = document.createElement("div");
    card.className = "tf-card";

    if (!metrics) {
      card.innerHTML = `
        <div class="tf-title">
          <span>${timeframe.toUpperCase()}</span>
          <span class="warn">…</span>
        </div>
      `;
    } else {
      const checks = [
        [condition(metrics, "ema"), "EMA20/50"],
        [condition(metrics, "ema200"), "EMA200"],
        [condition(metrics, "vwap"), "VWAP"],
        [condition(metrics, "supertrend"), "Supertrend"],
        [
          condition(metrics, "structure"),
          `Структура ${structureText(metrics)}`
        ],
        [
          condition(metrics, "bos"),
          eventText(metrics.event)
        ],
      ];

      const passed = checks.filter(
        item => item[0]
      ).length;

      card.innerHTML = `
        <div class="tf-title">
          <span>${timeframe.toUpperCase()}</span>
          <span class="${
            passed >= 5
              ? "ok"
              : passed >= 3
                ? "warn"
                : "bad"
          }">
            ${passed}/6
          </span>
        </div>
        <div class="checks">
          ${checks.map(item => `
            <div class="${item[0] ? "ok" : "bad"}">
              ● ${item[1]}
            </div>
          `).join("")}
        </div>
      `;
    }

    host.append(card);
  });
}

function renderStructurePanel() {
  const metrics = state.metrics["5m"];
  if (!metrics) return;

  const longScore = directionScore("LONG");
  const shortScore = directionScore("SHORT");

  setText("longScore", `${longScore}%`);

  setText("shortScore", `${shortScore}%`);

  const stateElement = document.getElementById(
    "structureState"
  );

  stateElement.textContent = structureText(metrics);

  stateElement.className = (
    metrics.structure === "BULL"
      ? "structure-state ok"
      : metrics.structure === "BEAR"
        ? "structure-state bad"
        : "structure-state warn"
  );

  setText("swingHigh", `${metrics.highLabel} · ${formatPrice(metrics.high)}`);

  setText("swingLow", `${metrics.lowLabel} · ${formatPrice(metrics.low)}`);

  setText("structureEvent", eventText(metrics.event));

  setText("closedCandle", formatPrice(metrics.closedClose));
}


function renderSmartMoney() {
  const metrics = state.metrics["5m"];
  if (!metrics) return;

  const smartState = document.getElementById(
    "smartState"
  );

  let label = "ЖДАТЬ";
  let className = "structure-state warn";

  if (
    metrics.sweep?.type === "LOW" &&
    (
      metrics.event === "CHOCH_UP" ||
      metrics.event === "BOS_UP"
    )
  ) {
    label = "LONG SETUP";
    className = "structure-state ok";
  } else if (
    metrics.sweep?.type === "HIGH" &&
    (
      metrics.event === "CHOCH_DOWN" ||
      metrics.event === "BOS_DOWN"
    )
  ) {
    label = "SHORT SETUP";
    className = "structure-state bad";
  }

  smartState.textContent = label;
  smartState.className = className;

  setText("fvgState", metrics.fvg
      ? `${metrics.fvg.type} · ${formatPrice(metrics.fvg.from)}–${formatPrice(metrics.fvg.to)}`
      : "Нет открытого FVG");

  const equalParts = [];

  if (metrics.equal.high) {
    equalParts.push(
      `EQH ${formatPrice(metrics.equal.high.value)}`
    );
  }

  if (metrics.equal.low) {
    equalParts.push(
      `EQL ${formatPrice(metrics.equal.low.value)}`
    );
  }

  setText("equalState", equalParts.length
      ? equalParts.join(" · ")
      : "Не найдено");

  setText("sweepState", metrics.sweep
      ? `${metrics.sweep.type === "LOW" ? "LOW" : "HIGH"} · ${formatPrice(metrics.sweep.level)}`
      : "Нет свежего sweep");

  setText("obState", metrics.orderBlock
      ? `${metrics.orderBlock.type} · ${formatPrice(metrics.orderBlock.low)}–${formatPrice(metrics.orderBlock.high)}`
      : "Не подтверждён");

  const checklist = [
    [
      Boolean(metrics.equal.high || metrics.equal.low),
      "Есть Equal High/Low"
    ],
    [
      Boolean(metrics.sweep),
      "Ликвидность снята"
    ],
    [
      metrics.event !== "NONE",
      "Есть BOS/CHoCH"
    ],
    [
      Boolean(metrics.fvg),
      "Есть открытый FVG"
    ],
    [
      Boolean(metrics.orderBlock),
      "Есть Order Block"
    ],
  ];

  setHtml("smartChecklist", checklist.map(item => `
      <div class="${item[0] ? "ok" : "bad"}">
        ${item[0] ? "✅" : "❌"} ${item[1]}
      </div>
    `).join(""));

  setText("assistantText", smartMoneyText(metrics));
}

function renderDecision() {
  const metrics = state.metrics["5m"];
  if (!metrics) return;

  const isLong = state.direction === "LONG";
  const score = directionScore(state.direction);

  const confirmation = isLong
    ? metrics.high
    : metrics.low;

  const cancellation = isLong
    ? metrics.low
    : metrics.high;

  const range = Math.max(
    Math.abs(metrics.high - metrics.low),
    metrics.closedClose * 0.002
  );

  const target1 = isLong
    ? metrics.closedClose + range
    : metrics.closedClose - range;

  const target2 = isLong
    ? metrics.closedClose + range * 2
    : metrics.closedClose - range * 2;

  setText("score", `${score}%`);

  setWidth("scoreBar", `${score}%`);

  const badge = document.getElementById("badge");

  const structureMatches = condition(
    metrics,
    "structure"
  );

  const bosConfirmed = condition(
    metrics,
    "bos"
  );

  if (
    score >= 80 &&
    structureMatches &&
    bosConfirmed
  ) {
    badge.textContent = "ПОДТВЕРЖДЁН";
    badge.style.color = "#b8f7db";
    badge.style.background =
      "rgba(39,202,136,.10)";
  } else if (
    score >= 60 &&
    structureMatches
  ) {
    badge.textContent = "ЖДАТЬ BOS";
    badge.style.color = "#ffd89d";
    badge.style.background =
      "rgba(255,189,85,.10)";
  } else {
    badge.textContent = "ЗАПРЕЩЁН";
    badge.style.color = "#ffd0d6";
    badge.style.background =
      "rgba(255,97,117,.10)";
  }

  let instruction;

  if (!structureMatches) {
    instruction = isLong
      ? `Структура 5M сейчас ${structureText(metrics)}. LONG запрещён до формирования HH/HL.`
      : `Структура 5M сейчас ${structureText(metrics)}. SHORT запрещён до формирования LH/LL.`;
  } else if (bosConfirmed) {
    instruction = (
      `${eventText(metrics.event)} подтверждён закрытой 5M-свечой. ` +
      `Ждём ретест уровня ${formatPrice(confirmation)} ` +
      `${isLong ? "сверху" : "снизу"}; без ретеста не догоняем цену.`
    );
  } else {
    instruction = isLong
      ? `Есть структура HH/HL. Ждём закрытие 5M выше ${formatPrice(confirmation)} для BOS вверх.`
      : `Есть структура LH/LL. Ждём закрытие 5M ниже ${formatPrice(confirmation)} для BOS вниз.`;
  }

  setText("waitText", instruction);

  setText("confirm", formatPrice(confirmation));

  setText("cancel", formatPrice(cancellation));

  setText("target1", formatPrice(target1));

  setText("target2", formatPrice(target2));
}

function renderChart() {
  const data = state.data[state.timeframe];
  if (!data || !data.length) return;

  const metrics = analyse(data);
  const arrays = metrics.arrays;

  candles.setData(
    data.map(item => ({
      time: item.time,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
    }))
  );

  ema20Series.setData(
    data.map((item, index) => ({
      time: item.time,
      value: arrays.e20[index],
    }))
  );

  ema50Series.setData(
    data.map((item, index) => ({
      time: item.time,
      value: arrays.e50[index],
    }))
  );

  ema200Series.setData(
    data.map((item, index) => ({
      time: item.time,
      value: arrays.e200[index],
    }))
  );

  vwapSeries.setData(arrays.vw);

  supertrendSeries.setData(
    arrays.st.map(item => ({
      time: item.time,
      value: item.value,
    }))
  );

  volumeSeries.setData(
    data.map(item => ({
      time: item.time,
      value: item.volume,
      color: item.close >= item.open
        ? "rgba(39,202,136,.38)"
        : "rgba(255,97,117,.38)",
    }))
  );

  if (
    typeof LightweightCharts.createSeriesMarkers === "function"
  ) {
    if (state.markersApi?.setMarkers) {
      state.markersApi.setMarkers(
        metrics.pivotMarkers
      );
    } else {
      state.markersApi =
        LightweightCharts.createSeriesMarkers(
          candles,
          metrics.pivotMarkers
        );
    }
  }

  setText("chartTitle", `${state.symbol} · ${state.timeframe.toUpperCase()}`);

  setText("chartPrice", formatPrice(data.at(-1).close));

  renderTradeLines();
  chart.timeScale().fitContent();
}

function secondsPerTimeframe() {
  return {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
  }[state.timeframe];
}

function updateCandleTimer() {
  const seconds = secondsPerTimeframe();
  const now = Math.floor(Date.now() / 1000);
  const remaining = seconds - (now % seconds);

  const minutes = Math.floor(remaining / 60);
  const secs = remaining % 60;

  setText("candleTimer", `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
}

async function fetchTimeframe(timeframe) {
  const response = await fetch(
    `/api/klines?symbol=${encodeURIComponent(state.symbol)}&timeframe=${timeframe}&limit=350`,
    { cache: "no-store" }
  );

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.detail || `Ошибка ${response.status}`);
  }

  state.data[timeframe] = payload.candles;
  state.metrics[timeframe] = analyse(payload.candles);
}

async function fetchTicker() {
  const response = await fetch(
    `/api/ticker?symbol=${encodeURIComponent(state.symbol)}`,
    { cache: "no-store" }
  );

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.detail || `Ошибка ${response.status}`);
  }

  setText("last", formatPrice(payload.last_price));

  setText("bid", formatPrice(payload.bid));

  setText("ask", formatPrice(payload.ask));

  setText("fair", formatPrice(payload.fair_price));

  setText("index", formatPrice(payload.index_price));

  setText("funding", `${(payload.funding_rate * 100).toFixed(4)}%`);

  setText("openInterest", formatCompact(payload.open_interest));

  state.previousOi = state.currentOi;
  state.currentOi = payload.open_interest;
  state.tickerData = payload;
}






function checkValue(strategy, key) {
  return strategy?.checks?.find(
    item => item.key === key
  )?.ok || false;
}

function percentageFromBooleans(values) {
  if (!values.length) return 0;

  const passed = values.filter(Boolean).length;

  return Math.round(
    passed / values.length * 100
  );
}

function computeDynamicSignalIntelligence() {
  const strategy = strategyChecklist();
  const risk = proRiskAssessment();

  if (!strategy) {
    return {
      score: 0,
      direction: "—",
      level: "НЕТ ДАННЫХ",
      trend: "STABLE",
      trendLabel: "СТАБИЛЬНО",
      change: 0,
      components: {
        trend: 0,
        structure: 0,
        flow: 0,
        smart: 0,
        risk: 0,
      },
      explanation: "Недостаточно данных по таймфреймам.",
    };
  }

  const weights = {
    higherTrend: 14,
    structure: 14,
    ema: 8,
    ema200: 8,
    vwap: 5,
    supertrend: 7,
    bos: 14,
    delta: 12,
    volume: 8,
    liquidity: 5,
    smartMoney: 5,
  };

  let score = 0;

  Object.entries(weights).forEach(([key, weight]) => {
    if (checkValue(strategy, key)) {
      score += weight;
    }
  });

  if (strategy.retestReady) {
    score += 3;
  } else {
    score -= 3;
  }

  if (risk.rr >= 2) {
    score += 3;
  } else if (risk.rr < 1.5) {
    score -= 8;
  }

  if (
    dynamic &&
    dynamic.trend === "WEAKENING" &&
    dynamic.score < 70 &&
    !state.activeTrade
  ) {
    return {
      action: "СЦЕНАРИЙ ОСЛАБ",
      className: "blocked",
      textClass: "bad",
      subtitle: `Динамическая оценка снизилась до ${dynamic.score}/100.`,
      direction: strategy.direction,
      score: dynamic.score,
      risk,
      guards,
      voice: "Сигнал заметно ослабевает. Не входи и дождись нового подтверждения.",
    };
  }

  if (risk.lateEntry) {
    score -= 12;
  }

  if (risk.commissionPressure) {
    score -= 5;
  }

  if (risk.invalidated) {
    score = 0;
  }

  score = Math.max(
    0,
    Math.min(100, Math.round(score))
  );
  const components = {
    trend: percentageFromBooleans([
      checkValue(strategy, "higherTrend"),
      checkValue(strategy, "ema"),
      checkValue(strategy, "ema200"),
      checkValue(strategy, "vwap"),
      checkValue(strategy, "supertrend"),
    ]),
    structure: percentageFromBooleans([
      checkValue(strategy, "structure"),
      checkValue(strategy, "bos"),
      strategy.retestReady,
    ]),
    flow: percentageFromBooleans([
      checkValue(strategy, "delta"),
      checkValue(strategy, "volume"),
      state.dataHealth.deals,
    ]),
    smart: percentageFromBooleans([
      checkValue(strategy, "liquidity"),
      checkValue(strategy, "smartMoney"),
    ]),
    risk: percentageFromBooleans([
      risk.rr >= 1.5,
      !risk.lateEntry,
      !risk.invalidated,
      !risk.commissionPressure,
    ]),
  };

  const history = state.signalIntelligence.history;
  const reference = history.length >= 10
    ? history[history.length - 10].score
    : history.length
      ? history[0].score
      : score;

  const change = score - reference;

  let trend = "STABLE";
  let trendLabel = "→ СТАБИЛЬНО";

  if (change >= 3) {
    trend = "STRENGTHENING";
    trendLabel = `↑ УСИЛИВАЕТСЯ +${change}`;
  } else if (change <= -3) {
    trend = "WEAKENING";
    trendLabel = `↓ СЛАБЕЕТ ${change}`;
  }

  let level = "СЛАБЫЙ";

  if (score >= 85) {
    level = "СИЛЬНЫЙ";
  } else if (score >= 70) {
    level = "ХОРОШИЙ";
  } else if (score >= 55) {
    level = "СРЕДНИЙ";
  }

  const weakComponents = Object.entries(components)
    .filter(([, value]) => value < 67)
    .sort((a, b) => a[1] - b[1]);

  const componentNames = {
    trend: "тренд",
    structure: "структура и BOS",
    flow: "Delta и объём",
    smart: "ликвидность / Smart Money",
    risk: "качество точки входа",
  };

  let explanation =
    `${level} ${strategy.direction}-сигнал: ${score}/100. `;

  if (trend === "STRENGTHENING") {
    explanation +=
      "За последние секунды подтверждения усиливаются. ";
  } else if (trend === "WEAKENING") {
    explanation +=
      "Сценарий ослабевает — не спеши с входом. ";
  } else {
    explanation +=
      "Сила сигнала существенно не изменилась. ";
  }

  if (weakComponents.length) {
    explanation +=
      `Главное слабое место: ${componentNames[weakComponents[0][0]]} — ${weakComponents[0][1]}%.`;
  } else {
    explanation +=
      "Все основные блоки стратегии согласованы.";
  }

  return {
    score,
    direction: strategy.direction,
    level,
    trend,
    trendLabel,
    change,
    components,
    explanation,
  };
}

function updateDynamicSignalIntelligence() {
  const snapshot = computeDynamicSignalIntelligence();
  const intelligence = state.signalIntelligence;

  intelligence.latest = snapshot;
  intelligence.history.push({
    time: Date.now(),
    score: snapshot.score,
    direction: snapshot.direction,
  });

  if (intelligence.history.length > 120) {
    intelligence.history.splice(
      0,
      intelligence.history.length - 120
    );
  }

  intelligence.peakScore = Math.max(
    snapshot.score,
    intelligence.peakScore || 0
  );

  if (snapshot.score < 50) {
    intelligence.peakScore = snapshot.score;
  }

  processSignalNotification(snapshot);

  return snapshot;
}

function sparklinePath(history) {
  if (!history.length) return "";

  const width = 320;
  const height = 90;
  const padding = 8;

  return history.map((item, index) => {
    const x = history.length === 1
      ? padding
      : padding + (
          index / (history.length - 1)
        ) * (width - padding * 2);

    const y = height - padding - (
      item.score / 100
    ) * (height - padding * 2);

    return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
}

function renderSignalSparkline(snapshot) {
  const svg = getElement("signalSparkline");
  if (!svg) return;

  const path = sparklinePath(
    state.signalIntelligence.history
  );

  const stroke = snapshot.trend === "STRENGTHENING"
    ? "#27ca88"
    : snapshot.trend === "WEAKENING"
      ? "#ff6175"
      : "#ffbd55";

  svg.innerHTML = `
    <line x1="0" y1="45" x2="320" y2="45"
      stroke="rgba(152,162,177,.18)" stroke-width="1" />
    <path
      d="${path}"
      fill="none"
      stroke="${stroke}"
      stroke-width="3"
      vector-effect="non-scaling-stroke"
    />
  `;
}

function renderDynamicSignalIntelligence() {
  const snapshot = state.signalIntelligence.latest
    || updateDynamicSignalIntelligence();

  setText(
    "dynamicSignalScore",
    `${snapshot.score}%`
  );

  setClass(
    "dynamicSignalScore",
    `intelligence-score ${
      snapshot.score >= 85
        ? "ok"
        : snapshot.score >= 70
          ? "warn"
          : "bad"
    }`
  );

  setText(
    "dynamicSignalTrend",
    snapshot.trendLabel
  );

  setClass(
    "dynamicSignalTrend",
    snapshot.trend === "STRENGTHENING"
      ? "ok"
      : snapshot.trend === "WEAKENING"
        ? "bad"
        : "warn"
  );

  const componentMap = [
    ["Trend", snapshot.components.trend],
    ["Structure", snapshot.components.structure],
    ["Flow", snapshot.components.flow],
    ["Smart", snapshot.components.smart],
    ["Risk", snapshot.components.risk],
  ];

  componentMap.forEach(([name, value]) => {
    setText(
      `component${name}Value`,
      `${value}%`
    );

    setWidth(
      `component${name}Bar`,
      `${value}%`
    );
  });

  setText(
    "dynamicSignalExplanation",
    snapshot.explanation
  );

  renderSignalSparkline(snapshot);
  renderNotificationStatus();
}

function currentNotificationAction() {
  const decision = proDecision();

  if (
    decision.action === "ВХОДИТЬ LONG" ||
    decision.action === "ВХОДИТЬ SHORT"
  ) {
    return decision.action;
  }

  if (
    decision.action === "СЦЕНАРИЙ ОТМЕНЁН" ||
    decision.action === "СДЕЛКУ ПРОПУСТИТЬ"
  ) {
    return decision.action;
  }

  return null;
}

function sendBrowserNotification(title, body) {
  if (
    !state.signalIntelligence.notificationsEnabled ||
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  try {
    new Notification(title, {
      body,
      tag: "ssmarlboross-signal",
      renotify: true,
    });
  } catch (reason) {
    console.error("[notification]", reason);
  }
}

function processSignalNotification(snapshot) {
  const intelligence = state.signalIntelligence;
  const action = currentNotificationAction();

  if (action) {
    const key = `${action}:${snapshot.direction}`;

    if (key !== intelligence.lastAlertKey) {
      if (
        action === "ВХОДИТЬ LONG" ||
        action === "ВХОДИТЬ SHORT"
      ) {
        sendBrowserNotification(
          `ssMarlboross: ${action}`,
          `Сила сигнала ${snapshot.score}/100. Проверь реакцию на 1M и уровень входа.`
        );
      } else {
        sendBrowserNotification(
          `ssMarlboross: ${action}`,
          snapshot.explanation
        );
      }

      intelligence.lastAlertKey = key;
    }

    return;
  }

  if (
    intelligence.peakScore >= 80 &&
    intelligence.peakScore - snapshot.score >= 10
  ) {
    const key = `WEAKENING:${snapshot.direction}:${Math.floor(snapshot.score / 5)}`;

    if (key !== intelligence.lastAlertKey) {
      sendBrowserNotification(
        "ssMarlboross: сигнал ослаб",
        `Оценка снизилась с ${intelligence.peakScore} до ${snapshot.score}. Не спеши с входом.`
      );

      intelligence.lastAlertKey = key;
    }
  }
}

async function enableBrowserNotifications() {
  if (typeof Notification === "undefined") {
    setText(
      "notificationStatus",
      "Этот браузер не поддерживает системные уведомления."
    );
    return;
  }

  try {
    const permission = await Notification.requestPermission();

    state.signalIntelligence.notificationsEnabled =
      permission === "granted";

    localStorage.setItem(
      "ssmarlboross_notifications",
      state.signalIntelligence.notificationsEnabled
        ? "1"
        : "0"
    );

    renderNotificationStatus();
  } catch (reason) {
    setText(
      "notificationStatus",
      `Не удалось включить уведомления: ${reason.message || String(reason)}`
    );
  }
}

function loadNotificationPreference() {
  state.signalIntelligence.notificationsEnabled = (
    localStorage.getItem(
      "ssmarlboross_notifications"
    ) === "1" &&
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  );
}

function renderNotificationStatus() {
  const enabled = (
    state.signalIntelligence.notificationsEnabled &&
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  );

  setText(
    "notificationStatus",
    enabled
      ? "Уведомления включены. Терминал сообщит о разрешённом входе и отмене сценария."
      : "Уведомления выключены. Нажми кнопку, чтобы получать сигнал при открытой странице."
  );

  setText(
    "enableNotificationsButton",
    enabled
      ? "Уведомления включены"
      : "Включить уведомления"
  );
}

function proRiskAssessment() {
  const strategy = strategyChecklist();
  const scenario = tradeScenario();
  const calculation = positionCalculation();
  const currentPrice = currentMarketPrice();

  if (!strategy || !scenario) {
    return {
      stars: "★★★★★",
      level: "Высокий",
      rr: 0,
      lateEntry: false,
      invalidated: false,
      priceDistance: 0,
      commissionPressure: false,
    };
  }

  const riskDistance = Math.abs(
    scenario.entry - scenario.stop
  );

  const rewardDistance = Math.abs(
    scenario.tp1 - scenario.entry
  );

  const rr = riskDistance > 0
    ? rewardDistance / riskDistance
    : 0;

  const priceDistance = scenario.entry > 0
    ? Math.abs(currentPrice - scenario.entry) /
      scenario.entry * 100
    : 0;

  const lateEntry = priceDistance > 0.25;

  const invalidated = scenario.direction === "LONG"
    ? currentPrice <= scenario.stop
    : currentPrice >= scenario.stop;

  const commissionPressure = calculation
    ? calculation.totalCommission >
      calculation.riskUsdt * 0.25
    : false;

  let points = 0;

  if (strategy.readiness >= 85) points += 1;
  if (strategy.structureReady) points += 1;
  if (strategy.triggerReady) points += 1;
  if (strategy.retestReady) points += 1;
  if (rr >= 1.5) points += 1;

  const stars = "★".repeat(points) +
    "☆".repeat(5 - points);

  let level = "Высокий";

  if (
    points >= 4 &&
    !lateEntry &&
    !invalidated &&
    !commissionPressure
  ) {
    level = "Ниже среднего";
  } else if (
    points >= 3 &&
    !invalidated
  ) {
    level = "Средний";
  }

  return {
    stars,
    level,
    rr,
    lateEntry,
    invalidated,
    priceDistance,
    commissionPressure,
  };
}

function proDecision() {
  const strategy = strategyChecklist();
  const lifecycle = signalLifecycleDecision();
  const risk = proRiskAssessment();
  const scenario = tradeScenario();
  const dynamic = state.signalIntelligence.latest;

  if (!strategy || !scenario) {
    return {
      action: "НЕ ВХОДИТЬ",
      className: "blocked",
      textClass: "bad",
      subtitle: "Недостаточно данных для безопасного решения.",
      direction: "—",
      score: 0,
      risk,
      guards: [
        { ok: false, text: "Нет полной структуры" },
        { ok: false, text: "Нет готового сценария" },
      ],
      voice: "Пока не входи. Система ещё не собрала все данные.",
    };
  }

  const guards = [
    {
      ok: !risk.invalidated,
      text: risk.invalidated
        ? "Цена уже вошла в стоп-зону"
        : "Стоп-зона не нарушена",
    },
    {
      ok: !risk.lateEntry,
      text: risk.lateEntry
        ? `Цена ушла от входа на ${risk.priceDistance.toFixed(2)}%`
        : "Цена остаётся возле рабочей зоны",
    },
    {
      ok: risk.rr >= 1.5,
      text: risk.rr >= 1.5
        ? `R:R приемлемый — 1:${risk.rr.toFixed(2)}`
        : `R:R слабый — 1:${risk.rr.toFixed(2)}`,
    },
    {
      ok: !risk.commissionPressure,
      text: risk.commissionPressure
        ? "Комиссия слишком велика относительно риска"
        : "Комиссия допустима",
    },
  ];

  if (risk.invalidated) {
    return {
      action: "СЦЕНАРИЙ ОТМЕНЁН",
      className: "blocked",
      textClass: "bad",
      subtitle: "Цена достигла уровня отмены сценария.",
      direction: strategy.direction,
      score: strategy.readiness,
      risk,
      guards,
      voice: "Не входи. Сценарий уже сломан ценой.",
    };
  }

  if (
    lifecycle.status.startsWith("ВХОД РАЗРЕШЁН") &&
    !risk.lateEntry &&
    risk.rr >= 1.5 &&
    !risk.commissionPressure
  ) {
    const isLong = strategy.direction === "LONG";

    return {
      action: isLong
        ? "ВХОДИТЬ LONG"
        : "ВХОДИТЬ SHORT",
      className: isLong
        ? "allowed-long"
        : "allowed-short",
      textClass: isLong ? "ok" : "bad",
      subtitle: "Все обязательные условия выполнены. Подтверди фактический вход только после реакции на 1M.",
      direction: strategy.direction,
      score: strategy.readiness,
      risk,
      guards,
      voice: isLong
        ? "Лонговый сценарий подтверждён. Ищи аккуратный вход на ретесте, не догоняй цену."
        : "Шортовый сценарий подтверждён. Ищи аккуратный вход на ретесте, не догоняй цену.",
    };
  }

  if (risk.lateEntry) {
    return {
      action: "СДЕЛКУ ПРОПУСТИТЬ",
      className: "blocked",
      textClass: "bad",
      subtitle: "Цена уже слишком далеко ушла от расчётной точки входа.",
      direction: strategy.direction,
      score: strategy.readiness,
      risk,
      guards,
      voice: "Не догоняй движение. Лучше пропустить вход и дождаться нового сценария.",
    };
  }

  if (
    lifecycle.status === "ГОТОВИТЬСЯ" ||
    strategy.readiness >= 70
  ) {
    return {
      action: "ЖДАТЬ",
      className: "waiting",
      textClass: "warn",
      subtitle: lifecycle.validity,
      direction: strategy.direction,
      score: strategy.readiness,
      risk,
      guards,
      voice: `Сильнее ${strategy.direction}. Пока не входи — дождись последнего подтверждения и ретеста.`,
    };
  }

  return {
    action: "НЕ ВХОДИТЬ",
    className: "blocked",
    textClass: "bad",
    subtitle: "Качество сценария недостаточно для сделки.",
    direction: strategy.direction,
    score: strategy.readiness,
    risk,
    guards,
    voice: "Условия слабые. Сделку лучше пропустить.",
  };
}

function renderProDecision() {
  const decision = proDecision();

  setClass(
    "proDecisionCard",
    `pro-decision ${decision.className}`
  );

  setText(
    "proDecisionAction",
    decision.action
  );

  setClass(
    "proDecisionAction",
    `pro-action ${decision.textClass}`
  );

  setText(
    "proDecisionSubtitle",
    decision.subtitle
  );

  setText(
    "proDirection",
    decision.direction
  );

  setText(
    "proScore",
    `${decision.score}%`
  );

  setText(
    "proRr",
    decision.risk.rr > 0
      ? `1:${decision.risk.rr.toFixed(2)}`
      : "—"
  );

  setText(
    "proRiskStars",
    decision.risk.stars
  );

  setHtml(
    "proGuards",
    decision.guards.map(item => `
      <div class="guard-item ${item.ok ? "ok" : "bad"}">
        ${item.ok ? "✅" : "❌"} ${item.text}
      </div>
    `).join("")
  );

  setText(
    "proVoiceText",
    decision.voice
  );
}

function currentMarketPrice() {
  return Number(
    state.tickerData?.last_price
    || state.metrics["5m"]?.close
    || state.metrics["5m"]?.closedClose
    || 0
  );
}

function activeTradeOutcome(trade, currentPrice) {
  if (!trade || !Number.isFinite(currentPrice)) {
    return null;
  }

  const stopHit = trade.direction === "LONG"
    ? currentPrice <= trade.stop
    : currentPrice >= trade.stop;

  const tp1Hit = trade.direction === "LONG"
    ? currentPrice >= trade.tp1
    : currentPrice <= trade.tp1;

  const tp2Hit = trade.direction === "LONG"
    ? currentPrice >= trade.tp2
    : currentPrice <= trade.tp2;

  if (stopHit) return "STOP";
  if (tp2Hit) return "TP2";
  if (tp1Hit) return "TP1";
  return null;
}

function cycleStageDecision() {
  const strategy = strategyChecklist();
  const scenario = tradeScenario();
  const lifecycle = signalLifecycleDecision();
  const trade = state.activeTrade;
  const currentPrice = currentMarketPrice();

  if (trade) {
    const outcome = activeTradeOutcome(
      trade,
      currentPrice
    );

    if (outcome === "STOP") {
      return {
        stage: "COMPLETE_STOP",
        number: "6 / 6",
        status: "СДЕЛКА ЗАВЕРШЕНА · STOP",
        className: "bad",
        note: "Стоп достигнут. Результат записывается в журнал, затем система вернётся к новому анализу.",
        direction: trade.direction,
        scenario: trade,
        canEnter: false,
      };
    }

    if (outcome === "TP2") {
      return {
        stage: "COMPLETE_TP2",
        number: "6 / 6",
        status: "СДЕЛКА ЗАВЕРШЕНА · TP2",
        className: "ok",
        note: "TP2 достигнут. Остаток позиции закрывается в симуляции и результат записывается в журнал.",
        direction: trade.direction,
        scenario: trade,
        canEnter: false,
      };
    }

    if (outcome === "TP1") {
      return {
        stage: "MANAGE_TP1",
        number: "5 / 6",
        status: "TP1 ДОСТИГНУТ",
        className: "ok",
        note: "Зафиксируй часть позиции и перенеси стоп в безубыток. Сопровождение продолжается до TP2 или стопа.",
        direction: trade.direction,
        scenario: trade,
        canEnter: false,
      };
    }

    return {
      stage: "MANAGE",
      number: "4 / 6",
      status: "СДЕЛКА АКТИВНА",
      className: "ok",
      note: "Соблюдай план. Не расширяй стоп и не увеличивай риск без нового сигнала.",
      direction: trade.direction,
      scenario: trade,
      canEnter: false,
    };
  }

  if (!strategy || !scenario) {
    return {
      stage: "ANALYSIS",
      number: "1 / 6",
      status: "АНАЛИЗ",
      className: "warn",
      note: "Система собирает данные по таймфреймам.",
      direction: "—",
      scenario: null,
      canEnter: false,
    };
  }

  if (
    lifecycle.status.startsWith("ВХОД РАЗРЕШЁН")
  ) {
    return {
      stage: "ENTRY_READY",
      number: "3 / 6",
      status: lifecycle.status,
      className: strategy.direction === "LONG" ? "ok" : "bad",
      note: "Сигнал активен. Проверь реакцию на 1M и нажми «Подтвердить вход», только если фактически открыл сделку на бирже.",
      direction: strategy.direction,
      scenario,
      canEnter: true,
    };
  }

  if (lifecycle.status === "ГОТОВИТЬСЯ") {
    return {
      stage: "PREPARE",
      number: "2 / 6",
      status: "ГОТОВИТЬСЯ",
      className: "warn",
      note: lifecycle.validity,
      direction: strategy.direction,
      scenario,
      canEnter: false,
    };
  }

  if (lifecycle.status === "СИГНАЛ УСТАРЕЛ") {
    return {
      stage: "EXPIRED",
      number: "2 / 6",
      status: "СИГНАЛ УСТАРЕЛ",
      className: "bad",
      note: "Старое окно входа закрыто. Ждём новую закрытую свечу и новый ретест.",
      direction: strategy.direction,
      scenario,
      canEnter: false,
    };
  }

  return {
    stage: "BLOCKED",
    number: "1 / 6",
    status: "НЕ ВХОДИТЬ",
    className: "bad",
    note: lifecycle.validity,
    direction: strategy.direction,
    scenario,
    canEnter: false,
  };
}

function renderTradeCycle() {
  const cycle = cycleStageDecision();
  state.tradeCycle.stage = cycle.stage;

  setText("cycleStatus", cycle.status);
  setClass("cycleStatus", `cycle-status ${cycle.className}`);
  setText("cycleStage", cycle.number);
  setText("cycleDirection", cycle.direction || "—");
  setText("cycleNote", cycle.note);

  if (cycle.scenario) {
    setText(
      "cycleEntry",
      formatPrice(cycle.scenario.entry)
    );

    setText(
      "cycleStop",
      formatPrice(cycle.scenario.stop)
    );

    setText(
      "cycleTargets",
      `${formatPrice(cycle.scenario.tp1)} / ${formatPrice(cycle.scenario.tp2)}`
    );
  } else {
    setText("cycleEntry", "—");
    setText("cycleStop", "—");
    setText("cycleTargets", "—");
  }

  const button = getElement("confirmEntryButton");

  if (button) {
    button.disabled = !cycle.canEnter;
    button.textContent = cycle.canEnter
      ? `Подтвердить вход ${cycle.direction}`
      : "Подтвердить вход";
  }
}

function confirmCycleEntry() {
  const cycle = cycleStageDecision();

  if (!cycle.canEnter) {
    return;
  }

  startTradeTracking();
  state.tradeCycle.stage = "MANAGE";
  renderTradeCycle();
  renderTradeMonitor();
}

function resetTradeCycle() {
  state.activeTrade = null;
  state.tradeCycle = {
    stage: "ANALYSIS",
    lastCompletion: null,
  };

  saveActiveTrade();

  state.signalLifecycle.armedAt = null;
  state.signalLifecycle.validUntil = null;
  state.signalLifecycle.lastStatus = "WAIT";

  renderTradeCycle();
  renderTradeMonitor();
  renderSignalLifecycle();
  renderEntryPermission();
}

function automaticallyCompleteTradeCycle() {
  const trade = state.activeTrade;

  if (!trade) {
    return;
  }

  const currentPrice = currentMarketPrice();
  const outcome = activeTradeOutcome(
    trade,
    currentPrice
  );

  if (outcome === "STOP") {
    appendJournalTrade(
      trade,
      currentPrice,
      "Автоматическое завершение по Stop"
    );

    state.tradeCycle.lastCompletion = {
      result: "STOP",
      time: Date.now(),
    };

    state.activeTrade = null;
    saveActiveTrade();
    renderJournal();
    renderTradeMonitor();
    renderTradeCycle();
    return;
  }

  if (outcome === "TP2") {
    appendJournalTrade(
      trade,
      currentPrice,
      "Автоматическое завершение по TP2"
    );

    state.tradeCycle.lastCompletion = {
      result: "TP2",
      time: Date.now(),
    };

    state.activeTrade = null;
    saveActiveTrade();
    renderJournal();
    renderTradeMonitor();
    renderTradeCycle();
    return;
  }

  if (
    outcome === "TP1" &&
    !trade.breakEvenSuggested
  ) {
    trade.breakEvenSuggested = true;
    saveActiveTrade();
  }
}

function currentCandleSecondsLeft() {
  const tf = state.selectedTimeframe || "5m";
  const now = Math.floor(Date.now() / 1000);

  const secondsMap = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
  };

  const length = secondsMap[tf] || 300;
  return length - (now % length);
}

function formatCountdown(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0")  );
}

function signalLifecycleDecision() {
  const strategy = strategyChecklist();
  const now = Date.now();

  if (!strategy) {
    return {
      status: "СОБИРАЕМ ДАННЫЕ",
      className: "warn",
      timerLabel: "До закрытия свечи",
      timerValue: formatCountdown(currentCandleSecondsLeft()),
      validity: "Недостаточно данных для оценки сценария.",
      missing: ["Свечи", "Структура", "Поток сделок"],
    };
  }

  const missing = strategy.checks
    .filter(item => !item.ok)
    .map(item => item.label);

  const fullSignal = (
    strategy.readiness >= 85 &&
    strategy.structureReady &&
    strategy.triggerReady &&
    strategy.retestReady
  );

  if (fullSignal) {
    if (
      !state.signalLifecycle.validUntil ||
      state.signalLifecycle.direction !== strategy.direction
    ) {
      state.signalLifecycle.armedAt = now;
      state.signalLifecycle.validUntil = now + 120000;
      state.signalLifecycle.direction = strategy.direction;
      state.signalLifecycle.lastStatus = "ACTIVE";
    }

    const secondsLeft = Math.ceil(
      (state.signalLifecycle.validUntil - now) / 1000
    );

    if (secondsLeft > 0) {
      return {
        status: strategy.direction === "LONG"
          ? "ВХОД РАЗРЕШЁН · LONG"
          : "ВХОД РАЗРЕШЁН · SHORT",
        className: strategy.direction === "LONG" ? "ok" : "bad",
        timerLabel: "Сигнал действителен",
        timerValue: formatCountdown(secondsLeft),
        validity: "Сигнал активен 120 секунд. Ищем реакцию на 1M и не догоняем цену.",
        missing: ["Структура ✅", "Триггер ✅", "Ретест ✅"],
      };
    }

    state.signalLifecycle.lastStatus = "EXPIRED";

    return {
      status: "СИГНАЛ УСТАРЕЛ",
      className: "bad",
      timerLabel: "Новый анализ",
      timerValue: formatCountdown(currentCandleSecondsLeft()),
      validity: "Окно входа закрыто. Ждём новую закрытую свечу и повторное подтверждение.",
      missing: ["Новый BOS", "Новая Delta", "Новый ретест"],
    };
  }

  state.signalLifecycle.validUntil = null;
  state.signalLifecycle.armedAt = null;
  state.signalLifecycle.direction = strategy.direction;

  if (
    strategy.readiness >= 70 &&
    strategy.structureReady
  ) {
    state.signalLifecycle.lastStatus = "PREPARE";

    return {
      status: "ГОТОВИТЬСЯ",
      className: "warn",
      timerLabel: "До закрытия свечи",
      timerValue: formatCountdown(currentCandleSecondsLeft()),
      validity: `Сильнее ${strategy.direction}. Ждём недостающие подтверждения.`,
      missing: missing.slice(0, 3).length
        ? missing.slice(0, 3)
        : ["Триггер", "Ретест", "Объём"],
    };
  }

  state.signalLifecycle.lastStatus = "BLOCKED";

  return {
    status: "НЕ ВХОДИТЬ",
    className: "bad",
    timerLabel: "До нового анализа",
    timerValue: formatCountdown(currentCandleSecondsLeft()),
    validity: "Сценарий не готов. Сделку пропускаем до появления структуры и триггера.",
    missing: missing.slice(0, 3).length
      ? missing.slice(0, 3)
      : ["Структура", "Триггер", "Ретест"],
  };
}

function renderSignalLifecycle() {
  const decision = signalLifecycleDecision();

  const status = getElement(
    "signalLifecycleStatus"
  );

  if (status) {
    status.textContent = decision.status;
    status.className = decision.className;
  }

  document.getElementById(
    "signalTimerLabel"
  ).textContent = decision.timerLabel;

  document.getElementById(
    "signalTimerValue"
  ).textContent = decision.timerValue;

  document.getElementById(
    "signalValidityText"
  ).textContent = decision.validity;

  document.getElementById(
    "signalMissingConditions"
  ).innerHTML = decision.missing.map(item => `
    <div class="${
      item.includes("✅") ? "ok" : "bad"
    }">
      ${item.includes("✅") ? "" : "❌ "}${item}
    </div>
  `).join("");
}

function entryPermissionDecision() {
  const strategy = strategyChecklist();

  if (!strategy) {
    return {
      status: "НЕ ВХОДИТЬ",
      className: "blocked",
      textClass: "bad",
      reason: "Недостаточно данных по таймфреймам. Ждём загрузку свечей.",
    };
  }

  const missing = strategy.checks
    .filter(item => !item.ok)
    .map(item => item.label);

  if (
    strategy.readiness >= 85 &&
    strategy.structureReady &&
    strategy.triggerReady &&
    strategy.retestReady
  ) {
    return {
      status: strategy.direction === "LONG"
        ? "ВХОД РАЗРЕШЁН · LONG"
        : "ВХОД РАЗРЕШЁН · SHORT",
      className: "allowed",
      textClass: strategy.direction === "LONG" ? "ok" : "bad",
      reason: "Все обязательные условия выполнены. Ищем подтверждение реакции на 1M и не догоняем цену.",
    };
  }

  if (
    strategy.readiness >= 70 &&
    strategy.structureReady
  ) {
    return {
      status: "ГОТОВИТЬСЯ",
      className: "prepare",
      textClass: "warn",
      reason: `Сильнее ${strategy.direction}. Не хватает: ${missing.slice(0, 3).join(", ") || "ретеста"}.`,
    };
  }

  return {
    status: "НЕ ВХОДИТЬ",
    className: "blocked",
    textClass: "bad",
    reason: (
      !state.dataHealth.deals
        ? `Сценарий не готов. Нет подтверждения Delta/потока сделок. Также не хватает: ${missing.slice(0, 3).join(", ") || "ключевых условий"}.`
        : `Сценарий не готов. Не хватает: ${missing.slice(0, 4).join(", ") || "ключевых подтверждений"}.`
    ),
  };
}

function renderEntryPermission() {
  const decision = entryPermissionDecision();
  const card = getElement("entryPermission");
  const text = getElement("entryPermissionText");

  if (card) {
    card.className = `entry-permission ${decision.className}`;
  }

  if (text) {
    text.className = decision.textClass;
    text.textContent = decision.status;
  }
  setText("entryPermissionReason", decision.reason);
}



function getElement(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = getElement(id);
  if (!element) return false;
  element.textContent = value;
  return true;
}

function setHtml(id, value) {
  const element = getElement(id);
  if (!element) return false;
  element.innerHTML = value;
  return true;
}

function setClass(id, value) {
  const element = getElement(id);
  if (!element) return false;
  element.className = value;
  return true;
}

function setWidth(id, value) {
  const element = getElement(id);
  if (!element) return false;
  element.style.width = value;
  return true;
}

function setDisplay(id, value) {
  const element = getElement(id);
  if (!element) return false;
  element.style.display = value;
  return true;
}

function safeRender(name, callback, errors) {
  try {
    callback();
    return true;
  } catch (reason) {
    console.error(`[${name}]`, reason);
    errors.push(
      `${name}: ${reason.message || String(reason)}`
    );
    return false;
  }
}

async function refreshAll() {
  const error = getElement("error");
  if (error) {
    error.style.display = "none";
  }

  const tickerResult = await Promise.allSettled([
    fetchTicker(),
  ]);

  state.dataHealth.ticker =
    tickerResult[0].status === "fulfilled";

  const klineResults = await Promise.allSettled(
    ["1h", "15m", "5m", "1m"].map(fetchTimeframe)
  );

  state.dataHealth.klines = klineResults.every(
    item => item.status === "fulfilled"
  );

  const dealsResult = await Promise.allSettled([
    fetchDeals(),
  ]);

  state.dataHealth.deals =
    dealsResult[0].status === "fulfilled";

  const renderErrors = [];

  safeRender(
    "таймфреймы",
    renderTimeframes,
    renderErrors
  );

  if (state.metrics["5m"]) {
    // Главные рабочие модули рендерятся первыми.
    // Ошибка одного из них не останавливает остальные.
    safeRender(
      "график",
      renderChart,
      renderErrors
    );


    safeRender(
      "чек-лист",
      renderStrategyCore,
      renderErrors
    );

    safeRender(
      "наставник",
      renderMentor,
      renderErrors
    );

    safeRender(
      "мозг системы",
      renderSystemBrain,
      renderErrors
    );

    safeRender(
      "сценарий сделки",
      renderTradeScenario,
      renderErrors
    );

    safeRender(
      "расчёт позиции",
      renderPositionCalculation,
      renderErrors
    );

    safeRender(
      "сопровождение",
      renderTradeMonitor,
      renderErrors
    );

    safeRender(
      "журнал",
      renderJournal,
      renderErrors
    );

    safeRender(
      "разрешение входа",
      renderEntryPermission,
      renderErrors
    );

    safeRender(
      "жизненный цикл сигнала",
      renderSignalLifecycle,
      renderErrors
    );

    safeRender(
      "полный цикл сделки",
      renderTradeCycle,
      renderErrors
    );

    safeRender(
      "динамический интеллект",
      () => {
        updateDynamicSignalIntelligence();
        renderDynamicSignalIntelligence();
      },
      renderErrors
    );

    safeRender(
      "PRO решение",
      renderProDecision,
      renderErrors
    );

    safeRender(
      "автозавершение сделки",
      automaticallyCompleteTradeCycle,
      renderErrors
    );

    // Дополнительная аналитика обновляется после ядра.
    // Её ошибка больше не оставит главные блоки пустыми.

  }

  const problems = [];

  if (!state.dataHealth.ticker) {
    problems.push("цена MEXC");
  }

  if (!state.dataHealth.klines) {
    problems.push("часть свечей");
  }

  if (!state.dataHealth.deals) {
    problems.push("Delta/поток сделок");
  }

  if (problems.length) {
    if (error) {
      error.textContent =
        `Временно недоступно: ${problems.join(", ")}. Основные модули продолжают работать.`;

      error.style.display = "block";
    }
  } else if (error) {
    error.style.display = "none";
  }
}

function restartRefreshTimer() {
  clearInterval(state.timer);
  state.timer = setInterval(
    refreshAll,
    state.refresh * 1000
  );
}

document.getElementById("symbol").addEventListener(
  "change",
  event => {
    state.symbol = event.target.value;
    state.data = {};
    state.metrics = {};
    state.deals = new Map();
    state.cvdSession = 0;
    state.currentOi = null;
    state.previousOi = null;
    refreshAll();
  }
);

document.getElementById("refresh").addEventListener(
  "change",
  event => {
    state.refresh = Number(event.target.value);
    restartRefreshTimer();
  }
);

document.querySelectorAll("[data-direction]").forEach(button => {
  button.addEventListener("click", () => {
    state.direction = button.dataset.direction;

    document.querySelectorAll("[data-direction]").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    renderTimeframes();
renderStrategyCore();
    renderMentor();
    renderSystemBrain();
    renderTradeScenario();
    renderTradeLines();
    renderPositionCalculation();
    renderTradeMonitor();
    renderEntryPermission();
    renderSignalLifecycle();
    renderTradeCycle();
    updateDynamicSignalIntelligence();
    renderDynamicSignalIntelligence();
    renderProDecision();
  });
});

document.querySelectorAll("[data-tf]").forEach(button => {
  button.addEventListener("click", () => {
    state.timeframe = button.dataset.tf;

    document.querySelectorAll("[data-tf]").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    renderChart();
    updateCandleTimer();
  });
});



function saveManagerSettings() {
  const settings = {
    deposit: document.getElementById("depositInput")?.value,
    risk: document.getElementById("riskInput")?.value,
    leverage: document.getElementById("leverageInput")?.value,
    commission: document.getElementById("commissionInput")?.value,
  };

  localStorage.setItem(
    "ssmarlboross_manager_settings",
    JSON.stringify(settings)
  );
}

function loadManagerSettings() {
  try {
    const raw = localStorage.getItem(
      "ssmarlboross_manager_settings"
    );

    if (!raw) return;

    const settings = JSON.parse(raw);

    if (settings.deposit) {
      document.getElementById("depositInput").value =
        settings.deposit;
    }

    if (settings.risk) {
      document.getElementById("riskInput").value =
        settings.risk;
    }

    if (settings.leverage) {
      document.getElementById("leverageInput").value =
        settings.leverage;
    }

    if (settings.commission) {
      document.getElementById("commissionInput").value =
        settings.commission;
    }
  } catch {
    // ignore broken local settings
  }
}

["depositInput", "riskInput", "leverageInput", "commissionInput"].forEach(id => {
  document.getElementById(id)?.addEventListener(
    "input",
    () => {
      saveManagerSettings();
      renderPositionCalculation();
    }
  );
});

document.getElementById(
  "startTradeButton"
)?.addEventListener(
  "click",
  startTradeTracking
);

document.getElementById(
  "closeTradeButton"
)?.addEventListener(
  "click",
  closeTradeTracking
);

document.getElementById(
  "breakEvenButton"
)?.addEventListener(
  "click",
  moveStopToBreakEven
);

document.getElementById(
  "partialCloseButton"
)?.addEventListener(
  "click",
  partialCloseTrade
);

document.getElementById(
  "finishTradeButton"
)?.addEventListener(
  "click",
  () => finishActiveTrade("Закрыто вручную")
);

document.getElementById(
  "confirmEntryButton"
)?.addEventListener(
  "click",
  confirmCycleEntry
);

document.getElementById(
  "resetCycleButton"
)?.addEventListener(
  "click",
  resetTradeCycle
);

document.getElementById(
  "enableNotificationsButton"
)?.addEventListener(
  "click",
  enableBrowserNotifications
);

loadManagerSettings();
loadActiveTrade();
loadNotificationPreference();
renderJournal();
renderNotificationStatus();


setInterval(() => {
  try {
    renderSignalLifecycle();
    renderTradeCycle();
    updateDynamicSignalIntelligence();
    renderDynamicSignalIntelligence();
    renderProDecision();
    automaticallyCompleteTradeCycle();
  } catch (reason) {
    console.error("[signal timer]", reason);
  }
}, 1000);

refreshAll();
restartRefreshTimer();
updateCandleTimer();
setInterval(updateCandleTimer, 1000);
</script>
</body>
</html>
"""

telegram_app: Application | None = None


def normalize_symbol(raw: str) -> str:
    symbol = raw.strip().upper().replace("/", "_").replace("-", "_")
    if symbol not in SYMBOLS:
        raise HTTPException(status_code=400, detail="Неподдерживаемая монета")
    return symbol


def public_url() -> str | None:
    value = (
        os.getenv("PUBLIC_HTTPS_URL")
        or os.getenv("WEBAPP_URL")
        or os.getenv("RAILWAY_PUBLIC_DOMAIN")
    )
    if not value:
        return None

    value = value.strip().rstrip("/")
    if not value.startswith(("https://", "http://")):
        value = f"https://{value}"
    return value


async def telegram_start(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
) -> None:
    url = public_url()

    if not url:
        await update.effective_message.reply_text(
            "❌ Сначала добавьте PUBLIC_HTTPS_URL в Railway."
        )
        return

    keyboard = InlineKeyboardMarkup(
        [[
            InlineKeyboardButton(
                "📊 Открыть помощника",
                web_app=WebAppInfo(url=url),
            )
        ]]
    )

    await update.effective_message.reply_text(
        "👋 ssMarlboross Live\n\n"
        "Живой график MEXC, реальные цены, таймер свечи "
        "и базовый анализ 1H → 15M → 5M → 1M.",
        reply_markup=keyboard,
    )


async def start_bot() -> None:
    global telegram_app

    token = os.getenv("BOT_TOKEN", "").strip()
    if not token:
        logger.warning("BOT_TOKEN не задан. Запускается только WebApp.")
        return

    telegram_app = Application.builder().token(token).build()
    telegram_app.add_handler(CommandHandler("start", telegram_start))
    telegram_app.add_handler(CommandHandler("analysis", telegram_start))

    await telegram_app.initialize()
    await telegram_app.start()

    if telegram_app.updater is None:
        raise RuntimeError("Telegram updater не создан")

    await telegram_app.updater.start_polling(
        drop_pending_updates=True
    )

    logger.info("Telegram bot started")


async def stop_bot() -> None:
    global telegram_app

    if telegram_app is None:
        return

    if telegram_app.updater is not None:
        await telegram_app.updater.stop()

    await telegram_app.stop()
    await telegram_app.shutdown()
    telegram_app = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await start_bot()
    except Exception:
        logger.exception("Telegram bot start failed")
    yield
    try:
        await stop_bot()
    except Exception:
        logger.exception("Telegram bot stop failed")


app = FastAPI(
    title="ssMarlboross Live",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "ssMarlboross Live",
        "time": int(time.time()),
        "telegram": bool(os.getenv("BOT_TOKEN")),
    }


@app.get("/")
async def home(request: Request):
    html_bytes = UTF8_BOM + INDEX_HTML.encode("utf-8")

    return Response(
        content=html_bytes,
        media_type="text/html; charset=utf-8",
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
            "Content-Type": "text/html; charset=utf-8",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/analysis")
async def analysis(request: Request):
    return await home(request)


@app.get("/api/ticker")
async def ticker(
    symbol: str = Query(default="BTC_USDT"),
):
    safe_symbol = normalize_symbol(symbol)

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(
                MEXC_TICKER_URL,
                params={"symbol": safe_symbol},
            )
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Ошибка получения цены MEXC: {exc}",
        ) from exc

    if not payload.get("success"):
        raise HTTPException(
            status_code=502,
            detail=payload.get("message") or "Ошибка MEXC",
        )

    data = payload.get("data") or {}

    return JSONResponse(
        {
            "symbol": safe_symbol,
            "last_price": float(data.get("lastPrice") or 0),
            "fair_price": float(data.get("fairPrice") or 0),
            "index_price": float(data.get("indexPrice") or 0),
            "bid": float(data.get("bid1") or 0),
            "ask": float(data.get("ask1") or 0),
            "funding_rate": float(data.get("fundingRate") or 0),
            "change_24h": float(data.get("riseFallRate") or 0) * 100,
            "open_interest": float(data.get("holdVol") or 0),
            "volume_24h": float(data.get("volume24") or 0),
            "amount_24h": float(data.get("amount24") or 0),
            "high_24h": float(data.get("high24Price") or 0),
            "low_24h": float(data.get("lower24Price") or 0),
        },
        headers={"Cache-Control": "no-store"},
    )



@app.get("/api/deals")
async def deals(
    symbol: str = Query(default="BTC_USDT"),
    limit: int = Query(default=100, ge=10, le=100),
):
    safe_symbol = normalize_symbol(symbol)

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(
                MEXC_DEALS_URL.format(symbol=safe_symbol),
                params={"limit": limit},
            )
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Ошибка получения сделок MEXC: {exc}",
        ) from exc

    if not payload.get("success"):
        raise HTTPException(
            status_code=502,
            detail=payload.get("message") or "Ошибка MEXC",
        )

    rows = []
    for item in payload.get("data") or []:
        rows.append(
            {
                "price": float(item.get("p") or 0),
                "volume": float(item.get("v") or 0),
                "side": "BUY" if int(item.get("T") or 0) == 1 else "SELL",
                "time": int(item.get("t") or 0),
            }
        )

    rows.sort(key=lambda item: item["time"])

    return JSONResponse(
        {"symbol": safe_symbol, "deals": rows},
        headers={"Cache-Control": "no-store"},
    )


@app.get("/api/klines")
async def klines(
    symbol: str = Query(default="BTC_USDT"),
    timeframe: str = Query(default="5m"),
    limit: int = Query(default=350, ge=220, le=700),
):
    safe_symbol = normalize_symbol(symbol)

    if timeframe not in TIMEFRAMES:
        raise HTTPException(
            status_code=400,
            detail="Неподдерживаемый таймфрейм",
        )

    mexc_interval, seconds = TIMEFRAMES[timeframe]
    end_ts = int(time.time())
    start_ts = end_ts - seconds * (limit + 20)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                MEXC_KLINE_URL.format(symbol=safe_symbol),
                params={
                    "interval": mexc_interval,
                    "start": start_ts,
                    "end": end_ts,
                },
            )
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Ошибка получения свечей MEXC: {exc}",
        ) from exc

    if not payload.get("success"):
        raise HTTPException(
            status_code=502,
            detail=payload.get("message") or "Ошибка MEXC",
        )

    data = payload.get("data") or {}
    keys = ("time", "open", "high", "low", "close", "vol")

    if any(key not in data for key in keys):
        raise HTTPException(
            status_code=502,
            detail="MEXC вернул неполные свечи",
        )

    size = min(len(data[key]) for key in keys)
    candles = []

    for index in range(size):
        candles.append(
            {
                "time": int(data["time"][index]),
                "open": float(data["open"][index]),
                "high": float(data["high"][index]),
                "low": float(data["low"][index]),
                "close": float(data["close"][index]),
                "volume": float(data["vol"][index]),
            }
        )

    candles.sort(key=lambda item: item["time"])
    candles = candles[-limit:]

    return JSONResponse(
        {
            "symbol": safe_symbol,
            "timeframe": timeframe,
            "candles": candles,
            "server_time": end_ts,
        },
        headers={"Cache-Control": "no-store"},
    )