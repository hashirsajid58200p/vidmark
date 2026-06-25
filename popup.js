// VidMark - Popup Logic

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initPopup();
  wireTabListeners();
  wireSettingsListeners();
});

// UI Elements mapping
const activeState = document.getElementById("active-state");
const emptyState = document.getElementById("empty-state");
const videoTitle = document.getElementById("video-title");
const videoThumbnail = document.getElementById("video-thumbnail");
const videoTime = document.getElementById("video-time");
const saveBtn = document.getElementById("save-timestamp");
const bookmarksList = document.getElementById("bookmarks-list");

let currentTabId = null;
let activeFrameId = 0; // Target sub-frame hosting the video element

// Helper to normalize the URL by stripping seek query parameters
function getNormalizedUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.searchParams.delete('t');
    url.searchParams.delete('time_continue');
    url.searchParams.delete('start');
    if (url.hash && url.hash.startsWith('#t=')) {
      url.hash = '';
    }
    return url.toString();
  } catch (e) {
    return rawUrl;
  }
}

// Helper to display a custom confirmation modal overlay inside the popup bounds
function showConfirm(titleText, messageText) {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirm-modal");
    const modalTitle = document.getElementById("confirm-modal-title");
    const modalMessage = document.getElementById("confirm-modal-message");
    const cancelBtn = document.getElementById("confirm-modal-cancel");
    const confirmBtn = document.getElementById("confirm-modal-confirm");
    const card = document.getElementById("confirm-modal-card");

    modalTitle.textContent = titleText;
    modalMessage.textContent = messageText;

    // Show overlay
    modal.classList.remove("hidden");
    
    // Animate scale in
    requestAnimationFrame(() => {
      card.classList.remove("scale-95");
      card.classList.add("scale-100");
    });

    const cleanup = (result) => {
      card.classList.remove("scale-100");
      card.classList.add("scale-95");
      setTimeout(() => {
        modal.classList.add("hidden");
      }, 150);
      
      // Clean up event handlers to avoid memory leak
      cancelBtn.onclick = null;
      confirmBtn.onclick = null;
      
      resolve(result);
    };

    cancelBtn.onclick = () => cleanup(false);
    confirmBtn.onclick = () => cleanup(true);
  });
}

// Helper to display a custom alert modal overlay inside the popup bounds
function showAlert(titleText, messageText) {
  return new Promise((resolve) => {
    const modal = document.getElementById("alert-modal");
    const modalTitle = document.getElementById("alert-modal-title");
    const modalMessage = document.getElementById("alert-modal-message");
    const okBtn = document.getElementById("alert-modal-ok");
    const card = document.getElementById("alert-modal-card");

    modalTitle.textContent = titleText;
    modalMessage.textContent = messageText;

    // Show overlay
    modal.classList.remove("hidden");
    
    // Animate scale in
    requestAnimationFrame(() => {
      card.classList.remove("scale-95");
      card.classList.add("scale-100");
    });

    const cleanup = () => {
      card.classList.remove("scale-100");
      card.classList.add("scale-95");
      setTimeout(() => {
        modal.classList.add("hidden");
      }, 150);
      
      okBtn.onclick = null;
      resolve();
    };

    okBtn.onclick = cleanup;
  });
}

