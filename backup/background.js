chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fetchAudioChunk') {
        const url = `http://localhost:3000/audio-chunk?v=${encodeURIComponent(request.videoId)}&t=${request.timestamp}&d=${request.duration}`;
        
        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.blob();
            })
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    sendResponse({ success: true, dataUri: reader.result });
                };
                reader.onerror = () => {
                    sendResponse({ success: false, error: 'Failed to read blob' });
                };
                reader.readAsDataURL(blob);
            })
            .catch(error => {
                console.error('Error fetching audio:', error);
                sendResponse({ success: false, error: error.message });
            });
            
        return true; // Keep the message channel open for asynchronous response
    }
});
