import { Component } from '../Component.js';

/**
 * ui/views/GlobalMapView.js
 * 
 * Visualizzazione Grafica Globale:
 * - Ogni mazzo è un nodo.
 * - Connessioni automatiche per "Subject" comune.
 * - Supporto per Panning, Zoom e Drag.
 */
export class GlobalMapView extends Component {
    constructor(store, mountPoint) {
        super(store, mountPoint);
        this.nodes = [];
        this.edges = [];
        this.camera = { x: 0, y: 0, zoom: 0.8 };
        this.isPanning = false;
        this.draggedNode = null;
        this.animationId = null;
        this.lastMouse = { x: 0, y: 0 };
    }

    render(state) {
        if (state.currentView !== 'globalmap') return '';

        return `
            <div class="globalmap-wrap" style="position:fixed; inset:0; z-index:1000; background:#050510; color:#fff; font-family:var(--font-sans); overflow:hidden;">
                <!-- Header Overlay -->
                <div style="position:absolute; top:20px; left:20px; right:20px; z-index:10; display:flex; justify-content:space-between; align-items:center;">
                    <div style="display:flex; gap:12px; align-items:center;">
                        <button id="btn-back-global" class="btn btn-outline" style="padding:8px 16px; border-radius:100px; background:rgba(0,0,0,0.5); backdrop-filter:blur(10px);">🏠 Esci</button>
                        <h2 style="font-size:1.1rem; font-weight:800; margin:0; text-transform:uppercase; letter-spacing:0.1em; color:var(--accent);">Global Knowledge Graph 2.0</h2>
                    </div>
                    <div style="background:rgba(255,255,255,0.05); padding:8px 20px; border-radius:12px; font-size:0.8rem; backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.1);">
                        Trascina i nodi per organizzare • Scroll per Zoom • 🖱️ Pan
                    </div>
                </div>

                <canvas id="global-graph-canvas" style="width:100%; height:100%; cursor:grab;"></canvas>

                <!-- UI Controls -->
                <div style="position:absolute; bottom:30px; right:30px; display:flex; flex-direction:column; gap:10px;">
                    <button id="btn-zoom-in" class="btn-icon" style="background:var(--surface2); width:40px; height:40px; font-size:1.2rem;">+</button>
                    <button id="btn-zoom-out" class="btn-icon" style="background:var(--surface2); width:40px; height:40px; font-size:1.2rem;">-</button>
                    <button id="btn-recenter" class="btn-icon" style="background:var(--surface2); width:40px; height:40px;">🎯</button>
                </div>
            </div>
        `;
    }

    bindEvents() {
        if (this.store.getState().currentView !== 'globalmap') return;

        const canvas = this.mountPoint.querySelector('#global-graph-canvas');
        const btnBack = this.mountPoint.querySelector('#btn-back-global');
        if (!canvas) return;

        if (btnBack) btnBack.addEventListener('click', () => {
            cancelAnimationFrame(this.animationId);
            this.store.dispatch({ type: 'NAVIGATE', payload: 'materiale' });
        });

        const ctx = canvas.getContext('2d');
        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        window.addEventListener('resize', resize);
        resize();

        this.initGraph();
        this.runPhysics(ctx, canvas);
        this.setupInteractions(canvas);
        
        // Buttons
        this.mountPoint.querySelector('#btn-zoom-in').onclick = () => this.camera.zoom = Math.min(this.camera.zoom * 1.2, 3);
        this.mountPoint.querySelector('#btn-zoom-out').onclick = () => this.camera.zoom = Math.max(this.camera.zoom * 0.8, 0.2);
        this.mountPoint.querySelector('#btn-recenter').onclick = () => { this.camera.x = 0; this.camera.y = 0; this.camera.zoom = 0.8; };
    }

    initGraph() {
        const { decks } = this.store.getState();
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Creazione Nodi dai Mazzi
        this.nodes = decks.map((d, i) => ({
            id: d.id,
            label: d.name,
            subject: d.subject || 'Generale',
            x: (Math.random() - 0.5) * width * 1.5,
            y: (Math.random() - 0.5) * height * 1.5,
            vx: 0, 
            vy: 0,
            radius: 25 + (Math.min(d.cardsCount || 0, 50) / 2),
            color: this.getColorForSubject(d.subject)
        }));

        // Creazione Archi (Logic Ibrida: per ora Subject comune)
        this.edges = [];
        for (let i = 0; i < this.nodes.length; i++) {
            for (let j = i + 1; j < this.nodes.length; j++) {
                const n1 = this.nodes[i];
                const n2 = this.nodes[j];
                if (n1.subject && n1.subject === n2.subject) {
                    this.edges.push({ from: n1, to: n2, length: 250 });
                }
            }
        }
    }

