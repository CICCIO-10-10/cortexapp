import { Component } from '../Component.js';

export class MindMapView extends Component {
    constructor(store, mountPoint) {
        super(store, mountPoint);
        this.nodes = [];
        this.edges = [];
        this.draggedNode = null;
        this.animationId = null;
        
        // Modalità Telecamera
        this.camera = { x: 0, y: 0, zoom: 1 };
        this.isPanning = false;
        this.lastMouse = { x: 0, y: 0 };
    }

    render(state) {
        if (state.currentView !== 'mindmap') return '';

        return `
            <div class="mindmap-container" style="position: relative; width: 100%; height: 100vh; overflow: hidden; background: #0a0a0f;">
                <div class="mindmap-header" style="position: absolute; top: 20px; left: 20px; z-index: 10; display: flex; gap: 10px;">
                    <button id="btn-back-home" class="secondary-btn" style="background: rgba(255,255,255,0.05); backdrop-filter: blur(10px);">🏠 Home</button>
                    <div style="background: rgba(255,255,255,0.05); padding: 8px 15px; border-radius: 8px; color: var(--accent); font-weight: bold; backdrop-filter: blur(10px);">
                        🧠 Mappa Concettuale IA
                    </div>
                </div>
                <canvas id="mindmap-canvas" style="width: 100%; height: 100%; display: block;"></canvas>
            </div>
        `;
    }

