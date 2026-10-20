export function setupCamera({
    FaceLandmarker,
    FilesetResolver,
    btnCamera,
    video,
    pipVideo,
    pipCanvas,
    pipContainer,
    showPip,
    setStatus,
    resizeCanvases,
    drawScene
}) {
    let faceLandmarker = null;
    let imageLandmarker = null;
    let isActive = false;
    let lastVideoTime = -1;
    let trackingResults = null;
    let audioStream = null;

    async function initializeEngine() {
        try {
            btnCamera.disabled = true;
            const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm");
            faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                    delegate: "CPU"
                },
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
                runningMode: "VIDEO",
                numFaces: 1
            });
            imageLandmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                    delegate: "CPU"
                },
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
                runningMode: "IMAGE",
                numFaces: 1,
                minFaceDetectionConfidence: 0.1,
                minFacePresenceConfidence: 0.01
            });
            setStatus("Ready to animate", "bg-blue-400");
            btnCamera.disabled = false;
        } catch (error) {
            setStatus("Engine Error", "bg-red-500");
            console.error("MediaPipe initialization failed:", error);
        }
    }

    async function renderLoop() {
        if (isActive && video.videoWidth > 0 && !video.paused) {
            try {
                const startTimeMs = performance.now();
                if (lastVideoTime !== video.currentTime) {
                    lastVideoTime = video.currentTime;
                    trackingResults = faceLandmarker.detectForVideo(video, startTimeMs);
                }
                drawScene();
            } catch (error) {
                console.error("Face tracking frame failed:", error);
            }
        }
        requestAnimationFrame(renderLoop);
    }

    btnCamera.addEventListener('click', async () => {
        try {
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
                    audio: true
                });
            } catch {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } }
                });
            }

            audioStream = stream;
            video.srcObject = stream;
            pipVideo.srcObject = stream;
            video.muted = true;
            pipVideo.muted = true;
            await video.play();
            await pipVideo.play();
            video.onloadedmetadata = () => {
                isActive = true;
                btnCamera.classList.add('opacity-0', 'pointer-events-none');
                if (showPip()) pipContainer.classList.remove('opacity-0', 'pointer-events-none');
                document.getElementById('btn-record').classList.remove('hidden');
                resizeCanvases();
                setStatus("Live! Make a face!", "bg-emerald-400");
                requestAnimationFrame(renderLoop);
            };
        } catch (error) {
            setStatus("Camera Denied", "bg-red-500");
            console.error("Camera initialization failed:", error);
        }
    });

    return {
        initializeEngine,
        get isActive() {
            return isActive;
        },
        get trackingResults() {
            return trackingResults;
        },
        get imageLandmarker() {
            return imageLandmarker;
        },
        get audioStream() {
            return audioStream;
        }
    };
}
