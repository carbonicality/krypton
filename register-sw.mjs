const stockSW = "/uv/uv.sw.js"
export async function registerSW() {
    if (!navigator.serviceWorker) {
        throw new Error("bro :( your browser doesnt support sw");
    }
    await navigator.serviceWorker.register(stockSW);
}