const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const youtubedl = require('yt-dlp-exec');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());

const urlCache = new Map();       // videoId -> streamUrl
const localFileCache = new Map(); // videoId -> { path, ready }

const resolvePromiseCache = new Map(); // videoId -> Promise

// --- URL Resolution (cached) ---
async function getStreamUrl(videoId) {
    if (urlCache.has(videoId)) return urlCache.get(videoId);
    if (resolvePromiseCache.has(videoId)) return resolvePromiseCache.get(videoId);

    const promise = (async () => {
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        console.log(`[yt-dlp] Resolving stream URL for ${videoId}...`);
        const rawUrl = await youtubedl(videoUrl, { f: '140', g: true });
        
        if (typeof rawUrl === 'string') {
            return rawUrl.split('\n')[0].trim();
        }
        throw new Error('No stream URL found');
    })();

    resolvePromiseCache.set(videoId, promise);
    
    try {
        const streamUrl = await promise;
        urlCache.set(videoId, streamUrl);
        setTimeout(() => urlCache.delete(videoId), 3600 * 1000);
        return streamUrl;
    } finally {
        resolvePromiseCache.delete(videoId);
    }
}

// --- Local File Cache (background download) ---
function startLocalDownload(videoId, streamUrl) {
    if (localFileCache.has(videoId)) return;

    const localPath = path.join(__dirname, `cache_${videoId}.m4a`);
    localFileCache.set(videoId, { path: localPath, ready: false });

    console.log(`[cache] Downloading full audio for ${videoId}...`);

    const dl = spawn(ffmpegPath, [
        '-i', streamUrl,
        '-c', 'copy',
        '-f', 'mp4',
        '-y',
        localPath
    ]);

    dl.stderr.on('data', () => {}); // suppress ffmpeg stderr

    dl.on('close', (code) => {
        const entry = localFileCache.get(videoId);
        if (entry) {
            if (code === 0) {
                entry.ready = true;
                console.log(`[cache] Audio cached locally for ${videoId}`);
                // Auto-cleanup after 1 hour
                setTimeout(() => {
                    localFileCache.delete(videoId);
                    try { fs.unlinkSync(localPath); } catch(e) {}
                    console.log(`[cache] Cleaned up cache for ${videoId}`);
                }, 3600 * 1000);
            } else {
                console.error(`[cache] Download failed for ${videoId} (exit ${code})`);
                localFileCache.delete(videoId);
            }
        }
    });
}

// --- Chunk Extraction ---
app.get('/audio-chunk', async (req, res) => {
    const videoId = req.query.v;
    const timestamp = parseFloat(req.query.t);
    const duration = parseFloat(req.query.d) || 10;

    if (!videoId || isNaN(timestamp)) {
        return res.status(400).send('Missing video ID or timestamp');
    }

    let startTime = timestamp - duration;
    let actualDuration = duration;

    if (startTime < 0) {
        actualDuration = timestamp;
        startTime = 0;
    }

    if (actualDuration <= 0) {
        return res.status(400).send('Invalid timestamp/duration');
    }

    try {
        const streamUrl = await getStreamUrl(videoId);

        // Start background download of full file (if not already started)
        startLocalDownload(videoId, streamUrl);

        // Use local file if ready, otherwise remote URL
        const cached = localFileCache.get(videoId);
        const useLocal = cached && cached.ready;
        const inputSource = useLocal ? cached.path : streamUrl;

        console.log(`[ffmpeg] Chunk ${startTime.toFixed(0)}s-${(startTime + actualDuration).toFixed(0)}s [${useLocal ? 'LOCAL' : 'REMOTE'}]`);

        const ffmpegArgs = [
            '-ss', startTime.toString(),
            '-i', inputSource,
            '-t', actualDuration.toString(),
            '-c:a', 'libmp3lame',
            '-b:a', '128k',
            '-f', 'mp3',
            'pipe:1'
        ];

        const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);

        let chunks = [];
        ffmpegProcess.stdout.on('data', (chunk) => {
            chunks.push(chunk);
        });

        ffmpegProcess.on('error', (err) => {
            console.error(`[ffmpeg error] chunk ${startTime.toFixed(0)}s:`, err);
        });

        ffmpegProcess.on('close', (code) => {
            if (code === 0 && chunks.length > 0) {
                const buffer = Buffer.concat(chunks);
                if (!res.headersSent) {
                    res.setHeader('Content-Type', 'audio/mp3');
                    res.setHeader('Cache-Control', 'public, max-age=3600');
                    res.send(buffer);
                }
            } else {
                console.error(`[ffmpeg] Failed to fetch chunk ${startTime.toFixed(0)}s (exit ${code}, bytes: ${chunks.reduce((acc, val) => acc + val.length, 0)})`);
                if (!res.headersSent) {
                    res.status(500).send('ffmpeg failed or returned no data');
                }
            }
        });

        req.on('close', () => {
            ffmpegProcess.kill();
        });

    } catch (error) {
        console.error('Error:', error);
        if (!res.headersSent) {
            return res.status(500).send('Failed to fetch audio chunk');
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Audio Reverse Server running on port ${PORT}`);
});

// Cleanup on exit
process.on('exit', () => {
    for (const [, entry] of localFileCache) {
        try { fs.unlinkSync(entry.path); } catch(e) {}
    }
});
