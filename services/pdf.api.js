export const PdfService = {
    /**
     * Estrae il testo da un file PDF usando un Web Worker
     * @param {File} file Il file caricato dall'input
     * @returns {Promise<string>} Il testo estratto
     */
    extractText(file) {
        return new Promise((resolve, reject) => {
            // Istanzia il worker
            const worker = new Worker(new URL('./pdfWorker.js', import.meta.url));
            
            worker.onmessage = (e) => {
                const { success, text, error } = e.data;
                worker.terminate(); // Uccidi il worker per liberare RAM
                
                if (success) resolve(text);
                else reject(new Error(error));
            };

            worker.onerror = (err) => {
                worker.terminate();
                reject(new Error("Worker error: " + err.message));
            };

            // Leggi il file come buffer e passalo trasferendone la proprietà (zero-copy)
            file.arrayBuffer().then(buffer => {
                worker.postMessage({ buffer }, [buffer]);
            }).catch(reject);
        });
    }
};
