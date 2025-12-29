// Import strategies to ensure they register themselves
import './strategies/NetflixStrategy';

import { SubtitleOverlay } from './SubtitleOverlay';

// Storage keys (must match popup.ts)
const STORAGE_KEY_SUBTITLE = 'loadedSubtitle';
const STORAGE_KEY_APPEARANCE = 'subtitleAppearance';

// Initialize the subtitle overlay for browser environment
let subtitleOverlay: SubtitleOverlay | null = null;

// Use setTimeout to ensure all strategy files have loaded and registered
setTimeout(() => {
  subtitleOverlay = new SubtitleOverlay();

  // Load any saved subtitles from storage
  chrome.storage.local.get([STORAGE_KEY_SUBTITLE, STORAGE_KEY_APPEARANCE], (result) => {
    const subtitleData = result[STORAGE_KEY_SUBTITLE];
    if (subtitleData && subtitleData.content && subtitleOverlay) {
      subtitleOverlay.loadSubtitles(subtitleData.content);
      console.log('[OpenCaptions] Loaded saved subtitles:', subtitleData.fileName);
    }
    
    // Load saved appearance settings
    const appearanceData = result[STORAGE_KEY_APPEARANCE];
    if (appearanceData && subtitleOverlay) {
      subtitleOverlay.setAppearance(appearanceData.fontSize, appearanceData.fontColor);
      console.log('[OpenCaptions] Loaded appearance settings:', appearanceData);
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
  
  // Handle setAppearance action
  if (request.action === 'setAppearance') {
    console.log('[OpenCaptions] Received setAppearance:', request);
    if (subtitleOverlay) {
      subtitleOverlay.setAppearance(request.fontSize, request.fontColor);
      sendResponse({ success: true });
    } else {
      console.log('[OpenCaptions] Overlay not ready, will retry...');
      setTimeout(() => {
        if (subtitleOverlay) {
          subtitleOverlay.setAppearance(request.fontSize, request.fontColor);
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

