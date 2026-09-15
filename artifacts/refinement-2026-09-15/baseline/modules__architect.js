import { t } from '../core/i18n.js';
/**
 * modules/architect.js — Phase 29
 *
 * Study Architect Engine: backup dati, questionario VARK/Felder-Silverman,
 * tutor ibrido web+file, material manager, profilo neurale, Aura Plan.
 * Estratto da main.js (MEGA FEATURE 4 + STUDY ARCHITECT LOGIC block).
 *
 * Dipendenze iniettate via init():
 *   state              — app state
 *   gState             — gamification state (live reference)
 *   saveState          — persist state
 *   saveGState         — persist gamification state
 *   showToast          — notifiche UI
 *   renderDecks        — aggiorna lista mazzi
 *   renderHome         — torna alla home (chiamata da renderFinalReport)
 *   discoverGeminiModel — scopre il modello AI disponibile
 *   KEYS               — oggetto costanti localStorage
 *
 * Import diretti:
 *   awardXP            ← modules/gamification.js
 *   fetchWithTimeout   ← js/utils.js
 */
import { awardXP }          from './gamification.js';
import { fetchWithTimeout, todayStr }  from '../js/utils.js';
import { callGemini }        from '../services/firebase.js';

// ── Dependency injection ──────────────────────────────────────────────────────

let _deps = {
    state:               { decks: [] },
    gState:              { xp: 0, geminiKey: '' },
    saveState:           () => {},
    saveGState:          () => {},
    showToast:           () => {},
    renderDecks:         () => {},
    renderHome:          () => {},
    discoverGeminiModel: async () => 'gemini-2.5-flash',
    KEYS:                {},
    updateUIStrings:     () => {},
};

export function init(deps) {
    _deps = { ..._deps, ...deps };
    try { window.generateUnimeKit = generateUnimeKit; } catch (e) {}
}

// Proxy locali per retrocompatibilità con il codice estratto che usa i nomi originali
const getState    = () => _deps.state;
const getGState   = () => _deps.gState;

// ===== MEGA FEATURE 4: MAGIC TRANSFER SYNC =====
export const appSync = {
    exportData: function () {
        if (!_deps.state.username) {
            const name = prompt("Come ti chiami? Il tuo nome viaggerà al sicuro nel tuo file di backup:");
            if (name && name.trim().length > 0) {
                _deps.state.username = name.trim();
                localStorage.setItem(_deps.KEYS.USERNAME, _deps.state.username);
            }
        }
        
        // FIX: Raggruppa lo stato logico (state) e i progressi di gioco (gState)
        const combinedData = {
            core: state,
            gamification: _deps.gState || {}
        };
        
        const data = JSON.stringify(combinedData);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Cortex_Backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
        awardXP(20, '💾 Dati Esportati');
        _deps.showToast('Dati esportati con successo!', 'success');
    },

    importData: function (event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const importedData = JSON.parse(e.target.result);
                
                // Estrazione retro-compatibile (permette di importare vecchi e nuovi backup)
                const importedState = importedData.core ? importedData.core : importedData;
                const importedGamification = importedData.gamification ? importedData.gamification : importedData;
                
                // FIX: TYPE CHECK RIGOROSO (Evita crash mortali (Bricking) della PWA)
                if (importedState && Array.isArray(importedState.decks)) {
                    _deps.state.decks = importedState.decks;
                    
                    if (importedState.username) {
                        _deps.state.username = importedState.username;
                        localStorage.setItem(_deps.KEYS.USERNAME, _deps.state.username);
                    }
                    
                    // FIX: Restore di XP e Badge nel corretto oggetto `gState`
                    if (true) { // gState always available via _deps
                        if (importedGamification.xp !== undefined) _deps.gState.xp = importedGamification.xp;
                        if (importedGamification.streak !== undefined) _deps.gState.streak = importedGamification.streak;
                        if (importedGamification.badges !== undefined) _deps.gState.badges = importedGamification.badges;
                        if (importedGamification.lastDate !== undefined) _deps.gState.lastDate = importedGamification.lastDate;
                        _deps.saveGState();
                    }
                    
                    _deps.saveState();
                    _deps.renderDecks();
                    if (typeof renderStats === 'function') renderStats();
                    
                    const welcomeName = _deps.state.username ? ' ' + _deps.state.username : '';
                    _deps.showToast(`Dati importati con successo! Bentornato${welcomeName} 🚀`, 'success');
                } else {
                    _deps.showToast('File corrotto o struttura invalida. Ripristino abortito.', 'error');
                }
            } catch (err) {
                console.error("Import error", err);
                _deps.showToast("JSON non leggibile o file non supportato.", "error");
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset per consentire file con lo stesso nome
    }
};

// ===== MEGA FEATURE 5: P.A.O. SYSTEM GENERATOR =====
// ===== MEGA FEATURE 5: P.A.O. SYSTEM GENERATOR ===== (→ modules/pao.js, Phase 10)
// generatePAO, renderPAOTable, togglePAOTable importati dal modulo.

// --- SCRIPT BLOCK 4 ---
// ===== STUDY ARCHITECT LOGIC =====
let archStep = 0;
let archAnswers = [];
let dynamicArchQuestions = [];
const MAX_DYNAMIC_QUESTIONS = 14; // +4 domande per profili più accurati
const ARCH_QUESTIONS = [
    // --- PILASTRO 0: ONBOARDING PSICOLOGICO (Stress e Abitudini) ---
    { id: "LIFE_1", q: "Come vivi emotivamente una sessione di studio intensa prima di un esame importante?", opts: ["Come una maratona di sopravvivenza: mi spingo al limite con ansia e caffè.", "Cerco di dividerla rigorosamente con un timer, ma la costanza è un miraggio.", "Mi immergo in uno stato di iper-focus profondo isolandomi dal mondo intero.", "Non arrivo mai a farla: l'ansia da prestazione o la noia mi bloccano prima."] },
    { id: "LIFE_2", q: "Qual è il tuo più grande 'demone' quotidiano quando provi a metterti a studiare?", opts: ["La distrazione continua: smartphone, notifiche e pensieri intrusivi.", "La procrastinazione acuta: rimando finché l'ansia non prende il comando.", "La nebbia cognitiva: leggo le stesse frasi all'infinito senza trattenerle.", "La paralisi da analisi: non so mai da quale argomento sterminato iniziare."] },

    // --- PILASTRO 1: CODIFICA SENSORIALE (VARK Evoluto) ---
    { id: "VARK_V1", q: "Immagina di dover imparare il funzionamento di un motore o di un algoritmo. Cosa cerchi per prima cosa?", opts: ["Un diagramma, uno schema di flusso o un'infografica dettagliata", "Un video su YouTube o un podcast dove un esperto lo spiega a voce", "Un testo accademico o un manuale scritto passo-passo", "Un simulatore, un modellino o scrivere fisicamente il codice/procedimento"] },
    { id: "VARK_A1", q: "Ripensi a un concetto cruciale che hai memorizzato mesi fa. Come si ripresenta nella tua mente?", opts: ["Vedo la pagina del libro, le evidenziature o lo schema spaziale", "Sento letteralmente la mia voce o quella del professore che lo ripete", "Mi viene in mente l'esatta definizione testuale scritta", "Ricordo i movimenti che facevo o l'esercizio in cui l'ho applicato"] },
    { id: "VARK_R1", q: "Entri in una città sconosciuta e devi orientarti. Qual è il tuo istinto?", opts: ["Apro la mappa visiva e guardo la geometria delle strade", "Chiedo indicazioni orali ai passanti e me le ripeto mentalmente", "Leggo i nomi delle vie sui cartelli e me li appunto", "Mi muovo a istinto per tentativi, costruendo una 'bussola interna'"] },
    { id: "VARK_K1", q: "Hai appena letto 20 pagine densissime di teoria pura. Qual è il primo passo per fissarle?", opts: ["Le riorganizzo in una mappa mentale colorata o un Grafo", "Metto via il libro e parlo ad alta voce spiegandole al muro", "Riscrivo a mano i concetti chiave in forma di elenchi puntati", "Devo alzarmi in piedi, camminare o cercare subito un'applicazione pratica"] },
    { id: "VARK_M1", q: "Qual è la forma di 'lezione noiosa' che ti devasta di più cognitivamente?", opts: ["Il professore che parla per due ore senza nemmeno una slide", "Il professore che legge slide caotiche senza piegare il tono di voce", "Lezioni astratte senza alcun caso studio o esercizi pratici", "Dover fare lavori di gruppo al posto di studiare in autonomia dal manuale"] },

    // --- PILASTRO 2: ELABORAZIONE (Attiva vs Riflessiva - Felder-Silverman) ---
    { id: "FS_E1", q: "Ti presentano un problema che non hai mai visto. Come reagisci?", opts: ["Inizio subito a fare dei tentativi o a manipolare i dati per vedere che succede", "Mi fermo a riflettere in silenzio per capire la logica prima di muovere un dito", "Ne parlo immediatamente con qualcuno per fare brainstorming a voce", "Cerco nella memoria o su Google un problema simile e ne leggo la soluzione"] },
    { id: "FS_E2", q: "Quando capisci 'veramente' un argomento difficile?", opts: ["Quando riesco a discuterne e ribatterlo con un collega di studi", "Quando l'ho meditato da solo e i 'pezzi del puzzle' si incastrano nella mia testa", "Quando riesco a schematizzarlo visivamente in modo perfetto", "Quando riesco ad applicarlo per risolvere un quiz o un esercizio senza errori"] },
    { id: "FS_E3", q: "Quale ambiente di studio massimizza il tuo apprendimento profondo?", opts: ["Un gruppo di studio attivo e dinamico con cui confrontarmi", "Una stanza silenziosa, isolata dal mondo, solo io e i materiali", "Un ambiente vivace come un bar o una biblioteca dove posso ascoltare white-noise", "Un tavolo spazioso dove posso fare schemi, camminare e parlare da solo"] },

    // --- PILASTRO 3: PROCESSO (Sequenziale vs Globale) ---
    { id: "FS_P1", q: "Quando approcci una nuova materia imponente, qual è il tuo bisogno principale?", opts: ["Voglio studiare capitolo 1, poi capitolo 2, costruendo passo per passo (Sequenziale)", "Voglio prima l'indice e l'infarinatura generale saltando da un macro-tema all'altro (Globale)", "Voglio capire subito a cosa serve la materia nella vita reale", "Voglio ascoltare un'introduzione discorsiva prima di aprire il libro"] },
    { id: "FS_P2", q: "Come ti ritrovi solitamente quando un argomento è finalmente 'tuo'?", opts: ["Ho costruito la conoscenza mattone dopo mattone in modo logico", "All'improvviso ho avuto un'illuminazione (Aha! moment) e tutto ha senso insieme", "Ho ripassato così tante volte le flashcard che è ormai automatico", "So replicare perfettamente la spiegazione ad alta voce"] },

    // --- PILASTRO 4: FOCUS E GESTIONE DELLO STRESS ---
    { id: "COG_F1", q: "Qual è il tuo limite di tolleranza al focus ininterrotto (Deep Work)?", opts: ["Ho bisogno di micro-pause frequenti, circa ogni 25-30 minuti (Pomodoro)", "Posso immergermi per 60-90 minuti, ma poi ho bisogno di una pausa lunga", "La mia attenzione è irregolare: potrei stare due ore o stancarmi dopo 10 minuti", "Finché mi muovo o interagisco non mi stanco, ma crollo se devo leggere fermo"] },
    { id: "COG_S1", q: "Hai l'ansia che sale prima di un esame importante. Cosa ti blocca di più?", opts: ["La paura del vuoto di memoria inestricabile e improvviso (Orale/Scritto)", "Andare in pallone davanti al professore e non trovare le parole (Ansia Sociale/Orale)", "Trovarmi davanti a esercizi pratici che non assomigliano a quelli fatti a casa", "L'enorme quantità di testo da ricordare parola per parola"] },
    { id: "COG_F2", q: "Stai studiando e il tuo livello di energia cala bruscamente. Cosa fai istintivamente?", opts: ["Prendo un caffè e cerco di forzare l'attenzione sui paragrafi", "Metto le cuffie con musica ritmata/Lofi per isolare l'ambiente", "Mi metto a fare schemi belli o a colorare per tenere le mani occupate", "Devo alzarmi, camminare per la stanza e spiegare i concetti ad alta voce"] },

    // --- PILASTRO 5: STRATEGIE DI MEMORIZZAZIONE ESPLICITE ---
    { id: "MEM_1", q: "Devi memorizzare l'elenco dei 12 nervi cranici o una sequenza di articoli di legge. Come fai?", opts: ["Creo una storiella visiva o li posiziono nelle stanze di casa mia (Loci)", "Inventocanzoncine, acronimi o filastrocche sonore", "Ripeto la lista decine di volte scrivendola in brutta copia", "Uso le flashcard in Ripetizione Spaziata compulsivamente finché non li so"] },
    { id: "MEM_2", q: "Hai appena chiuso il libro, la sessione è finita. Come fai a sapere se 'lo sai'?", opts: ["Chiudo gli occhi e provo a ricostruire mentalmente l'indice visivo dei concetti", "Mi auto-interrogo a voce fingendo di avere un pubblico", "Provo a fare un test o riscrivo i bullet point principali a memoria", "Non lo so finché non mi trovo davanti al foglio da compilare"] },
    { id: "MEM_3", q: "In passato, quale di questi errori all'esame ti ha fatto più rabbia?", opts: ["Sapevo esattamente dov'era la risposta sulla pagina, ma non le parole", "Sapevo il concetto ma non mi veniva in mente come esprimerlo sintatticamente", "Ho applicato la formula giusta in modo sbagliato per distrazione pratica", "Ho fatto un banale errore di lettura sulla domanda"] },
    { id: "MEM_4", q: "L'esame richiede di memorizzare migliaia di date e definizioni. Il tuo incubo?", opts: ["Doverle imparare tutte scollegate senza poter creare trame o storie (Palazzo)", "Doverle scrivere di continuo senza poterle associare a fonetiche o P.A.O.", "Non poter fare schemi gerarchici che le includano tutte", "Non avere abbastanza tempo per mandarle in pasto all'algoritmo di Spaced Repetition"] },
    { id: "MEM_5", q: "Come ti piace che sia presentata una spiegazione AI (ChatGPT o simili)?", opts: ["Concisa, bullet points, grassetti essenziali", "Narrativa, esplicativa, come se stesse parlando a me", "Sotto forma di tabella comparativa o codice da elaborare", "Estremamente analitica, divisa in premesse logiche rigorose"] },

    // --- PILASTRO 6: CHIUSURA ---
    { id: "FIN_1", q: "Il tuo obiettivo ultimo con lo studio (la tua 'Scintilla' o 'Aura'):", opts: ["Eccellere, prendere sempre il massimo e battere l'ansia", "Poter parlare e argomentare con chiunque di questi temi fluidamente", "Costruire un 'Secondo Cervello' digitale dove non dimentico mai le fondamenta", "Capire profondamente i sistemi per poterli applicare e superare nel mondo reale"] }
];

