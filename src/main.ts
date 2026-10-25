import './ui/terminal.css';
import './ui/styles.css';
import { installDebugAPI } from './engine/debug-api';
import { TextureMosaicEngine } from './engine/state';
import { mountTextureMosaicUI } from './ui/app-ui';

async function bootstrap(): Promise<void> {
  const appRoot = document.getElementById('app');
  if (!appRoot) {
    throw new Error('Missing #app root element.');
  }

  const canvas = document.createElement('canvas');

  try {
    const engine = new TextureMosaicEngine(canvas);

    const params = new URLSearchParams(window.location.search);
    // Debug access is exposed in dev/test builds only (Spec §8.2);
    // on production it requires an explicit ?debug=1
    if (import.meta.env.DEV || params.has('debug')) {
      installDebugAPI(engine);
    }

    mountTextureMosaicUI(appRoot, canvas, engine);

    if (params.get('demo') === '1') {
      await engine.loadDemoScene();
    } else {
      engine.initDefaultScene();
    }
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : 'Fatal error initializing WebGL2 Texture Mosaic.';
    appRoot.innerHTML = `
      <div class="toast-container" data-testid="error-container">
        <div class="toast is-danger" data-testid="error-toast">
          <div>
            <div class="toast-title">Initialization Error</div>
            <div class="toast-message" data-testid="error-message">${msg}</div>
          </div>
        </div>
      </div>
    `;
  }
}

bootstrap();
