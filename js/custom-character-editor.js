const FACE_OVAL_CONTOUR = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];

export function createCustomCharacterEditor({ camera, customSettings, onImageLoaded }) {
    const imageInput = document.getElementById('custom-image-file');
    const previewCanvas = document.getElementById('custom-preview-canvas');
    const customStatus = document.getElementById('custom-status');
    const customControls = document.getElementById('custom-controls');
    const panel3dAdjust = document.getElementById('panel-3d-adjust');
    const cUseMask = document.getElementById('c-use-mask');
    const panelMask = document.getElementById('panel-mask');
    const panelScale = document.getElementById('panel-scale');
    const cExpand = document.getElementById('c-expand');
    const cFeather = document.getElementById('c-feather');
    const cScale = document.getElementById('c-scale');
    const cPanX = document.getElementById('c-pan-x');
    const cPanY = document.getElementById('c-pan-y');
    const featureInputs = {
        leftEyeX: document.getElementById('c-e1x'),
        leftEyeY: document.getElementById('c-e1y'),
        rightEyeX: document.getElementById('c-e2x'),
        rightEyeY: document.getElementById('c-e2y'),
        mouthX: document.getElementById('c-mx'),
        mouthY: document.getElementById('c-my')
    };
    const guides = {
        'guide-e1': document.getElementById('guide-e1'),
        'guide-e2': document.getElementById('guide-e2'),
        'guide-mouth': document.getElementById('guide-mouth')
    };
    const magnifier = document.getElementById('magnifier');
    const magnifierCanvas = document.getElementById('magnifier-canvas');
    const magnifierContext = magnifierCanvas.getContext('2d');
    const previewContainer = document.getElementById('custom-preview-container');
    const dotMapping = {
        'guide-e1': { x: featureInputs.leftEyeX, y: featureInputs.leftEyeY },
        'guide-e2': { x: featureInputs.rightEyeX, y: featureInputs.rightEyeY },
        'guide-mouth': { x: featureInputs.mouthX, y: featureInputs.mouthY }
    };

    let baseImage = null;
    let faceLandmarks = null;
    let maskedImage = null;
    let draggedGuide = null;

    function updatePreview() {
        if (!maskedImage) return;
        const width = previewCanvas.width = previewCanvas.offsetWidth;
        const height = previewCanvas.height = previewCanvas.offsetHeight;
        const context = previewCanvas.getContext('2d');
        context.clearRect(0, 0, width, height);
        context.drawImage(maskedImage, 0, 0, width, height);

        guides['guide-e1'].style.left = `${parseFloat(featureInputs.leftEyeX.value) * 100}%`;
        guides['guide-e1'].style.top = `${parseFloat(featureInputs.leftEyeY.value) * 100}%`;
        guides['guide-e2'].style.left = `${parseFloat(featureInputs.rightEyeX.value) * 100}%`;
        guides['guide-e2'].style.top = `${parseFloat(featureInputs.rightEyeY.value) * 100}%`;
        guides['guide-mouth'].style.left = `${parseFloat(featureInputs.mouthX.value) * 100}%`;
        guides['guide-mouth'].style.top = `${parseFloat(featureInputs.mouthY.value) * 100}%`;
    }

    function generateImage(autoAlign = false) {
        if (!baseImage) return;
        const size = 512;
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = size;
        outputCanvas.height = size;
        const context = outputCanvas.getContext('2d');
        const useMask = cUseMask.checked;
        const sourceWidth = baseImage.width;
        const sourceHeight = baseImage.height;
        const transform = { offsetX: 0, offsetY: 0, scale: 1 };

        if (useMask && faceLandmarks) {
            const expand = parseFloat(cExpand.value);
            const feather = parseFloat(cFeather.value);
            let minX = 1, maxX = 0, minY = 1, maxY = 0;
            FACE_OVAL_CONTOUR.forEach(index => {
                const point = faceLandmarks[index];
                if (point.x < minX) minX = point.x;
                if (point.x > maxX) maxX = point.x;
                if (point.y < minY) minY = point.y;
                if (point.y > maxY) maxY = point.y;
            });
            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const expandedWidth = (maxX - minX) * sourceWidth * expand;
            const expandedHeight = (maxY - minY) * sourceHeight * expand;
            const padding = feather * 2;
            const requiredSize = Math.max(expandedWidth, expandedHeight) + padding * 2;
            transform.scale = size / requiredSize;
            transform.offsetX = size / 2 - (centerX * sourceWidth * transform.scale);
            transform.offsetY = size / 2 - (centerY * sourceHeight * transform.scale);

            context.fillStyle = '#ffffff';
            if (feather > 0) context.filter = `blur(${feather}px)`;
            context.beginPath();
            FACE_OVAL_CONTOUR.forEach((index, pointIndex) => {
                const point = faceLandmarks[index];
                const x = transform.offsetX + ((centerX + (point.x - centerX) * expand) * sourceWidth * transform.scale);
                const y = transform.offsetY + ((centerY + (point.y - centerY) * expand) * sourceHeight * transform.scale);
                if (pointIndex === 0) context.moveTo(x, y);
                else context.lineTo(x, y);
            });
            context.closePath();
            context.fill();
            context.filter = 'none';
            context.globalCompositeOperation = 'source-in';
        } else {
            const scale = parseFloat(cScale.value);
            const panX = parseFloat(cPanX.value) * size;
            const panY = parseFloat(cPanY.value) * size;
            transform.scale = (size / Math.max(sourceWidth, sourceHeight)) * scale;
            transform.offsetX = (size / 2 + panX) - (sourceWidth / 2 * transform.scale);
            transform.offsetY = (size / 2 + panY) - (sourceHeight / 2 * transform.scale);
        }

        context.translate(transform.offsetX, transform.offsetY);
        context.scale(transform.scale, transform.scale);
        context.drawImage(baseImage, 0, 0);

        if (autoAlign && faceLandmarks) {
            const getNormalizedPosition = point => ({
                x: (transform.offsetX + point.x * sourceWidth * transform.scale) / size,
                y: (transform.offsetY + point.y * sourceHeight * transform.scale) / size
            });
            const leftEye = getNormalizedPosition(faceLandmarks[33]);
            const rightEye = getNormalizedPosition(faceLandmarks[263]);
            const mouth = getNormalizedPosition(faceLandmarks[13]);
            featureInputs.leftEyeX.value = leftEye.x;
            featureInputs.leftEyeY.value = leftEye.y;
            featureInputs.rightEyeX.value = rightEye.x;
            featureInputs.rightEyeY.value = rightEye.y;
            featureInputs.mouthX.value = mouth.x;
            featureInputs.mouthY.value = mouth.y;
        } else if (!autoAlign && !faceLandmarks) {
            featureInputs.leftEyeX.value = 0.35;
            featureInputs.leftEyeY.value = 0.4;
            featureInputs.rightEyeX.value = 0.65;
            featureInputs.rightEyeY.value = 0.4;
            featureInputs.mouthX.value = 0.5;
            featureInputs.mouthY.value = 0.7;
        }

        const result = new Image();
        result.onload = () => {
            maskedImage = result;
            updatePreview();
        };
        result.onerror = error => {
            console.error("Could not create the custom character image:", error);
            customStatus.textContent = "Could not process this image.";
            customStatus.style.display = 'block';
        };
        result.src = outputCanvas.toDataURL('image/png');
    }

    function updateMagnifier(clientX, clientY, rect) {
        if (!maskedImage) return;
        const size = magnifierCanvas.width = magnifierCanvas.height = 112;
        magnifierContext.clearRect(0, 0, size, size);
        magnifierContext.save();
        magnifierContext.imageSmoothingEnabled = false;
        const targetX = clientX - rect.left;
        const targetY = clientY - rect.top;
        const sourceSize = size / 5;
        magnifierContext.drawImage(
            previewCanvas,
            (targetX - sourceSize / 2) * (previewCanvas.width / rect.width),
            (targetY - sourceSize / 2) * (previewCanvas.height / rect.height),
            sourceSize * (previewCanvas.width / rect.width),
            sourceSize * (previewCanvas.height / rect.height),
            0, 0, size, size
        );
        magnifierContext.restore();

        let left = targetX + 20;
        let top = targetY - 120;
        if (left + size > rect.width) left = targetX - size - 20;
        if (top < 0) top = targetY + 20;
        magnifier.style.left = `${left}px`;
        magnifier.style.top = `${top}px`;
    }

    function dragGuide(event) {
        if (!draggedGuide) return;
        event.preventDefault();
        const rect = previewContainer.getBoundingClientRect();
        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;
        const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
        const mapped = dotMapping[draggedGuide.id];
        if (!mapped) return;
        mapped.x.value = x;
        mapped.y.value = y;
        updatePreview();
        updateMagnifier(clientX, clientY, rect);
    }

    function endGuideDrag() {
        draggedGuide = null;
        magnifier.classList.add('hidden');
        document.removeEventListener('mousemove', dragGuide);
        document.removeEventListener('touchmove', dragGuide);
    }

    function startGuideDrag(event) {
        event.preventDefault();
        draggedGuide = event.target;
        magnifier.classList.remove('hidden');
        document.addEventListener('mousemove', dragGuide);
        document.addEventListener('touchmove', dragGuide, { passive: false });
        document.addEventListener('mouseup', endGuideDrag, { once: true });
        document.addEventListener('touchend', endGuideDrag, { once: true });
    }

    imageInput.addEventListener('change', event => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        customStatus.style.display = 'block';
        customStatus.textContent = "Detecting Face Layout...";
        customControls.classList.add('hidden');
        customControls.classList.remove('flex');
        document.getElementById('btn-custom-save').classList.add('opacity-50', 'pointer-events-none');
        Object.values(guides).forEach(guide => guide.classList.add('hidden'));

        reader.onerror = error => {
            console.error("Could not read custom character image:", error);
            customStatus.textContent = "Could not read this image.";
        };
        reader.onload = loadEvent => {
            const image = new Image();
            image.onerror = error => {
                console.error("Could not decode custom character image:", error);
                customStatus.textContent = "Could not load this image.";
            };
            image.onload = () => {
                const maxSize = 800;
                let width = image.width;
                let height = image.height;
                if (width > maxSize || height > maxSize) {
                    const ratio = Math.min(maxSize / width, maxSize / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                const workCanvas = document.createElement('canvas');
                workCanvas.width = width;
                workCanvas.height = height;
                workCanvas.getContext('2d').drawImage(image, 0, 0, width, height);
                let results = { faceLandmarks: [] };
                try {
                    if (camera.imageLandmarker) results = camera.imageLandmarker.detect(workCanvas);
                } catch (error) {
                    console.error("Could not detect a face in the custom character image:", error);
                    customStatus.textContent = "Could not analyze this image.";
                    customControls.classList.remove('hidden');
                    customControls.classList.add('flex');
                    document.getElementById('btn-custom-save').classList.remove('opacity-50', 'pointer-events-none');
                    Object.values(guides).forEach(guide => guide.classList.remove('hidden'));
                    return;
                }
                baseImage = workCanvas;
                faceLandmarks = results.faceLandmarks?.[0] || null;

                if (faceLandmarks) {
                    customStatus.style.display = 'none';
                    cUseMask.checked = true;
                    cUseMask.disabled = false;
                    document.getElementById('label-use-mask').classList.remove('opacity-50');
                    panelMask.classList.remove('hidden');
                    panelScale.classList.add('hidden');
                } else {
                    customStatus.textContent = "Manual placement mode activated.";
                    cUseMask.checked = false;
                    cUseMask.disabled = true;
                    document.getElementById('label-use-mask').classList.add('opacity-50');
                    panelMask.classList.add('hidden');
                    panelScale.classList.remove('hidden');
                }

                customControls.classList.remove('hidden');
                customControls.classList.add('flex');
                document.getElementById('btn-custom-save').classList.remove('opacity-50', 'pointer-events-none');
                Object.values(guides).forEach(guide => guide.classList.remove('hidden'));
                customSettings.is3D = false;
                panel3dAdjust.classList.add('hidden');
                panel3dAdjust.classList.remove('flex');
                onImageLoaded();
                generateImage(Boolean(faceLandmarks));
            };
            image.src = loadEvent.target.result;
        };
        reader.readAsDataURL(file);
        event.target.value = '';
    });

    cUseMask.addEventListener('change', () => {
        if (cUseMask.checked && !faceLandmarks) {
            cUseMask.checked = false;
            return;
        }
        if (cUseMask.checked) {
            panelMask.classList.remove('hidden');
            panelScale.classList.add('hidden');
        } else {
            panelMask.classList.add('hidden');
            panelScale.classList.remove('hidden');
        }
        generateImage(true);
    });

    [cExpand, cFeather, cScale, cPanX, cPanY].forEach(input => {
        input.addEventListener('input', () => generateImage(false));
    });
    Object.values(featureInputs).forEach(input => input.addEventListener('input', updatePreview));
    Object.values(guides).forEach(guide => guide.addEventListener('mousedown', startGuideDrag));
    Object.values(guides).forEach(guide => guide.addEventListener('touchstart', startGuideDrag, { passive: false }));

    return {
        get baseImage() { return baseImage; },
        get faceLandmarks() { return faceLandmarks; },
        get maskedImage() { return maskedImage; },
        featureInputs,
        updatePreview
    };
}