export function openArchitect() {
    const overlay = document.getElementById('architect-overlay');
    overlay.style.display = 'flex';
    archStep = 0;
    archAnswers = [];
    // Seed the dynamic test with 2 foundational behavioral questions 
    dynamicArchQuestions = [ ARCH_QUESTIONS[0], ARCH_QUESTIONS[1] ]; // 2 comportamentali
    renderArchStep();

}

export function closeArchitect() {
    const overlay = document.getElementById('architect-overlay');
    if (overlay) overlay.style.display = 'none';
}

// Phase 14: neuralPulseArchive, getNeuralPulse, refreshPulseUI, renderHome
//           estratte in modules/home.js — importate in cima al file.

/**
 * ==========================================
 * TUTOR IBRIDO: INTEGRAZIONE WEB + FILE
 * ==========================================
 */

export function getActiveContext(deckId) {
    const deck = _deps.gState.decks.find(d => d.id === deckId);
    if (!deck || !deck.sources) return "";
    
    const active = deck.sources.filter(s => s.isActive);
    if (active.length === 0) return "";

    return active.map(s => `[📄 FILE: ${s.name}]\n(In un'applicazione reale, qui andrebbe il contenuto estratto del file ${s.name}...)`).join('\n\n');
}

export async function callGeminiWithSearch(prompt) {
    // Google Search grounding requires direct API call (proxy non supporta tools)
    const apiKey = _deps.state?.geminiKey || window.SecurityManager?.getApiKey?.();
    if (!apiKey) {
        // Fallback: chiamata senza grounding tramite proxy
        try {
            return await callGemini(prompt, { temperature: 0.6 });
        } catch (e) {
            _deps.showToast(t('arch_no_gemini_key'), 'error');
            return "Errore: API key mancante.";
        }
    }

    const model = (typeof _deps.discoverGeminiModel === 'function') ? await _deps.discoverGeminiModel(apiKey) : 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }] 
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        const data = await response.json();

        // 1. Estrarre il testo principale
        let aiText = data.candidates[0].content.parts[0].text;

        // 2. Estrarre i Metadata di ricerca (I link reali)
        const grounding = data.candidates[0].groundingMetadata;
        if (grounding && grounding.groundingChunks) {
            aiText += `\n\n---\n🌐 **Fonti Web verificate:**\n`;
            grounding.groundingChunks.forEach((chunk, index) => {
                if (chunk.web) {
                    aiText += `[${index + 1}] ${chunk.web.title} (${chunk.web.uri})\n`;
                }
            });
        }

        return aiText;
    } catch (error) {
        console.error("Errore API Gemini Search:", error);
        return "Errore nella sincronizzazione neurale con il web.";
    }
}

export async function askHybridTutor(userQuestion, deckId) {
    const fileContext = getActiveContext(deckId);
    _deps.showToast(t('arch_querying'), 'info');

    const hybridPrompt = `
        CONFIGURAZIONE TUTOR CORTEX:
        Sei un'intelligenza ibrida. Hai accesso a due database:
        1. [DATABASE LOCALE]: I file caricati dall'utente (Verità Assoluta).
        2. [DATABASE WEB]: Informazioni aggiornate dal mondo esterno.

        --- INIZIO DATABASE LOCALE (I TUOI FILE) ---
        ${fileContext || "Nessun file selezionato."}
        --- FINE DATABASE LOCALE ---

        DOMANDA DELL'UTENTE: ${userQuestion}

        ISTRUZIONI DI RISPOSTA:
        - Priorità: Se la risposta è nei file locali, parti da lì citando il file [📄 NomeFile].
        - Espansione: Arricchisci la risposta con dati dal web citando [🌐 Web].
        - Conflitto: Se i file e il web dicono cose diverse, segnalalo chiaramente.
        - Stile: Risposta tecnica, pulita, da Architect.
    `;

    const response = await callGeminiWithSearch(hybridPrompt);
    return response;
}

export function updateHybridStatusBadge(deckId) {
    const deck = _deps.gState.decks.find(d => d.id === deckId);
    if (!deck) return;
    const fileCount = deck.sources ? deck.sources.filter(s => s.isActive).length : 0;
    
    const badge = document.getElementById('chat-status-badge');
    if (badge) {
        badge.innerHTML = `
            <div style="display: flex; gap: 10px; align-items: center;">
                <span title="File Locali">📄 ${fileCount}</span>
                <span style="opacity: 0.3; color: var(--text-main);">|</span>
                <span title="Web Sync Attivo" style="color: var(--text-main);">🌐 Online</span>
                <span class="pulse-dot"></span>
            </div>
        `;
    }
}

/**
 * ==========================================
 * GESTIONE FONTI (MATERIAL MANAGER)
 * ==========================================
 */

export function renderMaterialSection(deckId) {
    const deck = _deps.gState.decks.find(d => d.id === deckId);
    if (!deck) return;
    const container = document.getElementById('page-home'); // Safe mapping

    container.innerHTML = `
        <div class="material-manager" style="max-width: 800px; margin: 0 auto; padding: 40px 20px;">
            <button aria-label="Torna alla home" data-fn="renderHome" style="background:none; border:none; color:var(--accent); cursor:pointer; font-size:0.9rem; margin-bottom:20px; display:flex; align-items:center; gap:5px;">
                ${t('arch_back')}
            </button>
            <h2 style="color: var(--text-main); margin-bottom: 10px;">Gestione Fonti: ${deck.name}</h2>
            <p style="color: var(--text-sub); font-size: 0.9rem; margin-bottom: 30px;">
                Seleziona i file che l'IA deve utilizzare come base per la tua conoscenza.
            </p>

            <div class="upload-box" style="border: 2px dashed var(--border-color); padding: 40px; text-align: center; border-radius: 15px; margin-bottom: 40px;">
                <input type="file" id="file-input" aria-label="Carica file sorgente per analisi" hidden onchange="handleFileUpload('${deckId}')">
                <button aria-label="Carica file sorgente" class="btn-architect" data-fn="clickFileInput" style="width: auto; padding: 12px 30px;">
                    ${t('arch_upload_btn')}
                </button>
            </div>

            <div class="sources-list" style="background: var(--card-bg); border-radius: 20px; border: 1px solid var(--border-color); overflow: hidden;">
                <div style="padding: 15px 20px; border-bottom: 1px solid var(--border-color); font-weight: bold; font-size: 0.8rem; text-transform: uppercase; opacity: 0.6;">
                    Fonti Caricate (${deck.sources?.length || 0})
                </div>
                <div id="sources-container">
                    ${renderSourceRows(deck)}
                </div>
            </div>
        </div>
    `;
}

function renderSourceRows(deck) {
    if (!deck.sources || deck.sources.length === 0) {
        return `<div style="padding: 30px; text-align: center; opacity: 0.4; color: var(--text-main);">${t('arch_no_sources')}</div>`;
    }

    return deck.sources.map(source => `
        <div class="source-row" style="display: flex; align-items: center; justify-content: space-between; padding: 15px 20px; border-bottom: 1px solid var(--border-color); transition: 0.2s; ${source.isActive ? 'background: rgba(124, 58, 237, 0.05);' : 'opacity: 0.6;'}">
            <div style="display: flex; align-items: center; gap: 15px;">
                <span style="font-size: 1.2rem;">${source.name.endsWith('.pdf') ? '📕' : '📄'}</span>
                <span style="font-size: 0.95rem; color: var(--text-main); font-weight: ${source.isActive ? '600' : '400'};">${source.name}</span>
            </div>
            
            <div style="display: flex; align-items: center; gap: 20px;">
                <label class="switch">
                    <input type="checkbox" aria-label="Attiva/Disattiva questa sorgente" ${source.isActive ? 'checked' : ''} onchange="toggleSource('${deckId}', '${source.id}')">
                    <span class="slider round"></span>
                </label>
                <button aria-label="Elimina questo sorgente" data-fn="deleteSource" data-params='["${deckId}", "${source.id}"]' style="background:none; border:none; color:#ff4444; cursor:pointer; font-size: 0.8rem;">${t('arch_delete')}</button>
            </div>
        </div>
    `).join('');
}

export function toggleSource(deckId, sourceId) {
    const deck = _deps.gState.decks.find(d => d.id === deckId);
    if (!deck) return;
    const source = deck.sources.find(s => s.id === sourceId);
    if (!source) return;
    
    source.isActive = !source.isActive;
    _deps.saveGState();
    renderMaterialSection(deckId);
    _deps.showToast(source.isActive ? t('arch_source_on') : t('arch_source_off'), "info");
}

export function deleteSource(deckId, sourceId) {
    const deck = _deps.gState.decks.find(d => d.id === deckId);
    if (!deck) return;
    
    deck.sources = deck.sources.filter(s => s.id !== sourceId);
    _deps.saveGState();
    renderMaterialSection(deckId);
    _deps.showToast(t('arch_source_deleted'), "warning");
}

