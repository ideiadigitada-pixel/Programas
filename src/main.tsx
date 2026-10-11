import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';
import './index.css';

// Travar zoom em 100% em todos os modos e dispositivos
if (typeof window !== 'undefined') {
  // Prevenir zoom por gestos de pinça no iOS/Safari e touchpads
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  document.addEventListener('gestureend', (e) => e.preventDefault());

  // Prevenir zoom com Ctrl + Scroll do mouse / trackpad
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  // Prevenir atalhos de teclado de zoom (Ctrl + '+', '-', '0', '=')
  window.addEventListener('keydown', (e) => {
    if (
      (e.ctrlKey || e.metaKey) &&
      (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '_')
    ) {
      e.preventDefault();
    }
  });

  // Tentar travar a orientação do dispositivo no modo retrato no mobile
  const lockPortrait = () => {
    try {
      const orientation = (screen.orientation || (screen as any).mozOrientation || (screen as any).msOrientation);
      if (orientation && typeof orientation.lock === 'function') {
        orientation.lock('portrait').catch(() => {
          // Navegadores que exigem tela cheia silenciosamente ignoram
        });
      }
    } catch {
      // Ignorar caso a API não seja suportada
    }
  };

  lockPortrait();
  window.addEventListener('orientationchange', lockPortrait);
  window.addEventListener('touchstart', lockPortrait, { once: true });
  window.addEventListener('click', lockPortrait, { once: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
