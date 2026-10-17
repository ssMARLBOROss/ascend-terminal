import React from 'react';
import {createRoot} from 'react-dom/client';
import StableMarketApp from './StableMarketApp';
import './stable-market.css';
import './cloudflare-market-ported.css';
import './chart-focus.css';
import './liquidity-decision.css';
import './trend-structure.css';
import './on-radar.css';
import './early-on-radar.css';
import './chart-context.css';
import './ascend-focus-v1.css';
import './global-bias-preview.css';

// Market-only stable shell. Legacy App and ASCEND Core remain intact but unmounted.
createRoot(document.getElementById('root')!).render(
  <React.StrictMode><StableMarketApp/></React.StrictMode>
);
