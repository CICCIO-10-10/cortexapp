/**
 * ui/router.js
 * Centralized History API management for Cortex.
 * Handles URL synchronization, back/forward navigation, and initial routing.
 */
export class AppRouter {
    constructor() {
        this.init();
    }

    init() {
        // Expose navigation globally for the legacy bridge in main.js
        // Usage: window.__cortexNav('materiale')
        window.__cortexNav = (pageId) => this.navigate(pageId);

        // Listen for browser navigation (back/forward buttons)
        window.addEventListener('popstate', (event) => {
            const pageId = event.state?.pageId || this._getPathAsPageId();
            this._dispatch(pageId, false);
        });

        // Initialize on current URL after DOM is ready
        if (document.readyState === 'complete') {
            this._initialBoot();
        } else {
            window.addEventListener('load', () => this._initialBoot());
        }
    }

    _initialBoot() {
        const initialPage = this._getPathAsPageId();
        // Small delay to ensure main.js has fully registered showPage
        setTimeout(() => this._dispatch(initialPage, false), 50);
    }

    /**
     * Navigation entry point
     * @param {string} pageId - The ID of the page to show (e.g., 'materiale')
     * @param {boolean} push - Whether to push to history (true) or just render (false)
     */
    navigate(pageId, push = true) {
        if (!pageId) return;
        this._dispatch(pageId, push);
    }

    _dispatch(pageId, push) {
        const path = pageId === 'home' ? '/' : `/${pageId}`;
        
        if (push) {
            if (window.location.pathname !== path) {
                history.pushState({ pageId }, '', path);
            }
        }

        // Delegate rendering to the legacy showPage function in main.js
        if (typeof window.showPage === 'function') {
            window.showPage(pageId);
        } else {
            // Fallback for extreme cases where main.js is still loading
            const checkInt = setInterval(() => {
                if (typeof window.showPage === 'function') {
                    window.showPage(pageId);
                    clearInterval(checkInt);
                }
            }, 100);
            setTimeout(() => clearInterval(checkInt), 5000);
        }
    }

    _getPathAsPageId() {
        const path = window.location.pathname.replace(/^\/|\/$/g, '');
        // /app è il punto di ingresso SPA — trattalo come home
        if (path === 'app') return 'home';
        return path || 'home';
    }
}
