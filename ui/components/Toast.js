// ui/components/Toast.js
/**
 * Componente Toast — notifiche visive non bloccanti.
 *
 * Si appoggia a window.showToast già definito nel sistema legacy (main.js).
 * Se window.showToast non esiste (es. in un futuro senza main.js), crea
 * il proprio sistema di toast minimale.
 *
 * Questo componente è gestito dal Router separatamente dalle view principali.
 */
export class ToastComponent {
    constructor(store, mountPoint) {
        this.store = store;
        this.mountPoint = mountPoint;
        this._ensureShowToast();
    }

    /**
     * Crea window.showToast se non esiste ancora (sistema legacy non caricato).
     * In produzione, main.js lo definisce prima — questo è il fallback.
     */
    _ensureShowToast() {
        if (typeof window.showToast === 'function') return; // già definito da main.js

        // Crea il container se non c'è
        let container = document.getElementById('toast-container-modular');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container-modular';
            container.style.cssText = `
                position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
                z-index: 9999; display: flex; flex-direction: column; gap: 8px;
                pointer-events: none;
            `;
            document.body.appendChild(container);
        }

        window.showToast = (message, type = 'info') => {
            const colors = { info: '#7c3aed', success: '#059669', error: '#dc2626', warning: '#d97706' };
            const toast = document.createElement('div');
            toast.style.cssText = `
                background: ${colors[type] || colors.info};
                color: #fff; padding: 10px 20px; border-radius: 8px;
                font-size: 14px; font-weight: 500; opacity: 0;
                transition: opacity 0.3s ease; pointer-events: auto;
                max-width: 300px; text-align: center;
            `;
            toast.textContent = message;
            container.appendChild(toast);
            requestAnimationFrame(() => { toast.style.opacity = '1'; });
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        };
    }

    /** Il router chiama questo ad ogni state change — non fa nulla qui. */
    update(state) {}
}
