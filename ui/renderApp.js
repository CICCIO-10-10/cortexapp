import { MaterialeView } from './views/MaterialeView.js';
import { HomeView } from './views/HomeView.js';

/**
 * @deprecated renderApp è usato solo dal legacy main.js.
 * Il nuovo entry point (index.js) usa AppRouter (ui/router.js).
 * Rimuovere questo file quando main.js sarà completamente dismesso (Phase 4).
 */
export function renderApp(state, dispatch) {
    try {
        const root = document.getElementById('app-root');
        
        // Se l'HTML non è ancora stato aggiornato, usciamo in sicurezza
        if (!root) {
            console.warn("renderApp: Contenitore #app-root non trovato. Rendering saltato.");
            return; 
        }

        // Router di base
        if (state.currentView === 'home') {
            root.innerHTML = HomeView(state);
        } 
        // 👇 NUOVO BLOCCO AGGIUNTO QUI 👇
        else if (['materiale', 'view-create', 'view-plan'].includes(state.currentView)) {
            root.innerHTML = MaterialeView(state);
            
            // Hook temporaneo per far disegnare le vecchie card
            if (state.currentView === 'materiale' && window.renderDecks) {
                setTimeout(() => window.renderDecks(), 50);
            }
        }
        // 👆 FINE NUOVO BLOCCO 👆
        
    } catch (error) {
        console.error("💥 Errore critico nel rendering della UI:", error);
    }
}