// Initialize the extension popup
async function initPopup() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      showEmptyState();
      return;
    }
    
    currentTabId = tab.id;

    if (!tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")) {
      showEmptyState();
      return;
    }

    // Query the background service worker to find the registered frame hosting the video tag
    chrome.runtime.sendMessage({ action: "GET_ACTIVE_FRAME", tabId: tab.id }, (response) => {
      activeFrameId = response?.frameId || 0;

      // Request video state from content script in that specific frame
      chrome.tabs.sendMessage(tab.id, { action: "GET_VIDEO_STATE" }, { frameId: activeFrameId }, (videoState) => {
        if (chrome.runtime.lastError || !videoState || !videoState.found) {
          // If message to targeted frame failed, try messaging the main top-frame as a fallback
          chrome.tabs.sendMessage(tab.id, { action: "GET_VIDEO_STATE" }, { frameId: 0 }, (topState) => {
            if (chrome.runtime.lastError || !topState || !topState.found) {
              showEmptyState();
            } else {
              activeFrameId = 0;
              showActiveState(topState);
            }
          });
        } else {
          // We got the video state from the subframe!
          // Query the top-frame (frame 0) to get the clean page title and cover thumbnail as fallback/upgrade
          if (activeFrameId !== 0) {
            chrome.tabs.sendMessage(tab.id, { action: "GET_VIDEO_STATE" }, { frameId: 0 }, (topState) => {
              if (!chrome.runtime.lastError && topState && topState.found) {
                // Merge the top-frame's high-quality metadata thumbnail and title!
                if (topState.thumbnail && !topState.thumbnail.startsWith('data:image')) {
                  videoState.thumbnail = topState.thumbnail;
                }
                if (topState.title && topState.title !== "Video" && topState.title !== "Active Video") {
                  videoState.title = topState.title;
                }
              }
              showActiveState(videoState);
            });
          } else {
            showActiveState(videoState);
          }
        }
      });
    });

  } catch (err) {
    console.error("VidMark Initialization Error:", err);
    showEmptyState();
  }
}

// Show the Empty state UI
function showEmptyState() {
  activeState.style.display = "none";
  emptyState.style.display = "flex";
  switchTab("bookmarks", "empty");
}

// Show the Active state UI with video bookmarking features
function showActiveState(videoState) {
  emptyState.style.display = "none";
  activeState.style.display = "flex";
  switchTab("bookmarks", "active");

  // Populate Video Card Info
  videoTitle.textContent = videoState.title || "Active Video";
  videoTime.textContent = formatTime(videoState.duration);
  videoThumbnail.src = videoState.thumbnail || 'icons/logo.png';
  videoThumbnail.alt = videoState.title || 'Video Thumbnail';

  // Apply marquee animation if title is too long
  updateTitleMarquee();

  // Play/pause toggle on clicking main thumbnail container
  const thumbContainer = document.getElementById("video-thumbnail-container");
  if (thumbContainer) {
    updatePlayOverlayIcon(videoState.paused);
    if (!thumbContainer.dataset.listenerAttached) {
      thumbContainer.dataset.listenerAttached = "true";
      thumbContainer.addEventListener("click", () => {
        const msg = { action: "TOGGLE_PLAYBACK" };
        chrome.tabs.sendMessage(currentTabId, msg, { frameId: activeFrameId }, (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            // Fallback: target main frame (frameId: 0)
            chrome.tabs.sendMessage(currentTabId, msg, { frameId: 0 }, (fallbackResponse) => {
              if (!chrome.runtime.lastError && fallbackResponse && fallbackResponse.success) {
                updatePlayOverlayIcon(fallbackResponse.paused);
              }
            });
          } else {
            updatePlayOverlayIcon(response.paused);
          }
        });
      });
    }
  }

  const normalizedUrl = getNormalizedUrl(videoState.url);
  const storageKey = `vidmark_bm_${normalizedUrl}`;

  // Load and render existing bookmarks
  loadBookmarks(storageKey);

  // Hook up the Add Bookmark button
  saveBtn.replaceWith(saveBtn.cloneNode(true));
  const newSaveBtn = document.getElementById("save-timestamp");
  
  newSaveBtn.addEventListener("click", () => {
    // Send QUICK_MARK to content script in targeted frame
    chrome.tabs.sendMessage(currentTabId, { action: "QUICK_MARK" }, { frameId: activeFrameId }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        const errorMsg = response?.error || chrome.runtime.lastError?.message || "Failed to save bookmark. Is there a video playing on the active tab?";
        showAlert("Bookmark Failed", errorMsg);
        return;
      }
      loadBookmarks(storageKey);
    });
  });

  notifyContentScriptUpdate();
}

