// YouTube Video Reverser - Content Script
// Foundation: backup's proven audio pipeline
// Improvements:
//   1. setInterval scrubber (fixes pausing bug)
//   2. Video starts immediately, audio loads async
//   3. Aggressive pre-buffering: 6 chunks fetched in parallel at startup
//   4. Cache-based playback: chunks play in order from cache, no gaps
//   5. Forward button UI

let isReversing = false;
let videoElement = null;
let reverseInterval = null;

// Audio state
let audioCtx = null;
let activeSources = [];
const audioChunkDuration = 10; // seconds per chunk
let nextAudioContextTime = 0;

// Pre-buffer system
const audioBufferCache = new Map();  // timestamp -> AudioBuffer (reversed)
const fetchingChunks = new Set();    // timestamps currently being fetched
let audioPlaybackTimer = null;
let nextChunkToPlay = 0;
const PREFETCH_COUNT = 6;            // 60 seconds of buffer

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
    if (audioPlaybackTimer) {
        clearTimeout(audioPlaybackTimer);
        audioPlaybackTimer = null;
    }
}

function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
}

// --- Fetch a chunk and store in cache (doesn't play it) ---
function fetchAndCacheChunk(timestamp) {
    if (fetchingChunks.has(timestamp) || audioBufferCache.has(timestamp)) return;
    if (timestamp <= 0) return;

    fetchingChunks.add(timestamp);

    const videoId = getVideoId();
    if (!videoId) return;

    const chunkStartVideoTime = Math.max(0, timestamp - audioChunkDuration);
    const duration = timestamp - chunkStartVideoTime;
    if (duration <= 0) return;

    chrome.runtime.sendMessage({
        action: 'fetchAudioChunk',
        videoId: videoId,
        timestamp: timestamp,
        duration: duration
    }, async (response) => {
        if (chrome.runtime.lastError) {
            console.error('[buffer] Chrome runtime error:', chrome.runtime.lastError.message);
            if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                stopReversing();
                alert('YouTube Reverse Extension was updated. Please refresh the page to continue using it.');
            }
            return;
        }

        if (!isReversing) return;

        if (response && response.success) {
            try {
                const fetchRes = await fetch(response.dataUri);
                const arrayBuffer = await fetchRes.arrayBuffer();
                const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);

                // Reverse all audio channels in memory
                for (let i = 0; i < decodedBuffer.numberOfChannels; i++) {
                    decodedBuffer.getChannelData(i).reverse();
                }

                audioBufferCache.set(timestamp, decodedBuffer);
                console.log(`[buffer] Cached chunk at ${timestamp.toFixed(1)}s (${decodedBuffer.duration.toFixed(1)}s)`);
            } catch (e) {
                console.error('[buffer] Decode error for chunk at', timestamp, ':', e.message);
                fetchingChunks.delete(timestamp);
            }
        } else {
            console.error('[buffer] Fetch failed for chunk at', timestamp, ':', response?.error);
            fetchingChunks.delete(timestamp);
            // Retry fetching this chunk after a short delay
            setTimeout(() => fetchAndCacheChunk(timestamp), 1000);
        }
    });
}

// --- Pre-fetch multiple chunks ahead ---
function prefetchAhead(fromTimestamp) {
    for (let i = 0; i < PREFETCH_COUNT; i++) {
        const t = fromTimestamp - (i * audioChunkDuration);
        if (t <= 0) break;
        fetchAndCacheChunk(t);
    }
}

