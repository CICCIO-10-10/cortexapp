/**
 * Classe base per tutti i componenti View.
 *
 * Pattern: le View sono PASSIVE — non si iscrivono allo store da sole.
 * È il Router (AppRouter) a chiamare update(state) ad ogni cambio di stato.
 * Questo evita il doppio-render che si verifica se ogni view gestisce
 * la propria subscription E il router chiama update() direttamente.
 *
 * Lifecycle:
 *   mount()   → render iniziale + bindEvents
 *   update()  → re-render se l'HTML è cambiato + rebind eventi
 *   unmount() → pulizia DOM e risorse (override nelle sottoclassi se serve)
 */
export class Component {
    constructor(store, mountPoint) {
        this.store = store;
        this.mountPoint = mountPoint;
    }

    /** Render iniziale. Chiamato dal router al mount della view. */
    mount() {
        this.update(this.store.getState());
    }

    /**
     * Cleanup. Override nelle sottoclassi per cancellare timer, animazioni, listener.
     * Es: MindMapView cancella il requestAnimationFrame qui.
     */
    unmount() {
        this.mountPoint.innerHTML = '';
    }

    /** Deve ritornare una stringa HTML. Override obbligatorio nelle sottoclassi. */
    render(state) { return ''; }

    /** Binding degli event listener dopo ogni render. Override nelle sottoclassi. */
    bindEvents() {}

    /**
     * Aggiorna il DOM solo se l'HTML è effettivamente cambiato.
     * Chiamato dal Router ad ogni dispatch allo store.
     */
    update(state) {
        const newHtml = this.render(state);
        if (this.mountPoint.innerHTML !== newHtml) {
            this.mountPoint.innerHTML = newHtml;
            this.bindEvents();
            // Ritraduce tutti i data-i18n nel DOM dopo ogni render
            window.cortexUpdateUIStrings?.();
        }
    }
}
