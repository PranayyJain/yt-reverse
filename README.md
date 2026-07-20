# ⏪ YT Reverse - YouTube Video & Audio Reversal Extension 🔄

Looking for a **YouTube reversal extension**? **YT Reverse** is the most powerful Chrome Extension that allows you to seamlessly play any YouTube video backwards. Whether you want to reverse YouTube audio, watch a video in reverse, or uncover hidden messages, our tool handles it all in real-time.

---

## ✨ Features
- **True Reverse Playback:** Plays both video and audio in reverse, completely synced.
- **Smart Audio Buffering:** Pre-fetches and decodes audio chunks dynamically so you don't have to wait for a 2-hour video to download before reversing.
- **Hardware Optimized:** Custom `requestAnimationFrame` video scrubbing to keep your browser running smoothly without thrashing the video decoder.
- **Seamless UI Integration:** Injects a sleek "Reverse" button directly into the native YouTube player controls!

## 🙌 Use Cases & Origin Story
**The Origin Story:** This extension was born out of pure necessity. I was trying to watch a long video on YouTube, but for some bizarre reason, the uploader had completely reversed both the video and the audio! Since I couldn't find any such extension online to fix it, I decided to take on the challenge myself and built this to reverse it back to normal in real-time.

Other great use cases include:
- **Watching Uploaded-in-Reverse Videos:** Easily reverse full-length videos that were uploaded backwards for artistic (or bizarre) reasons.
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
### 📬 Let's Connect!
[![LinkedIn Connect](https://img.shields.io/badge/LinkedIn-Connect_with_me-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/pranayyjain/)

*Created by [PranayyJain](https://github.com/PranayyJain)*