// Load and render bookmarks for the current video from local storage
function loadBookmarks(storageKey) {
  chrome.storage.local.get([storageKey], (result) => {
    const bookmarks = result[storageKey] || [];
    renderBookmarks(bookmarks, storageKey);
  });
}

// Save inline note editing changes
function saveInlineEdit(time, newNote, storageKey) {
  chrome.storage.local.get([storageKey], (result) => {
    const bookmarks = result[storageKey] || [];
    const index = bookmarks.findIndex(bm => bm.time === time);
    
    if (index !== -1) {
      bookmarks[index].note = newNote.trim() || `Bookmark @ ${formatTime(time)}`;
      chrome.storage.local.set({ [storageKey]: bookmarks }, () => {
        renderBookmarks(bookmarks, storageKey);
        notifyContentScriptUpdate();
      });
    }
  });
}

// Delete a saved bookmark
function deleteBookmark(time, storageKey) {
  chrome.storage.local.get([storageKey], (result) => {
    let bookmarks = result[storageKey] || [];
    bookmarks = bookmarks.filter(bm => bm.time !== time);
    chrome.storage.local.set({ [storageKey]: bookmarks }, () => {
      renderBookmarks(bookmarks, storageKey);
      notifyContentScriptUpdate();
    });
  });
}

// Send a message to seek video in the active frame container
function seekVideo(time) {
  chrome.tabs.sendMessage(currentTabId, { action: "SEEK_VIDEO", time }, { frameId: activeFrameId }, (response) => {
    if (chrome.runtime.lastError || !response || !response.success) {
      console.warn("Seeking failed:", chrome.runtime.lastError || response?.error);
    }
  });
}

// Notify content script in the targeted frame to update visual timeline checkpoints
function notifyContentScriptUpdate() {
  if (currentTabId) {
    chrome.tabs.sendMessage(currentTabId, { action: "UPDATE_CHECKPOINTS" }, { frameId: activeFrameId }, () => {
      if (chrome.runtime.lastError) {
        // ignore errors silently
      }
    });
  }
}

// Tab Switching logic
function switchTab(viewName, state = 'active') {
  const views = ['bookmarks', 'history', 'settings', 'help'];
  
  views.forEach(v => {
    const el = document.getElementById(`${state}-${v}-view`);
    if (el) {
      el.style.display = (v === viewName) ? 'flex' : 'none';
    }
  });

  // Load History items dynamically if history view tab is requested
  if (viewName === 'history') {
    loadHistory();
  }

  // Adjust bottom navigation buttons' active colors & fonts
  const tabs = ['bookmarks', 'history'];
  tabs.forEach(t => {
    const btn = document.getElementById(`${state}-${t}-tab`);
    if (btn) {
      if (t === viewName) {
        btn.className = "flex flex-col items-center justify-center text-primary font-bold active:scale-90 hover:text-primary-fixed-dim transition-all w-[96px] h-[48px] gap-1";
        const icon = btn.querySelector('.material-symbols-outlined');
        if (icon) icon.style.fontVariationSettings = "'FILL' 1";
      } else {
        btn.className = "flex flex-col items-center justify-center text-on-surface-variant active:scale-90 hover:text-primary-fixed-dim transition-all w-[96px] h-[48px] gap-1";
        const icon = btn.querySelector('.material-symbols-outlined');
        if (icon) icon.style.fontVariationSettings = "'FILL' 0";
      }
    }
  });

  // Adjust active header buttons coloring
  const settingsBtn = document.getElementById(`${state}-settings-btn`);
  if (settingsBtn) {
    if (viewName === 'settings') {
      settingsBtn.classList.remove('text-on-surface-variant');
      settingsBtn.classList.add('text-primary');
    } else {
      settingsBtn.classList.remove('text-primary');
      settingsBtn.classList.add('text-on-surface-variant');
    }
  }

  const helpBtn = document.getElementById(`${state}-help-btn`);
  if (helpBtn) {
    if (viewName === 'help') {
      helpBtn.classList.remove('text-on-surface-variant');
      helpBtn.classList.add('text-primary');
    } else {
      helpBtn.classList.remove('text-primary');
      helpBtn.classList.add('text-on-surface-variant');
    }
  }
}

