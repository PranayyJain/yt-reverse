# ⏪ YT Reverse Extension 🔄

Ever wanted to watch a YouTube video backwards? Now you can! **YT Reverse** is a powerful Chrome Extension that allows you to seamlessly play both the video and audio of any YouTube video in reverse.

---

## ✨ Features
- **True Reverse Playback:** Plays both video and audio in reverse, completely synced.
- **Smart Audio Buffering:** Pre-fetches and decodes audio chunks dynamically so you don't have to wait for a 2-hour video to download before reversing.
- **Hardware Optimized:** Custom `requestAnimationFrame` video scrubbing to keep your browser running smoothly without thrashing the video decoder.
- **Seamless UI Integration:** Injects a sleek "Reverse" button directly into the native YouTube player controls!

## 🚀 Use Cases & Origin Story
**The Origin Story:** This extension was born out of pure necessity. I was trying to watch a movie on YouTube, but the uploader had reversed the entire video and audio to bypass YouTube's copyright filters! Instead of giving up, I built this extension to reverse it back to normal in real-time. 

Other great use cases include:
- **Watching Copyright-Reversed Movies:** Easily reverse full-length movies that were uploaded backwards to bypass Content ID.
- **Episode Recaps:** Good to watch a recap like for an episode of what happened previously!
- **Easter Eggs & Subliminal Messages:** Hear what that song *really* sounds like when played backwards.
- **Choreography & Sports:** Watch complex movements, dances, or sports tricks in reverse to understand how they are performed.
- **Animation & Art:** See how drawings or animations unfold in reverse.
- **Language Learning:** Hear words spoken backward to understand phonetics in a weird new way!
- **Pure Fun:** Everything looks hilarious when it happens backwards.

---

## 🛠️ Installation & Local Setup

Currently, this extension relies on a locally hosted backend to process and serve the reversed audio chunks (because doing complex audio stream extraction directly inside the browser is hard!). 

### 1. Start the Backend Server
You'll need Node.js and ffmpeg installed on your system.

```bash
cd backend
npm install
npm start
```
*The server will start on `http://localhost:3000`.*

### 2. Load the Extension in Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** in the top right corner.
3. Click **Load unpacked** in the top left.
4. Select the root folder of this repository.

Now, just go to any YouTube video, click the new Reverse button on the player, and enjoy!

---

## 🤝 Contributing (Help Make It Deployable!)

**Heads up to contributors!** Right now, the backend is running purely on `localhost:3000` because it uses `yt-dlp` and `ffmpeg` to process audio chunks on the fly. 

We would absolutely **LOVE** your help to make this fully **deployable** and serverless (or hosted on a lightweight cloud infrastructure). If you have ideas on how to optimize the backend for deployment, bypass CORS/CSP elegantly, or even handle the audio extraction entirely client-side using WebAssembly (WASM), please open a PR or an Issue!

Let's make YouTube reversing accessible to everyone without needing a local terminal! 🎉

---
*Created by [PranayyJain](https://github.com/PranayyJain)*
