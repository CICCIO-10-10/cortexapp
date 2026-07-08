import { Component } from '../Component.js';

export class NeuralTrialView extends Component {
    mount() {
        this.mountPoint.innerHTML = '<div id="page-challenge" style="min-height:100%; padding-top:20px;"></div>';
    }

    update(state) {
        // Il render iniziale è sufficiente per avviare il challenge.
    }

    unmount() {
        this.mountPoint.innerHTML = '';
        // Invia comando globale per pulire il timer della challenge 
        // se implementato lato app
        if (window.__cortexDispatch) {
            // (opzionale) reset del timer via action
        }
    }
}
