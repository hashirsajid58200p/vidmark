// VidMark - Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  console.log("VidMark Extension initialized and ready.");
});

// Listen to keyboard shortcut commands registered in manifest.json
chrome.commands.onCommand.addListener((command) => {
  if (command === "quick-mark") {
    // Query the currently active tab in the active window
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab && activeTab.id) {
        // Send a message to content script to add bookmark at current timestamp
        chrome.tabs.sendMessage(activeTab.id, { action: "QUICK_MARK" }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn(
              "VidMark: Quick bookmark shortcut failed. Either the page is a restricted browser internal tab, or the content script has not initialized yet.",
              chrome.runtime.lastError.message
            );
          } else if (response && response.success) {
            console.log(`VidMark: Quick bookmark saved successfully at timestamp ${response.time}s.`);
          } else {
            console.warn("VidMark: Quick bookmark operation skipped:", response?.error || "Unknown error");
          }
        });
      }
    });
  }
});
