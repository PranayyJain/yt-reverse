const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const youtubedl = require('yt-dlp-exec');

const app = express();
app.use(cors());

const urlCache = new Map(); // videoId -> streamUrl

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

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`Requesting audio chunk for ${videoId} from ${startTime}s to ${startTime + actualDuration}s`);

    try {
        let streamUrl = urlCache.get(videoId);
        
        if (!streamUrl) {
            console.log(`Fetching new stream URL for ${videoId}...`);
            let rawUrl = await youtubedl(videoUrl, {
                f: '140', // Crucial: m4a allows accurate fast-seeking
                g: true
            });

            if (typeof rawUrl === 'string') {
                streamUrl = rawUrl.split('\n')[0].trim();
                urlCache.set(videoId, streamUrl);
                setTimeout(() => urlCache.delete(videoId), 3600 * 1000);
            } else {
                return res.status(500).send('No stream URL found');
            }
        }

        if (!streamUrl) {
            return res.status(500).send('No stream URL found');
        }

        // Use ffmpeg to accurately cut the chunk. We use -c copy for instant speed.
        // The empty_moov flag makes the piped mp4 stream playable by Web Audio API.
        const ffmpegArgs = [
            '-ss', startTime.toString(),
            '-i', streamUrl,
            '-t', actualDuration.toString(),
            '-c', 'copy',
            '-f', 'mp4',
            '-movflags', 'frag_keyframe+empty_moov',
            'pipe:1'
        ];

        const ffmpegProcess = spawn(ffmpegPath, ffmpegArgs);

        res.setHeader('Content-Type', 'audio/mp4');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        
        ffmpegProcess.stdout.pipe(res);
        
        ffmpegProcess.on('error', (err) => {
            console.error('ffmpeg process error:', err);
        });

        req.on('close', () => {
            ffmpegProcess.kill();
        });

    } catch (error) {
        console.error('yt-dlp error:', error);
        if (!res.headersSent) {
            return res.status(500).send('Failed to fetch audio chunk');
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Audio Reverse Server running on port ${PORT}`);
});