// --- Playback scheduler: plays chunks from cache in correct order ---
function startAudioPlayback(startTime) {
    nextChunkToPlay = startTime;
    nextAudioContextTime = 0;

    function tryPlayNext() {
        if (!isReversing) return;

        const buffer = audioBufferCache.get(nextChunkToPlay);
        if (buffer) {
            // Play this chunk
            const source = audioCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(audioCtx.destination);
            activeSources.push(source);

            let offset = 0;
            if (nextAudioContextTime === 0 || nextAudioContextTime < audioCtx.currentTime) {
                // Sync with current video position
                offset = Math.max(0, nextChunkToPlay - videoElement.currentTime);
                if (offset > buffer.duration) offset = buffer.duration;
                nextAudioContextTime = audioCtx.currentTime;
            }

            source.start(nextAudioContextTime, offset);
            const playDuration = buffer.duration - offset;
            nextAudioContextTime += playDuration;

            source.onended = () => {
                const idx = activeSources.indexOf(source);
                if (idx > -1) activeSources.splice(idx, 1);
            };

            console.log(`[play] Playing chunk at ${nextChunkToPlay.toFixed(1)}s (offset: ${offset.toFixed(1)}s, duration: ${playDuration.toFixed(1)}s)`);

            // Advance to next chunk
            const chunkStart = Math.max(0, nextChunkToPlay - audioChunkDuration);
            nextChunkToPlay = chunkStart;

            // Pre-fetch more chunks ahead of where we'll be
            if (nextChunkToPlay > 0) {
                prefetchAhead(nextChunkToPlay);
            }

            // Schedule playing next chunk slightly before this one ends
            if (nextChunkToPlay > 0) {
                const scheduleIn = Math.max(100, (playDuration - 0.5) * 1000);
                audioPlaybackTimer = setTimeout(tryPlayNext, scheduleIn);
            }
        } else if (nextChunkToPlay > 0) {
            // Chunk not ready yet — retry in 300ms
            audioPlaybackTimer = setTimeout(tryPlayNext, 300);
        }
    }

    tryPlayNext();
}

let realWorldStartTime = 0;
let audioStartTimeForSync = 0;
let isAudioPlaying = false;

// --- Audio-Synced Video Scrubbing ---
function startSyncedScrubbing() {
    if (reverseInterval) cancelAnimationFrame(reverseInterval);
    
    realWorldStartTime = audioCtx.currentTime;
    audioStartTimeForSync = videoElement.currentTime;
    
    function loop() {
        if (!isReversing || !videoElement || !isAudioPlaying) {
            return;
        }
        
        const elapsedRealTime = audioCtx.currentTime - realWorldStartTime;
        const targetVideoTime = Math.max(0, audioStartTimeForSync - elapsedRealTime);
        
        // Dynamically adjust to hardware decoding speed by waiting for seek to finish
        if (!videoElement.seeking && Math.abs(videoElement.currentTime - targetVideoTime) > 0.05) {
            videoElement.currentTime = targetVideoTime;
        }

        if (targetVideoTime <= 0) {
            videoElement.currentTime = 0;
            const btn = document.querySelector('.ytp-reverse-button');
            if (btn) btn.classList.remove('active');
            stopReversing();
            return;
        }
        
        reverseInterval = requestAnimationFrame(loop);
    }
    
    reverseInterval = requestAnimationFrame(loop);
}

// --- Start reversing ---
function startReversing() {
    if (!videoElement) return;
    isReversing = true;
    isAudioPlaying = false;
    videoElement.pause();

    // Add loading state to button
    const btn = document.querySelector('.ytp-reverse-button');
    if (btn) {
        btn.classList.add('loading');
        btn.title = 'Buffering audio...';
    }

    // Initialize audio system
    initAudio();
    stopAllAudio();
    audioBufferCache.clear();
    fetchingChunks.clear();

    const startTime = videoElement.currentTime;
    const maxWaitTime = 15000; // 15 seconds timeout
    const checkStart = Date.now();

    // Wait for the first chunk to be ready before playing video
    const checkReadyInterval = setInterval(() => {
        if (!isReversing) {
            clearInterval(checkReadyInterval);
            return;
        }

        if (Date.now() - checkStart > maxWaitTime) {
            clearInterval(checkReadyInterval);
            stopReversing();
            alert('Failed to buffer audio for reversing. The backend server might be down or taking too long.');
            return;
        }
        
        // Wait until at least the first chunk (or a chunk close to startTime) is loaded
        const requiredChunkStart = Math.max(0, startTime - audioChunkDuration);
        
        // A simple check: do we have ANY buffer cached yet? Since we prefetch
        // the immediate chunk, if the cache has size > 0, we can start.
        if (audioBufferCache.size > 0) {
            clearInterval(checkReadyInterval);
            
            // Remove loading state
            if (btn) {
                btn.classList.remove('loading');
                btn.title = 'Play Reverse';
            }
            
            isAudioPlaying = true;
            
            // Start audio and synced video scrubbing
            startAudioPlayback(startTime);
            startSyncedScrubbing();
        }
    }, 200);

    // Pre-fetch chunks in parallel (60 seconds of buffer)
    prefetchAhead(startTime);
}

