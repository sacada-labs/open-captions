// Import strategies to ensure they register themselves
import './strategies/NetflixStrategy';

import { SubtitleOverlay } from './SubtitleOverlay';

// Storage key (must match popup.ts)
const STORAGE_KEY_SUBTITLE = 'loadedSubtitle';

// Initialize the subtitle overlay for browser environment
let subtitleOverlay: SubtitleOverlay | null = null;

// Use setTimeout to ensure all strategy files have loaded and registered
setTimeout(() => {
  subtitleOverlay = new SubtitleOverlay();

  // Load any saved subtitles from storage
  chrome.storage.local.get([STORAGE_KEY_SUBTITLE], (result) => {
    const data = result[STORAGE_KEY_SUBTITLE];
    if (data && data.content && subtitleOverlay) {
      subtitleOverlay.loadSubtitles(data.content);
      console.log('Loaded saved subtitles:', data.fileName);
    }
  });
}, 0);

// Listen for messages from the popup
// This listener is set up outside the setTimeout to ensure it's always available
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  // Handle loadSubtitles action
  if (request.action === 'loadSubtitles') {
    if (subtitleOverlay) {
      subtitleOverlay.loadSubtitles(request.subtitles);
      sendResponse({ success: true });
    } else {
      // If overlay isn't ready yet, wait a bit and try again
      setTimeout(() => {
        if (subtitleOverlay) {
          subtitleOverlay.loadSubtitles(request.subtitles);
        }
      }, 100);
      sendResponse({ success: true });
    }
    return false; // Response sent synchronously
  }

  // Other actions (getOffset, setOffset, increaseOffset, decreaseOffset, resetOffset)
  // are handled by SubtitleOverlay's own message listener
  // Return undefined to allow other listeners to handle and respond
  return;
});

