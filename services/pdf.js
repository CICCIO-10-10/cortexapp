export async function extractTextFromPDF(file) {
    const reader = new FileReader();

    return new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsText(file);
    });
}
