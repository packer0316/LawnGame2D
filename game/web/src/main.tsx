import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './hud.css';
import { App } from './App';
import { PreviewHarness } from './PreviewHarness';

const preview = new URLSearchParams(location.search).get('preview');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{preview === 'monster' || preview === 'map' ? <PreviewHarness kind={preview} /> : <App />}</StrictMode>,
);
