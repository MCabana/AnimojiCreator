export function setupRecording({ canvas, getAudioStream, isCameraActive, setStatus }) {
    const btnRecord = document.getElementById('btn-record');
    const recordIcon = document.getElementById('record-icon');
    const timerUI = document.getElementById('recording-timer');
    let mediaRecorder = null;
    let recordedChunks = [];
    let isRecording = false;
    let recordingTimer = null;
    let recordingSecondsLeft = 15;

    function stopRecording() {
        if (!mediaRecorder || !isRecording) return;

        mediaRecorder.stop();
        isRecording = false;
        clearInterval(recordingTimer);
        timerUI.classList.add('hidden');
        btnRecord.classList.remove('animate-pulse', 'border-rose-300');
        recordIcon.classList.add('rounded-full');
        recordIcon.classList.remove('rounded-sm', 'scale-75');
        setStatus("Saving Video...", "bg-blue-400");
    }

    btnRecord.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
            return;
        }

        try {
            const canvasStream = canvas.captureStream(30);
            const audioStream = getAudioStream();
            const audioTracks = audioStream ? audioStream.getAudioTracks() : [];
            let processedAudioStream = null;
            if (audioTracks.length > 0) {
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                const dest = audioCtx.createMediaStreamDestination();
                audioCtx.createMediaStreamSource(audioStream).connect(dest);
                processedAudioStream = dest.stream;
            }
            const combinedStream = new MediaStream([
                ...canvasStream.getVideoTracks(),
                ...(processedAudioStream ? processedAudioStream.getAudioTracks() : [])
            ]);

            const targetBitrate = 5000000;
            let options = { mimeType: 'video/webm', videoBitsPerSecond: targetBitrate };
            if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) {
                options = { mimeType: 'video/mp4;codecs=avc1,mp4a.40.2', videoBitsPerSecond: targetBitrate };
            } else if (MediaRecorder.isTypeSupported('video/mp4')) {
                options = { mimeType: 'video/mp4', videoBitsPerSecond: targetBitrate };
            } else if (MediaRecorder.isTypeSupported('video/webm;codecs=h264,opus')) {
                options = { mimeType: 'video/webm;codecs=h264,opus', videoBitsPerSecond: targetBitrate };
            }

            mediaRecorder = new MediaRecorder(combinedStream, options);
            recordedChunks = [];
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) recordedChunks.push(event.data);
            };
            mediaRecorder.onstop = () => {
                clearInterval(recordingTimer);
                timerUI.classList.add('hidden');
                const finalMimeType = mediaRecorder.mimeType || options.mimeType || 'video/mp4';
                const url = URL.createObjectURL(new Blob(recordedChunks, { type: finalMimeType }));
                const link = document.createElement('a');
                link.style.display = 'none';
                link.href = url;
                link.download = `animoji-${Date.now()}.${finalMimeType.includes('mp4') ? 'mp4' : 'webm'}`;
                document.body.appendChild(link);
                link.click();
                setTimeout(() => {
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                }, 1000);
                setStatus("Video Saved!", "bg-emerald-500");
                setTimeout(() => {
                    if (isCameraActive()) setStatus("Live! Make a face!", "bg-emerald-400");
                }, 3000);
            };

            mediaRecorder.start();
            isRecording = true;
            btnRecord.classList.add('animate-pulse', 'border-rose-300');
            recordIcon.classList.remove('rounded-full');
            recordIcon.classList.add('rounded-sm', 'scale-75');
            recordingSecondsLeft = 15;
            timerUI.textContent = `00:${recordingSecondsLeft}`;
            timerUI.classList.remove('hidden');
            setStatus(audioTracks.length === 0 ? "Recording (No Mic)..." : "Recording...", "bg-rose-500");
            recordingTimer = setInterval(() => {
                recordingSecondsLeft--;
                timerUI.textContent = `00:${recordingSecondsLeft < 10 ? `0${recordingSecondsLeft}` : recordingSecondsLeft}`;
                if (recordingSecondsLeft <= 0 && isRecording) stopRecording();
            }, 1000);
        } catch (error) {
            setStatus("Recording Error", "bg-red-500");
            console.error("Recording failed:", error);
        }
    });
}
