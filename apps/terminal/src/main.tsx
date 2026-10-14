import React from 'react';
import {createRoot} from 'react-dom/client';
import StableMarketApp from './StableMarketApp';
import './stable-market.css';
import './cloudflare-market-ported.css';
import './chart-focus.css';
import './liquidity-decision.css';
import './trend-structure.css';

// Market-only stable shell. Legacy App and ASCEND Core remain intact but unmounted.
createRoot(document.getElementById('root')!).render(
  <React.StrictMode><StableMarketApp/></React.StrictMode>
);
