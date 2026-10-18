        import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
        import { PALETTES, drawCharacterBase } from "./characters.js";
        import { setupCamera } from "./camera.js";
        import { setupRecording } from "./recording.js";
        import { setupFullscreen } from "./fullscreen.js";
        import { createCustomCharacterEditor } from "./custom-character-editor.js";
        import { createPreviewBackground } from "./preview-background.js";
        import { createAccessoryManager } from "./accessory-manager.js";

        const BABYLON = window.BABYLON;

        const originalConsoleError = console.error;
        console.error = function(...args) {
            if (typeof args[0] === 'string' && args[0].includes('Created TensorFlow Lite XNNPACK delegate')) {
                return;
            }
            originalConsoleError.apply(console, args);
        };

        const statusText = document.getElementById('status-text');
        const statusIndicator = document.getElementById('status-indicator');
        const backgroundFile = document.getElementById('background-file');
        const backgroundColor = document.getElementById('background-color');
        const backgroundStatus = document.getElementById('background-status');
        const clearBackgroundButton = document.getElementById('btn-clear-background');
        const btnCamera = document.getElementById('btn-camera');
        const pipContainer = document.getElementById('pip-container');
        const canvas = document.getElementById('render-canvas');
        const ctx = canvas.getContext('2d');
        const video = document.getElementById('webcam');
        const pipVideo = document.getElementById('pip-video');
        const pipCanvas = document.getElementById('pip-canvas');
        const pipCtx = pipCanvas.getContext('2d');
        
        const sliderEyes = document.getElementById('slider-eyes');
        const sliderNose = document.getElementById('slider-nose');
        const sliderMouth = document.getElementById('slider-mouth');
        const btnTogglePip = document.getElementById('btn-toggle-pip');
        const btnRecenter = document.getElementById('btn-recenter');

        const CORE_CHARACTER_ID = 'standard';
        let selectedCharacter = 'bear'; 
        let selectedVariant = 0;
        const savedVariants = { bear: 0, cat: 0, moose: 0, dog: 0, bird: 0, penguin: 0, [CORE_CHARACTER_ID]: 0, custom: 0 };
        
        let eyeScale = 1.0;
        let noseScale = 1.0;
        let mouthScale = 1.0;
        let showPip = false;
        let previewBackgroundManager = null;

        let offsetRoll = 0;
        let offsetYaw = 0;
        let offsetPitch = 0;
        let offsetPositionX = 0;
        let offsetPositionY = 0;
        let neutralHeadZ = null;
        let currentHeadZ = 0;
        let neutralFaceAspectRatio = null;
        let requestRecenter = false;

        let customBgDrawW = 256;
        let customBgDrawH = 256;
        let customStaticScaleMult = 1.0;
        let model3DEngine = null;
        let model3DRenderCanvas = null;
        let model3DScene = null;
        let model3DCamera = null;
        let model3DCameraBaseZ = 4.0;
        let model3DCameraBaseY = 0.0;
        let model3DAssetContainer = null;
        let modelBones = {};
        let isPreviewing3D = false;
        let rigBonesByName = new Map();
        let coreLoadToken = 0;
        
        let loadedModelRoot = null;
        let orbitAngleX = 0;
        let orbitAngleY = 0;
        let isDraggingOrbit = false;
        let lastMouseX = 0;
        let lastMouseY = 0;
        
        const headRotationFilters = {
            yaw: { value: null, derivative: 0, time: 0 },
            pitch: { value: null, derivative: 0, time: 0 },
            roll: { value: null, derivative: 0, time: 0 }
        };
        let fullscreen = { isFullscreen: false };
        
        const customSettings = { e1x: 0.35, e1y: 0.4, e2x: 0.65, e2y: 0.4, mx: 0.5, my: 0.7, isStatic: false, is3D: false };
        let customImageEditor = null;

        let livePlanes = {};

        function smoothHeadRotation(filter, value, time, isAngle = false) {
            if (filter.value === null || time - filter.time > 500) {
                filter.value = value;
                filter.derivative = 0;
                filter.time = time;
                return value;
            }

            const deltaTime = Math.max((time - filter.time) / 1000, 0.001);
            let delta = value - filter.value;
            if (isAngle) delta = Math.atan2(Math.sin(delta), Math.cos(delta));

            const derivative = delta / deltaTime;
            const derivativeAlpha = 1 / (1 + (1 / (2 * Math.PI)) / deltaTime);
            filter.derivative += derivativeAlpha * (derivative - filter.derivative);

            const cutoff = Math.min(3, 1.2 + 0.15 * Math.abs(filter.derivative));
            const valueAlpha = 1 / (1 + (1 / (2 * Math.PI * cutoff)) / deltaTime);
            filter.value += valueAlpha * delta;
            filter.time = time;
            return filter.value;
        }

        function setTrackedRotation(node, yaw, pitch, roll) {
            const offset = BABYLON.Quaternion.RotationYawPitchRoll(yaw, pitch, roll);
            node.rotationQuaternion = node.initRotationQuaternion.multiply(offset);
        }

        function clearLivePlanes() {
            Object.values(livePlanes).forEach(plane => {
                plane.mesh?.dispose(false, true);
                plane.anchor?.dispose(true);
            });
            livePlanes = {};
        }

        function updateLivePlaneCounterRotations() {
            Object.values(livePlanes).forEach(plane => {
                if (!plane.anchor || !plane.anchor.parent) return;
                // Keep the plane anchored to the bone in its initial rest orientation,
                // so it follows the 3D head bone 1:1 in yaw, pitch, and roll.
                plane.anchor.rotationQuaternion.copyFrom(plane.initialAnchorLocalRotation);
            });
        }

        function createLivePlane(bone, name) {
            const cvs = document.createElement('canvas');
            cvs.width = 256; cvs.height = 256;
            
            const tex = new BABYLON.DynamicTexture(`${name}-texture`, { width: cvs.width, height: cvs.height }, model3DScene, false);
            tex.hasAlpha = true;
            tex.getContext().clearRect(0, 0, cvs.width, cvs.height);
            tex.update();
            const mat = new BABYLON.StandardMaterial(`${name}-material`, model3DScene);
            mat.diffuseTexture = tex;
            mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
            mat.disableLighting = true;
            mat.useAlphaFromDiffuseTexture = true;
            mat.backFaceCulling = false;
            mat.disableDepthWrite = true;
            mat.alpha = 1;
            mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
            mat.needAlphaBlending = () => true;
            const mesh = new BABYLON.Mesh(`${name}-plane`, model3DScene);
            const positions = [];
            const indices = [];
            const uvs = [];
            const subdivisions = 16;
            for (let y = 0; y <= subdivisions; y++) {
                for (let x = 0; x <= subdivisions; x++) {
                    positions.push((x / subdivisions - 0.5) * 0.5, (0.5 - y / subdivisions) * 0.5, 0);
                    uvs.push(x / subdivisions, 1 - y / subdivisions);
                    if (x < subdivisions && y < subdivisions) {
                        const i = y * (subdivisions + 1) + x;
                        indices.push(i, i + 1, i + subdivisions + 1, i + 1, i + subdivisions + 2, i + subdivisions + 1);
                    }
                }
            }
            const normals = [];
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
            const vertexData = new BABYLON.VertexData();
            vertexData.positions = positions;
            vertexData.indices = indices;
            vertexData.normals = normals;
            vertexData.uvs = uvs;
            vertexData.applyToMesh(mesh, true);
            mesh.material = mat;
            mesh.isPickable = false;

            const anchor = new BABYLON.TransformNode(`${name}-anchor`, model3DScene);
            const worldScale = new BABYLON.Vector3();
            const worldRotation = new BABYLON.Quaternion();
            const worldPosition = new BABYLON.Vector3();
            bone.computeWorldMatrix(true).decompose(worldScale, worldRotation, worldPosition);
            anchor.rotationQuaternion = BABYLON.Quaternion.Inverse(worldRotation);
            anchor.parent = bone;
            mesh.parent = anchor;
            
            livePlanes[name] = {
                canvas: cvs,
                texture: tex,
                mesh,
                anchor,
                initialAnchorLocalRotation: anchor.rotationQuaternion.clone()
            };
            updateLivePlaneCurvature(livePlanes[name]);
        }

        function updateLivePlaneCurvature(plane) {
            const horizontalBend = parseFloat(c3dCurveHorizontal.value);
            const verticalBend = parseFloat(c3dCurveVertical.value);
            const positions = plane.mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            for (let i = 0; i < positions.length; i += 3) {
                const x = positions[i];
                const y = positions[i + 1];
                positions[i + 2] = horizontalBend * x * x + verticalBend * y * y;
            }
            const indices = plane.mesh.getIndices();
            const normals = [];
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
            plane.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions, true);
            plane.mesh.updateVerticesData(BABYLON.VertexBuffer.NormalKind, normals, false);
        }

        let scratchVideoCanvas = null;
        let scratchVideoCtx = null;
        function getScratchVideoCanvas(w, h) {
            if (!scratchVideoCanvas) {
                scratchVideoCanvas = document.createElement('canvas');
                scratchVideoCanvas.width = w;
                scratchVideoCanvas.height = h;
                scratchVideoCtx = scratchVideoCanvas.getContext('2d');
            } else if (scratchVideoCanvas.width !== w || scratchVideoCanvas.height !== h) {
                scratchVideoCanvas.width = w;
                scratchVideoCanvas.height = h;
            }
            return { canvas: scratchVideoCanvas, ctx: scratchVideoCtx };
        }

        let canvasFilterSupported = null;
        function isCanvasFilterSupported() {
            if (canvasFilterSupported !== null) return canvasFilterSupported;
            try {
                const c = document.createElement('canvas');
                c.width = 1; c.height = 1;
                const tCtx = c.getContext('2d');
                if (!tCtx || !('filter' in tCtx)) {
                    canvasFilterSupported = false;
                    return false;
                }
                tCtx.filter = 'blur(2px)';
                canvasFilterSupported = (tCtx.filter === 'blur(2px)');
                return canvasFilterSupported;
            } catch (e) {
                canvasFilterSupported = false;
                return false;
            }
        }

        function updateTextureCanvas(canvas, landmarks, indices, flipFor3D = false, rollAngle = 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (!landmarks || indices.length === 0) return;
            
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            if (!vw || !vh) return;
            
            let minX = 1, maxX = 0, minY = 1, maxY = 0;
            indices.forEach(idx => {
                const pt = landmarks[idx];
                if(pt.x < minX) minX = pt.x;
                if(pt.x > maxX) maxX = pt.x;
                if(pt.y < minY) minY = pt.y;
                if(pt.y > maxY) maxY = pt.y;
            });
            
            let anchorX = (minX + maxX) / 2;
            let anchorY = (minY + maxY) / 2;
            
            const featureW = (maxX - minX) * vw;
            const featureH = (maxY - minY) * vh;
            if (featureW <= 0 || featureH <= 0) return;
            
            // Reduce scale slightly to 0.55 to leave padding on the canvas for the feathered mask
            const scale = Math.min(canvas.width / featureW, canvas.height / featureH) * 0.55; 
            
            // 1. Draw the feathered mask onto canvas
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            if (rollAngle !== 0) ctx.rotate(rollAngle);
            
            if (isCanvasFilterSupported()) {
                // Browsers supporting ctx.filter (Chrome, Edge, Firefox, Android)
                ctx.save();
                ctx.scale(1.4, 1.4); // Expand masked area by 40% to show more surrounding skin
                ctx.beginPath();
                indices.forEach((idx, i) => {
                    const pt = landmarks[idx];
                    const dx = (pt.x - anchorX) * vw * scale;
                    const dy = (pt.y - anchorY) * vh * scale;
                    if (i === 0) ctx.moveTo(dx, dy); else ctx.lineTo(dx, dy);
                });
                ctx.closePath();
                
                ctx.fillStyle = '#ffffff';
                ctx.filter = 'blur(12px)'; // Apply heavy feathering to the mask edges
                ctx.fill();
                ctx.fill(); // Fill twice to keep the center solidly opaque
                ctx.filter = 'none';
                ctx.restore();
            } else {
                // Safari / iOS WebKit where ctx.filter is disabled by default:
                // Create a smooth feathered falloff using a radial/elliptical gradient matching the feature size
                const rx = (featureW * scale * 0.5) * 1.45;
                const minRy = rx * 0.6;
                const ry = Math.max((featureH * scale * 0.5) * 1.45, minRy);

                ctx.save();
                ctx.scale(1, ry / rx);
                const grad = ctx.createRadialGradient(0, 0, rx * 0.45, 0, 0, rx);
                grad.addColorStop(0, '#ffffff');
                grad.addColorStop(0.5, '#ffffff');
                grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(0, 0, rx, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                // Fill the contour core solidly
                ctx.save();
                ctx.beginPath();
                indices.forEach((idx, i) => {
                    const pt = landmarks[idx];
                    const dx = (pt.x - anchorX) * vw * scale;
                    const dy = (pt.y - anchorY) * vh * scale;
                    if (i === 0) ctx.moveTo(dx, dy); else ctx.lineTo(dx, dy);
                });
                ctx.closePath();
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                ctx.restore();
            }
            ctx.restore();
            
            // 2. Render video to scratch canvas first to avoid Safari's HTMLVideoElement source-in compositing bug
            const { canvas: sCanvas, ctx: sCtx } = getScratchVideoCanvas(canvas.width, canvas.height);
            sCtx.clearRect(0, 0, sCanvas.width, sCanvas.height);
            sCtx.save();
            sCtx.translate(sCanvas.width / 2, sCanvas.height / 2);
            if (rollAngle !== 0) sCtx.rotate(rollAngle);
            const drawW = vw * scale;
            const drawH = vh * scale;
            sCtx.drawImage(video, -anchorX * drawW, -anchorY * drawH, drawW, drawH);
            sCtx.restore();

            // 3. Composite the video onto the feathered mask
            ctx.globalCompositeOperation = 'source-in';
            ctx.drawImage(sCanvas, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
        }

        function updateLivePlaneTexture(plane) {
            const textureContext = plane.texture.getContext();
            textureContext.clearRect(0, 0, plane.canvas.width, plane.canvas.height);
            textureContext.drawImage(plane.canvas, 0, 0);
            plane.texture.update();
        }

        const MOUTH_CONTOUR = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
        const LEFT_EYE_CONTOUR = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
        const RIGHT_EYE_CONTOUR = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
        function setStatus(text, colorClass) {
            statusText.textContent = text;
            statusIndicator.className = `w-2 h-2 rounded-full ${colorClass}`;
        }

        const camera = setupCamera({
            FaceLandmarker,
            FilesetResolver,
            btnCamera,
            video,
            pipVideo,
            pipCanvas,
            pipContainer,
            showPip: () => showPip,
            setStatus,
            resizeCanvases,
            drawScene
        });

        previewBackgroundManager = createPreviewBackground({
            canvas,
            context: ctx,
            fileInput: backgroundFile,
            colorInput: backgroundColor,
            status: backgroundStatus,
            clearButton: clearBackgroundButton,
            renderPreview: drawScene,
            isCameraActive: () => camera.isActive
        });

        const accessoryManager = createAccessoryManager({
            BABYLON,
            getScene: () => model3DScene,
            getCharacter: () => selectedCharacter,
            getModelRoot: () => loadedModelRoot,
            isCameraActive: () => camera.isActive,
            drawScene
        });

        function resizeCanvases() {
            if (canvas.offsetWidth === 0) return;
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            canvas.width = canvas.offsetWidth * dpr;
            canvas.height = canvas.offsetHeight * dpr;
            
            if (model3DEngine && model3DCamera) {
                model3DEngine.setSize(canvas.width, canvas.height);
                model3DCamera.position.x = 0;
                model3DCamera.position.z = fullscreen.isFullscreen ? model3DCameraBaseZ * 1.5 : model3DCameraBaseZ;
                model3DCamera.position.y = model3DCameraBaseY;
                model3DCamera.setTarget(new BABYLON.Vector3(0, model3DCameraBaseY, 0));
            }

            if (camera.isActive && video.videoWidth > 0) {
                pipCanvas.width = video.videoWidth;
                pipCanvas.height = video.videoHeight;
            }
            drawScene();
        }
        let resizeFrame = 0;
        function scheduleCanvasResize() {
            if (resizeFrame) cancelAnimationFrame(resizeFrame);
            resizeFrame = requestAnimationFrame(() => {
                resizeFrame = 0;
                resizeCanvases();
            });
        }
        window.addEventListener('resize', scheduleCanvasResize);
        window.addEventListener('orientationchange', scheduleCanvasResize);
        window.visualViewport?.addEventListener('resize', scheduleCanvasResize);
        const canvasResizeObserver = new ResizeObserver(scheduleCanvasResize);
        canvasResizeObserver.observe(document.querySelector('.canvas-container'));

        function drawScene() {
            if (canvas.width === 0 || (camera.isActive && video.videoWidth === 0)) return;
            
            ctx.fillStyle = previewBackgroundManager.color;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            previewBackgroundManager.draw();
            
            let cx = canvas.width / 2;
            let cy = canvas.height / 2;
            const screenCenterX = canvas.width / 2;
            const screenCenterY = canvas.height / 2;
            
            const headRadius = Math.min(canvas.width, canvas.height) * 0.35;
            customBgDrawW = headRadius * 2.5;
            customBgDrawH = headRadius * 2.5;
            
            let landmarks = null;
            let angle = 0; let yawX = 0; let pitchY = 0; let pitchAxisScale = 1; let globalScale = 1.0;
            const vw = video.videoWidth || 640; const vh = video.videoHeight || 480;
            const isCustomStatic = (selectedCharacter === 'custom' && customSettings.isStatic);

            if (camera.trackingResults && camera.trackingResults.facialTransformationMatrixes && camera.trackingResults.facialTransformationMatrixes.length > 0) {
                const matrix = camera.trackingResults.facialTransformationMatrixes[0];
                const matrixData = matrix.data || matrix;
                if (matrixData && matrixData.length >= 15) {
                    const rawZ = matrixData[14];
                    if (!isNaN(rawZ) && rawZ !== 0) {
                        if (neutralHeadZ === null) {
                            neutralHeadZ = rawZ;
                        }
                        currentHeadZ = rawZ;
                    }
                }
            }

            if (camera.trackingResults && camera.trackingResults.faceLandmarks && camera.trackingResults.faceLandmarks.length > 0) {
                landmarks = camera.trackingResults.faceLandmarks[0];
                const nose = landmarks[1];
                const leftCorner = landmarks[33]; const rightCorner = landmarks[263]; 
                
                cx = ((1.0 - nose.x) - offsetPositionX) * canvas.width;
                cy = (nose.y - offsetPositionY) * canvas.height;
                
                const dxRoll = ((1.0 - leftCorner.x) - (1.0 - rightCorner.x)) * vw;
                const dyRoll = (leftCorner.y - rightCorner.y) * vh;
                let rawAngle = Math.atan2(dyRoll, dxRoll);
                angle = rawAngle - offsetRoll;
                
                const faceWidthRatio = Math.sqrt(dxRoll * dxRoll + dyRoll * dyRoll) / vw;
                
                if (faceWidthRatio > 0.05) {
                    globalScale = (headRadius * 1.5) / (faceWidthRatio * vw);
                    const uX = dxRoll / (faceWidthRatio * vw); const uY = dyRoll / (faceWidthRatio * vw);
                    const vX = -uY; const vY = uX;
                    const midEyeX = ((1.0 - leftCorner.x) + (1.0 - rightCorner.x)) / 2;
                    const midEyeY = (leftCorner.y + rightCorner.y) / 2;
                    const nX = (1.0 - nose.x) - midEyeX; const nY = nose.y - midEyeY;
                    
                    const localYaw = (nX * uX + nY * uY) / faceWidthRatio; 
                    const rawPitch = (nX * vX + nY * vY) / faceWidthRatio;
                    const forehead = landmarks[10];
                    const chin = landmarks[152];
                    const faceHeightRatio = forehead && chin
                        ? Math.hypot((forehead.x - chin.x) * vw, (forehead.y - chin.y) * vh) / vh
                        : 0;
                    const faceAspectRatio = faceHeightRatio > 0 ? faceWidthRatio / faceHeightRatio : 0;
                    if (neutralFaceAspectRatio === null && faceAspectRatio > 0) {
                        neutralFaceAspectRatio = faceAspectRatio;
                    }
                    
                    if (requestRecenter) {
                        offsetRoll = rawAngle; offsetYaw = localYaw; offsetPitch = rawPitch - 0.30;
                        offsetPositionX = (1.0 - nose.x) - 0.5;
                        offsetPositionY = nose.y - 0.5;
                        if (currentHeadZ !== 0) neutralHeadZ = currentHeadZ;
                        cx = canvas.width / 2;
                        cy = canvas.height / 2;
                        if (faceAspectRatio > 0) neutralFaceAspectRatio = faceAspectRatio;
                        requestRecenter = false;
                        btnRecenter.textContent = "Centered!"; btnRecenter.classList.add('bg-emerald-100', 'text-emerald-600', 'border-emerald-200');
                        setTimeout(() => { btnRecenter.textContent = "Recenter"; btnRecenter.classList.remove('bg-emerald-100', 'text-emerald-600', 'border-emerald-200'); }, 1000);
                    }

                    let localPitch = (rawPitch - 0.30) - offsetPitch; 
                    let adjustedYaw = localYaw - offsetYaw;
                    
                    yawX = adjustedYaw * headRadius * 1.2;
                    pitchY = localPitch * headRadius * 1.2;
                    if (neutralFaceAspectRatio && faceAspectRatio > 0) {
                        pitchAxisScale = Math.max(0.6, Math.min(1, faceAspectRatio / neutralFaceAspectRatio));
                    }
                }
                drawPIPVisualizer(landmarks);
            } else { drawPIPVisualizer(null); }

            if ((selectedCharacter === 'custom' || selectedCharacter === CORE_CHARACTER_ID) && customSettings.is3D && model3DEngine) {
                const activeCx = isCustomStatic ? screenCenterX : cx;
                const activeCy = isCustomStatic ? screenCenterY : cy;
                const trackedRoll = update3DModelRigging(landmarks, angle, yawX, pitchY, activeCx, activeCy, pitchAxisScale);
                updateLivePlaneCounterRotations();
                
                if (livePlanes.eye_left) {
                    updateTextureCanvas(livePlanes.eye_left.canvas, landmarks, RIGHT_EYE_CONTOUR, true, trackedRoll);
                    updateLivePlaneTexture(livePlanes.eye_left);
                    livePlanes.eye_left.mesh.scaling.setAll(eyeScale * 1.3);
                }
                if (livePlanes.eye_right) {
                    updateTextureCanvas(livePlanes.eye_right.canvas, landmarks, LEFT_EYE_CONTOUR, true, trackedRoll);
                    updateLivePlaneTexture(livePlanes.eye_right);
                    livePlanes.eye_right.mesh.scaling.setAll(eyeScale * 1.3);
                }
                if (livePlanes.mouth) {
                    updateTextureCanvas(livePlanes.mouth.canvas, landmarks, MOUTH_CONTOUR, true, trackedRoll);
                    updateLivePlaneTexture(livePlanes.mouth);

                    let mouthOpenScale = 1.0;
                    if (landmarks) {
                        const topLip = landmarks[13];
                        const botLip = landmarks[14] || landmarks[17];
                        mouthOpenScale = 1.0 + (Math.abs(topLip.y - botLip.y) * 4.0);
                    }
                    const mouthWidthScale = 1.0 + (mouthOpenScale - 1.0) * 0.35;
                    livePlanes.mouth.mesh.scaling.set(mouthScale * 1.3 * mouthWidthScale, mouthScale * 1.3 * mouthOpenScale, mouthScale * 1.3);
                }

                render3DScene();
                return;
            }

            const surfaceX = isCustomStatic ? screenCenterX : cx + yawX;
            const surfaceY = isCustomStatic ? screenCenterY : cy + pitchY;
            const snoutX = cx + yawX * 1.2;
            const snoutY = (cy + pitchY * 1.2) + (headRadius * 0.05);

            ctx.save();
            ctx.translate(isCustomStatic ? screenCenterX : cx, isCustomStatic ? screenCenterY : cy);
            ctx.rotate(isCustomStatic ? 0 : angle);
            ctx.translate(isCustomStatic ? -screenCenterX : -cx, isCustomStatic ? -screenCenterY : -cy);
            
            if (selectedCharacter in PALETTES && selectedCharacter !== 'custom') {
                drawCharacterBase(ctx, selectedCharacter, selectedVariant, cx, cy, headRadius, yawX, pitchY);
            } else if (selectedCharacter === 'custom' && customImageEditor?.maskedImage) {
                if (isCustomStatic) ctx.drawImage(customImageEditor.maskedImage, screenCenterX - customBgDrawW/2, screenCenterY - customBgDrawH/2, customBgDrawW, customBgDrawH);
                else {
                    const hx = cx + yawX * 0.2; const hy = cy + pitchY * 0.2;
                    ctx.drawImage(customImageEditor.maskedImage, hx - customBgDrawW/2, hy - customBgDrawH/2, customBgDrawW, customBgDrawH);
                }
            }
            ctx.restore();

            let rEyeTargetX, rEyeTargetY, lEyeTargetX, lEyeTargetY, mTargetX, mTargetY;
            
            if (selectedCharacter === 'custom' && customImageEditor?.maskedImage) {
                const e1x = customSettings.e1x; const e1y = customSettings.e1y;
                const e2x = customSettings.e2x; const e2y = customSettings.e2y;
                const mx = customSettings.mx;   const my = customSettings.my;

                if (isCustomStatic) {
                    const imgLeft = screenCenterX - customBgDrawW/2; const imgTop = screenCenterY - customBgDrawH/2;
                    rEyeTargetX = imgLeft + e1x * customBgDrawW; rEyeTargetY = imgTop + e1y * customBgDrawH;
                    lEyeTargetX = imgLeft + e2x * customBgDrawW; lEyeTargetY = imgTop + e2y * customBgDrawH;
                    mTargetX = imgLeft + mx * customBgDrawW; mTargetY = imgTop + my * customBgDrawH;
                } else {
                    const hx = cx + yawX * 0.2; const hy = cy + pitchY * 0.2;
                    const rawPitchY = pitchY + (0.30 * headRadius * 1.2);
                    const parallaxX = yawX * 0.4; const parallaxY = rawPitchY * 0.4;
                    const pImgLeft = hx - customBgDrawW/2; const pImgTop = hy - customBgDrawH/2;

                    rEyeTargetX = pImgLeft + parallaxX + e1x * customBgDrawW; rEyeTargetY = pImgTop + parallaxY + e1y * customBgDrawH;
                    lEyeTargetX = pImgLeft + parallaxX + e2x * customBgDrawW; lEyeTargetY = pImgTop + parallaxY + e2y * customBgDrawH;
                    mTargetX = pImgLeft + parallaxX + mx * customBgDrawW; mTargetY = pImgTop + parallaxY + my * customBgDrawH;
                }
            } else {
                rEyeTargetX = surfaceX - headRadius * 0.35; rEyeTargetY = surfaceY - headRadius * 0.2;
                lEyeTargetX = surfaceX + headRadius * 0.35; lEyeTargetY = surfaceY - headRadius * 0.2;
                mTargetX = snoutX; mTargetY = snoutY + headRadius * 0.40;
            }

            const getRotatedPos = (targetX, targetY, isMouth = false, isEye = false) => {
                let posAngle = angle;
                if (isCustomStatic) posAngle = isMouth ? angle : (isEye ? (angle * 0.1) : 0);
                const pivotX = isCustomStatic ? screenCenterX : cx; const pivotY = isCustomStatic ? screenCenterY : cy;
                const dx = targetX - pivotX; const dy = targetY - pivotY;
                return { x: pivotX + dx * Math.cos(posAngle) - dy * Math.sin(posAngle), y: pivotY + dx * Math.sin(posAngle) + dy * Math.cos(posAngle) };
            };

            const rEyePos = getRotatedPos(rEyeTargetX, rEyeTargetY, false, true);
            const lEyePos = getRotatedPos(lEyeTargetX, lEyeTargetY, false, true);
            const mouthPos = getRotatedPos(mTargetX, mTargetY, true, false); 

            if (selectedCharacter !== 'custom' && selectedCharacter !== CORE_CHARACTER_ID) {
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(angle);
                ctx.translate(-cx, -cy);

                ctx.fillStyle = PALETTES[selectedCharacter][selectedVariant].snout;
                if (selectedCharacter === 'moose' || selectedCharacter === 'dog') {
                    ctx.beginPath(); ctx.ellipse(snoutX, snoutY, headRadius * 0.45 * noseScale, headRadius * 0.35 * noseScale, 0, 0, Math.PI * 2); ctx.fill();
                } else if (selectedCharacter === 'bird' || selectedCharacter === 'penguin') {
                    ctx.beginPath();
                    ctx.moveTo(snoutX - headRadius * 0.3 * noseScale, snoutY - headRadius * 0.1 * noseScale);
                    ctx.quadraticCurveTo(snoutX, snoutY + headRadius * 0.5 * noseScale, snoutX + headRadius * 0.3 * noseScale, snoutY - headRadius * 0.1 * noseScale);
                    ctx.quadraticCurveTo(snoutX, snoutY - headRadius * 0.2 * noseScale, snoutX - headRadius * 0.3 * noseScale, snoutY - headRadius * 0.1 * noseScale);
                    ctx.fill();
                } else {
                    ctx.beginPath(); ctx.arc(snoutX, snoutY, headRadius * 0.4 * noseScale, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }

            const eyeDrawAngle = isCustomStatic ? angle * 0.1 : angle; 
            const mouthDrawAngle = angle; 
            const finalEyeScale = globalScale * eyeScale * (isCustomStatic ? customStaticScaleMult : 1.0);
            const finalMouthScale = globalScale * mouthScale * (isCustomStatic ? customStaticScaleMult : 1.0);

            if (landmarks && globalScale > 0 && globalScale !== Infinity) {
                const skinColor = selectedCharacter === 'custom' ? '#ffffff' : PALETTES[selectedCharacter]?.[selectedVariant]?.base || '#fff';
                drawAlignedCutout(landmarks, RIGHT_EYE_CONTOUR, rEyePos.x, rEyePos.y, finalEyeScale, eyeDrawAngle, skinColor, null, 0.4);
                drawAlignedCutout(landmarks, LEFT_EYE_CONTOUR, lEyePos.x, lEyePos.y, finalEyeScale, eyeDrawAngle, skinColor, null, 0.4);
                drawAlignedCutout(landmarks, MOUTH_CONTOUR, mouthPos.x, mouthPos.y, finalMouthScale, mouthDrawAngle, skinColor, null, 1.0);
            }
            
            if (selectedCharacter !== 'custom' && selectedCharacter !== CORE_CHARACTER_ID && selectedCharacter !== 'bird' && selectedCharacter !== 'penguin') {
                ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle); ctx.translate(-cx, -cy);
                ctx.fillStyle = '#000';
                if (selectedCharacter === 'cat') {
                    ctx.beginPath(); ctx.moveTo(snoutX, snoutY - headRadius * 0.05 * noseScale); ctx.lineTo(snoutX - headRadius * 0.1 * noseScale, snoutY + headRadius * 0.05 * noseScale); ctx.lineTo(snoutX + headRadius * 0.1 * noseScale, snoutY + headRadius * 0.05 * noseScale); ctx.closePath(); ctx.fill();
                } else if (selectedCharacter === 'dog') {
                    ctx.beginPath(); ctx.roundRect(snoutX - headRadius * 0.15 * noseScale, snoutY - headRadius * 0.1 * noseScale, headRadius * 0.3 * noseScale, headRadius * 0.2 * noseScale, 8); ctx.fill();
                } else {
                    ctx.beginPath(); ctx.arc(snoutX, snoutY, headRadius * 0.15 * noseScale, 0, Math.PI * 2); ctx.fill();
                }
                ctx.restore();
            }
        }

        function init3DCanvasRenderer() {
            if (model3DEngine) return;
            const w = canvas.width || 512; const h = canvas.height || 512;
            model3DRenderCanvas = document.createElement('canvas');
            model3DEngine = new BABYLON.Engine(model3DRenderCanvas, true, {
                alpha: true,
                preserveDrawingBuffer: true,
                premultipliedAlpha: false
            });
            model3DEngine.setSize(w, h);
            model3DScene = new BABYLON.Scene(model3DEngine);
            model3DScene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
            model3DCamera = new BABYLON.FreeCamera('preview-camera', new BABYLON.Vector3(0, 0, 4), model3DScene);
            model3DCamera.fov = Math.PI / 4;
            model3DCamera.minZ = 0.1;
            model3DCamera.maxZ = 1000;
            model3DCamera.setTarget(BABYLON.Vector3.Zero());
            const ambientLight = new BABYLON.HemisphericLight('preview-ambient', new BABYLON.Vector3(0, 1, 0), model3DScene);
            ambientLight.diffuse = BABYLON.Color3.FromHexString("#fffaf5");
            ambientLight.groundColor = BABYLON.Color3.FromHexString("#a39b90");
            ambientLight.intensity = 1.2;
            const directionalLight = new BABYLON.DirectionalLight('preview-directional', new BABYLON.Vector3(-2, -4, -3), model3DScene);
            directionalLight.diffuse = BABYLON.Color3.FromHexString("#fffaf5");
            directionalLight.position.set(2, 4, 3);
            directionalLight.intensity = 0.8;
        }

        function render3DScene() {
            model3DScene.render();
            ctx.drawImage(model3DRenderCanvas, 0, 0, canvas.width, canvas.height);
        }

        function clearLoaded3DModel() {
            clearLivePlanes();
            if (model3DAssetContainer) {
                model3DAssetContainer.rootNodes.forEach(rootNode => {
                    if (rootNode.parent === loadedModelRoot) rootNode.parent = null;
                });
                model3DAssetContainer.dispose();
                model3DAssetContainer = null;
            }
            if (loadedModelRoot) {
                loadedModelRoot.dispose(false, true);
                loadedModelRoot = null;
            }
        }

        function loadAssetContainer(modelPath) {
            const url = new URL(modelPath, document.baseURI);
            const pathSeparator = url.href.lastIndexOf('/') + 1;
            return BABYLON.SceneLoader.LoadAssetContainerAsync(
                url.href.slice(0, pathSeparator),
                url.href.slice(pathSeparator),
                model3DScene
            );
        }

        function loadProceduralTest3DModel(openStudio = true) {
            init3DCanvasRenderer();
            reset3DFeatureOffsets();
            accessoryManager.resetRig();
            clearLoaded3DModel();
            rigBonesByName = new Map();
            const root = new BABYLON.TransformNode("AvatarRoot", model3DScene);
            root.position.y = -1.2;
            root.baseY = -1.2;
            loadedModelRoot = root;

            const spine0 = new BABYLON.TransformNode("spine_0", model3DScene);
            spine0.parent = root;
            const spineMat = new BABYLON.StandardMaterial("procedural-spine-material", model3DScene);
            spineMat.diffuseColor = BABYLON.Color3.FromHexString("#3b82f6");
            const spine0Mesh = BABYLON.MeshBuilder.CreateBox("spine-0-mesh", { width: 0.9, height: 0.7, depth: 0.5 }, model3DScene);
            spine0Mesh.position.y = 0.35;
            spine0Mesh.material = spineMat;
            spine0Mesh.parent = spine0;

            const spine1 = new BABYLON.TransformNode("spine_1", model3DScene);
            spine1.position.y = 0.7;
            spine1.parent = spine0;
            const spine1Mesh = BABYLON.MeshBuilder.CreateBox("spine-1-mesh", { width: 0.8, height: 0.6, depth: 0.45 }, model3DScene);
            spine1Mesh.position.y = 0.3;
            spine1Mesh.material = spineMat;
            spine1Mesh.parent = spine1;

            const neck = new BABYLON.TransformNode("neck", model3DScene);
            neck.position.y = 0.6;
            neck.parent = spine1;
            const neckMat = new BABYLON.StandardMaterial("procedural-neck-material", model3DScene);
            neckMat.diffuseColor = BABYLON.Color3.FromHexString("#fca5a5");
            const neckMesh = BABYLON.MeshBuilder.CreateCylinder("neck-mesh", { height: 0.4, diameter: 0.3, tessellation: 16 }, model3DScene);
            neckMesh.position.y = 0.2;
            neckMesh.material = neckMat;
            neckMesh.parent = neck;

            const head = new BABYLON.TransformNode("head", model3DScene);
            head.position.y = 0.4;
            head.parent = neck;
            const headMat = new BABYLON.StandardMaterial("procedural-head-material", model3DScene);
            headMat.diffuseColor = BABYLON.Color3.FromHexString("#60a5fa");
            const headMesh = BABYLON.MeshBuilder.CreateSphere("head-mesh", { diameter: 1.4, segments: 32 }, model3DScene);
            headMesh.material = headMat;
            headMesh.parent = head;

            const leftEyeBone = new BABYLON.TransformNode("eye_left", model3DScene);
            leftEyeBone.position.set(-0.25, 0.15, 0.65);
            leftEyeBone.parent = head;
            const rightEyeBone = new BABYLON.TransformNode("eye_right", model3DScene);
            rightEyeBone.position.set(0.25, 0.15, 0.65);
            rightEyeBone.parent = head;
            const mouthBone = new BABYLON.TransformNode("mouth", model3DScene);
            mouthBone.position.set(0, -0.25, 0.65);
            mouthBone.parent = head;

            modelBones = { spine_0: spine0, spine_1: spine1, neck, head, eye_left: leftEyeBone, eye_right: rightEyeBone, mouth: mouthBone };
            rigBonesByName = new Map(Object.values(modelBones).map(bone => [bone.name.toLowerCase(), bone]));
            Object.values(modelBones).forEach(bone => {
                bone.initRotationQuaternion = bone.rotationQuaternion?.clone()
                    ?? BABYLON.Quaternion.FromEulerVector(bone.rotation);
            });

            if(modelBones.eye_left) createLivePlane(modelBones.eye_left, 'eye_left');
            if(modelBones.eye_right) createLivePlane(modelBones.eye_right, 'eye_right');
            if(modelBones.mouth) createLivePlane(modelBones.mouth, 'mouth');

            customSettings.is3D = true; customSettings.isStatic = false;
            if (openStudio) {
                document.getElementById('custom-status').style.display = 'none';
                document.getElementById('custom-controls').classList.add('hidden'); document.getElementById('custom-controls').classList.remove('flex');
                document.getElementById('panel-3d-adjust').classList.remove('hidden'); document.getElementById('panel-3d-adjust').classList.add('flex');
                btnCustomSave.classList.remove('opacity-50', 'pointer-events-none');
                guides.forEach(g => g.classList.add('hidden'));
            }
            isPreviewing3D = openStudio;
            if (openStudio) render3DStudioPreview();
            else if (!camera.isActive) drawScene();
        }

        function loadTest3DModel(openStudio = true) {
            init3DCanvasRenderer();
            const loadToken = ++coreLoadToken;
            accessoryManager.resetRig();
            loadAssetContainer('models/core/character.glb').then(assetContainer => {
                if (loadToken !== coreLoadToken || (!openStudio && selectedCharacter !== CORE_CHARACTER_ID)) {
                    accessoryManager.disposeModelResources(assetContainer);
                    return;
                }
                initializeLoaded3DModel(assetContainer, openStudio, !openStudio, CORE_CHARACTER_ID);
            }).catch(error => {
                if (loadToken !== coreLoadToken || (!openStudio && selectedCharacter !== CORE_CHARACTER_ID)) return;
                console.error("Core character model failed to load:", error);
                loadProceduralTest3DModel(openStudio);
                if (selectedCharacter === CORE_CHARACTER_ID) {
                    accessoryManager.setStatus("The core character rig could not be loaded; accessories are unavailable.");
                }
            });
        }

        function initializeLoaded3DModel(assetContainer, openStudio = true, isCoreModel = false, characterId = null) {
            reset3DFeatureOffsets();
            accessoryManager.resetRig();
            clearLoaded3DModel();
            model3DAssetContainer = assetContainer;
            model3DAssetContainer.addAllToScene();
            loadedModelRoot = new BABYLON.TransformNode("loaded-model-root", model3DScene);
            loadedModelRoot.baseY = 0;
            model3DAssetContainer.rootNodes.forEach(rootNode => loadedModelRoot.addChild(rootNode));

            modelBones = {};
            rigBonesByName = new Map();
            const candidateNodes = new Set();
            model3DAssetContainer.transformNodes.forEach(node => {
                if (node === loadedModelRoot || node.isDescendantOf(loadedModelRoot)) candidateNodes.add(node);
            });
            model3DAssetContainer.meshes.forEach(mesh => {
                if (mesh.isDescendantOf(loadedModelRoot)) candidateNodes.add(mesh);
            });
            model3DAssetContainer.skeletons.forEach(skeleton => skeleton.bones.forEach(bone => {
                const linkedNode = bone.getTransformNode();
                if (linkedNode) candidateNodes.add(linkedNode);
                const normalizedName = bone.name?.trim().toLowerCase();
                if (normalizedName && linkedNode && !rigBonesByName.has(normalizedName)) rigBonesByName.set(normalizedName, linkedNode);
            }));

            candidateNodes.forEach(child => {
                if (!child.name) return;
                const normalizedName = child.name.trim().toLowerCase();
                if (!rigBonesByName.has(normalizedName)) rigBonesByName.set(normalizedName, child);
                if (normalizedName.includes('spine_0') || normalizedName === 'spine0') modelBones.spine_0 = child;
                else if (normalizedName.includes('spine_1') || normalizedName === 'spine1') modelBones.spine_1 = child;
                else if (normalizedName.includes('neck')) modelBones.neck = child;
                else if (normalizedName.includes('head')) modelBones.head = child;
                else if (normalizedName.includes('eye_left') || normalizedName.includes('lefteye') || normalizedName === 'eye.l') modelBones.eye_left = child;
                else if (normalizedName.includes('eye_right') || normalizedName.includes('righteye') || normalizedName === 'eye.r') modelBones.eye_right = child;
                else if (normalizedName.includes('mouth') || normalizedName.includes('jaw') || normalizedName.includes('lip')) modelBones.mouth = child;
            });

            if (!modelBones.head) {
                modelBones.head = model3DAssetContainer.skeletons
                    .flatMap(skeleton => skeleton.bones)
                    .map(bone => bone.getTransformNode())
                    .find(Boolean);
                if (!modelBones.head) {
                    modelBones.head = new BABYLON.TransformNode("head-fallback", model3DScene);
                    modelBones.head.position.y = 1;
                    modelBones.head.parent = loadedModelRoot;
                }
            }

            if (!modelBones.eye_left) {
                modelBones.eye_left = new BABYLON.TransformNode("eye_left_virtual", model3DScene);
                modelBones.eye_left.position.set(-0.25, 0.15, 0.65);
                modelBones.eye_left.parent = modelBones.head;
            }
            if (!modelBones.eye_right) {
                modelBones.eye_right = new BABYLON.TransformNode("eye_right_virtual", model3DScene);
                modelBones.eye_right.position.set(0.25, 0.15, 0.65);
                modelBones.eye_right.parent = modelBones.head;
            }
            if (!modelBones.mouth) {
                modelBones.mouth = new BABYLON.TransformNode("mouth_virtual", model3DScene);
                modelBones.mouth.position.set(0, -0.25, 0.65);
                modelBones.mouth.parent = modelBones.head;
            }
            [modelBones.eye_left, modelBones.eye_right, modelBones.mouth].forEach(bone => {
                if (!rigBonesByName.has(bone.name.toLowerCase())) rigBonesByName.set(bone.name.toLowerCase(), bone);
            });

            Object.values(modelBones).forEach(bone => {
                if (bone) {
                    bone.initRotationQuaternion = bone.rotationQuaternion?.clone()
                        ?? BABYLON.Quaternion.FromEulerVector(bone.rotation);
                }
            });

            if(modelBones.eye_left) createLivePlane(modelBones.eye_left, 'eye_left');
            if(modelBones.eye_right) createLivePlane(modelBones.eye_right, 'eye_right');
            if(modelBones.mouth) createLivePlane(modelBones.mouth, 'mouth');

            accessoryManager.setRig(loadedModelRoot, rigBonesByName, isCoreModel ? characterId : null);
            customSettings.is3D = true; customSettings.isStatic = false;
            if (openStudio) {
                document.getElementById('custom-status').style.display = 'none';
                document.getElementById('custom-controls').classList.add('hidden'); document.getElementById('custom-controls').classList.remove('flex');
                document.getElementById('panel-3d-adjust').classList.remove('hidden'); document.getElementById('panel-3d-adjust').classList.add('flex');
                btnCustomSave.classList.remove('opacity-50', 'pointer-events-none');
                guides.forEach(g => g.classList.add('hidden'));
            }
            isPreviewing3D = openStudio;
            if (openStudio) render3DStudioPreview();
            else if (!camera.isActive) drawScene();
        }

        function load3DModelFile(file) {
            init3DCanvasRenderer();
            coreLoadToken++;
            accessoryManager.resetRig();
            BABYLON.SceneLoader.LoadAssetContainerAsync("", file, model3DScene).then(assetContainer => {
                initializeLoaded3DModel(assetContainer, true, false);
            }).catch(error => {
                console.error("Could not load custom 3D model:", error);
                alert('Could not parse GLB/GLTF model.');
            });
        }

        function update3DModelRigging(landmarks, roll, yaw, pitch, cx, cy, pitchAxisScale) {
            if (!modelBones.head) return 0;
            
            const targetYaw = yaw / 150; const targetPitch = (pitch / 100) * pitchAxisScale; const targetRoll = roll;
            const now = performance.now();
            const smoothedYaw = smoothHeadRotation(headRotationFilters.yaw, targetYaw, now);
            const smoothedPitch = smoothHeadRotation(headRotationFilters.pitch, targetPitch, now);
            const smoothedRoll = smoothHeadRotation(headRotationFilters.roll, targetRoll, now, true);

            const totalYaw = smoothedYaw * 1.0;
            const totalPitch = smoothedPitch * 0.8;
            const totalRoll = -smoothedRoll * 2.0;

            let swayPitch = 0;

            if (loadedModelRoot && cx !== undefined && cy !== undefined) {
                const screenDx = (cx - canvas.width / 2) / canvas.width;
                const screenDy = (cy - canvas.height / 2) / canvas.height;
                const aspect = canvas.width / canvas.height;
                const frustumHeight = 2 * Math.tan(model3DCamera.fov / 2) * model3DCamera.position.z;
                const frustumWidth = frustumHeight * aspect;
                
                const targetTransX = -screenDx * frustumWidth;
                const targetTransY = -screenDy * frustumHeight;

                let targetTransZ = 0;
                if (neutralHeadZ !== null && currentHeadZ !== 0) {
                    const deltaZ = currentHeadZ - neutralHeadZ;
                    // deltaZ > 0 when user moves closer to the camera
                    targetTransZ = Math.max(-1.5, Math.min(1.5, deltaZ * 0.04));
                }
                
                if (loadedModelRoot.tx === undefined) { 
                    loadedModelRoot.tx = 0; 
                    loadedModelRoot.ty = 0; 
                    loadedModelRoot.tz = 0; 
                }
                loadedModelRoot.tx += (targetTransX - loadedModelRoot.tx) * 0.4;
                loadedModelRoot.ty += (targetTransY - loadedModelRoot.ty) * 0.4;
                loadedModelRoot.tz += (targetTransZ - loadedModelRoot.tz) * 0.3;
                loadedModelRoot.position.x = loadedModelRoot.tx;
                loadedModelRoot.position.y = loadedModelRoot.baseY + loadedModelRoot.ty;
                loadedModelRoot.position.z = loadedModelRoot.tz;

                swayPitch = -screenDy * 1.0;
            }

            const wSpine0 = 0.10; const wSpine1 = 0.20; const wNeck = 0.30; const wHead = 0.40;

            if (modelBones.spine_0) {
                setTrackedRotation(
                    modelBones.spine_0,
                    totalYaw * wSpine0,
                    totalPitch * wSpine0 + swayPitch * 0.5,
                    totalRoll * wSpine0
                );
            }
            if (modelBones.spine_1) {
                setTrackedRotation(
                    modelBones.spine_1,
                    totalYaw * wSpine1,
                    totalPitch * wSpine1 + swayPitch * 0.5,
                    totalRoll * wSpine1
                );
            }
            if (modelBones.neck) {
                setTrackedRotation(
                    modelBones.neck,
                    totalYaw * wNeck,
                    totalPitch * wNeck - swayPitch * 0.2,
                    totalRoll * wNeck
                );
            }
            if (modelBones.head) {
                setTrackedRotation(modelBones.head, totalYaw * wHead, totalPitch * wHead, totalRoll * wHead);
            }

            if (modelBones.eye_left && modelBones.eye_right) {
                const eyeGazeYaw = totalYaw * 0.05; 
                setTrackedRotation(modelBones.eye_left, eyeGazeYaw, 0, 0);
                setTrackedRotation(modelBones.eye_right, eyeGazeYaw, 0, 0);
            }
            return smoothedRoll;
        }

        function drawAlignedCutout(landmarks, indices, targetX, targetY, scale, rollAngle, skinColor, anchorPt = null, featherScale = 1.0, flipHorizontal = false) {
            const vw = video.videoWidth; const vh = video.videoHeight;
            let minX = 1, maxX = 0, minY = 1, maxY = 0;
            indices.forEach(idx => {
                const pt = landmarks[idx];
                if(pt.x < minX) minX = pt.x; if(pt.x > maxX) maxX = pt.x;
                if(pt.y < minY) minY = pt.y; if(pt.y > maxY) maxY = pt.y;
            });
            let anchorX = (minX + maxX) / 2; let anchorY = (minY + maxY) / 2;
            if (anchorPt) { anchorX = anchorPt.x; anchorY = anchorPt.y; }
            
            ctx.save(); ctx.translate(targetX, targetY); ctx.rotate(rollAngle);
            if (flipHorizontal) ctx.scale(-1, 1);
            
            ctx.beginPath();
            indices.forEach((idx, i) => {
                const pt = landmarks[idx];
                const dx = ((1.0 - pt.x) - (1.0 - anchorX)) * vw * scale;
                const dy = (pt.y - anchorY) * vh * scale;
                if (i === 0) ctx.moveTo(dx, dy); else ctx.lineTo(dx, dy);
            });
            ctx.closePath(); ctx.clip(); ctx.scale(-1, 1);
            const drawW = vw * scale; const drawH = vh * scale;
            ctx.drawImage(video, -anchorX * drawW, -anchorY * drawH, drawW, drawH);
            ctx.scale(-1, 1);
            
            if (selectedCharacter !== 'custom') {
                ctx.lineWidth = 15 * featherScale; ctx.strokeStyle = skinColor; ctx.shadowColor = skinColor; ctx.shadowBlur = 10 * featherScale; ctx.stroke();
                ctx.lineWidth = 8 * featherScale; ctx.stroke();
            }
            ctx.restore();
        }

        function drawPIPVisualizer(landmarks) {
            pipCtx.clearRect(0, 0, pipCanvas.width, pipCanvas.height);
            if(!landmarks) return;
            const drawContour = (indices, color) => {
                pipCtx.beginPath();
                indices.forEach((idx, i) => {
                    const pt = landmarks[idx];
                    const x = pt.x * pipCanvas.width; const y = pt.y * pipCanvas.height;
                    if (i === 0) pipCtx.moveTo(x, y); else pipCtx.lineTo(x, y);
                });
                pipCtx.closePath(); pipCtx.strokeStyle = color; pipCtx.lineWidth = 2; pipCtx.setLineDash([5, 5]); pipCtx.stroke(); pipCtx.setLineDash([]);
            };
            drawContour(LEFT_EYE_CONTOUR, '#06b6d4'); drawContour(RIGHT_EYE_CONTOUR, '#06b6d4'); drawContour(MOUTH_CONTOUR, '#ec4899');
        }

        const btnBear = document.getElementById('btn-bear');
        const btnCat = document.getElementById('btn-cat');
        const btnMoose = document.getElementById('btn-moose');
        const btnDog = document.getElementById('btn-dog');
        const btnBird = document.getElementById('btn-bird');
        const btnPenguin = document.getElementById('btn-penguin');
        const btnCowboy = document.getElementById('btn-cowboy');
        const btnCharacterMode2D = document.getElementById('btn-character-mode-2d');
        const btnCharacterMode3D = document.getElementById('btn-character-mode-3d');
        const characterList2D = document.getElementById('character-list-2d');
        const characterList3D = document.getElementById('character-list-3d');
        const btnCustomTrig = document.getElementById('btn-custom-trigger');
        const btnLoadTest3D = document.getElementById('btn-load-test-3d');
        const selectVariant = document.getElementById('select-variant');

        function setCharacterMode(mode) {
            const is3DMode = mode === '3d';
            characterList2D.classList.toggle('hidden', is3DMode);
            characterList3D.classList.toggle('hidden', !is3DMode);
            btnCharacterMode2D.setAttribute('aria-selected', String(!is3DMode));
            btnCharacterMode3D.setAttribute('aria-selected', String(is3DMode));
            btnCharacterMode2D.className = is3DMode
                ? 'bg-slate-100 text-slate-500 rounded-xl py-2 text-xs font-bold transition active:scale-95'
                : 'bg-indigo-500 text-white rounded-xl py-2 text-xs font-bold shadow-sm transition active:scale-95';
            btnCharacterMode3D.className = is3DMode
                ? 'bg-indigo-500 text-white rounded-xl py-2 text-xs font-bold shadow-sm transition active:scale-95'
                : 'bg-slate-100 text-slate-500 rounded-xl py-2 text-xs font-bold transition active:scale-95';
        }

        btnCharacterMode2D.addEventListener('click', () => setCharacterMode('2d'));
        btnCharacterMode3D.addEventListener('click', () => setCharacterMode('3d'));

        function updateCharacterSelection(activeChar) {
            if (activeChar !== selectedCharacter) {
                coreLoadToken++;
                accessoryManager.resetRig();
            }
            selectedCharacter = activeChar;
            accessoryManager.rebuildSelectors();
            [btnBear, btnCat, btnMoose, btnDog, btnBird, btnPenguin, btnCowboy, btnCustomTrig].forEach(btn => {
                if (btn.id === 'btn-custom-trigger') btn.className = 'w-full bg-indigo-50 text-indigo-500 rounded-2xl p-2.5 flex items-center justify-center gap-2 border-2 border-dashed border-indigo-200 transition active:scale-95 hover:bg-indigo-100';
                else btn.className = 'bg-slate-100 text-slate-500 rounded-2xl p-2.5 flex flex-col items-center border-2 border-transparent transition active:scale-95';
            });
            const characterButtons = { bear: btnBear, cat: btnCat, moose: btnMoose, dog: btnDog, bird: btnBird, penguin: btnPenguin };
            const activeClasses = {
                bear: 'bg-blue-100 text-blue-600 rounded-2xl p-2.5 flex flex-col items-center border-2 border-blue-200 shadow-sm transition active:scale-95',
                cat: 'bg-orange-100 text-orange-600 rounded-2xl p-2.5 flex flex-col items-center border-2 border-orange-200 shadow-sm transition active:scale-95',
                moose: 'bg-amber-100 text-amber-800 rounded-2xl p-2.5 flex flex-col items-center border-2 border-amber-300 shadow-sm transition active:scale-95',
                dog: 'bg-yellow-100 text-yellow-800 rounded-2xl p-2.5 flex flex-col items-center border-2 border-yellow-300 shadow-sm transition active:scale-95',
                bird: 'bg-sky-100 text-sky-600 rounded-2xl p-2.5 flex flex-col items-center border-2 border-sky-300 shadow-sm transition active:scale-95',
                penguin: 'bg-slate-200 text-slate-800 rounded-2xl p-2.5 flex flex-col items-center border-2 border-slate-400 shadow-sm transition active:scale-95'
            };
            if (characterButtons[activeChar]) characterButtons[activeChar].className = activeClasses[activeChar];
            if (activeChar === CORE_CHARACTER_ID) btnCowboy.className = 'bg-amber-100 text-amber-800 rounded-2xl p-2.5 flex flex-col items-center border-2 border-amber-300 shadow-sm transition active:scale-95';
            if (activeChar === 'custom') btnCustomTrig.className = 'w-full bg-indigo-500 text-white rounded-2xl p-2.5 flex items-center justify-center gap-2 border-2 border-indigo-600 shadow-md transition active:scale-95';
            
            selectedVariant = savedVariants[activeChar] || 0; selectVariant.value = selectedVariant; selectVariant.disabled = (activeChar === 'custom' || activeChar === CORE_CHARACTER_ID);
            if(!camera.isActive) drawScene();
        }

        const characterButtons = { bear: btnBear, cat: btnCat, moose: btnMoose, dog: btnDog, bird: btnBird, penguin: btnPenguin };
        Object.entries(characterButtons).forEach(([character, button]) => {
            button.onclick = () => updateCharacterSelection(character);
        });
        btnCowboy.onclick = () => {
            updateCharacterSelection(CORE_CHARACTER_ID);
            loadTest3DModel(false);
        };
        btnLoadTest3D.onclick = () => loadTest3DModel();

        selectVariant.addEventListener('change', (e) => { selectedVariant = parseInt(e.target.value); savedVariants[selectedCharacter] = selectedVariant; if(!camera.isActive) drawScene(); });
        sliderEyes.addEventListener('input', (e) => { eyeScale = parseFloat(e.target.value); if(!camera.isActive) drawScene(); });
        sliderNose.addEventListener('input', (e) => { noseScale = parseFloat(e.target.value); if(!camera.isActive) drawScene(); });
        sliderMouth.addEventListener('input', (e) => { mouthScale = parseFloat(e.target.value); if(!camera.isActive) drawScene(); });
        btnRecenter.addEventListener('click', () => { requestRecenter = true; });

        btnTogglePip.addEventListener('click', () => {
            showPip = !showPip;
            if (showPip) {
                if (camera.isActive) pipContainer.classList.remove('opacity-0', 'pointer-events-none');
                btnTogglePip.textContent = 'Hide Live Feed'; btnTogglePip.classList.replace('text-slate-500', 'text-emerald-500'); btnTogglePip.classList.replace('bg-slate-100', 'bg-emerald-50'); btnTogglePip.classList.replace('border-slate-200', 'border-emerald-100');
            } else {
                pipContainer.classList.add('opacity-0', 'pointer-events-none');
                btnTogglePip.textContent = 'Show Live Feed'; btnTogglePip.classList.replace('text-emerald-500', 'text-slate-500'); btnTogglePip.classList.replace('bg-emerald-50', 'bg-slate-100'); btnTogglePip.classList.replace('border-emerald-100', 'border-slate-200');
            }
        });

        const modalCustom = document.getElementById('modal-custom');
        const custom3DInput = document.getElementById('custom-3d-file');
        const customPreviewCanvas = document.getElementById('custom-preview-canvas');
        const customStatus = document.getElementById('custom-status');
        const customControls = document.getElementById('custom-controls');
        
        const cStatic = document.getElementById('c-static');
        
        const c3dCamZ = document.getElementById('c3d-cam-z'); const c3dCamY = document.getElementById('c3d-cam-y');
        const c3dModelScale = document.getElementById('c3d-model-scale');
        const c3dFeatureOffsets = {
            eye_left: ['x', 'y', 'z'].map(axis => document.getElementById(`c3d-eye-left-${axis}`)),
            eye_right: ['x', 'y', 'z'].map(axis => document.getElementById(`c3d-eye-right-${axis}`)),
            mouth: ['x', 'y', 'z'].map(axis => document.getElementById(`c3d-mouth-${axis}`))
        };
        const c3dCurveHorizontal = document.getElementById('c3d-curve-horizontal');
        const c3dCurveVertical = document.getElementById('c3d-curve-vertical');
        function reset3DFeatureOffsets() {
            Object.values(c3dFeatureOffsets).flat().forEach(slider => { slider.value = '0'; });
        }
        const btnResetOrbit = document.getElementById('btn-reset-orbit'); const panel3dAdjust = document.getElementById('panel-3d-adjust');

        const btnCustomCancel = document.getElementById('btn-custom-cancel'); const btnCustomSave = document.getElementById('btn-custom-save');
        const guides = [document.getElementById('guide-e1'), document.getElementById('guide-e2'), document.getElementById('guide-mouth')];
        customImageEditor = createCustomCharacterEditor({
            camera,
            customSettings,
            onImageLoaded: () => { isPreviewing3D = false; }
        });

        btnCustomTrig.addEventListener('click', () => {
            modalCustom.classList.remove('hidden'); modalCustom.classList.add('flex');
            if(customSettings.is3D) {
                customControls.classList.add('hidden'); customControls.classList.remove('flex');
                panel3dAdjust.classList.remove('hidden'); panel3dAdjust.classList.add('flex');
                guides.forEach(g => g.classList.add('hidden'));
                btnCustomSave.classList.remove('opacity-50', 'pointer-events-none');
                isPreviewing3D = true; render3DStudioPreview();
            } else if (customImageEditor.maskedImage) {
                customControls.classList.remove('hidden'); customControls.classList.add('flex');
                panel3dAdjust.classList.add('hidden'); panel3dAdjust.classList.remove('flex');
                guides.forEach(g => g.classList.remove('hidden'));
                btnCustomSave.classList.remove('opacity-50', 'pointer-events-none');
                customImageEditor.updatePreview();
            } else {
                customStatus.style.display = 'block';
                customControls.classList.add('hidden'); customControls.classList.remove('flex');
                panel3dAdjust.classList.add('hidden'); panel3dAdjust.classList.remove('flex');
            }
        });

        btnCustomCancel.addEventListener('click', () => { modalCustom.classList.add('hidden'); modalCustom.classList.remove('flex'); isPreviewing3D = false; });

        custom3DInput.addEventListener('change', async (e) => { if (!e.target.files[0]) return; load3DModelFile(e.target.files[0]); e.target.value = ''; });

        Object.values(c3dFeatureOffsets).flat().forEach(el => el.addEventListener('input', render3DStudioPreview));
        [c3dCurveHorizontal, c3dCurveVertical].forEach(slider => slider.addEventListener('input', () => {
            Object.values(livePlanes).forEach(updateLivePlaneCurvature);
        }));

        function render3DStudioPreview() {
            if (!isPreviewing3D || !model3DEngine || !model3DScene || !model3DCamera) return;
            
            if (loadedModelRoot) { 
                const s = c3dModelScale ? parseFloat(c3dModelScale.value) : 1.0; 
                loadedModelRoot.scaling.set(s, s, s);
                loadedModelRoot.rotation.y = orbitAngleX;
                loadedModelRoot.rotation.x = orbitAngleY;
            }
            
            Object.entries(c3dFeatureOffsets).forEach(([name, sliders]) => {
                const plane = livePlanes[name];
                if (plane) plane.mesh.position.set(...sliders.map(slider => parseFloat(slider.value)));
            });

            model3DCamera.position.z = parseFloat(c3dCamZ.value); 
            model3DCamera.position.y = parseFloat(c3dCamY.value); 
            model3DCamera.setTarget(new BABYLON.Vector3(0, parseFloat(c3dCamY.value), 0));

            render3DScene();

            // Draw the WebGL renderer output onto the modal's 2D canvas
            const cvs = customPreviewCanvas;
            const ctxC = cvs.getContext('2d');
            if (cvs.width !== cvs.offsetWidth || cvs.height !== cvs.offsetHeight) {
                cvs.width = cvs.offsetWidth;
                cvs.height = cvs.offsetHeight;
            }
            ctxC.clearRect(0, 0, cvs.width, cvs.height);
            ctxC.drawImage(model3DRenderCanvas, 0, 0, cvs.width, cvs.height);

            // Loop the preview to reflect live slider and orbital camera changes
            requestAnimationFrame(render3DStudioPreview);
        }

        customPreviewCanvas.addEventListener('mousedown', (e) => {
            if(!isPreviewing3D) return; 
            isDraggingOrbit = true; 
            lastMouseX = e.clientX; 
            lastMouseY = e.clientY; 
        });

        window.addEventListener('mousemove', (e) => {
            if(!isDraggingOrbit || !isPreviewing3D) return;
            orbitAngleX += (e.clientX - lastMouseX) * 0.01; 
            orbitAngleY = Math.max(-Math.PI/2, Math.min(Math.PI/2, orbitAngleY + (e.clientY - lastMouseY) * 0.01));
            lastMouseX = e.clientX; 
            lastMouseY = e.clientY;
        });

        window.addEventListener('mouseup', () => { isDraggingOrbit = false; });
        
        customPreviewCanvas.addEventListener('touchstart', (e) => { if(!isPreviewing3D) return; isDraggingOrbit = true; lastMouseX = e.touches[0].clientX; lastMouseY = e.touches[0].clientY; }, {passive: true});
        window.addEventListener('touchmove', (e) => {
            if(!isDraggingOrbit || !isPreviewing3D) return;
            orbitAngleX += (e.touches[0].clientX - lastMouseX) * 0.01; orbitAngleY = Math.max(-Math.PI/2, Math.min(Math.PI/2, orbitAngleY + (e.touches[0].clientY - lastMouseY) * 0.01));
            lastMouseX = e.touches[0].clientX; lastMouseY = e.touches[0].clientY;
        }, {passive: true});
        window.addEventListener('touchend', () => { isDraggingOrbit = false; });

        btnResetOrbit.addEventListener('click', () => { orbitAngleX = 0; orbitAngleY = 0; });

        btnCustomSave.addEventListener('click', () => {
            const featureInputs = customImageEditor.featureInputs;
            customSettings.e1x = parseFloat(featureInputs.leftEyeX.value); customSettings.e1y = parseFloat(featureInputs.leftEyeY.value);
            customSettings.e2x = parseFloat(featureInputs.rightEyeX.value); customSettings.e2y = parseFloat(featureInputs.rightEyeY.value);
            customSettings.mx = parseFloat(featureInputs.mouthX.value); customSettings.my = parseFloat(featureInputs.mouthY.value);
            customSettings.isStatic = cStatic.checked;
            
            if (customSettings.is3D && model3DCamera) {
                model3DCamera.position.z = parseFloat(c3dCamZ.value);
                model3DCamera.position.y = parseFloat(c3dCamY.value);
                model3DCameraBaseZ = model3DCamera.position.z;
                model3DCameraBaseY = model3DCamera.position.y;
                model3DCamera.setTarget(new BABYLON.Vector3(0, model3DCameraBaseY, 0));
            }
            if (loadedModelRoot) { loadedModelRoot.rotation.x = 0; loadedModelRoot.rotation.y = 0; }
            orbitAngleX = 0; orbitAngleY = 0;

            modalCustom.classList.add('hidden'); modalCustom.classList.remove('flex'); isPreviewing3D = false;
            updateCharacterSelection('custom'); resizeCanvases(); 
        });

        setupRecording({ canvas, getAudioStream: () => camera.audioStream, isCameraActive: () => camera.isActive, setStatus });

        fullscreen = setupFullscreen({ resizeCanvases });
        accessoryManager.loadCatalog();

        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && camera.isActive) { if (video.paused) video.play().catch(()=>{}); if (pipVideo.paused) pipVideo.play().catch(()=>{}); } });

        document.addEventListener('DOMContentLoaded', () => { resizeCanvases(); drawScene(); camera.initializeEngine(); });