// Wire up event listeners to bottom nav and top header buttons
function wireTabListeners() {
  const states = ['active', 'empty'];
  
  states.forEach(state => {
    // Bottom tabs: Bookmarks, History
    ['bookmarks', 'history'].forEach(tabName => {
      const btn = document.getElementById(`${state}-${tabName}-tab`);
      if (btn) {
        btn.addEventListener('click', () => {
          switchTab(tabName, state);
        });
      }
    });

    // Top Header Buttons: Settings, Help
    const settingsBtn = document.getElementById(`${state}-settings-btn`);
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        switchTab('settings', state);
      });
    }

    const helpBtn = document.getElementById(`${state}-help-btn`);
    if (helpBtn) {
      helpBtn.addEventListener('click', () => {
        switchTab('help', state);
      });
    }
  });
}

// Render the bookmark list into the UI container
function renderBookmarks(bookmarks, storageKey) {
  bookmarksList.innerHTML = "";

  if (bookmarks.length === 0) {
    bookmarksList.innerHTML = `
      <div class="flex-1 flex flex-col items-center justify-center text-center p-md text-on-surface-variant min-h-[140px] z-10">
        <span class="material-symbols-outlined text-[36px] opacity-40 mb-xs">bookmark_border</span>
        <p class="font-body-md text-body-md">No bookmarks saved yet.</p>
      </div>
    `;
    return;
  }

  bookmarks.forEach((bm) => {
    const entry = document.createElement("div");
    entry.className = "flex items-center justify-between py-sm border-b border-white/5 group z-10 bookmark-item-row";

    const thumbUrl = bm.thumbnail || 'icons/logo.png';

    entry.innerHTML = `
      <!-- Thumbnail frame canvas snapshot -->
      <div class="relative w-[56px] h-[36px] bg-surface-container-low rounded overflow-hidden shrink-0 mr-sm flex items-center justify-center border border-white/5">
        <img class="w-full h-full object-cover" src="${thumbUrl}" alt="Cap" onerror="this.onerror=null; this.src='icons/logo.png';"/>
        <div class="play-overlay absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
          <span class="material-symbols-outlined text-white text-[16px] play-trigger" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
        </div>
      </div>
      
      <!-- Bookmark metadata content -->
      <div class="flex-1 min-w-0 pr-sm flex flex-col">
        <span class="text-primary font-bold font-label-sm text-label-sm play-trigger cursor-pointer">[${formatTime(bm.time)}]</span>
        <p class="note-text font-body-md text-body-md text-on-surface truncate-text leading-tight" title="${escapeHTML(bm.note)}">${escapeHTML(bm.note)}</p>
      </div>
      
      <!-- Action buttons -->
      <div class="flex items-center gap-1 text-on-surface-variant opacity-70 group-hover:opacity-100 transition-opacity shrink-0">
        <button aria-label="Play" class="play-trigger hover:text-primary transition-colors flex items-center justify-center p-1 rounded-full">
          <span class="material-symbols-outlined text-[18px]">play_arrow</span>
        </button>
        <button aria-label="Edit" class="edit-btn hover:text-primary transition-colors flex items-center justify-center p-1 rounded-full">
          <span class="material-symbols-outlined text-[18px]">edit</span>
        </button>
        <button aria-label="Delete" class="delete-btn hover:text-error transition-colors flex items-center justify-center p-1 rounded-full">
          <span class="material-symbols-outlined text-[18px]">delete</span>
        </button>
      </div>
    `;

    // Direct event listener binding to handle seeks securely
    entry.querySelectorAll(".play-trigger").forEach(btn => {
      btn.addEventListener("click", () => seekVideo(bm.time));
    });

    entry.querySelector(".delete-btn").addEventListener("click", () => deleteBookmark(bm.time, storageKey));

    // Inline note editing implementation
    const noteText = entry.querySelector(".note-text");
    const editBtn = entry.querySelector(".edit-btn");
    const editIcon = editBtn.querySelector(".material-symbols-outlined");

    editBtn.addEventListener("click", () => {
      const isEditing = entry.classList.contains("is-editing");

      if (!isEditing) {
        entry.classList.add("is-editing");
        editIcon.textContent = "done"; 
        editBtn.classList.remove("hover:text-primary");
        editBtn.classList.add("text-primary");

        const input = document.createElement("input");
        input.type = "text";
        input.className = "bg-surface-container-low border-b-2 border-primary text-on-surface rounded px-1 py-xs w-full outline-none font-body-md text-body-md";
        input.value = bm.note;

        noteText.replaceWith(input);
        input.focus();
        input.select();

        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            saveInlineEdit(bm.time, input.value, storageKey);
          } else if (e.key === "Escape") {
            loadBookmarks(storageKey);
          }
        });
      } else {
        const input = entry.querySelector("input");
        saveInlineEdit(bm.time, input.value, storageKey);
      }
    });

    bookmarksList.appendChild(entry);
  });
}

