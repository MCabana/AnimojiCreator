export function createPreviewBackground({
    canvas,
    context,
    fileInput,
    colorInput,
    status,
    clearButton,
    renderPreview,
    isCameraActive
}) {
    let solidColor = colorInput.value;
    let media = null;
    let mediaUrl = null;
    let loadToken = 0;
    let videoFrameRequest = 0;

    function setStatus(message, isError = false) {
        status.textContent = message;
        status.className = `mt-2 truncate text-[10px] ${isError ? 'text-rose-600' : 'text-slate-500'}`;
    }

    function releaseMedia() {
        if (videoFrameRequest) {
            cancelAnimationFrame(videoFrameRequest);
            videoFrameRequest = 0;
        }
        if (media?.type === 'video') {
            media.element.pause();
            media.element.removeAttribute('src');
            media.element.load();
        }
        media = null;
        if (mediaUrl) {
            URL.revokeObjectURL(mediaUrl);
            mediaUrl = null;
        }
    }

    function draw() {
        if (!media) return;
        const source = media.element;
        const sourceWidth = source.videoWidth || source.naturalWidth;
        const sourceHeight = source.videoHeight || source.naturalHeight;
        if (!sourceWidth || !sourceHeight) return;
        const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight);
        const width = sourceWidth * scale;
        const height = sourceHeight * scale;
        context.drawImage(source, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    }

    function drawVideoFrames(token) {
        if (token !== loadToken || media?.type !== 'video') return;
        if (isCameraActive()) {
            videoFrameRequest = 0;
            return;
        }
        renderPreview();
        videoFrameRequest = requestAnimationFrame(() => drawVideoFrames(token));
    }

    function failLoad(token, file, error) {
        if (token !== loadToken) return;
        console.error("Could not load background media:", error);
        releaseMedia();
        fileInput.value = '';
        clearButton.disabled = true;
        setStatus(`Could not load ${file.name}`, true);
        renderPreview();
    }

    function load(file) {
        const token = ++loadToken;
        releaseMedia();
        if (!file) {
            fileInput.value = '';
            clearButton.disabled = true;
            setStatus("No background selected");
            renderPreview();
            return;
        }

        mediaUrl = URL.createObjectURL(file);
        clearButton.disabled = false;
        setStatus(`Loading ${file.name}...`);
        let failed = false;
        const fail = error => {
            if (failed || token !== loadToken) return;
            failed = true;
            failLoad(token, file, error);
        };

        if (file.type.startsWith('image/')) {
            const image = new Image();
            media = { type: 'image', element: image };
            image.onload = () => {
                if (token !== loadToken) return;
                setStatus(file.name);
                renderPreview();
            };
            image.onerror = () => fail(new Error(`Unsupported or invalid image: ${file.name}`));
            image.src = mediaUrl;
            return;
        }

        if (file.type.startsWith('video/')) {
            const backgroundVideo = document.createElement('video');
            backgroundVideo.muted = true;
            backgroundVideo.loop = true;
            backgroundVideo.playsInline = true;
            media = { type: 'video', element: backgroundVideo };
            backgroundVideo.addEventListener('loadeddata', () => {
                if (token !== loadToken) return;
                setStatus(`${file.name} (looping)`);
                renderPreview();
                if (!isCameraActive()) drawVideoFrames(token);
            }, { once: true });
            backgroundVideo.addEventListener('error', () => fail(new Error(`Unsupported or invalid video: ${file.name}`)), { once: true });
            backgroundVideo.src = mediaUrl;
            backgroundVideo.play().catch(fail);
            return;
        }

        fail(new Error(`Unsupported background file type: ${file.type || 'unknown'}`));
    }

    fileInput.addEventListener('change', () => load(fileInput.files[0]));
    clearButton.addEventListener('click', () => load(null));
    colorInput.addEventListener('input', () => {
        solidColor = colorInput.value;
        renderPreview();
    });

    return {
        get color() { return solidColor; },
        draw
    };
}