export async function handleFileUpload(deckId) {
    const file = document.getElementById('file-input').files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) { // Limite 10MB
        _deps.showToast(t('arch_file_too_large'), 'error');
        return;
    }

    _deps.showToast(t('arch_syncing'), 'info');

    try {
        const user = firebase.auth().currentUser;
        const userId = user ? user.uid : 'anon';
        const storage = firebase.storage();
        const storageRef = storage.ref(`users/${userId}/decks/${deckId}/${file.name}`);
        
        // 1. Upload del file reale
        const snapshot = await storageRef.put(file);
        const downloadURL = await snapshot.ref.getDownloadURL();

        // 2. Estrazione testo (Simuliamo l'estrazione per PDF/TXT)
        const textContent = await extractTextFromFile(file); 

        const newSource = {
            id: "src_" + Date.now(),
            name: file.name,
            url: downloadURL,
            content: textContent, // Questo è ciò che il Tutor leggerà
            isActive: true,
            uploadedAt: new Date().toISOString()
        };

        const deck = _deps.gState.decks.find(d => d.id === deckId);
        if (!deck) return;
        if (!deck.sources) deck.sources = [];
        deck.sources.push(newSource);

        _deps.saveGState(); 
        renderMaterialSection(deckId);
        _deps.showToast(t('arch_file_ready'), 'success');

    } catch (error) {
        console.error("Storage Error:", error);
        _deps.showToast(t('err_file_load'), "error");
    }
}

// Nota: La funzione extractTextFromFile è già definita precedentemente (riga 3022) 
// con il supporto completo per PDF.js e Mammoth.js (DOCX).

export function renderNeuralStrips() {
    const decks = (typeof _deps.state !== 'undefined' && _deps.state.decks) || [];
    if (decks.length === 0) {
        return `<p style="opacity:0.2; font-style: italic; font-size: 0.9rem; color:var(--text);">Nessuna traccia neurale rilevata. Crea un mazzo per iniziare.</p>`;
    }

    return decks.map((deck, index) => `
        <div class="neural-strip" data-fn="openDeck" data-params="[${index}]" 
             style="display: flex; align-items: center; justify-content: space-between; padding: 20px 0; border-bottom: 1px solid rgba(255,255,255,0.03); cursor: pointer; transition: 0.3s;">
            <div style="display: flex; align-items: center; gap: 20px;">
                <div class="status-dot" style="width: 6px; height: 6px; background: var(--accent); border-radius: 50%; box-shadow: 0 0 12px var(--accent);"></div>
                <span style="font-size: 1.1rem; font-weight: 400; letter-spacing: -0.5px; color:var(--text);">${deck.name}</span>
            </div>
            <div style="font-size: 0.75rem; font-family: monospace; opacity: 0.4; color:var(--text);">
                ${deck.cards?.length || 0} UNITS
            </div>
        </div>
    `).join('');
}

export function updateUsername(newName) {
    if (true) { // gState always available via _deps
        _deps.gState.username = newName;
        localStorage.setItem(_deps.KEYS.GAME_STATE, JSON.stringify(_deps.gState));
        _deps.showToast(t('arch_name_updated'), 'success');
    }
}

export function changeAvatar() {
    const newAvatar = prompt("Inserisci URL della nuova immagine:");
    if(newAvatar && typeof _deps.gState !== 'undefined') {
        _deps.gState.avatarUrl = newAvatar;
        const img = document.getElementById('current-avatar');
        if (img) img.src = newAvatar;
        localStorage.setItem(_deps.KEYS.GAME_STATE, JSON.stringify(_deps.gState));
    }
}

const OWNER_UID   = "f8oLEt3LDpT7VN9zFOa10mVE2Cf2";
const OWNER_EMAIL = "francesco1cutugno@gmail.com";

export function isAdmin() {
    // Controlla UID e email da Firebase Auth — no fallback localStorage (sicurezza)
    const uid   = window._fbUserId || '';
    const email = window._cortexUserEmail || '';
    if (uid === OWNER_UID || email === OWNER_EMAIL) return true;
    try {
        const user = typeof firebase !== 'undefined' ? firebase.auth().currentUser : null;
        return !!(user && (user.uid === OWNER_UID || user.email === OWNER_EMAIL));
    } catch (_) { return false; }
}

// Admin attivo = è admin E non è in modalità anteprima studente
function isAdminActive() {
    if (!isAdmin()) return false;
    return localStorage.getItem('cortex_admin_preview') !== '1';
}

export function renderDeckGrid() {
    return (_deps.state.decks || []).map((d, index) => `
        <div class="deck-card" data-fn="openDeck" data-params="[${index}]" style="padding:20px; border-radius:16px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); text-align:center; cursor:pointer; transition:0.2s;">
            <div style="font-size:2rem; margin-bottom:10px;">📚</div>
            <h4 style="font-size:1.1rem; color:var(--text); margin-bottom:5px;">${d.name}</h4>
            <div style="font-size:0.8rem; color:var(--text-muted);">${d.cards ? d.cards.length : 0} carte</div>
        </div>
    `).join('');
}

function dummyReplacement() { }

// Removed duplicate sendFeedback

export function getUnlockedMilestones() {
    const milestones = [];
    if (typeof _deps.gState === 'undefined') return milestones;
    const { streak = 0, xp = 0, studentProfile } = _deps.gState;

    if (streak >= 3) milestones.push({ icon: '🌱', name: 'Novizio', desc: '3 giorni di costanza' });
    if (streak >= 15) milestones.push({ icon: '🔥', name: 'Fenice', desc: '15 giorni di fuoco' });
    if (xp >= 5000) milestones.push({ icon: '✨', name: 'Elite', desc: 'Hai superato i 5000 XP' });
    
    if (studentProfile && studentProfile.scores && studentProfile.scores.every(s => s > 70)) {
        milestones.push({ icon: '☯️', name: 'Zen Master', desc: 'Mente perfettamente equilibrata' });
    }

    return milestones;
}