// Retrieve and render Recently Bookmarked Videos History
function loadHistory() {
  chrome.storage.local.get(null, (items) => {
    // Get all keys starting with vidmark_bm_
    const keys = Object.keys(items).filter(k => k.startsWith("vidmark_bm_"));

    const renderList = (container) => {
      if (!container) return;
      container.innerHTML = "";

      if (keys.length === 0) {
        container.className = "flex-1 flex flex-col items-center justify-center p-md text-center min-h-[300px]";
        container.innerHTML = `
          <span class="material-symbols-outlined text-[40px] text-primary mb-sm">history</span>
          <h3 class="font-headline-md text-on-surface mb-xs">History</h3>
          <p class="font-body-md text-on-surface-variant max-w-[240px] leading-relaxed">No recently bookmarked videos found.</p>
        `;
        return;
      }

      container.className = "flex-1 flex flex-col p-md text-left overflow-y-auto custom-scrollbar pb-[72px]";
      
      // Header Text
      const headerText = document.createElement("h3");
      headerText.className = "font-headline-md text-headline-md-mobile text-on-surface font-semibold mb-sm pr-xs tracking-tight";
      headerText.textContent = "Bookmarked Videos";
      container.appendChild(headerText);

      const listWrapper = document.createElement("div");
      listWrapper.className = "flex flex-col gap-xs flex-1";

      keys.forEach(key => {
        const bookmarks = items[key] || [];
        if (bookmarks.length === 0) return;

        const videoUrl = key.substring("vidmark_bm_".length);
        
        // Smarter Title & Thumbnail parsing: grab first item notes and frames
        const firstBm = bookmarks[0];
        const title = firstBm.note || "Annotated Video Link";
        const thumbnail = bookmarks.find(b => b.thumbnail)?.thumbnail || 'icons/logo.png';

        const item = document.createElement("div");
        item.className = "flex items-center gap-sm p-sm bg-surface-container rounded-lg border border-white/5 hover:border-primary/20 transition-all cursor-pointer group active:scale-[0.98]";

        item.innerHTML = `
          <!-- Main link area (opens tab) -->
          <div class="flex items-center gap-sm flex-1 min-w-0 link-area">
            <div class="relative w-[64px] h-[40px] bg-surface-container-low rounded overflow-hidden shrink-0 border border-white/5">
              <img class="w-full h-full object-cover" src="${thumbnail}" alt="Thumb" onerror="this.onerror=null; this.src='icons/logo.png';"/>
            </div>
            <div class="flex-1 min-w-0 flex flex-col justify-center">
              <h4 class="font-body-md text-body-md text-on-surface font-semibold truncate leading-tight group-hover:text-primary transition-colors" title="${escapeHTML(title)}">${escapeHTML(title)}</h4>
              <p class="font-label-sm text-label-sm text-on-surface-variant mt-xs">${bookmarks.length} bookmark${bookmarks.length > 1 ? 's' : ''}</p>
            </div>
          </div>
          <!-- Action buttons area -->
          <div class="flex items-center gap-1 text-on-surface-variant shrink-0">
            <button aria-label="Open Link" class="open-btn hover:text-primary transition-colors flex items-center justify-center p-1 rounded-full">
              <span class="material-symbols-outlined text-[18px]">open_in_new</span>
            </button>
            <button aria-label="Delete Video Bookmarks" class="delete-history-btn hover:text-error transition-colors flex items-center justify-center p-1 rounded-full">
              <span class="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>
        `;

        item.querySelector(".link-area").addEventListener("click", () => {
          chrome.tabs.create({ url: videoUrl });
        });
        
        item.querySelector(".open-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          chrome.tabs.create({ url: videoUrl });
        });
        
        item.querySelector(".delete-history-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          showConfirm("Delete History", `Delete all bookmarks for "${title}"?`).then((confirmed) => {
            if (confirmed) {
              chrome.storage.local.remove(key, () => {
                loadHistory();
                // Also update timeline checkpoints of the active tab if it matches
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                  const activeTab = tabs[0];
                  if (activeTab && getNormalizedUrl(activeTab.url) === videoUrl) {
                    initPopup();
                  }
                });
              });
            }
          });
        });

        listWrapper.appendChild(item);
      });

      container.appendChild(listWrapper);
    };

    const activeHistory = document.getElementById("active-history-view");
    renderList(activeHistory);

    const emptyHistory = document.getElementById("empty-history-view");
    renderList(emptyHistory);
  });
}

