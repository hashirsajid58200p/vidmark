// VidMark - Background Service Worker

// Active frame maps to track which tab sub-frame contains the video element: tabId -> frameId
const activeVideoFrames = {};

chrome.runtime.onInstalled.addListener(() => {
  console.log("VidMark Extension initialized and ready.");
});

// Listen to registration messages from frame content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "REGISTER_VIDEO_FRAME") {
    if (sender.tab && sender.tab.id) {
      const tabId = sender.tab.id;
      const frameId = sender.frameId || 0;
      const newScore = message.score || 0;

      const current = activeVideoFrames[tabId];
      // Overwrite if:
      // 1. No active frame registered yet
      // 2. The registering frame is the SAME as the current registered frame
      // 3. The new score is strictly greater than the current registered frame's score
      if (!current || current.frameId === frameId || newScore > current.score) {
        activeVideoFrames[tabId] = {
          frameId: frameId,
          score: newScore,
          timestamp: Date.now()
        };
        console.log(`VidMark: Registered video frame ${frameId} for tab ${tabId} with score ${newScore}`);
      }
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: "Sender tab details missing" });
    }
  } 
  
  else if (message.action === "RESET_VIDEO_FRAME") {
    if (sender.tab && sender.tab.id) {
      delete activeVideoFrames[sender.tab.id];
      console.log(`VidMark: Reset video frame registry for tab ${sender.tab.id}`);
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false });
    }
  }
  
  else if (message.action === "GET_ACTIVE_FRAME") {
    const tabId = message.tabId;
    const current = activeVideoFrames[tabId];
    const activeFrameId = current ? current.frameId : 0;
    sendResponse({ frameId: activeFrameId });
  }
  
  return true;
});

// Clean up frame state mappings on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  delete activeVideoFrames[tabId];
});

// Listen to the QUICK_MARK command registered in manifest.json
chrome.commands.onCommand.addListener((command) => {
  if (command === "QUICK_MARK") {
    // Query active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab && activeTab.id) {
        // Query memory for the active video frame of this tab
        const current = activeVideoFrames[activeTab.id];
        const frameId = current ? current.frameId : 0;
        
        // Send a message directly to the registered frame
        chrome.tabs.sendMessage(activeTab.id, { action: "QUICK_MARK" }, { frameId }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn(
              `VidMark: Quick bookmark shortcut failed for frame ${frameId}.`,
              chrome.runtime.lastError.message
            );
          } else if (response && response.success) {
            console.log(`VidMark: Quick bookmark saved successfully at timestamp ${response.time}s in frame ${frameId}.`);
          } else {
            console.warn("VidMark: Quick bookmark operation skipped:", response?.error || "Unknown error");
          }
        });
      }
    });
  }
});