export async function generatePersonalizedTutorPlan() {
    // Se l'admin non ha ancora fatto il test, genera un profilo random e poi procede
    if (!_deps.gState || !_deps.gState.studentProfile) {
        if (isAdmin()) {
            generateRandomProfile(); // setta _deps.gState.studentProfile in modo sincrono
            _deps.showToast(t('arch_profile_generated'), "info");
            // Aspetta che la pagina si ri-renderizzi, poi richiama questa funzione
            setTimeout(() => generatePersonalizedTutorPlan(), 400);
            return;
        }
        _deps.showToast(t('arch_complete_test_first'), "warning");
        const btn = document.querySelector('[data-fn="openArchitect"]');
        if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }

    const btn = document.querySelector('[data-fn="generatePersonalizedTutorPlan"]');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span style="display:inline-block;width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;margin-right:8px;vertical-align:middle;"></span> ${t('arch_processing')}`;
    }

    const prompt = `Agisci come Coach di Studio. Analizza questo profilo studente: ${JSON.stringify(_deps.gState.studentProfile)}.
Crea un piano d'azione personalizzato in questo formato JSON esatto (solo JSON, nessun testo aggiuntivo):
{
    "masterTechnique": "Nome della tecnica principale di studio (es. Feynman con Visual Box)",
    "cognitiveBridge": "Un ponte cognitivo che spieghi come superare la carenza principale sfruttando il punto di forza"
}`;

    try {
        // Passa responseMimeType in camelCase (richiesto dall'SDK Node.js lato proxy)
        const rawText = await callGemini(prompt, {
            generationConfig: { temperature: 0.6, responseMimeType: 'application/json' }
        });

        // Estrazione JSON robusta — greedy per catturare oggetti annidati
        let plan;
        try {
            plan = JSON.parse(rawText.trim());
        } catch {
            // Gemini ha avvolto il JSON in markdown o testo extra → estrai con regex greedy
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("JSON non trovato nella risposta AI.");
            plan = JSON.parse(jsonMatch[0].trim());
        }

        if (!plan.masterTechnique || !plan.cognitiveBridge) throw new Error("Piano incompleto");

        if (_deps.gState) _deps.gState.activeTutorPlan = plan;
        if (_deps.state) _deps.state.activeTutorPlan = plan;

        if (_deps.KEYS?.GAME_STATE) {
            localStorage.setItem(_deps.KEYS.GAME_STATE, JSON.stringify(_deps.gState));
        }

        _deps.showToast(t('arch_plan_updated'), "success");
        renderNetworkAndStats();
    } catch (e) {
        console.error("Tutor Plan failed", e);
        let msg;
        if (e.name === 'AbortError') {
            msg = t('arch_err_slow');
        } else if (e.isPaywall) {
            msg = t('arch_err_limit');
        } else if (e.isNoApiKey) {
            msg = t('arch_err_no_key');
        } else if (e.code === 'unauthenticated' || e.message?.includes('unauthenticated')) {
            msg = t('arch_err_login');
        } else {
            msg = `❌ Errore AI: ${e.message || 'Riprova tra qualche secondo.'}`;
        }
        _deps.showToast(msg, "error");
    } finally {
        // Sempre: riabilita il button, qualunque cosa sia successa
        if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
    }
}

// Pool di materie scolastiche per la generazione rapida random (solo test admin)
const RANDOM_TEST_TOPICS = [
    'Storia', 'Matematica', 'Italiano', 'Fisica', 'Chimica', 'Biologia',
    'Filosofia', 'Inglese', 'Diritto', 'Economia', 'Geografia', 'Latino',
    'Informatica', 'Arte', 'Scienze', 'Educazione Civica'
];

/**
 * quickGenerateDeck — Admin test: genera un mazzo AI su una materia scolastica
 * presa a caso (nessun input richiesto). Serve solo per ottenere velocemente
 * un mazzo con cui testare flashcard, Quick Mode, Modalità Prof, ecc.
 */
export async function quickGenerateDeck() {
    const topic = RANDOM_TEST_TOPICS[Math.floor(Math.random() * RANDOM_TEST_TOPICS.length)];

    _deps.showToast(t('deck_generating'), 'info');

    const prompt_text = `Sei un professore esperto. Crea un mazzo di 12 flashcard sull'argomento: "${topic.trim()}".
Rispondi SOLO con un JSON valido in questo formato esatto, senza markdown, senza testo extra:
{
  "name": "Nome breve del mazzo",
  "cards": [
    {"q": "Domanda o termine", "a": "Risposta o definizione"},
    {"q": "...", "a": "..."}
  ]
}
Le domande devono essere brevi e precise. Le risposte complete ma concise (max 2 righe).`;

    try {
        // JSON mode: assicura risposta JSON pura senza markdown wrapper
        const rawText = await callGemini(prompt_text, {
            generationConfig: { temperature: 0.5, responseMimeType: 'application/json' }
        });

        let data;
        try {
            data = JSON.parse(rawText.trim());
        } catch {
            // Fallback: Gemini ha wrappato in markdown — estrai con regex
            const match = rawText.match(/\{[\s\S]*\}/);
            if (!match) throw new Error('JSON non trovato nella risposta AI');
            data = JSON.parse(match[0]);
        }

        if (!data.cards || !Array.isArray(data.cards) || data.cards.length === 0) {
            throw new Error('Nessuna card generata');
        }

        // Crea il mazzo nello state
        const newDeck = {
            id: Date.now(),
            name: data.name || topic.trim(),
            subject: topic.trim(),
            examDate: '',
            studyMethod: 'cortex',
            cards: data.cards.map((c, i) => ({
                id: Date.now() + i,
                q: c.q || c.front || '',
                a: c.a || c.back || '',
                interval: 1,
                ease: 2.5,
                nextReview: todayStr(),
                reps: 0
            }))
        };

        if (_deps.state && Array.isArray(_deps.state.decks)) {
            _deps.state.decks.push(newDeck);
            _deps.saveState();
        }

        _deps.showToast(`✅ Mazzo "${newDeck.name}" creato con ${newDeck.cards.length} card!`, 'success');

        // Naviga a Materiale e re-renderizza la lista mazzi
        if (typeof window.showPage === 'function') {
            window.showPage('materiale');
        }
        // Belt-and-suspenders: ri-renderizza esplicitamente dopo che il DOM si stabilizza
        // (gestisce eventuali race condition tra navigazione e rendering della griglia)
        setTimeout(() => {
            if (typeof window.renderDecks === 'function') {
                window.renderDecks();
            } else if (typeof _deps.renderDecks === 'function') {
                _deps.renderDecks();
            }
        }, 100);

    } catch (e) {
        console.error('[quickGenerateDeck]', e);
        if (e.name === 'AbortError') {
            _deps.showToast(t('ai_too_slow'), 'warning');
        } else if (e.isPaywall) {
            _deps.showToast(t('ai_limit_reached'), 'warning');
        } else if (e.isNoApiKey) {
            _deps.showToast(t('ai_no_key_login'), 'error');
        } else {
            _deps.showToast(`❌ Errore: ${e.message}`, 'error');
        }
    }
}

/**
 * generateUnimeKit — genera al volo il kit di studio (flashcard, con quiz automatico
 * a partire dal mazzo) per l'insegnamento UNIME scelto su /unime.
 * Legge cortex_uni_insegnamento / cortex_uni_corso da localStorage.
 */
export async function generateUnimeKit() {
    let ins = '', corso = '';
    try { ins = (localStorage.getItem('cortex_uni_insegnamento') || '').trim(); corso = (localStorage.getItem('cortex_uni_corso') || '').trim(); } catch (e) {}
    if (!ins) { _deps.showToast('Nessun insegnamento selezionato.', 'warning'); return; }

    _deps.showToast('⏳ Preparo il tuo kit di studio…', 'info');

    const ctx = corso ? ` (corso di ${corso}, Università di Messina)` : '';
    const prompt_text = `Sei un professore universitario esperto. Crea un mazzo di 18 flashcard per preparare l'esame universitario di "${ins}"${ctx}.
Copri definizioni, concetti chiave, teoremi/formule ed esempi tipici dell'esame. Livello universitario, in italiano.
Rispondi SOLO con un JSON valido in questo formato esatto, senza markdown, senza testo extra:
{
  "name": "Nome breve del mazzo",
  "cards": [
    {"q": "Domanda o termine", "a": "Risposta o definizione"}
  ]
}
Domande brevi e precise. Risposte complete ma concise (max 3 righe).`;

    try {
        const rawText = await callGemini(prompt_text, {
            generationConfig: { temperature: 0.5, responseMimeType: 'application/json' }
        });
        let data;
        try { data = JSON.parse(rawText.trim()); }
        catch { const m = rawText.match(/\{[\s\S]*\}/); if (!m) throw new Error('JSON non trovato nella risposta AI'); data = JSON.parse(m[0]); }
        if (!data.cards || !Array.isArray(data.cards) || data.cards.length === 0) throw new Error('Nessuna card generata');

        const newDeck = {
            id: Date.now(),
            name: data.name || ins,
            subject: ins,
            examDate: '',
            studyMethod: 'cortex',
            cards: data.cards.map((c, i) => ({
                id: Date.now() + i,
                q: c.q || c.front || '',
                a: c.a || c.back || '',
                interval: 1, ease: 2.5, nextReview: todayStr(), reps: 0
            }))
        };
        if (_deps.state && Array.isArray(_deps.state.decks)) { _deps.state.decks.push(newDeck); _deps.saveState(); }
        try { localStorage.removeItem('cortex_uni_insegnamento'); } catch (e) {}

        _deps.showToast(`✅ Kit "${newDeck.name}" pronto: ${newDeck.cards.length} flashcard + quiz!`, 'success');
        if (typeof window.showPage === 'function') window.showPage('materiale');
        setTimeout(() => {
            if (typeof window.renderDecks === 'function') window.renderDecks();
            else if (typeof _deps.renderDecks === 'function') _deps.renderDecks();
        }, 100);
    } catch (e) {
        console.error('[generateUnimeKit]', e);
        if (e.name === 'AbortError') _deps.showToast(t('ai_too_slow'), 'warning');
        else if (e.isPaywall) _deps.showToast(t('ai_limit_reached'), 'warning');
        else if (e.isNoApiKey) _deps.showToast(t('ai_no_key_login'), 'error');
        else _deps.showToast(`❌ Errore nella generazione: ${e.message}`, 'error');
    }
}

export function resetSystemForTesting() {
    if (!isAdmin()) return;
    if (confirm("Azzerare tutto? (XP, Stelle, Profilo, Tutor, Stats)")) {
        _deps.gState.xp = 0; 
        _deps.gState.stars = 0; 
        _deps.gState.streak = 0;
        _deps.gState.studentProfile = null; 
        _deps.gState.activeTutorPlan = null;
        if(_deps.state) _deps.state.studentProfile = null; // Forza anche qui
        localStorage.setItem(_deps.KEYS.GAME_STATE, JSON.stringify(_deps.gState));
        location.reload();
    }
}

// ── Archetipi cognitivi — basati su VARK, Big Five, Kolb, Felder-Silverman ──────
const COGNITIVE_ARCHETYPES = [
    {
        archetype: "Il Falco",
        archetype_subtitle: "Logico-sequenziale. Analisi deduttiva, strutture rigide, precisione assoluta.",
        archetype_emoji: "🦅",
        labels: ["LOGICO", "SEQUENZIALE", "ANALITICO", "PRECISO", "SISTEMATICO"],
        strengths: ["Ragionamento deduttivo", "Strutturazione gerarchica dei concetti", "Alta precisione nei dettagli"],
        weaknesses: ["Difficoltà con ambiguità e salti intuitivi", "Lentezza nei task aperti", "Resistenza al cambiamento di metodo"],
        advice: "Costruisci mappe gerarchiche prima di ogni sessione. Usa Feynman per testare la comprensione bottom-up."
    },
    {
        archetype: "Il Delfino",
        archetype_subtitle: "Sociale-collaborativo. Impara spiegando, processa in modo dialogico.",
        archetype_emoji: "🐬",
        labels: ["SOCIALE", "VERBALE", "COLLABORATIVO", "EMPATICO", "DIALOGICO"],
        strengths: ["Spiegazione come consolidamento", "Alta intelligenza interpersonale", "Memorizzazione narrativa"],
        weaknesses: ["Difficoltà nello studio solitario prolungato", "Distrazione in ambienti rumorosi", "Dipendenza dal feedback esterno"],
        advice: "Studia ad alta voce, registra spiegazioni, cerca un compagno di studio. Il metodo Delfino: insegna prima di studiare."
    },
    {
        archetype: "Il Leone",
        archetype_subtitle: "Attivo-pragmatico. Apprende facendo, preferisce il concreto all'astratto.",
        archetype_emoji: "🦁",
        labels: ["ATTIVO", "PRAGMATICO", "CINESTETICO", "IMPULSIVO", "DIRETTO"],
        strengths: ["Apprendimento esperienziale", "Alta tolleranza alla sperimentazione", "Problem solving pratico"],
        weaknesses: ["Difficoltà con teorie astratte prolungate", "Scarsa pazienza per la revisione", "Impulsività nelle conclusioni"],
        advice: "Alterna teoria (max 20min) con esercizi pratici. Kolb Accomodante: fai l'esperienza, poi capisci la teoria."
    },
    {
        archetype: "La Farfalla",
        archetype_subtitle: "Creativo-associativo. Pensa per metafore, connette idee distanti tra loro.",
        archetype_emoji: "🦋",
        labels: ["CREATIVO", "VISUALE", "ASSOCIATIVO", "DIVERGENTE", "INTUITIVO"],
        strengths: ["Sintesi visiva e grafica", "Connessioni interdisciplinari", "Creatività nella risoluzione"],
        weaknesses: ["Difficoltà con sequenze rigide", "Tendenza a divagare", "Scarsa attenzione ai dettagli tecnici"],
        advice: "Usa Mind Map e schemi visivi. Il tuo punto di forza è il quadro d'insieme — costruisci la struttura poi riempila."
    },
    {
        archetype: "La Tartaruga",
        archetype_subtitle: "Riflessivo-profondo. Elaborazione lenta ma solidissima, teoria prima della pratica.",
        archetype_emoji: "🐢",
        labels: ["RIFLESSIVO", "TEORICO", "ACCURATO", "LENTO", "SOLIDO"],
        strengths: ["Comprensione profonda e duratura", "Alto livello di accuratezza", "Resistenza all'oblio nel lungo periodo"],
        weaknesses: ["Lentezza nell'output", "Difficoltà sotto pressione temporale", "Blocco da perfezionismo"],
        advice: "Kolb Assimilante: costruisci modelli teorici completi. Usa spaced repetition e non forzare i tempi — la tua memoria è la più solida."
    },
    {
        archetype: "Il Lupo",
        archetype_subtitle: "Intuitivo-olistico. Vede il pattern prima dei dettagli, pensiero globale.",
        archetype_emoji: "🐺",
        labels: ["GLOBALE", "INTUITIVO", "OLISTICO", "VELOCE", "SINTETICO"],
        strengths: ["Pattern recognition immediato", "Visione d'insieme rapida", "Adattamento intuitivo a nuovi contesti"],
        weaknesses: ["Lacune nei dettagli tecnici", "Difficoltà a giustificare il ragionamento", "Instabilità se il pattern non emerge"],
        advice: "Felder-Silverman Globale: leggi prima l'indice e il riassunto, poi entra nei dettagli. Quiz frequenti per consolidare."
    },
    {
        archetype: "La Volpe",
        archetype_subtitle: "Adattivo-strategico. Cambia metodo rapidamente, metacognizione elevata.",
        archetype_emoji: "🦊",
        labels: ["STRATEGICO", "ADATTIVO", "METACOGNITIVO", "FLESSIBILE", "CALCOLATORE"],
        strengths: ["Alta metacognizione e autoregolazione", "Ottimizzazione del metodo in real time", "Efficienza nelle sessioni di studio"],
        weaknesses: ["Sovra-ottimizzazione (cambia metodo troppo spesso)", "Difficoltà a mantenere un sistema fisso", "Ansia da prestazione"],
        advice: "Definisci un sistema fisso per 2 settimane prima di cambiarlo. Il tuo punto di forza è la strategia — sfruttala."
    },
    {
        archetype: "Il Gufo",
        archetype_subtitle: "Analitico-verbale. Pensa attraverso il linguaggio, forte lettore e scrittore.",
        archetype_emoji: "🦉",
        labels: ["VERBALE", "ANALITICO", "LETTORE", "CRITICO", "METODICO"],
        strengths: ["Comprensione testuale avanzata", "Scrittura come strumento di pensiero", "Argomentazione critica"],
        weaknesses: ["Difficoltà con immagini e diagrammi", "Lentezza nei task non verbali", "Sottovalutazione della pratica"],
        advice: "VARK Reading/Writing: prendi appunti rielaborati, non copia. Scrivi riassunti propri. La parola è il tuo motore."
    },
    {
        archetype: "La Scintilla",
        archetype_subtitle: "Impulsivo-creativo. Energia a burst, alto rischio distrazione, picchi di genio.",
        archetype_emoji: "⚡",
        labels: ["IMPULSIVO", "ENERGICO", "CREATIVO", "DISPERSIVO", "INTENSO"],
        strengths: ["Picchi di produttività estrema", "Alta creatività sotto pressione", "Energia e motivazione iniziale"],
        weaknesses: ["Difficoltà nel mantenere focus prolungato", "Procrastinazione cronica", "Crollo dopo i picchi"],
        advice: "Pomodoro aggressivo: 25 min on, 10 off. Sfrutta i picchi. Elimina le distrazioni fisicamente dal campo visivo."
    },
    {
        archetype: "Il Cristallo",
        archetype_subtitle: "Rigoroso-perfezionista. Alta conscienziosità Big Five, standard elevatissimi.",
        archetype_emoji: "🧊",
        labels: ["PERFEZIONISTA", "RIGOROSO", "COSCIENZIOSO", "CONTROLLATO", "PRECISO"],
        strengths: ["Qualità dell'output elevatissima", "Zero errori nei dettagli", "Costanza e disciplina nel lungo periodo"],
        weaknesses: ["Blocco da perfezionismo", "Lentezza nell'avanzamento", "Ansia da imprecisione"],
        advice: "Imposta un timer. Il perfezionismo è una risorsa — governa il quando. Done is better than perfect nelle prime bozze."
    }
];

export function generateRandomProfile() {
    // Disponibile per qualsiasi utente loggato (usato per testing)
    // Seleziona un archetipo casuale (mai lo stesso due volte di fila)
    const lastIdx = parseInt(localStorage.getItem('cortex_last_archetype_idx') || '-1');
    let idx;
    do { idx = Math.floor(Math.random() * COGNITIVE_ARCHETYPES.length); } while (idx === lastIdx);
    localStorage.setItem('cortex_last_archetype_idx', String(idx));

    const archetype = COGNITIVE_ARCHETYPES[idx];

    // Pesi realistici per le dimensioni (non tutti uguali)
    const baseScores = archetype.labels.map((_, i) => {
        // Prima dimensione = punto di forza dominante (70-100), resto variabile (35-85)
        return i === 0
            ? Math.floor(Math.random() * 30) + 70
            : Math.floor(Math.random() * 50) + 35;
    });

    const profile = {
        archetype:          archetype.archetype,
        archetype_subtitle: archetype.archetype_subtitle,
        archetype_emoji:    archetype.archetype_emoji,
        labels:             archetype.labels,
        scores:             baseScores,
        strengths:          archetype.strengths,
        weaknesses:         archetype.weaknesses,
        advice:             archetype.advice,
    };

    if (_deps.gState) _deps.gState.studentProfile = profile;
    if (_deps.state)  _deps.state.studentProfile  = profile;

    localStorage.setItem(_deps.KEYS.GAME_STATE, JSON.stringify(_deps.gState));
    _deps.showToast(`Profilo generato: ${archetype.archetype_emoji} ${archetype.archetype}`, "success");
    if (typeof window.showPage === 'function') {
        window.showPage('community');
    } else {
        location.reload();
    }
}

// ── Admin Panel ───────────────────────────────────────────────────────────────
function adminPanelHtml() {
    return `
        <div id="admin-panel" style="
            margin-top: 36px;
            padding: 24px;
            border: 1px solid rgba(255, 68, 68, 0.25);
            border-radius: 16px;
            background: rgba(255, 30, 30, 0.04);
        ">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:18px;">
                <span style="font-size:1.3rem;">👑</span>
                <h4 style="color:#ff6b6b; font-size:0.9rem; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; margin:0;">Admin Panel</h4>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <button data-fn="quickGenerateDeck"
                    style="padding:12px 16px; border-radius:10px; border:1px solid rgba(100,200,100,0.25); background:rgba(100,200,100,0.06); color:#7fffb2; font-size:0.82rem; font-weight:700; cursor:pointer; text-align:left; transition:background 0.2s; grid-column: 1 / -1;"
                    onmouseover="this.style.background='rgba(100,200,100,0.14)'" onmouseout="this.style.background='rgba(100,200,100,0.06)'">
                    ${t('arch_generate_btn')}
                </button>
                <button data-fn="generateRandomProfile"
                    style="padding:12px 16px; border-radius:10px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:var(--text); font-size:0.82rem; font-weight:700; cursor:pointer; text-align:left; transition:background 0.2s;"
                    onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
                    🎲 Genera Profilo Random
                </button>
                <button data-fn="openArchitect"
                    style="padding:12px 16px; border-radius:10px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.04); color:var(--text); font-size:0.82rem; font-weight:700; cursor:pointer; text-align:left; transition:background 0.2s;"
                    onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.04)'">
                    🧪 Test Attitudinale
                </button>
                <button data-fn="adminToggleFeedback"
                    style="padding:12px 16px; border-radius:10px; border:1px solid rgba(255,100,100,0.2); background:rgba(255,60,60,0.05); color:#ff8080; font-size:0.82rem; font-weight:700; cursor:pointer; text-align:left; transition:background 0.2s;"
                    onmouseover="this.style.background='rgba(255,60,60,0.12)'" onmouseout="this.style.background='rgba(255,60,60,0.05)'">
                    📋 Modalità Feedback Admin
                </button>
                <button data-fn="resetSystemForTesting"
                    style="padding:12px 16px; border-radius:10px; border:1px solid rgba(255,68,68,0.2); background:rgba(255,68,68,0.05); color:#ff6b6b; font-size:0.82rem; font-weight:700; cursor:pointer; text-align:left; transition:background 0.2s;"
                    onmouseover="this.style.background='rgba(255,68,68,0.12)'" onmouseout="this.style.background='rgba(255,68,68,0.05)'">
                    🧹 Reset DB Test
                </button>
            </div>
            <p style="margin-top:12px; font-size:0.72rem; color:rgba(255,255,255,0.25); text-align:center;">Visibile solo a te · ${new Date().toLocaleString('it-IT')}</p>
        </div>
    `;
}

export function renderNetworkAndStats() {
    const container = document.getElementById('stats-container') || 
                      document.getElementById('community-root') ||
                      document.getElementById('page-community');
    if (!container) return;
    // Leggi la chiave da più fonti per robustezza
    const apiKey = _deps.state?.geminiKey
        || window.SecurityManager?.getApiKey?.()
        || sessionStorage.getItem('cortex_gemini_key')
        || localStorage.getItem('cortex_gemini_key')
        || localStorage.getItem('mm_gemini_key');
    const apiKeyWarningHtml = ''; // L'AI usa la chiave condivisa di Cortex — nessun avviso necessario

    if (!_deps.gState || !_deps.gState.studentProfile) {
        container.innerHTML = `
            <div class="stats-central-hub" style="padding:50px 20px; text-align:center;">
                ${apiKeyWarningHtml}
                <div class="card" style="max-width:500px; margin:0 auto; padding:40px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:16px;">
                    <div style="font-size:3rem; margin-bottom:15px;">🧠</div>
                    <h2 style="color:var(--text); margin-bottom:10px; font-weight:800;">Diagnostica Neurale Mancante</h2>
                    <p style="color:var(--text-muted); font-size:0.95rem; margin-bottom:25px; line-height:1.5;">Configura il tuo Profilo Cognitivo per sbloccare l'analisi del Tutor e le statistiche avanzate.</p>
                    <button aria-label="Inizia il test attitudinale" class="btn btn-primary" data-fn="openArchitect" style="width:100%; padding:14px; border-radius:12px; font-weight:bold; cursor:pointer;">Inizia Test Attitudinale 🚀</button>
                </div>
                ${isAdmin() ? adminPanelHtml() : ''}
            </div>
        `;
    } else {
        const profile = _deps.gState.studentProfile;
        const unlocked = getUnlockedMilestones();
        const plan = _deps.gState.activeTutorPlan;
        
        const tutorContent = plan ? `
            <div class="active-plan" style="text-align:left;">
                <h4 style="color:var(--accent); margin-bottom:10px; font-size:1rem;">🎯 ${plan.masterTechnique}</h4>
                <p style="font-size:0.9rem; margin-bottom:20px; color:rgba(255,255,255,0.8); line-height:1.5;">${plan.cognitiveBridge}</p>
                <button aria-label="Aggiorna analisi del tutor" class="btn btn-outline" data-fn="generatePersonalizedTutorPlan" style="padding:10px 20px; border-radius:100px; font-size:0.8rem; width:100%; border:1px solid rgba(255,255,255,0.1); color:var(--text); cursor:pointer;">Aggiorna Analisi</button>
            </div>
        ` : `
            <p style="opacity:0.6; color:var(--text); font-size:0.9rem; margin-bottom:15px;">Non hai ancora un piano d'azione personalizzato.</p>
            <button aria-label="Genera piano tutor personalizzato" class="btn btn-primary" data-fn="generatePersonalizedTutorPlan" style="width:100%; border-radius:100px; padding:12px; background:var(--accent); border:none; color:#fff; font-weight:700; cursor:pointer;">Genera Piano Tutor</button>
        `;

        container.innerHTML = `
            <div class="stats-central-hub" style="padding:20px 24px 40px; max-width:900px; margin:0 auto;">
                ${apiKeyWarningHtml}

                <div class="game-stats-grid" style="display:flex; gap:15px; margin-bottom:60px; margin-top:20px;">
                    <div class="mini-stat-card" style="flex:1; background:rgba(255,255,255,0.04); padding:16px; border-radius:12px; text-align:center; border:1px solid rgba(255,255,255,0.05); cursor:default; transition: background 0.2s;">🔥 <span style="display:block; font-size:1.6rem; font-weight:800; color:var(--text);">${_deps.gState.streak || 0}</span><label style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Giorni</label></div>
                    <div class="mini-stat-card" style="flex:1; background:rgba(255,255,255,0.04); padding:16px; border-radius:12px; text-align:center; border:1px solid rgba(255,255,255,0.05); cursor:default; transition: background 0.2s;">⭐ <span style="display:block; font-size:1.6rem; font-weight:800; color:var(--gold);">${_deps.gState.stars || 0}</span><label style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Stelle</label></div>
                    <div class="mini-stat-card" style="flex:1; background:rgba(255,255,255,0.04); padding:16px; border-radius:12px; text-align:center; border:1px solid rgba(255,255,255,0.05); cursor:default; transition: background 0.2s;">✨ <span style="display:block; font-size:1.6rem; font-weight:800; color:var(--accent2);">${_deps.gState.xp || 0}</span><label style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">XP Totali</label></div>
                </div>

                <div class="neural-dashboard-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:20px;">
                    <div class="card chart-box" style="background:rgba(255,255,255,0.02); padding:24px; border-radius:16px; border:1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column;">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                            <div>
                                <h3 style="font-size:1.1rem; color:var(--text); margin:0 0 2px 0;">${profile.archetype ? `${profile.archetype_emoji || '🧠'} ${profile.archetype}` : t('arch_cognitive_profile')}</h3>
                                ${profile.archetype_subtitle ? `<p style="font-size:0.7rem; color:var(--accent); margin:0; font-style:italic;">${profile.archetype_subtitle}</p>` : ''}
                            </div>
                            <button aria-label="Rifai il test attitudinale" data-fn="openArchitect" style="background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); border-radius:8px; color:rgba(255,255,255,0.6); font-size:0.7rem; padding:4px 10px; cursor:pointer;">🔄 Rifai Test</button>
                        </div>
                        <div class="canvas-wrapper" style="aspect-ratio: 1; min-height: 280px; max-height: 300px; margin:0 auto; width:100%;">
                            <canvas id="neural-radar-canvas"></canvas>
                        </div>
                    </div>
                    <div class="card tutor-box" style="background:rgba(255,255,255,0.02); padding:24px; border-radius:16px; border:1px solid rgba(255,255,255,0.05);">
                        <h3 style="margin-bottom:20px; font-size:1.1rem; color:var(--text);">Consigli del Tutor</h3>
                        <div id="tutor-analysis">
                            ${tutorContent}
                        </div>
                    </div>
                </div>

                <div class="card milestones-box" style="margin-top: 24px; background:rgba(255,255,255,0.02); padding:24px; border-radius:16px; border:1px solid rgba(255,255,255,0.05);">
                    <h3 style="margin-bottom:16px; font-size:1.1rem; color:var(--text);">I Tuoi Traguardi</h3>
                    <div class="milestones-grid" style="display: flex; gap: 15px; overflow-x: auto; padding-bottom: 10px;">
                        ${unlocked.length > 0 ? unlocked.map(m => `
                            <div class="milestone-badge" title="${m.desc}" style="background:rgba(255,255,255,0.04); padding:12px 16px; border-radius:12px; text-align:center; min-width:100px; border:1px solid rgba(255,255,255,0.03);">
                                <div class="badge-icon" style="font-size:1.8rem; margin-bottom:6px;">${m.icon}</div>
                                <span style="font-size:0.8rem; color:var(--text); font-weight:700; white-space:nowrap;">${m.name}</span>
                            </div>
                        `).join('') : '<p style="opacity:0.5; color:var(--text-muted); font-size:0.9rem;">Continua a studiare...</p>'}
                    </div>
                </div>

                ${isAdmin() ? adminPanelHtml() : ''}
            </div>
        `;
    }


    if (_deps.gState && _deps.gState.studentProfile) {
        requestAnimationFrame(() => drawRadarChart(_deps.gState.studentProfile));
    }
}

export function drawRadarChart(profile) {
    const canvas = document.getElementById('neural-radar-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    new Chart(ctx, {
        type: 'radar',
        data: {
            labels: profile.labels,
            datasets: [{
                label: 'Statistiche Studente',
                data: profile.scores,
                backgroundColor: 'rgba(124, 106, 247, 0.2)', // Viola Cortex
                borderColor: 'rgba(124, 106, 247, 1)',
                borderWidth: 2,
                pointBackgroundColor: '#fff'
            }]
        },
        options: {
            scales: {
                r: {
                    angleLines: { color: 'rgba(255,255,255,0.1)' },
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    pointLabels: { color: '#fff', font: { size: 10 } },
                    suggestedMin: 0,
                    suggestedMax: 100,
                    ticks: { display: false }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

export function renderNeuralDashboard() {
    const container = document.getElementById('arch-content');
    if (typeof _deps.gState === 'undefined' || !_deps.gState.studentProfile) return;

    const p = _deps.gState.studentProfile;
    
    container.innerHTML = `
        <div class="glass" style="padding:40px; border-radius:24px; max-width:800px; margin:0 auto; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05);">
            <div style="text-align:center; margin-bottom:40px;">
                ${p.archetype ? `
                <div style="display:inline-block; background:linear-gradient(135deg,rgba(139,92,246,0.2),rgba(6,182,212,0.2)); border:1px solid rgba(139,92,246,0.4); border-radius:20px; padding:24px 40px; margin-bottom:24px;">
                    <div style="font-size:3.5rem; margin-bottom:10px;">${p.archetype_emoji || '🧠'}</div>
                    <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:3px; color:var(--accent); margin-bottom:6px;">Il tuo profilo cognitivo</div>
                    <h2 style="font-size:2rem; font-weight:900; color:var(--text); margin:0 0 8px 0; text-shadow:0 0 30px rgba(139,92,246,0.8);">${p.archetype}</h2>
                    <p style="color:rgba(255,255,255,0.6); font-style:italic; font-size:0.95rem; margin:0;">"${p.archetype_subtitle || ''}"</p>
                </div>` : `
                <div style="font-size:3rem; margin-bottom:16px;">🔬</div>
                <h2 style="font-size:1.8rem; font-weight:800; color:var(--text);">${t('arch_your_neural_profile')}</h2>`}
                <p style="color:var(--text-muted); margin-top:8px;">Ecco un'analisi della tua architettura cognitiva basata sul test.</p>
            </div>

            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:32px; margin-bottom:40px; align-items:center;">
                <div style="max-width:280px; margin:0 auto; width:100%; aspect-ratio:1; min-height:280px;">
                    <canvas id="neural-radar-canvas" width="280" height="280"></canvas>
                </div>
                <div>
                    <h4 style="color:var(--accent); font-size:0.8rem; text-transform:uppercase; letter-spacing:2px; margin-bottom:16px;">💡 Feedback Coach</h4>
                    <p style="color:var(--text); font-size:0.95rem; line-height:1.6; font-style:italic; margin-bottom:24px;">"${p.advice}"</p>
                    
                    <div style="margin-bottom:20px;">
                        <h5 style="color:var(--green); font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">✅ Punti di Forza</h5>
                        <ul style="padding-left:16px; color:rgba(255,255,255,0.8); font-size:0.9rem;">
                            ${(p.strengths || []).map(s => `<li style="margin-bottom:6px;">${s}</li>`).join('')}
                        </ul>
                    </div>
                    <div>
                        <h5 style="color:var(--red); font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">⚠️ Carenze</h5>
                        <ul style="padding-left:16px; color:rgba(255,255,255,0.8); font-size:0.9rem;">
                            ${(p.weaknesses || []).map(w => `<li style="margin-bottom:6px;">${w}</li>`).join('')}
                        </ul>
                    </div>
                </div>
            </div>

            <div style="text-align:center;">
                <button aria-label="Genera Aura Plan personalizzato" class="btn btn-primary" data-fn="generateAuraPlan" style="padding:12px 36px; border-radius:100px; font-weight:700;">Genera Aura Plan ➔</button>
            </div>
        </div>
    `;
    setTimeout(() => drawRadarChart(p), 100);
}

export function renderArchStep() {
    const container = document.getElementById('arch-content');
    const closeBtnHtml = `<button aria-label="${t('arch_close_profile')}" data-fn="closeArchitect" style="position:absolute; top:24px; right:24px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:50%; width:44px; height:44px; display:flex; align-items:center; justify-content:center; font-size:1.5rem; color:var(--text); cursor:pointer; transition:0.2s;">&times;</button>`;

    if (archStep < MAX_DYNAMIC_QUESTIONS && archStep < dynamicArchQuestions.length) {
        const q = dynamicArchQuestions[archStep];
        const progress = ((archStep + 1) / MAX_DYNAMIC_QUESTIONS) * 100;

        container.innerHTML = `
                    ${closeBtnHtml}
                    <div style="text-align:center; margin-bottom:40px;">
                        <div class="progress-bar" style="height:4px; background:rgba(255,255,255,0.05); border-radius:100px; width:200px; margin:0 auto 24px; overflow:hidden;">
                            <div style="width:${progress}%; height:100%; background:var(--accent); transition:width 0.3s ease;"></div>
                        </div>
                        <div data-i18n="arch_neural_diag" style="font-size:0.75rem; color:var(--accent); font-weight:800; text-transform:uppercase; letter-spacing:2px; margin-bottom:12px;">Diagnostica Neurale Adattiva: Modulo ${archStep + 1} di ${MAX_DYNAMIC_QUESTIONS}</div>
                        <h2 style="font-size:1.8rem; font-weight:700; line-height:1.3; max-width:650px; margin:0 auto; color:var(--text);">${q.q}</h2>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr; gap:16px; max-width: 650px; margin: 0 auto;">
                        ${q.opts.map((o, i) => `
                            <button aria-label="Opzione ${String.fromCharCode(65+i)}: ${o.substring(0,40).replace(/"/g,'&quot;')}" class="arch-option glass" data-fn="saveArchAnswer" data-params="[${i}]" style="text-align:left; padding:20px; border-radius:16px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.02); color:rgba(255,255,255,0.9); cursor:pointer; font-size:1rem; transition:all 0.2s; display:flex; align-items:center; gap:16px;">
                                <div style="width:32px; height:32px; border-radius:50%; background:var(--accent-glow); border:1px solid var(--accent); display:flex; align-items:center; justify-content:center; font-size:0.8rem; font-weight:800; flex-shrink:0;">${String.fromCharCode(65 + i)}</div>
                                <span>${o}</span>
                            </button>
                        `).join('')}

                        <!-- Risposta libera: nessuna opzione mi rappresenta -->
                        <div id="arch-free-toggle" style="margin-top:4px;">
                            <button onclick="document.getElementById('arch-free-wrap').style.display='block'; this.style.display='none';"
                                style="background:none; border:1px dashed rgba(255,255,255,0.15); border-radius:12px; color:rgba(255,255,255,0.4); font-size:0.85rem; padding:12px 20px; width:100%; cursor:pointer; transition:all 0.2s;"
                                onmouseenter="this.style.color='rgba(255,255,255,0.7)'; this.style.borderColor='rgba(255,255,255,0.3)';"
                                onmouseleave="this.style.color='rgba(255,255,255,0.4)'; this.style.borderColor='rgba(255,255,255,0.15)';">
                                ✏️ Nessuna opzione mi rappresenta — scrivi tu
                            </button>
                            <div id="arch-free-wrap" style="display:none; margin-top:8px;">
                                <textarea id="arch-free-input" placeholder="Descrivi la tua risposta con parole tue..." rows="3"
                                    style="width:100%; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.15); border-radius:12px; color:var(--text); padding:14px 16px; font-size:0.95rem; font-family:inherit; resize:vertical; outline:none; box-sizing:border-box;"></textarea>
                                <button onclick="
                                    var v=document.getElementById('arch-free-input').value.trim();
                                    if(!v){return;}
                                    window.saveArchAnswerText(v);
                                " style="margin-top:10px; width:100%; background:var(--accent); border:none; border-radius:12px; color:#fff; font-weight:700; font-size:0.95rem; padding:14px; cursor:pointer;">
                                    Conferma risposta →
                                </button>
                            </div>
                        </div>
                    </div>
                `;
    } else {
        renderArchLoading(t('arch_creating_profile'));
        finalizeNeuralProfile(archAnswers, dynamicArchQuestions);
    }
}

export async function finalizeNeuralProfile(responses, questions) {
    const quizData = responses.map((ans, idx) => ({
        id: questions[idx].id,
        q: questions[idx].q,
        // ans può essere un indice numerico oppure una stringa libera
        a: typeof ans === 'string' ? ans : (questions[idx].opts[ans] || ans)
    }));

    const prompt = `Sei il sistema di profilazione cognitiva di Cortex. Analizza ATTENTAMENTE queste ${quizData.length} risposte:
