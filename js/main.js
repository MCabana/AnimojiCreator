        import * as THREE from "three";
        import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";
        import { PALETTES, drawCharacterBase } from "./characters.js";
        import { setupCamera } from "./camera.js";
        import { setupRecording } from "./recording.js";
        import { setupFullscreen } from "./fullscreen.js";
        import { createCustomCharacterEditor } from "./custom-character-editor.js";
        import { createPreviewBackground } from "./preview-background.js";
        import { createAccessoryManager } from "./accessory-manager.js";
        import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
        import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

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
        const backgroundLightingMatch = document.getElementById('background-lighting-match');
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
        let neutralFaceAspectRatio = null;
        let requestRecenter = false;

        let customBgDrawW = 256;
        let customBgDrawH = 256;
        let customStaticScaleMult = 1.0;
        let model3DRenderer = null;
        let model3DScene = null;
        let model3DCamera = null;
        let model3DEnvironment = null;
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

        function clearLivePlanes() {
            Object.values(livePlanes).forEach(plane => {
                if (plane.mesh && plane.mesh.parent) plane.mesh.parent.remove(plane.mesh);
                if (plane.anchor && plane.anchor.parent) plane.anchor.parent.remove(plane.anchor);
                if (plane.texture) plane.texture.dispose();
                if (plane.mesh.material) plane.mesh.material.dispose();
                if (plane.mesh.geometry) plane.mesh.geometry.dispose();
            });
            livePlanes = {};
        }

        function createLivePlane(bone, name) {
            const cvs = document.createElement('canvas');
            cvs.width = 256; cvs.height = 256;
            
            const ctxC = cvs.getContext('2d');
            ctxC.fillStyle = name === 'mouth' ? 'rgba(239, 68, 68, 0.8)' : 'rgba(59, 130, 246, 0.8)';
            ctxC.beginPath();
            if (name === 'mouth') ctxC.ellipse(128, 128, 80, 40, 0, 0, Math.PI * 2);
            else ctxC.ellipse(128, 128, 40, 60, 0, 0, Math.PI * 2);
            ctxC.fill();

            const tex = new THREE.CanvasTexture(cvs);
            tex.colorSpace = THREE.SRGBColorSpace;
            const mat = new THREE.MeshLambertMaterial({
                map: tex,
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false,
                alphaTest: 0.01
            });
            
            const geo = new THREE.PlaneGeometry(0.5, 0.5, 16, 16);

            const mesh = new THREE.Mesh(geo, mat);

            const anchor = new THREE.Group();
            bone.updateWorldMatrix(true, false);
            const worldQuat = new THREE.Quaternion();
            bone.getWorldQuaternion(worldQuat);
            anchor.quaternion.copy(worldQuat.invert());

            anchor.add(mesh);
            bone.add(anchor);
            
            livePlanes[name] = { canvas: cvs, texture: tex, mesh: mesh, anchor: anchor };
            updateLivePlaneCurvature(livePlanes[name]);
        }

        function updateLivePlaneCurvature(plane) {
            const horizontalBend = parseFloat(c3dCurveHorizontal.value);
            const verticalBend = parseFloat(c3dCurveVertical.value);
            const positions = plane.mesh.geometry.attributes.position;
            for (let i = 0; i < positions.count; i++) {
                const x = positions.getX(i);
                const y = positions.getY(i);
                positions.setZ(i, -(horizontalBend * x * x + verticalBend * y * y));
            }
            positions.needsUpdate = true;
            plane.mesh.geometry.computeVertexNormals();
        }

        function updateTextureCanvas(canvas, landmarks, indices, flipFor3D = false, rollAngle = 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (!landmarks || indices.length === 0) return;
            
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            
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
            
            // Reduce scale slightly to 0.55 to leave padding on the canvas for the feathered mask
            const scale = Math.min(canvas.width / featureW, canvas.height / featureH) * 0.55; 
            
            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            if (rollAngle !== 0) ctx.rotate(-rollAngle);
            if (flipFor3D) ctx.scale(-1, 1);
            
            // 1. Draw the face boundary, expanded and heavily blurred to feather the edges
            ctx.save();
            ctx.scale(1.4, 1.4); // Expand the masked area by 40% to show more surrounding skin
            ctx.beginPath();
            indices.forEach((idx, i) => {
                const pt = landmarks[idx];
                const dx = ((1.0 - pt.x) - (1.0 - anchorX)) * vw * scale;
                const dy = (pt.y - anchorY) * vh * scale;
                if (i === 0) ctx.moveTo(dx, dy); else ctx.lineTo(dx, dy);
            });
            ctx.closePath();
            
            ctx.fillStyle = '#ffffff';
            ctx.filter = 'blur(12px)'; // Apply heavy feathering to the mask edges
            ctx.fill();
            ctx.fill(); // Fill twice to keep the center solidly opaque
            ctx.restore();
            
            // 2. Composite the video frame on top so it seamlessly blends into transparency
            ctx.globalCompositeOperation = 'source-in';
            ctx.scale(-1, 1); // Flip horizontally because the video input is mirrored
            const drawW = vw * scale;
            const drawH = vh * scale;
            ctx.drawImage(video, -anchorX * drawW, -anchorY * drawH, drawW, drawH);
            
            ctx.restore();
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
            lightingMatchInput: backgroundLightingMatch,
            status: backgroundStatus,
            clearButton: clearBackgroundButton,
            renderPreview: drawScene,
            isCameraActive: () => camera.isActive
        });

        const accessoryManager = createAccessoryManager({
            THREE,
            GLTFLoader,
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
            
            if (model3DRenderer && model3DCamera) {
                model3DRenderer.setSize(canvas.width, canvas.height, false);
                model3DCamera.aspect = canvas.width / canvas.height;
                
                let baseZ = model3DCamera.userData.baseZ !== undefined ? model3DCamera.userData.baseZ : 4.0;
                let baseY = model3DCamera.userData.baseY !== undefined ? model3DCamera.userData.baseY : 0.0;
                
                model3DCamera.position.x = 0;
                model3DCamera.position.z = fullscreen.isFullscreen ? baseZ * 1.5 : baseZ;
                model3DCamera.position.y = baseY;
                model3DCamera.lookAt(0, baseY, 0);
                
                model3DCamera.updateProjectionMatrix();
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
            previewBackgroundManager.updateVideoLighting();
            
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

            if (camera.trackingResults && camera.trackingResults.faceLandmarks && camera.trackingResults.faceLandmarks.length > 0) {
                landmarks = camera.trackingResults.faceLandmarks[0];
                const nose = landmarks[1];
                const leftCorner = landmarks[33]; const rightCorner = landmarks[263]; 
                
                cx = (1.0 - nose.x) * canvas.width;
                cy = nose.y * canvas.height;
                
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

            if ((selectedCharacter === 'custom' || selectedCharacter === CORE_CHARACTER_ID) && customSettings.is3D && model3DRenderer) {
                const activeCx = isCustomStatic ? screenCenterX : cx;
                const activeCy = isCustomStatic ? screenCenterY : cy;
                update3DModelRigging(landmarks, angle, yawX, pitchY, activeCx, activeCy, pitchAxisScale);
                
                if (livePlanes.eye_left) {
                    updateTextureCanvas(livePlanes.eye_left.canvas, landmarks, RIGHT_EYE_CONTOUR, false, angle);
                    livePlanes.eye_left.texture.needsUpdate = true; 
                    livePlanes.eye_left.mesh.scale.setScalar(eyeScale * 1.3);
                }
                if (livePlanes.eye_right) {
                    updateTextureCanvas(livePlanes.eye_right.canvas, landmarks, LEFT_EYE_CONTOUR, false, angle);
                    livePlanes.eye_right.texture.needsUpdate = true; 
                    livePlanes.eye_right.mesh.scale.setScalar(eyeScale * 1.3);
                }
                if (livePlanes.mouth) {
                    updateTextureCanvas(livePlanes.mouth.canvas, landmarks, MOUTH_CONTOUR, false, angle);
                    livePlanes.mouth.texture.needsUpdate = true; 

                    let mouthOpenScale = 1.0;
                    if (landmarks) {
                        const topLip = landmarks[13];
                        const botLip = landmarks[14] || landmarks[17];
                        mouthOpenScale = 1.0 + (Math.abs(topLip.y - botLip.y) * 4.0);
                    }
                    const mouthWidthScale = 1.0 + (mouthOpenScale - 1.0) * 0.35;
                    livePlanes.mouth.mesh.scale.set(mouthScale * 1.3 * mouthWidthScale, mouthScale * 1.3 * mouthOpenScale, mouthScale * 1.3);
                }

                model3DRenderer.render(model3DScene, model3DCamera);
                ctx.drawImage(model3DRenderer.domElement, 0, 0, canvas.width, canvas.height);
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
            if (model3DRenderer) return;
            const w = canvas.width || 512; const h = canvas.height || 512;
            model3DRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            model3DRenderer.setClearColor(0x000000, 0);
            model3DRenderer.setSize(w, h, false);
            model3DScene = new THREE.Scene();
            model3DCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
            model3DCamera.position.set(0, 0, 4.0);
            const pmremGenerator = new THREE.PMREMGenerator(model3DRenderer);
            pmremGenerator.compileEquirectangularShader();
            const roomEnvironment = new RoomEnvironment();
            try {
                model3DEnvironment = pmremGenerator.fromScene(roomEnvironment);
                model3DScene.environment = model3DEnvironment.texture;
                model3DScene.environmentIntensity = 0.5; // lower brightness; 1 is the default
            } finally {
                roomEnvironment.dispose();
                pmremGenerator.dispose();
            }
            const ambientLight = new THREE.AmbientLight(0xfffaf5, 0.8);
            model3DScene.add(ambientLight);
            const directionalLight = new THREE.DirectionalLight(0xfffaf5, 0.5);
            directionalLight.position.set(2, 4, 3);
            model3DScene.add(directionalLight);
            previewBackgroundManager.setLights(ambientLight, directionalLight);
        }

        function loadProceduralTest3DModel(openStudio = true) {
            init3DCanvasRenderer();
            reset3DFeatureOffsets();
            accessoryManager.resetRig();
            rigBonesByName = new Map();
            while(model3DScene.children.length > 2) model3DScene.remove(model3DScene.children[2]);

            const root = new THREE.Group(); root.name = "AvatarRoot";
            root.position.y = -1.2; root.userData.baseY = -1.2; loadedModelRoot = root;

            const spine0 = new THREE.Bone(); spine0.name = "spine_0";
            const spineMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.6 });
            const spine0Mesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.5), spineMat); spine0Mesh.position.y = 0.35; spine0.add(spine0Mesh);

            const spine1 = new THREE.Bone(); spine1.name = "spine_1"; spine1.position.y = 0.7;
            const spine1Mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.45), spineMat); spine1Mesh.position.y = 0.3; spine1.add(spine1Mesh); spine0.add(spine1);

            const neck = new THREE.Bone(); neck.name = "neck"; neck.position.y = 0.6;
            const neckMat = new THREE.MeshStandardMaterial({ color: 0xfca5a5 });
            const neckMeshGroup = new THREE.Group();
            neckMeshGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 16), neckMat));
            neckMeshGroup.position.y = 0.2; neck.add(neckMeshGroup); spine1.add(neck);

            const head = new THREE.Bone(); head.name = "head"; head.position.y = 0.4;
            head.add(new THREE.Mesh(new THREE.SphereGeometry(0.7, 32, 32), new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.3 }))); neck.add(head);

            const leftEyeBone = new THREE.Bone(); leftEyeBone.name = "eye_left"; leftEyeBone.position.set(-0.25, 0.15, 0.65); head.add(leftEyeBone);
            const rightEyeBone = new THREE.Bone(); rightEyeBone.name = "eye_right"; rightEyeBone.position.set(0.25, 0.15, 0.65); head.add(rightEyeBone);
            const mouthBone = new THREE.Bone(); mouthBone.name = "mouth"; mouthBone.position.set(0, -0.25, 0.65); head.add(mouthBone);

            root.add(spine0); model3DScene.add(root);

            modelBones = { spine_0: spine0, spine_1: spine1, neck: neck, head: head, eye_left: leftEyeBone, eye_right: rightEyeBone, mouth: mouthBone };
            rigBonesByName = new Map(Object.values(modelBones).filter(bone => bone?.isBone).map(bone => [bone.name.toLowerCase(), bone]));

            Object.values(modelBones).forEach(bone => {
                if (bone) {
                    bone.userData.initRot = { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z };
                    bone.userData.initScaleY = bone.scale.y;
                }
            });

            clearLivePlanes();
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
            const loader = new GLTFLoader();
            loader.load(new URL('models/core/character.glb', document.baseURI).href, (gltf) => {
                if (loadToken !== coreLoadToken || (!openStudio && selectedCharacter !== CORE_CHARACTER_ID)) {
                    accessoryManager.disposeModelResources(gltf.scene);
                    return;
                }
                initializeLoaded3DModel(gltf, openStudio, !openStudio, CORE_CHARACTER_ID);
            }, undefined, (error) => {
                if (loadToken !== coreLoadToken || (!openStudio && selectedCharacter !== CORE_CHARACTER_ID)) return;
                console.error("Core character model failed to load:", error);
                loadProceduralTest3DModel(openStudio);
                if (selectedCharacter === CORE_CHARACTER_ID) {
                    accessoryManager.setStatus("The core character rig could not be loaded; accessories are unavailable.");
                }
            });
        }

        function initializeLoaded3DModel(gltf, openStudio = true, isCoreModel = false, characterId = null) {
            reset3DFeatureOffsets();
            accessoryManager.resetRig();
            while(model3DScene.children.length > 2) model3DScene.remove(model3DScene.children[2]);
            model3DScene.add(gltf.scene);
            loadedModelRoot = gltf.scene; loadedModelRoot.userData.baseY = 0;

            modelBones = {};
            rigBonesByName = new Map();
            gltf.scene.traverse((child) => {
                if (child.isBone && child.name) {
                    const normalizedName = child.name.trim().toLowerCase();
                    if (!rigBonesByName.has(normalizedName)) rigBonesByName.set(normalizedName, child);
                }
                if (child.isBone || child.isObject3D) {
                    const name = child.name.toLowerCase();
                    if (name.includes('spine_0') || name === 'spine0') modelBones.spine_0 = child;
                    else if (name.includes('spine_1') || name === 'spine1') modelBones.spine_1 = child;
                    else if (name.includes('neck')) modelBones.neck = child;
                    else if (name.includes('head')) modelBones.head = child;
                    else if (name.includes('eye_left') || name.includes('lefteye') || name === 'eye.l') modelBones.eye_left = child;
                    else if (name.includes('eye_right') || name.includes('righteye') || name === 'eye.r') modelBones.eye_right = child;
                    else if (name.includes('mouth') || name.includes('jaw') || name.includes('lip')) modelBones.mouth = child;
                }
            });

            if (!modelBones.head) {
                gltf.scene.traverse((child) => { if (child.isBone && !modelBones.head) modelBones.head = child; });
                if (!modelBones.head) { modelBones.head = new THREE.Bone(); modelBones.head.position.y = 1.0; model3DScene.add(modelBones.head); }
            }

            if (!modelBones.eye_left && modelBones.head) { modelBones.eye_left = new THREE.Bone(); modelBones.eye_left.name = "eye_left_virtual"; modelBones.eye_left.position.set(-0.25, 0.15, 0.65); modelBones.head.add(modelBones.eye_left); }
            if (!modelBones.eye_right && modelBones.head) { modelBones.eye_right = new THREE.Bone(); modelBones.eye_right.name = "eye_right_virtual"; modelBones.eye_right.position.set(0.25, 0.15, 0.65); modelBones.head.add(modelBones.eye_right); }
            if (!modelBones.mouth && modelBones.head) { modelBones.mouth = new THREE.Bone(); modelBones.mouth.name = "mouth_virtual"; modelBones.mouth.position.set(0, -0.25, 0.65); modelBones.head.add(modelBones.mouth); }

            Object.values(modelBones).forEach(bone => {
                if (bone) {
                    bone.userData.initRot = { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z };
                    bone.userData.initScaleY = bone.scale.y;
                }
            });

            clearLivePlanes();
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
            const reader = new FileReader();
            reader.onload = (e) => {
                const loader = new GLTFLoader();
                loader.parse(e.target.result, '', (gltf) => {
                    initializeLoaded3DModel(gltf, true, false);
                }, undefined, (error) => { alert('Could not parse GLB/GLTF model.'); });
            };
            reader.readAsArrayBuffer(file);
        }

        function update3DModelRigging(landmarks, roll, yaw, pitch, cx, cy, pitchAxisScale) {
            if (!modelBones.head) return;
            
            const targetYaw = yaw / 150; const targetPitch = (pitch / 100) * pitchAxisScale; const targetRoll = roll;
            const now = performance.now();
            const smoothedYaw = smoothHeadRotation(headRotationFilters.yaw, targetYaw, now);
            const smoothedPitch = smoothHeadRotation(headRotationFilters.pitch, targetPitch, now);
            const smoothedRoll = smoothHeadRotation(headRotationFilters.roll, targetRoll, now, true);

            const totalYaw = smoothedYaw * 1.0;
            const totalPitch = smoothedPitch * 0.8;
            const totalRoll = -smoothedRoll * 2.0;

            let swayPitch = 0; let swayRoll = 0;

            if (loadedModelRoot && cx !== undefined && cy !== undefined) {
                const screenDx = (cx - canvas.width / 2) / canvas.width;
                const screenDy = (cy - canvas.height / 2) / canvas.height;
                const aspect = canvas.width / canvas.height;
                const frustumHeight = 2 * Math.tan((model3DCamera.fov * Math.PI / 180) / 2) * model3DCamera.position.z;
                const frustumWidth = frustumHeight * aspect;
                
                const targetTransX = screenDx * frustumWidth * 0.3; 
                const targetTransY = -screenDy * frustumHeight * 0.3;
                
                if (loadedModelRoot.userData.tx === undefined) { loadedModelRoot.userData.tx = 0; loadedModelRoot.userData.ty = 0; }
                loadedModelRoot.userData.tx = THREE.MathUtils.lerp(loadedModelRoot.userData.tx, targetTransX, 0.4);
                loadedModelRoot.userData.ty = THREE.MathUtils.lerp(loadedModelRoot.userData.ty, targetTransY, 0.4);
                loadedModelRoot.position.x = loadedModelRoot.userData.tx;
                loadedModelRoot.position.y = loadedModelRoot.userData.baseY + loadedModelRoot.userData.ty;

                swayPitch = -screenDy * 1.0; swayRoll = -screenDx * 1.2; 
            }

            const wSpine0 = 0.10; const wSpine1 = 0.20; const wNeck = 0.30; const wHead = 0.40;

            if (modelBones.spine_0) {
                const init = modelBones.spine_0.userData.initRot || {x:0, y:0, z:0};
                modelBones.spine_0.rotation.y = init.y + (totalYaw * wSpine0);
                modelBones.spine_0.rotation.x = init.x + (totalPitch * wSpine0) + (swayPitch * 0.5);
                modelBones.spine_0.rotation.z = init.z + (totalRoll * wSpine0) + (swayRoll * 0.5);
            }
            if (modelBones.spine_1) {
                const init = modelBones.spine_1.userData.initRot || {x:0, y:0, z:0};
                modelBones.spine_1.rotation.y = init.y + (totalYaw * wSpine1);
                modelBones.spine_1.rotation.x = init.x + (totalPitch * wSpine1) + (swayPitch * 0.5);
                modelBones.spine_1.rotation.z = init.z + (totalRoll * wSpine1) + (swayRoll * 0.5);
            }
            if (modelBones.neck) {
                const init = modelBones.neck.userData.initRot || {x:0, y:0, z:0};
                modelBones.neck.rotation.y = init.y + (totalYaw * wNeck);
                modelBones.neck.rotation.x = init.x + (totalPitch * wNeck) - (swayPitch * 0.2);
                modelBones.neck.rotation.z = init.z + (totalRoll * wNeck) - (swayRoll * 0.2);
            }
            if (modelBones.head) {
                const init = modelBones.head.userData.initRot || {x:0, y:0, z:0};
                modelBones.head.rotation.y = init.y + (totalYaw * wHead);
                modelBones.head.rotation.x = init.x + (totalPitch * wHead);
                modelBones.head.rotation.z = init.z + (totalRoll * wHead);
            }

            if (modelBones.eye_left && modelBones.eye_right) {
                const eyeGazeYaw = totalYaw * 0.05; 
                const initL = modelBones.eye_left.userData.initRot || {y:0};
                const initR = modelBones.eye_right.userData.initRot || {y:0};
                modelBones.eye_left.rotation.y = initL.y + eyeGazeYaw;
                modelBones.eye_right.rotation.y = initR.y + eyeGazeYaw;
            }
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
            if (!isPreviewing3D || !model3DRenderer || !model3DScene || !model3DCamera) return;
            
            if (loadedModelRoot) { 
                const s = c3dModelScale ? parseFloat(c3dModelScale.value) : 1.0; 
                loadedModelRoot.scale.set(s, s, s); 
                loadedModelRoot.rotation.y = orbitAngleX; 
                loadedModelRoot.rotation.x = orbitAngleY; 
            }
            
            Object.entries(c3dFeatureOffsets).forEach(([name, sliders]) => {
                const plane = livePlanes[name];
                if (plane) plane.mesh.position.set(...sliders.map(slider => parseFloat(slider.value)));
            });

            model3DCamera.position.z = parseFloat(c3dCamZ.value); 
            model3DCamera.position.y = parseFloat(c3dCamY.value); 
            model3DCamera.lookAt(0, parseFloat(c3dCamY.value), 0);

            // Render the 3D scene
            model3DRenderer.render(model3DScene, model3DCamera);

            // Draw the WebGL renderer output onto the modal's 2D canvas
            const cvs = customPreviewCanvas;
            const ctxC = cvs.getContext('2d');
            if (cvs.width !== cvs.offsetWidth || cvs.height !== cvs.offsetHeight) {
                cvs.width = cvs.offsetWidth;
                cvs.height = cvs.offsetHeight;
            }
            ctxC.clearRect(0, 0, cvs.width, cvs.height);
            ctxC.drawImage(model3DRenderer.domElement, 0, 0, cvs.width, cvs.height);

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
                model3DCamera.position.z = parseFloat(c3dCamZ.value); model3DCamera.position.y = parseFloat(c3dCamY.value); model3DCamera.lookAt(0, model3DCamera.position.y, 0);
                model3DCamera.userData.baseZ = model3DCamera.position.z; model3DCamera.userData.baseY = model3DCamera.position.y;
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
