export function setupFullscreen({ resizeCanvases }) {
    const btnFullscreen = document.getElementById('btn-fullscreen');
    const fullscreenIcon = document.getElementById('fullscreen-icon');
    const canvasContainer = document.querySelector('.canvas-container');
    let isFauxFullscreen = false;

    btnFullscreen.addEventListener('click', () => {
        isFauxFullscreen = !isFauxFullscreen;
        if (isFauxFullscreen) {
            canvasContainer.classList.add('faux-fullscreen');
            fullscreenIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 14h6m0 0v6m0-6l-7 7m17-11h-6m0 0V4m0 6l7-7M4 10h6m0 0V4m0 6l-7-7m17 11h-6m0 0v6m0-6l7 7"></path>`;
        } else {
            canvasContainer.classList.remove('faux-fullscreen');
            fullscreenIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>`;
        }
        setTimeout(resizeCanvases, 50);
    });

    return {
        get isFullscreen() {
            return isFauxFullscreen;
        }
    };
}