    getColorForSubject(subject) {
        const colors = {
            'Storia': '#fb7185',
            'Scienze': '#34d399',
            'Matematica': '#60a5fa',
            'Lingue': '#fbbf24',
            'Medicina': '#a78bfa',
            'Generale': '#94a3b8'
        };
        return colors[subject] || '#38bdf8';
    }

    runPhysics(ctx, canvas) {
        const REPULSION = 4000;
        const SPRING_K = 0.005;
        const DAMPING = 0.8;
        const CENTER = 0.002;

        const loop = () => {
            // Physics Calculation
            this.nodes.forEach(n1 => {
                if (n1 === this.draggedNode) return;

                let fx = 0, fy = 0;
                
                // Repulsione tra ogni coppia
                this.nodes.forEach(n2 => {
                    if (n1 === n2) return;
                    const dx = n1.x - n2.x;
                    const dy = n1.y - n2.y;
                    const d2 = dx*dx + dy*dy + 0.1;
                    const dist = Math.sqrt(d2);
                    if (dist < 600) {
                        const f = REPULSION / d2;
                        fx += (dx/dist) * f;
                        fy += (dy/dist) * f;
                    }
                });

                // Attrazione al centro
                fx += (-n1.x) * CENTER;
                fy += (-n1.y) * CENTER;

                n1.vx = (n1.vx + fx) * DAMPING;
                n1.vy = (n1.vy + fy) * DAMPING;
            });

            // Molle (Springs) per i collegamenti
            this.edges.forEach(e => {
                const dx = e.to.x - e.from.x;
                const dy = e.to.y - e.from.y;
                const dist = Math.sqrt(dx*dx + dy*dy) || 0.1;
                const force = (dist - e.length) * SPRING_K;
                const fx = (dx/dist) * force;
                const fy = (dy/dist) * force;

                if (e.from !== this.draggedNode) { e.from.vx += fx; e.from.vy += fy; }
                if (e.to !== this.draggedNode)   { e.to.vx -= fx; e.to.vy -= fy; }
            });

            // Aggiornamento posizioni
            this.nodes.forEach(n => {
                if (n === this.draggedNode) return;
                n.x += n.vx;
                n.y += n.vy;
            });

            // Rendering
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.translate(canvas.width/2 + this.camera.x, canvas.height/2 + this.camera.y);
            ctx.scale(this.camera.zoom, this.camera.zoom);

            // Archi con gradient e glow
            ctx.lineWidth = 1;
            this.edges.forEach(e => {
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(255,255,255,0.08)';
                ctx.moveTo(e.from.x, e.from.y);
                ctx.lineTo(e.to.x, e.to.y);
                ctx.stroke();
            });

            // Nodi Premium
            this.nodes.forEach(n => {
                ctx.beginPath();
                ctx.arc(n.x, n.y, n.radius, 0, Math.PI*2);
                
                // Glow effect per nodi grossi (molte carte)
                if (n.radius > 35) {
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = n.color;
                } else {
                    ctx.shadowBlur = 0;
                }

                ctx.fillStyle = n.color;
                ctx.fill();
                
                // Label
                ctx.shadowBlur = 0;
                ctx.fillStyle = "#fff";
                ctx.font = `bold ${Math.max(10, 12 / this.camera.zoom)}px Inter`;
                ctx.textAlign = 'center';
                ctx.fillText(n.label, n.x, n.y + n.radius + 15);
            });

            ctx.restore();
            this.animationId = requestAnimationFrame(loop);
        };
        loop();
    }

    setupInteractions(canvas) {
        const screenToWorld = (sx, sy) => ({
            x: (sx - canvas.width/2 - this.camera.x) / this.camera.zoom,
            y: (sy - canvas.height/2 - this.camera.y) / this.camera.zoom
        });

        canvas.onmousedown = (e) => {
            const world = screenToWorld(e.clientX, e.clientY);
            this.draggedNode = this.nodes.find(n => {
                const dx = n.x - world.x, dy = n.y - world.y;
                return Math.sqrt(dx*dx + dy*dy) < n.radius;
            });
            if (!this.draggedNode) this.isPanning = true;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            canvas.style.cursor = 'grabbing';
        };

        window.onmousemove = (e) => {
            if (this.draggedNode) {
                const world = screenToWorld(e.clientX, e.clientY);
                this.draggedNode.x = world.x;
                this.draggedNode.y = world.y;
                this.draggedNode.vx = 0; this.draggedNode.vy = 0;
            } else if (this.isPanning) {
                this.camera.x += (e.clientX - this.lastMouse.x);
                this.camera.y += (e.clientY - this.lastMouse.y);
                this.lastMouse = { x: e.clientX, y: e.clientY };
            }
        };

        window.onmouseup = () => {
            this.draggedNode = null;
            this.isPanning = false;
            canvas.style.cursor = 'grab';
        };

        canvas.onwheel = (e) => {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            this.camera.zoom = Math.max(0.1, Math.min(this.camera.zoom * factor, 5));
        };
    }
}