function stopReversing() {
    isReversing = false;
    isAudioPlaying = false;
    if (reverseInterval) {
        cancelAnimationFrame(reverseInterval);
        reverseInterval = null;
    }
    stopAllAudio();
    
    const btn = document.querySelector('.ytp-reverse-button');
    if (btn) {
        btn.classList.remove('loading');
        btn.title = 'Play Reverse';
    }
}

function toggleForward() {
    if (isReversing) {
        stopReversing();
        const btnRev = document.querySelector('.ytp-reverse-button');
        const btnFwd = document.querySelector('.ytp-forward-button');
        if (btnRev) btnRev.classList.remove('active');
        if (btnFwd) btnFwd.classList.add('active');
    }
    if (videoElement) {
        videoElement.play();
    }
}

function toggleReversing(button) {
    if (isReversing) {
        toggleForward();
    } else {
        startReversing();
        button.classList.add('active');
        const btnFwd = document.querySelector('.ytp-forward-button');
        if (btnFwd) btnFwd.classList.remove('active');
    }
}

function injectReverseButton() {
    videoElement = document.querySelector('video.html5-main-video');
    if (!videoElement) return;

    const rightControls = document.querySelector('.ytp-right-controls');
    if (!rightControls) return;

    if (document.querySelector('.ytp-custom-controls')) return;

    const container = document.createElement('div');
    container.className = 'ytp-custom-controls';

    const svgNS = "http://www.w3.org/2000/svg";

    // Reverse Button
    const reverseBtn = document.createElement('button');
    reverseBtn.className = 'ytp-button ytp-reverse-button';
    reverseBtn.title = 'Play Reverse';

    const revSvg = document.createElementNS(svgNS, 'svg');
    revSvg.setAttribute('height', '100%');
    revSvg.setAttribute('version', '1.1');
    revSvg.setAttribute('viewBox', '0 0 36 36');
    revSvg.setAttribute('width', '100%');
    const revPath = document.createElementNS(svgNS, 'path');
    revPath.setAttribute('class', 'ytp-svg-fill');
    revPath.setAttribute('d', 'M 12 18 L 22 24 L 22 12 Z M 22 18 L 32 24 L 32 12 Z');
    revSvg.appendChild(revPath);
    reverseBtn.appendChild(revSvg);
    reverseBtn.addEventListener('click', () => toggleReversing(reverseBtn));

    // Forward Button
    const forwardBtn = document.createElement('button');
    forwardBtn.className = 'ytp-button ytp-forward-button active';
    forwardBtn.title = 'Play Forward';

    const fwdSvg = document.createElementNS(svgNS, 'svg');
    fwdSvg.setAttribute('height', '100%');
    fwdSvg.setAttribute('version', '1.1');
    fwdSvg.setAttribute('viewBox', '0 0 36 36');
    fwdSvg.setAttribute('width', '100%');
    const fwdPath = document.createElementNS(svgNS, 'path');
    fwdPath.setAttribute('class', 'ytp-svg-fill');
    fwdPath.setAttribute('d', 'M 12 12 L 22 18 L 12 24 Z');
    fwdSvg.appendChild(fwdPath);
    forwardBtn.appendChild(fwdSvg);
    forwardBtn.addEventListener('click', toggleForward);

    container.appendChild(reverseBtn);
    container.appendChild(forwardBtn);
    rightControls.prepend(container);
}

// MutationObserver for YouTube's SPA navigation
const observer = new MutationObserver(() => {
    injectReverseButton();
});
observer.observe(document.body, { childList: true, subtree: true });

// If user clicks play/pause normally, stop reversing
document.addEventListener('play', (e) => {
    if (e.target.tagName === 'VIDEO' && e.target.classList.contains('html5-main-video')) {
        if (isReversing) {
            const btnRev = document.querySelector('.ytp-reverse-button');
            const btnFwd = document.querySelector('.ytp-forward-button');
            if (btnRev) btnRev.classList.remove('active');
            if (btnFwd) btnFwd.classList.add('active');
            stopReversing();
        }
    }
}, true);