${JSON.stringify(quizData, null, 2)}

Il tuo compito: assegnare un profilo neurale SPECIFICO e ACCURATO basato sulle risposte reali — non generico.

ARCHETIPI DISPONIBILI (scegli QUELLO che emerge davvero dalle risposte, o componi un ibrido come "L'Architetto Visivo" se nessuno è perfetto):

PRIMARI:
- "L'Architetto" — logico-sequenziale, costruisce conoscenza step-by-step, ama le strutture
- "Il Visionario" — globale-creativo, vede pattern tra concetti lontani, odia i dettagli
- "L'Esploratore Cinestetico" — impara facendo, ha bisogno di azione pratica e tentativi
- "Il Custode" — riflessivo-preciso, vuole capire prima di procedere, memorizza lentamente ma a lungo
- "Il Guerriero" — stress-resiliente, performa sotto pressione, mediocre senza scadenza
- "L'Empatico Sociale" — apprende in gruppo, soffre l'isolamento, ha bisogno di confronto
- "Il Filosofo" — ama la teoria pura, vuole il "perché" prima del "come"
- "Il Pragmatico" — studia SOLO ciò che serve all'esame, zero piacere disinteressato
- "Il Narratore" — apprende attraverso storie, esempi e analogie emotive
- "Il Perfezionista" — blocco da ansia da performance, forte ma paralisi pre-esame