// Format seconds into a visual time duration string (HH:MM:SS or MM:SS)
function formatTime(secs) {
  const s = Math.floor(secs);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  const pad = (n) => String(n).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

// Escape strings to prevent HTML/XSS injection vulnerabilities
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

const THEME_PRESETS = {
  cyan: {
    "--color-primary-rgb": "164 230 255",
    "--color-primary-container-rgb": "0 209 255",
    "--color-primary-fixed-dim-rgb": "76 214 255",
    "--color-on-primary-rgb": "0 53 67",
    "--color-on-primary-container-rgb": "0 86 106",
    "--theme-filter": "none"
  },
  red: {
    "--color-primary-rgb": "255 180 171",
    "--color-primary-container-rgb": "255 84 73",
    "--color-primary-fixed-dim-rgb": "255 137 125",
    "--color-on-primary-rgb": "105 0 5",
    "--color-on-primary-container-rgb": "65 0 2",
    "--theme-filter": "hue-rotate(173deg) brightness(1.1)"
  },
  orange: {
    "--color-primary-rgb": "255 184 121",
    "--color-primary-container-rgb": "255 159 10",
    "--color-primary-fixed-dim-rgb": "255 167 38",
    "--color-on-primary-rgb": "79 37 0",
    "--color-on-primary-container-rgb": "45 22 0",
    "--theme-filter": "hue-rotate(206deg)"
  },
  green: {
    "--color-primary-rgb": "142 243 167",
    "--color-primary-container-rgb": "48 209 88",
    "--color-primary-fixed-dim-rgb": "97 224 130",
    "--color-on-primary-rgb": "0 83 31",
    "--color-on-primary-container-rgb": "0 57 18",
    "--theme-filter": "hue-rotate(295deg) saturate(0.8)"
  },
  purple: {
    "--color-primary-rgb": "232 185 255",
    "--color-primary-container-rgb": "191 90 242",
    "--color-primary-fixed-dim-rgb": "212 142 255",
    "--color-on-primary-rgb": "86 0 126",
    "--color-on-primary-container-rgb": "50 0 74",
    "--theme-filter": "hue-rotate(89deg) brightness(1.2)"
  }
};

function applyTheme(themeName) {
  const preset = THEME_PRESETS[themeName] || THEME_PRESETS.cyan;
  const root = document.documentElement;
  for (const [key, val] of Object.entries(preset)) {
    root.style.setProperty(key, val);
  }

  // Save chosen theme in local storage
  chrome.storage.local.set({ active_theme: themeName }, () => {
    notifyContentScriptUpdate();
  });

  // Update selected UI borders of theme-dots
  document.querySelectorAll(".theme-dot").forEach(btn => {
    if (btn.getAttribute("data-theme") === themeName) {
      btn.classList.add("border-white", "ring-2", "ring-primary-container", "ring-offset-2", "ring-offset-surface-container");
      btn.classList.remove("border-transparent");
    } else {
      btn.classList.remove("border-white", "ring-2", "ring-primary-container", "ring-offset-2", "ring-offset-surface-container");
      btn.classList.add("border-transparent");
    }
  });
}

function applyThemeMode(mode) {
  const root = document.documentElement;
  if (mode === "light") {
    root.classList.remove("dark");
    root.classList.add("light");
  } else {
    root.classList.remove("light");
    root.classList.add("dark");
  }
  
  chrome.storage.local.set({ theme_mode: mode });
  updateThemeModeToggleUI(mode);
}

function updateThemeModeToggleUI(mode) {
  document.querySelectorAll(".theme-mode-btn").forEach(btn => {
    const knob = btn.querySelector("span");
    if (mode === "dark") {
      btn.classList.remove("bg-surface-variant");
      btn.classList.add("bg-primary");
      if (knob) {
        knob.classList.remove("translate-x-1");
        knob.classList.add("translate-x-6");
      }
    } else {
      btn.classList.remove("bg-primary");
      btn.classList.add("bg-surface-variant");
      if (knob) {
        knob.classList.remove("translate-x-6");
        knob.classList.add("translate-x-1");
      }
    }
  });
}

function initTheme() {
  chrome.storage.local.get(["active_theme", "theme_mode"], (result) => {
    const activeTheme = result.active_theme || "cyan";
    const themeMode = result.theme_mode || "dark";
    applyTheme(activeTheme);
    applyThemeMode(themeMode);
  });
}

function wireSettingsListeners() {
  document.querySelectorAll(".theme-dot").forEach(btn => {
    btn.addEventListener("click", () => {
      const theme = btn.getAttribute("data-theme");
      applyTheme(theme);
    });
  });

  document.querySelectorAll(".theme-mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      chrome.storage.local.get(["theme_mode"], (result) => {
        const currentMode = result.theme_mode || "dark";
        const newMode = currentMode === "dark" ? "light" : "dark";
        applyThemeMode(newMode);
      });
    });
  });

  const activeShortcuts = document.getElementById("active-shortcuts-btn");
  if (activeShortcuts) {
    activeShortcuts.addEventListener("click", () => {
      chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    });
  }

  const emptyShortcuts = document.getElementById("empty-shortcuts-btn");
  if (emptyShortcuts) {
    emptyShortcuts.addEventListener("click", () => {
      chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    });
  }
}

function updateTitleMarquee() {
  const container = document.getElementById("video-title-container");
  if (!container || !videoTitle) return;

  // Reset any prior marquee states
  videoTitle.classList.remove("animate-marquee");
  videoTitle.style.removeProperty("--marquee-width");
  videoTitle.style.removeProperty("--marquee-duration");

  // Allow layout calculations to settle
  setTimeout(() => {
    const containerWidth = container.offsetWidth;
    const titleWidth = videoTitle.scrollWidth;

    if (titleWidth > containerWidth) {
      videoTitle.style.setProperty("--marquee-width", `${containerWidth}px`);
      // Pace: ~30px per second, min 4s, max 15s
      const duration = Math.max(4, Math.min(15, (titleWidth - containerWidth) / 30 + 3));
      videoTitle.style.setProperty("--marquee-duration", `${duration}s`);
      videoTitle.classList.add("animate-marquee");
    }
  }, 100);
}

function updatePlayOverlayIcon(paused) {
  const icon = document.querySelector(".play-overlay span.material-symbols-outlined");
  if (icon) {
    icon.textContent = paused ? "play_arrow" : "pause";
  }
}


