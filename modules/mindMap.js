export function openMindMap(deckIdx) {
    // Physics Map rimosso — la funzionalità sarà sostituita in futuro
    const overlay = document.getElementById('mindmap-overlay');
    if (overlay) overlay.style.display = 'flex';
}

export function drawMindMap(text, title) {
    const canvas = document.getElementById('mindmap-canvas');
    if (!canvas) return;
    const W = canvas.clientWidth || window.innerWidth;
    const H = canvas.clientHeight || window.innerHeight - 80;

    // Extract top concepts (word frequency, ignoring stopwords)
    const stopwords = new Set(['il', 'la', 'le', 'i', 'gli', 'un', 'una', 'uno', 'di', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra', 'che', 'è', 'e', 'a', 'o', 'ma', 'non', 'si', 'lo', 'ne', 'se', 'al', 'del', 'dei', 'delle', 'della', 'dello', 'agli', 'dai', 'nelle', 'nella', 'nel', 'dei', 'nei', 'come', 'cosa', 'questo', 'questa', 'questi', 'queste', 'anche', 'più', 'tutto', 'tutti', 'però', 'dopo', 'prima', 'quando', 'dove', 'perché', 'poi', 'già', 'ancora', 'sempre', 'mai', 'ogni', 'molto', 'poco', 'troppo', 'bene', 'male', 'fare', 'avere', 'essere', 'stai', 'sono', 'sei', 'siamo', 'hanno', 'ha', 'hai', 'aveva', 'era', 'nel', 'negli', 'suo', 'sua', 'suoi', 'sue', 'mio', 'mia', 'tuoi', 'noi', 'voi', 'loro', 'lui', 'lei']);
    const words = text.toLowerCase().match(/\b[a-zA-ZàèéìíîòóùúÀÈÉÌÍÎÒÓÙÚ]{4,}\b/g) || [];
    const freq = {};
    words.forEach(w => { if (!stopwords.has(w)) freq[w] = (freq[w] || 0) + 1; });
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);

    const cx = W / 2, cy = H / 2;
    const r = Math.min(W, H) * 0.33;
    const colors = ['#7c6af7', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444', '#8b5cf6', '#f97316'];

    let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="background:var(--bg);">
                <defs><filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
                <!-- Center node -->
                <ellipse cx="${cx}" cy="${cy}" rx="80" ry="36" fill="#7c6af7" opacity="0.9" filter="url(#glow)"/>
                <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-family="Inter,sans-serif" font-size="13" font-weight="700" fill="white">${title.slice(0, 18)}</text>`;

    top.forEach((word, i) => {
        const angle = (i / top.length) * 2 * Math.PI - Math.PI / 2;
        const nx = cx + r * Math.cos(angle);
        const ny = cy + r * Math.sin(angle);
        const col = colors[i % colors.length];
        const lx = cx + (r * 0.45) * Math.cos(angle);
        const ly = cy + (r * 0.45) * Math.sin(angle);
        svg += `
                    <line x1="${cx}" y1="${cy}" x2="${lx}" y2="${ly}" stroke="${col}" stroke-width="2" opacity="0.5"/>
                    <ellipse cx="${nx}" cy="${ny}" rx="60" ry="26" fill="${col}" opacity="0.85"/>
                    <text x="${nx}" y="${ny + 5}" text-anchor="middle" font-family="Inter,sans-serif" font-size="12" font-weight="600" fill="white">${word}</text>`;
    });
    svg += '</svg>';
    canvas.innerHTML = svg;
}

export function closeMindMap() { 
    const overlay = document.getElementById('mindmap-overlay');
    if (overlay) overlay.style.display = 'none'; 
}
