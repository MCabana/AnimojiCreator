import * as THREE from "three";

export function createPreviewBackground({
    canvas,
    context,
    fileInput,
    colorInput,
    lightingMatchInput,
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
    let lastLightingSample = 0;
    let ambientLight = null;
    let directionalLight = null;

    const neutralLightColor = new THREE.Color(0xfffaf5);
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 16;
    sampleCanvas.height = 16;
    const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
    const averageColor = new THREE.Color();

    function setStatus(message, isError = false) {
        status.textContent = message;
        status.className = `mt-2 truncate text-[10px] ${isError ? 'text-rose-600' : 'text-slate-500'}`;
    }

    function resetLightingTint() {
        ambientLight?.color.copy(neutralLightColor);
        directionalLight?.color.copy(neutralLightColor);
    }

    function updateLighting(source) {
        if (!lightingMatchInput.checked || !ambientLight || !directionalLight) return;
        const sourceWidth = source.videoWidth || source.naturalWidth;
        const sourceHeight = source.videoHeight || source.naturalHeight;
        if (!sourceWidth || !sourceHeight) return;

        const scale = Math.max(sampleCanvas.width / sourceWidth, sampleCanvas.height / sourceHeight);
        const width = sourceWidth * scale;
        const height = sourceHeight * scale;
        try {
            sampleContext.fillStyle = solidColor;
            sampleContext.fillRect(0, 0, sampleCanvas.width, sampleCanvas.height);
            sampleContext.drawImage(
                source,
                (sampleCanvas.width - width) / 2,
                (sampleCanvas.height - height) / 2,
                width,
                height
            );

            const { data } = sampleContext.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
            let red = 0;
            let green = 0;
            let blue = 0;
            for (let index = 0; index < data.length; index += 4) {
                red += data[index];
                green += data[index + 1];
                blue += data[index + 2];
            }
            const pixelCount = data.length / 4;
            averageColor.setRGB(
                red / pixelCount / 255,
                green / pixelCount / 255,
                blue / pixelCount / 255,
                THREE.SRGBColorSpace
            );
        } catch (error) {
            console.error("Could not sample the preview background for 3D lighting:", error);
            return;
        }

        ambientLight.color.copy(neutralLightColor).lerp(averageColor, 0.3);
        directionalLight.color.copy(neutralLightColor).lerp(averageColor, 0.2);
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

    function updateVideoLighting() {
        if (media?.type !== 'video' || !lightingMatchInput.checked) return;
        if (performance.now() - lastLightingSample >= 500) {
            updateLighting(media.element);
            lastLightingSample = performance.now();
        }
    }

    function failLoad(token, file, error) {
        if (token !== loadToken) return;
        console.error("Could not load background media:", error);
        releaseMedia();
        fileInput.value = '';
        clearButton.disabled = true;
        resetLightingTint();
        setStatus(`Could not load ${file.name}`, true);
        renderPreview();
    }

    function load(file) {
        const token = ++loadToken;
        releaseMedia();
        resetLightingTint();
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
                if (lightingMatchInput.checked) updateLighting(image);
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
                if (lightingMatchInput.checked) updateLighting(backgroundVideo);
                lastLightingSample = performance.now();
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
    lightingMatchInput.addEventListener('change', () => {
        if (lightingMatchInput.checked && media) updateLighting(media.element);
        else resetLightingTint();
        renderPreview();
    });

    return {
        get color() { return solidColor; },
        draw,
        updateVideoLighting,
        setLights(ambient, directional) {
            ambientLight = ambient;
            directionalLight = directional;
            if (lightingMatchInput.checked && media) updateLighting(media.element);
            else resetLightingTint();
        }
    };
}
