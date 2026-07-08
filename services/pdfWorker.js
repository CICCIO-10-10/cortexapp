// Importiamo pdf.js direttamente nel worker via CDN
importScripts('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');

// Configura il worker interno di pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

self.onmessage = async function(e) {
    const { buffer } = e.data;
    
    try {
        const loadingTask = pdfjsLib.getDocument({ data: buffer });
        const pdf = await loadingTask.promise;
        let fullText = '';

        // Estrazione sequenziale per non saturare la RAM del worker
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n\n';
        }

        // Restituisce il testo al Main Thread
        self.postMessage({ success: true, text: fullText.trim() });
    } catch (error) {
        self.postMessage({ success: false, error: error.message });
    }
};