IBRIDI (usa se le risposte non convergono su un solo tipo):
- "L'Architetto Narrativo" — logico ma ha bisogno di storie per interiorizzare
- "Il Visionario Guerriero" — creativo ma efficacissimo sotto pressione
- "Il Custode Pragmatico" — preciso ma solo su ciò che è utile, non perde tempo
- "L'Esploratore Empatico" — attivo e collaborativo, lavora meglio in team pratici
- "Il Filosofo Visionario" — ama la teoria E le connessioni tra idee distanti
- "Il Perfezionista Custode" — vuole capire tutto in profondità, si blocca per paura di sbagliare
- "Il Pragmatico Guerriero" — risultato-oriented, funziona solo sotto deadline
- "Il Narratore Empatico" — apprende attraverso storie e relazioni interpersonali
- "Il Camaleonte Adattivo" — nessun stile dominante, alta flessibilità ma discontinuità
- "Il Guerriero Perfezionista" — alta performance ma ansia cronica, si sente mai abbastanza

Scegli i 5 TRATTI più rappresentativi come label del radar COERENTI con l'archetipo scelto.
I punteggi devono riflettere DAVVERO le risposte date — evita valori tutti simili (es. tutti a 70-80), usa il range 20-95.

Rispondi SOLO con questo JSON valido, nessun testo fuori:
{
    "archetype": "Nome archetipo",
    "archetype_subtitle": "Frase poetica di 10-15 parole che descrive ESATTAMENTE questo studente basandosi sulle sue risposte",
    "archetype_emoji": "emoji appropriata",
    "labels": ["Tratto1", "Tratto2", "Tratto3", "Tratto4", "Tratto5"],
    "scores": [numero0-100, numero0-100, numero0-100, numero0-100, numero0-100],
    "strengths": ["Forza specifica 1 (legata alle risposte)", "Forza 2", "Forza 3"],
    "weaknesses": ["Debolezza specifica 1 (legata alle risposte)", "Debolezza 2", "Debolezza 3"],
    "advice": "Consiglio pratico e specifico PERSONALIZZATO per questo studente — non generico, cita le sue abitudini reali emerse dalle risposte"
}`;

    try {
        const rawText = await callGemini(prompt);
        let cleanJson = rawText;
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) cleanJson = match[0];
        else cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const profile = JSON.parse(cleanJson);

        _deps.gState.studentProfile = profile;
        localStorage.setItem(_deps.KEYS.GAME_STATE, JSON.stringify(_deps.gState));
        _deps.showToast(t('arch_profile_updated'), "success");
        renderNeuralDashboard();
        renderNetworkAndStats();
    } catch (e) {
        console.error("Neural Profiling failed", e);

        const container = document.getElementById('arch-content');
        if (!container) return;

        // Errore specifico: nessuna chiave API → utente non loggato
        if (e.isNoApiKey || e.message === 'NO_API_KEY') {
            container.innerHTML = `
                <div style="text-align:center; padding:40px 20px;">
                    <div style="font-size:3rem; margin-bottom:16px;">🔐</div>
                    <h3 style="color:#a78bfa; margin-bottom:12px; font-family:'Outfit',sans-serif;">Accesso richiesto</h3>
                    <p style="color:rgba(255,255,255,0.7); font-size:0.9rem; line-height:1.5; margin-bottom:24px;">
                        Per analizzare il tuo profilo neurale con l'AI,<br>devi prima accedere con Google.
                    </p>
                    <button data-fn="loginWithGoogle" style="background:var(--accent-nebula); color:#fff; border:none; border-radius:12px; padding:14px 28px; font-weight:800; font-size:0.9rem; cursor:pointer; margin-bottom:12px; width:100%;">
                        ${t('arch_login_google')}
                    </button>
                    <button aria-label="Chiudi" data-fn="closeArchitect" style="background:transparent; border:1px solid rgba(255,255,255,0.15); border-radius:12px; padding:12px 28px; color:rgba(255,255,255,0.5); cursor:pointer; font-size:0.85rem; width:100%;">Chiudi</button>
                </div>
            `;
            return;
        }

        // Errore paywall
        if (e.isPaywall) {
            if (_deps.showToast) _deps.showToast(t('arch_limit_upgrade'), 'warning');
            container.innerHTML = `
                <div style="text-align:center; padding:40px 20px;">
                    <div style="font-size:3rem; margin-bottom:16px;">⚡</div>
                    <h3 style="color:#f59e0b; margin-bottom:12px;">Limite AI raggiunto</h3>
                    <p style="color:rgba(255,255,255,0.7); font-size:0.9rem; margin-bottom:24px;">Hai esaurito le chiamate AI gratuite di oggi.</p>
                    <button data-fn="showUpgradeModal" style="background:linear-gradient(135deg,#f59e0b,#f97316); color:#fff; border:none; border-radius:12px; padding:14px 28px; font-weight:800; cursor:pointer; width:100%;">⚡ Passa a Student</button>
                </div>
            `;
            return;
        }

        // Errore generico
        if (_deps.showToast) _deps.showToast(t('arch_err_analysis'), "error");
        container.innerHTML = `
            <div style="text-align:center; padding:40px 20px;">
                <div style="font-size:2.5rem; margin-bottom:16px;">😕</div>
                <h3 style="color:#ff6b6b; margin-bottom:12px;">Qualcosa è andato storto</h3>
                <p style="color:rgba(255,255,255,0.6); font-size:0.85rem; margin-bottom:24px;">
                    ${e.isRateLimit ? 'Troppe richieste. Attendi qualche minuto e riprova.' : 'Errore temporaneo. Riprova tra qualche istante.'}
                </p>
                <button aria-label="Riprova" onclick="this.closest('#architect-overlay') && document.getElementById('btn-arch-analyze')?.click()" style="background:var(--accent-nebula); color:#fff; border:none; border-radius:12px; padding:12px 24px; font-weight:700; cursor:pointer; margin-bottom:8px; width:100%;">🔄 Riprova</button>
                <button aria-label="Termina" data-fn="closeArchitect" style="background:transparent; border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:10px 24px; color:rgba(255,255,255,0.4); cursor:pointer; font-size:0.85rem; width:100%;">Chiudi</button>
            </div>
        `;
    }
}

// Loading UI Function
function renderArchLoading(msg) {
    const container = document.getElementById('arch-content');
    container.innerHTML = `
        <style>
            @keyframes llm-progress {
                0% { width: 0%; }
                40% { width: 50%; }
                70% { width: 80%; }
                100% { width: 96%; }
            }
            .aura-progress-bar {
                animation: llm-progress 15s cubic-bezier(0.1, 0.7, 0.1, 1) forwards;
            }
        </style>
        <div style="text-align:center; padding:60px 0;">
            <div class="loader-aura" style="width:60px; height:60px; margin:0 auto 24px; position:relative;">
                <div style="position:absolute; width:100%; height:100%; border:3px solid var(--accent); border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></div>
                <div style="position:absolute; width:70%; height:70%; top:15%; left:15%; border:3px solid var(--accent2); border-bottom-color:transparent; border-radius:50%; animation:spin 1.5s linear infinite reverse;"></div>
            </div>
            <h3 style="font-size:1.3rem; color:var(--text); margin-bottom:24px;">${msg}</h3>
            
            <div style="width: 100%; max-width: 350px; height: 6px; background: rgba(255,255,255,0.05); border-radius: 100px; margin: 0 auto; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
                <div class="aura-progress-bar" style="height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent-glow)); border-radius: 100px; box-shadow: 0 0 10px var(--accent);"></div>
            </div>
            <p style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-top:16px;">Connessione con Gemini in corso...</p>
        </div>
    `;
}

// Adaptive AI logic to generate next question based on previous answers
async function generateNextArchitectQuestion() {
    const previousQnA = archAnswers.map((ansIdx, i) => ({
        q: dynamicArchQuestions[i].q,
        // gestisce sia indici numerici che risposte libere in stringa
        a: typeof ansIdx === 'string' ? ansIdx : (dynamicArchQuestions[i].opts[ansIdx] || ansIdx)
    }));

    // Dimensioni già coperte per evitare ripetizioni
    const coveredDims = ['stress', 'abitudini'];
    const uncovered = ['memoria_di_lavoro', 'stile_elaborazione', 'motivazione_intrinseca',
        'gestione_errori', 'preferenza_feedback', 'ritmo_studio', 'ambiente',
        'meta_cognizione', 'tolleranza_ambiguità', 'apprendimento_sociale'].slice(archStep - 2, archStep);

    const prompt = `Sei il sistema di test psicometrico adattivo di Cortex.
