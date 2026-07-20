let isReversing = false;
let videoElement = null;
let isSeeking = false;
let lastRealTime = 0;

// Audio Reversing state
let audioCtx = null;
let activeSources = [];
const audioChunkDuration = 10;
let nextAudioContextTime = 0;
let prefetchTriggered = new Set();

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function stopAllAudio() {
    activeSources.forEach(source => {
        try { source.stop(); } catch(e) {}
    });
    activeSources = [];
    prefetchTriggered.clear();
}

function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
}

function scheduleNextChunk(requestTimestamp) {
    if (prefetchTriggered.has(requestTimestamp)) return;
    prefetchTriggered.add(requestTimestamp);

    const videoId = getVideoId();
    if (!videoId) return;
    
    const chunkStartVideoTime = Math.max(0, requestTimestamp - audioChunkDuration);
    const duration = requestTimestamp - chunkStartVideoTime;
    
    if (duration <= 0) return;

    chrome.runtime.sendMessage({
        action: 'fetchAudioChunk',
        videoId: videoId,
        timestamp: requestTimestamp,
        duration: duration
    }, async (response) => {
        if (!isReversing) return;

        if (response && response.success) {
            try {
                const fetchRes = await fetch(response.dataUri);
                const arrayBuffer = await fetchRes.arrayBuffer();
                const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                
                // Reverse the audio channels in memory!
                for (let i = 0; i < decodedBuffer.numberOfChannels; i++) {
                    decodedBuffer.getChannelData(i).reverse();
                }
                
                if (!isReversing) return;

                const source = audioCtx.createBufferSource();
                source.buffer = decodedBuffer;
                source.connect(audioCtx.destination);
                activeSources.push(source);

                let offset = 0;
                
                if (nextAudioContextTime === 0 || nextAudioContextTime < audioCtx.currentTime) {
                    offset = Math.max(0, requestTimestamp - videoElement.currentTime);
                    if (offset > decodedBuffer.duration) offset = decodedBuffer.duration;
                    nextAudioContextTime = audioCtx.currentTime;
                }

                source.start(nextAudioContextTime, offset);
                
                const playDuration = decodedBuffer.duration - offset;
                nextAudioContextTime += playDuration;
                
                // Pre-fetch next chunk halfway through
                const prefetchDelay = Math.max(0, (playDuration / 2) * 1000);
                setTimeout(() => {
                    if (isReversing && chunkStartVideoTime > 0) {
                        scheduleNextChunk(chunkStartVideoTime);
                    }
                }, prefetchDelay);

                source.onended = () => {
                    const index = activeSources.indexOf(source);
                    if (index > -1) activeSources.splice(index, 1);
                };

            } catch (error) {
                console.error('Audio processing error:', error);
            }
        } else {
            console.error('Failed to fetch audio chunk');
        }
    });
}

function reversePlayStep(timestamp) {
  if (!isReversing || !videoElement) return;

  // Calculate elapsed time since the last frame
  const delta = (timestamp - lastRealTime) / 1000;
  lastRealTime = timestamp;

  // Cap delta to 0.5s to prevent massive jumps if you switch tabs
  const timeStep = Math.min(delta, 0.5); 
  
  if (videoElement.currentTime - timeStep > 0) {
    isSeeking = true;
    videoElement.currentTime -= timeStep;
    
    // Audio chunks are now autonomously pre-fetched via scheduleNextChunk
    // The next step will be triggered by the 'seeked' event
  } else {
    // Reached the beginning
    videoElement.currentTime = 0;
    const btn = document.querySelector('.ytp-reverse-button');
    if (btn) btn.classList.remove('active');
    stopReversing();
  }
}

function handleSeeked() {
    if (isReversing && isSeeking) {
        isSeeking = false;
        // Wait for the next optimal animation frame before jumping again
        requestAnimationFrame((timestamp) => {
            if (isReversing) reversePlayStep(timestamp);
        });
    }
}

function startReversing() {
  if (!videoElement) return;
  isReversing = true;
  isSeeking = false;
  videoElement.pause();
  videoElement.muted = true; // Mute to avoid glitchy audio
  videoElement.addEventListener('seeked', handleSeeked);
  
  initAudio();
  stopAllAudio();
  nextAudioContextTime = 0;
  
  // Start the gapless fetching chain
  scheduleNextChunk(videoElement.currentTime);
  
  // Initialize the loop
  requestAnimationFrame((timestamp) => {
      lastRealTime = timestamp;
      isSeeking = true;
      // Kick off with a tiny step to trigger the first 'seeked' event
      videoElement.currentTime -= 0.001; 
  });
}

function stopReversing() {
  isReversing = false;
  isSeeking = false;
  if (videoElement) {
      videoElement.removeEventListener('seeked', handleSeeked);
  }
  stopAllAudio();
}

function toggleReversing(button) {
  if (isReversing) {
    stopReversing();
    button.classList.remove('active');
    if (videoElement) {
        videoElement.play();
    }
  } else {
    startReversing();
    button.classList.add('active');
  }
}

function injectReverseButton() {
  videoElement = document.querySelector('video.html5-main-video');
  if (!videoElement) return;

  // Find the right controls bar (where settings/subtitles are)
  const rightControls = document.querySelector('.ytp-right-controls');
  if (!rightControls) return;

  if (document.querySelector('.ytp-reverse-button')) return;

  const reverseBtn = document.createElement('button');
  reverseBtn.className = 'ytp-button ytp-reverse-button';
  reverseBtn.title = 'Instant Replay in Reverse (Lower resolution for smoother playback)';
  reverseBtn.setAttribute('aria-label', 'Reverse Video');

  // SVG for reverse icon (two arrows pointing left) with exact YouTube viewBox (0 0 36 36)
  reverseBtn.innerHTML = `
    <svg height="100%" version="1.1" viewBox="0 0 36 36" width="100%">
      <path class="ytp-svg-fill" d="M 12 18 L 22 24 L 22 12 Z M 22 18 L 32 24 L 32 12 Z"></path>
    </svg>
  `;

  reverseBtn.addEventListener('click', () => toggleReversing(reverseBtn));

  // Insert at the beginning of the right controls (leftmost of the right icons)
  rightControls.prepend(reverseBtn);
}

// Use a MutationObserver to handle YouTube's SPA navigation and dynamic player loading
const observer = new MutationObserver(() => {
  injectReverseButton();
});

observer.observe(document.body, { childList: true, subtree: true });

// Listen to standard play events to disable reverse mode if user clicks play/pause normally
document.addEventListener('play', (e) => {
    if (e.target.tagName === 'VIDEO' && e.target.classList.contains('html5-main-video')) {
        if (isReversing) {
            const btn = document.querySelector('.ytp-reverse-button');
            if (btn) btn.classList.remove('active');
            stopReversing();
        }
    }
}, true);