    bindEvents() {
        const canvas = this.mountPoint.querySelector('#mindmap-canvas');
        const btnBack = this.mountPoint.querySelector('#btn-back-home');

        if (btnBack) {
            btnBack.addEventListener('click', () => {
                cancelAnimationFrame(this.animationId);
                this.store.dispatch({ type: 'NAVIGATE', payload: 'home' });
            });
        }

        if (canvas) {
            const ctx = canvas.getContext('2d');
            
            const resize = () => {
                if (!canvas.parentElement) return; 
                canvas.width = canvas.parentElement.clientWidth;
                canvas.height = canvas.parentElement.clientHeight;
            };
            window.addEventListener('resize', resize);
            resize();

            const state = this.store.getState();
            const graphData = state.currentGraph || { nodes: [], edges: [] };

            const width = canvas.width;
            const height = canvas.height;
            this.nodes = (graphData.nodes || []).map(n => ({
                ...n,
                x: width / 2 + (Math.random() - 0.5) * 200,
                y: height / 2 + (Math.random() - 0.5) * 200,
                vx: 0, vy: 0,
                radius: n.type === 'root' ? 45 : 30
            }));

            this.edges = (graphData.edges || []).map(e => ({
                fromNode: this.nodes.find(n => n.id === e.from),
                toNode: this.nodes.find(n => n.id === e.to)
            })).filter(e => e.fromNode && e.toNode);

            const REPULSION = 3000;
            const SPRING_K = 0.005;
            const DAMPING = 0.85;
            const CENTER_ATTRACTION = 0.001;

            const frame = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                ctx.save();
                ctx.translate(this.camera.x, this.camera.y);
                ctx.scale(this.camera.zoom, this.camera.zoom);

                this.nodes.forEach(n => {
                    if (n === this.draggedNode) return;

                    let fx = 0; let fy = 0;
                    fx += (canvas.width / 2 - n.x) * CENTER_ATTRACTION;
                    fy += (canvas.height / 2 - n.y) * CENTER_ATTRACTION;

                    this.nodes.forEach(other => {
                        if (n === other) return;
                        const dx = n.x - other.x;
                        const dy = n.y - other.y;
                        const distSq = dx * dx + dy * dy + 0.01;
                        const dist = Math.sqrt(distSq);

                        if (dist < 400) {
                            const f = REPULSION / distSq;
                            fx += (dx / dist) * f;
                            fy += (dy / dist) * f;
                        }
                    });
                    
                    n.vx = (n.vx + fx) * DAMPING;
                    n.vy = (n.vy + fy) * DAMPING;
                });

                this.edges.forEach(e => {
                    const dx = e.toNode.x - e.fromNode.x;
                    const dy = e.toNode.y - e.fromNode.y;
                    const f = SPRING_K;

                    if (e.fromNode !== this.draggedNode) {
                        e.fromNode.vx += dx * f;
                        e.fromNode.vy += dy * f;
                    }
                    if (e.toNode !== this.draggedNode) {
                        e.toNode.vx -= dx * f;
                        e.toNode.vy -= dy * f;
                    }
                });

                this.nodes.forEach(n => {
                    if (n !== this.draggedNode) {
                        n.x += n.vx;
                        n.y += n.vy;
                    }
                });

                // Disegna Archi
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 2 / this.camera.zoom;
                this.edges.forEach(e => {
                    ctx.beginPath();
                    ctx.moveTo(e.fromNode.x, e.fromNode.y);
                    ctx.lineTo(e.toNode.x, e.toNode.y);
                    ctx.stroke();
                });

                // Disegna Nodi
                this.nodes.forEach(n => {
                    ctx.beginPath();
                    ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
                    
                    if (n.type === 'root') {
                        ctx.fillStyle = '#0284c7';
                        ctx.strokeStyle = '#38bdf8';
                    } else {
                        ctx.fillStyle = '#1e293b';
                        ctx.strokeStyle = '#64748b';
                    }
                    
                    ctx.lineWidth = 3 / this.camera.zoom;
                    ctx.fill();
                    ctx.stroke();

                    ctx.fillStyle = '#f8fafc';
                    ctx.font = n.type === 'root' ? `${Math.round(13 / this.camera.zoom)}px Inter` : `${Math.round(11 / this.camera.zoom)}px Inter`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    const words = n.label.split(' ');
                    if (words.length > 2) {
                        ctx.fillText(words[0] + ' ' + words[1], n.x, n.y - (7 / this.camera.zoom));
                        ctx.fillText(words.slice(2).join(' '), n.x, n.y + (7 / this.camera.zoom));
                    } else {
                        ctx.fillText(n.label, n.x, n.y);
                    }
                });

                ctx.restore();
                this.animationId = requestAnimationFrame(frame);
            };

            frame();
            this.setupInteraction(canvas);
        }
    }

    setupInteraction(canvas) {
        const screenToWorld = (screenX, screenY) => {
            const rect = canvas.getBoundingClientRect();
            return {
                x: (screenX - rect.left - this.camera.x) / this.camera.zoom,
                y: (screenY - rect.top - this.camera.y) / this.camera.zoom
            };
        };

        const startInteraction = (e) => {
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const worldPos = screenToWorld(clientX, clientY);
            
            this.lastMouse = { x: clientX, y: clientY };

            this.draggedNode = this.nodes.find(n => {
                const dx = n.x - worldPos.x; 
                const dy = n.y - worldPos.y;
                return Math.sqrt(dx*dx + dy*dy) < n.radius;
            });

            if (this.draggedNode) {
                canvas.style.cursor = 'grabbing';
            } else {
                this.isPanning = true;
                canvas.style.cursor = 'move';
            }
        };

        const performInteraction = (e) => {
            if (!this.draggedNode && !this.isPanning) return;
            e.preventDefault();

            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            if (this.draggedNode) {
                const worldPos = screenToWorld(clientX, clientY);
                this.draggedNode.x = worldPos.x;
                this.draggedNode.y = worldPos.y;
                this.draggedNode.vx = 0; this.draggedNode.vy = 0;
            } else if (this.isPanning) {
                const dx = clientX - this.lastMouse.x;
                const dy = clientY - this.lastMouse.y;
                this.camera.x += dx;
                this.camera.y += dy;
                this.lastMouse = { x: clientX, y: clientY };
            }
        };

        const endInteraction = () => {
            this.draggedNode = null;
            this.isPanning = false;
            canvas.style.cursor = 'grab';
        };

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomAmount = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = Math.max(0.2, Math.min(this.camera.zoom * zoomAmount, 3));
            
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            this.camera.x = mouseX - (mouseX - this.camera.x) * (newZoom / this.camera.zoom);
            this.camera.y = mouseY - (mouseY - this.camera.y) * (newZoom / this.camera.zoom);
            this.camera.zoom = newZoom;
        });

        canvas.addEventListener('mousedown', startInteraction);
        canvas.addEventListener('mousemove', performInteraction);
        window.addEventListener('mouseup', endInteraction);

        canvas.addEventListener('touchstart', startInteraction, {passive: false});
        canvas.addEventListener('touchmove', performInteraction, {passive: false});
        window.addEventListener('touchend', endInteraction);
    }
}
