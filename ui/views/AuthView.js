// ui/views/AuthView.js
/**
 * Vista di Autenticazione (Login / Registrazione)
 * Ritorna stringa HTML per il rendering
 */
export function AuthView(state) {
    return `
        <div class="auth-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #030305; color: #fff; font-family: sans-serif;">
            <div class="auth-box" style="background: rgba(20, 20, 25, 0.8); padding: 30px; border-radius: 12px; border: 1px solid rgba(139, 92, 246, 0.3); text-align: center; max-width: 400px; width: 90%;">
                
                <img src="LOGO_SQUARE.png" alt="Cortex" style="width: 80px; height: 80px; margin-bottom: 20px;">
                
                <h2 style="margin-bottom: 10px; font-weight: 600;">Benvenuto su Cortex</h2>
                <p style="color: #aaa; font-size: 14px; margin-bottom: 30px;">Il tuo secondo cervello per studiare in modo intelligente.</p>

                <!-- Bottone Richiesto per Google OAuth -->
                <button data-action="LOGIN_GOOGLE" style="display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 12px; background: #fff; color: #000; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; margin-bottom: 20px;">
                    <img src="https://www.gstatic.com/images/branding/googlelogo/2x/googlelogo_color_24dp.png" style="width: 20px;" alt="Google">
                    Accedi con Google
                </button>

                <div style="font-size: 12px; color: #555;">
                    <p>Al momento supportiamo solo il Login tramite Google.</p>
                </div>
            </div>
        </div>
    `;
}
