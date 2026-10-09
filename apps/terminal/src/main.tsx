import React from 'react';
import {createRoot} from 'react-dom/client';
import StableMarketApp from './StableMarketApp';
import './stable-market.css';

// Market-only stable shell. Legacy App and ASCEND Core remain intact but unmounted.
createRoot(document.getElementById('root')!).render(
  <React.StrictMode><StableMarketApp/></React.StrictMode>
);