L'utente ha già risposto a ${previousQnA.length} domande:
${JSON.stringify(previousQnA, null, 2)}

OBIETTIVO: generare la domanda ${archStep + 1} di 14 per costruire un profilo cognitivo PRECISO e SPECIFICO.

REGOLE:
1. Sonda una dimensione NON ancora esplorata (suggerite: ${uncovered.join(', ')})
2. Le opzioni devono essere NETTAMENTE diverse tra loro — non variazioni dello stesso tema
3. Ogni opzione deve mappare su un profilo cognitivo distinto
4. La domanda deve essere personalizzata in base alle risposte precedenti (se l'utente mostra ansia, approfondisci; se è pragmatico, testa i limiti)
5. Lingua: italiano colloquiale, non accademico
6. Max 30 parole per la domanda, max 20 parole per opzione

Formatta ESCLUSIVAMENTE come JSON valido:
{
  "id": "DYN_${archStep}",
  "q": "Domanda specifica e diversa dalle precedenti...",
  "opts": [
    "Opzione A — mappa su profilo X",
    "Opzione B — mappa su profilo Y",
    "Opzione C — mappa su profilo Z",
    "Opzione D — mappa su profilo W"
  ]
}
SOLO JSON. Nessun testo esterno.`;

    try {
        const rawText = await callGemini(prompt, {
            temperature: 0.8,
            responseMimeType: 'application/json'
        });

        let cleanJson = rawText;
        const match = rawText.match(/\{[\s\S]*\}/);
        if (match) cleanJson = match[0];
        else cleanJson = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

        const newQ = JSON.parse(cleanJson);
        dynamicArchQuestions.push(newQ);
    } catch (e) {
        console.error("Adaptive Question failed", e);
        dynamicArchQuestions.push(ARCH_QUESTIONS[archStep] || ARCH_QUESTIONS[0]); // fallback
    }
}

/** Salva risposta libera (testo) invece di un indice numerico */
export function saveArchAnswerText(text) {
    archAnswers.push(text); // stringa, non indice
    archStep++;
    if (archStep < MAX_DYNAMIC_QUESTIONS) {
        renderArchLoading(t('arch_thinking') || 'Elaboro la prossima domanda...');
        generateNextArchitectQuestion().then(() => renderArchStep());
    } else {
        renderArchLoading(t('arch_processing_profile'));
        finalizeNeuralProfile(archAnswers, dynamicArchQuestions);
    }
}

export async function saveArchAnswer(idx) {
    archAnswers.push(idx);
    archStep++;
    
    if (archStep < MAX_DYNAMIC_QUESTIONS) {
        if (archStep >= dynamicArchQuestions.length) {
            renderArchLoading(t('arch_ai_question'));
            await generateNextArchitectQuestion();
        }
        renderArchStep();
    } else {
        renderArchLoading(t('arch_processing_profile'));
        finalizeNeuralProfile(archAnswers, dynamicArchQuestions);
    }
}

function generateDefaultAuraPlan() {
    return {
        title: "Profilo Multimodale",
        type: "readwrite",
        scores: { v: 50, a: 50, r: 50, k: 50 },
        description: "Profilo equilibrato che trae beneficio da diverse strategie di memorizzazione simultanee.",
        strategies: [
            { feature: "Palazzo della Memoria", advice: "Usa i loci per fissare i concetti più complessi." },
            { feature: "Active Recall", advice: "Testa te stesso costantemente con le flashcard." }
        ],
        hacks: ["Usa la tecnica del Pomodoro", "Fai sessioni di studio di 25 minuti", "Ripassa prima di dormire"]
    };
}

function getAuraProfileSummary() {
    if (typeof _deps.gState === 'undefined' || !_deps.gState.auraResults) {
        return "Profilo non testato (usare approccio standard)";
    }
    const results = _deps.gState.auraResults;
    const sorted = Object.entries(results).sort((a, b) => b[1] - a[1]);
    const dominant = sorted[0] ? sorted[0][0] : 'Standard';
    return `Stile Dominante: ${dominant}. Analisi completa: ${JSON.stringify(results)}`;
}

async function analyzeProfileWithGemini(answers) {
    const quizData = answers.map((ans, idx) => ({
        id: ARCH_QUESTIONS[idx].id,
        q: ARCH_QUESTIONS[idx].q,
        a: ARCH_QUESTIONS[idx].opts[ans]
    }));

    const auraSummary = getAuraProfileSummary();
    const neuralContext = typeof _deps.gState !== 'undefined' && _deps.gState.studentProfile ? 
        `Punti di forza: ${(_deps.gState.studentProfile.strengths || []).join(', ')}. Carenze: ${(_deps.gState.studentProfile.weaknesses || []).join(', ')}.` : 
        "Profilo neurale non ancora generato.";

    const prompt = `Sei l'"Architetto Cognitivo" di Cortex, un sistema basato su neuroscienze, modelli VARK 2.0 e Felder-Silverman.
Il tuo compito è analizzare i risultati di questo test psicometrico a cui l'utente ha risposto, per dedurre il suo stile di processamento neurale dominante, e configurare rigorosamente il suo Piano di Studio AI.

DATI UTENTE (DA TEST METODO DI STUDIO): ${auraSummary}
PROFILO NEURALE STUDENTE (PUNTI DI FORZA/DEBOLEZZA): ${neuralContext}
RISPOSTE TEST CORRENTE:
${JSON.stringify(quizData, null, 2)}

ISTRUZIONI DI ELABORAZIONE:
1. Valuta il profilo considerando: Sensoriale (Visivo/Uditivo/Cinestesico/Lettura), Processo (Globale/Sequenziale), Elaborazione (Attiva/Riflessiva) e Tolleranza (Focus/Stress).
2. Assegna un titolo evocativo in italiano (es. "L'Architetto Visivo", "Il Divulgatore Auditivo", "Lo Stratega Cinestesico").
3. Determina il parametro "type" (scegli rigorosamente tra: "visual", "auditory", "readwrite", "kinesthetic" o "analyst").
4. Genera un array "strategies" con 3 raccomandazioni su quali feature di Cortex l'utente deve usare.
5. Genera un array "hacks" con 3 trucchi psicologici unici.
6. Aggiungi i seguenti 4 parametri quantitativi per l'Aura Plan:
   - "dailyGoal": minutaggio di studio ideale al giorno (es. "60 minuti/giorno").
   - "suggestedTechnique": Tecnica cardine da usare (es. Feynman, Feynman + Pomodoro).
   - "efficiencyScore": stima di efficienza dello studio attuale (0-100).
   - "notes": Consigli o note sull'efficienza basati sul profilo e gli obiettivi dell'utente.

Rispondi ESCLUSIVAMENTE in JSON valido, rispettando QUESTA ESATTA STRUTTURA:
{
  "title": "Stringa (Titolo)",
  "type": "Stringa (visual|auditory|readwrite|kinesthetic|analyst)",
  "scores": {"v": numero (0-100), "a": numero (0-100), "r": numero (0-100), "k": numero (0-100)},
  "description": "Una intensa diagnosi di massimo 40 parole...",
  "strategies": [{"feature": "Nome feature", "advice": "Raccomandazione"}],
  "hacks": ["Primo hack", "Secondo hack", "Terzo hack"],
  "dailyGoal": "minuti/giorno",
  "suggestedTechnique": "Nome tecnica",
  "efficiencyScore": "0-100",
  "notes": "Consigli specifici"
}
NESSUN ALTRO TESTO. SOLO JSON CORRETTO.`;

    try {
        const rawJson = await callGemini(prompt, {
            temperature: 0.7,
            responseMimeType: 'application/json'
        });

        const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
        const cleanJson = jsonMatch ? jsonMatch[0] : rawJson.replace(/```json/gi, '').replace(/```/g, '').trim();

        return JSON.parse(cleanJson);
    } catch (e) {
        console.error("Architect AI profiling failed", e);
        return generateDefaultAuraPlan(); // Fallback per non bloccare l'utente
    }
}

export async function generateAuraPlan() {
    const container = document.getElementById('arch-content');
    container.innerHTML = `
                <div style="text-align:center; padding:60px 0;">
                    <div class="loader-aura" style="width:80px; height:80px; margin:0 auto 32px; position:relative;">
                        <div style="position:absolute; width:100%; height:100%; border:4px solid var(--accent); border-top-color:transparent; border-radius:50%; animation:spin 1s linear infinite;"></div>
                        <div style="position:absolute; width:70%; height:70%; top:15%; left:15%; border:4px solid var(--accent2); border-bottom-color:transparent; border-radius:50%; animation:spin 1.5s linear infinite reverse;"></div>
                    </div>
                    <h3 style="font-size:1.4rem; color:var(--text); margin-bottom:12px;">Elaborazione Cortex Plan</h3>
                    <p style="color:var(--text-muted); font-style:italic;">Analisi dei percorsi neurali e dei trigger cognitivi...</p>
                </div>
            `;

    // Try AI analysis first, then fallback
    let blueprint = await analyzeProfileWithGemini(archAnswers);

    if (!blueprint) {
        // FALLBACK: Simple logic if no AI
        blueprint = {
            title: "Profilo Multimodale",
            type: "visual",
            scores: { v: 50, a: 50, r: 50, k: 50 },
            description: "Profilo equilibrato che trae beneficio da diverse strategie di memorizzazione simultanee.",
            strategies: [
                { feature: "Palazzo della Memoria", advice: "Usa i loci per fissare i concetti più complessi." },
                { feature: "Active Recall", advice: "Testa te stesso costantemente con le flashcard." }
            ],
            hacks: ["Usa la tecnica del Pomodoro", "Fai sessioni di studio di 25 minuti", "Ripassa prima di dormire"]
        };
    }

    _deps.state.architectBlueprint = blueprint;
    renderAuraPlanDashboard(blueprint);
}

export function renderAuraPlanDashboard(b) {
    const container = document.getElementById('arch-content');

    container.innerHTML = `
                <div style="text-align:center; margin-bottom:40px;">
                    <div style="font-size:4rem; margin-bottom:16px;">💎</div>
                    <h2 style="font-size:2.2rem; font-weight:800; color:var(--text); text-shadow:0 0 20px var(--accent-glow); margin-bottom:8px;">${b.title}</h2>
                    <p style="color:var(--text-muted); font-size:1.1rem; max-width:600px; margin:0 auto; line-height:1.6;">${b.description}</p>
                    
                    ${b.dailyGoal ? `
                    <div style="display:flex; justify-content:center; gap:12px; margin-top:24px; flex-wrap:wrap;">
                        <div class="glass" style="padding:10px 16px; border-radius:12px; text-align:left; border:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.02);">
                            <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">🎯 Obiettivo</div>
                            <div style="font-weight:800; color:var(--accent2); margin-top:4px;">${b.dailyGoal}</div>
                        </div>
                        <div class="glass" style="padding:10px 16px; border-radius:12px; text-align:left; border:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.02);">
                            <div style="font-size:0.65rem; color:var(--gold); text-transform:uppercase; letter-spacing:1px;">🧠 Tecnica</div>
                            <div style="font-weight:800; color:var(--gold); margin-top:4px;">${b.suggestedTechnique}</div>
                        </div>
                        <div class="glass" style="padding:10px 16px; border-radius:12px; text-align:left; border:1px solid rgba(255,255,255,0.05); background:rgba(255,255,255,0.02);">
                            <div style="font-size:0.65rem; color:var(--green); text-transform:uppercase; letter-spacing:1px;">📈 Rendimento</div>
                            <div style="font-weight:800; color:var(--green); margin-top:4px;">${b.efficiencyScore}%</div>
                        </div>
                    </div>
                    ${b.notes ? `<p style="margin-top:16px; font-size:0.9rem; color:var(--accent2); font-style:italic; max-width:500px; margin-left:auto; margin-right:auto;">💡 <strong>Nota:</strong> ${b.notes}</p>` : ''}
                    ` : ''}
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:40px;">
                    <div class="glass" style="padding:32px; border-radius:32px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.02);">
                        <h4 style="color:var(--accent); font-size:0.8rem; text-transform:uppercase; letter-spacing:2px; margin-bottom:24px;"></h4>
                        <div style="display:flex; flex-direction:column; gap:20px;">
                            ${b.strategies.map(s => `
                                <div style="display:flex; gap:16px; align-items:flex-start;">
                                    <div style="width:40px; height:40px; border-radius:12px; background:rgba(124,106,247,0.1); display:flex; align-items:center; justify-content:center; color:var(--accent); flex-shrink:0;">✨</div>
                                    <div>
                                        <div style="font-weight:700; color:var(--text); margin-bottom:4px;">${s.feature}</div>
                                        <div style="font-size:0.85rem; color:var(--text-muted); line-height:1.4;">${s.advice}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="glass" style="padding:32px; border-radius:32px; border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.02);">
                        <h4 style="color:var(--gold); font-size:0.8rem; text-transform:uppercase; letter-spacing:2px; margin-bottom:24px;">Study Hacks Pro</h4>
                        <div style="display:flex; flex-direction:column; gap:12px;">
                            ${b.hacks.map(h => `
                                <div style="padding:16px; border-radius:16px; background:rgba(245,158,11,0.05); border:1px solid rgba(245,158,11,0.1); font-size:0.9rem; color:rgba(255,255,255,0.9); font-weight:600;">⚡ ${h}</div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div style="background:var(--accent-glow); padding:32px; border-radius:32px; border:1px solid var(--accent); position:relative; overflow:hidden;">
                    <div style="position:relative; z-index:1;">
                        <h3 style="font-family:'Outfit'; margin-bottom:8px;">Applica il Metodo</h3>
                        <p style="color:rgba(255,255,255,0.7); font-size:0.9rem; margin-bottom:24px;">Configura subito i tuoi mazzi per utilizzare questo blueprint neurale.</p>
                        
                        <div style="display:flex; flex-direction:column; gap:20px; margin-bottom:24px;">
                            <label style="display:flex; align-items:center; gap:12px; cursor:pointer;">
                                <input type="checkbox" id="applyGlobal" aria-label="Applica a tutte le materie" checked style="width:24px; height:24px; accent-color:var(--accent);">
                                <span style="font-weight:700;">Imposta come predefinito per nuove materie</span>
                            </label>
                            ${_deps.state.decks && _deps.state.decks.length > 0 ? `
                            <div>
                                <div style="font-size:0.8rem; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">Applica ai mazzi esistenti:</div>
                                <div style="display:flex; flex-wrap:wrap; gap:10px;" id="applyDecksList">
                                    ${_deps.state.decks.map((deck, idx) => `
                                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; background:rgba(255,255,255,0.05); padding:6px 14px; border-radius:100px; border:1px solid rgba(255,255,255,0.1);">
                                            <input type="checkbox" data-deck-idx="${idx}" aria-label="Applica a ${deck.name}" checked style="accent-color:var(--accent);">
                                            <span style="font-size:0.85rem; color:var(--text);">${deck.name}</span>
                                        </label>
                                    `).join('')}
                                </div>
                            </div>` : ''}
                        </div>
                        <button data-fn="applyArchipelagoMethod" style="width:100%; padding:16px; border-radius:16px; background:var(--accent); border:none; color:#fff; font-weight:800; font-size:1rem; cursor:pointer; letter-spacing:0.05em;">
                            Attiva Blueprint →
                        </button>
                    </div>
                </div>
    `;
}

export function applyArchipelagoMethod() {
    const state = _deps.state;
    const blueprint = state.architectBlueprint;
    if (!blueprint) {
        _deps.showToast('Genera prima il tuo Blueprint neurale.', 'warning');
        return;
    }

    const applyGlobal = document.getElementById('applyGlobal')?.checked ?? true;
    const deckCheckboxes = document.querySelectorAll('#applyDecksList input[type="checkbox"]');

    let appliedCount = 0;

    deckCheckboxes.forEach(cb => {
        if (cb.checked) {
            const idx = parseInt(cb.dataset.deckIdx);
            if (state.decks && state.decks[idx]) {
                state.decks[idx].studyBlueprint = blueprint.type || 'visual';
                appliedCount++;
            }
        }
    });

    // Applica globalmente se checkbox globale è selezionata
    if (applyGlobal) {
        if (state.decks) {
            state.decks.forEach(deck => {
                deck.studyBlueprint = blueprint.type || 'visual';
            });
            appliedCount = state.decks.length;
        }
        state.defaultBlueprint = blueprint.type || 'visual';
    }

    _deps.saveState();

    const archipelagoOverlay = document.getElementById('archipelago-overlay');
    if (archipelagoOverlay) archipelagoOverlay.remove();

    _deps.showToast('Blueprint applicato a ' + appliedCount + ' materie!', 'success');
}
