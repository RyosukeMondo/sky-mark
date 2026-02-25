/**
 * Background service worker for Sky-Mark Flight History extension.
 *
 * Routes messages between content script and options page.
 * Stores extracted data in chrome.storage.local.
 */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "RESULT") {
    chrome.storage.local.set(
      { [`data_${msg.data.year}`]: msg.data },
      () => {
        broadcastToOptionsPages({ type: "DATA_READY", year: msg.data.year });
      }
    );
    return;
  }

  if (msg.type === "STATUS") {
    broadcastToOptionsPages(msg);
    return;
  }

  if (msg.type === "ERROR") {
    broadcastToOptionsPages(msg);
    return;
  }

  if (msg.type === "TRIGGER_EXTRACT") {
    chrome.tabs.query(
      { active: true, currentWindow: true },
      (tabs) => {
        if (!tabs || tabs.length === 0) {
          broadcastToOptionsPages({
            type: "STATUS",
            message: "No active tab found. Open Skymark mypage first.",
          });
          return;
        }

        const tab = tabs[0];
        const url = tab.url || "";
        if (!url.includes("www.skymark.co.jp/ja/mypage")) {
          broadcastToOptionsPages({
            type: "STATUS",
            message: "Active tab is not on Skymark mypage. Navigate to https://www.skymark.co.jp/ja/mypage/ first.",
          });
          return;
        }

        chrome.tabs.sendMessage(
          tab.id,
          { type: "EXTRACT", year: msg.year },
          (response) => {
            if (chrome.runtime.lastError) {
              broadcastToOptionsPages({
                type: "STATUS",
                message: `Cannot reach content script: ${chrome.runtime.lastError.message}. Reload the Skymark mypage and try again.`,
              });
            }
          }
        );
      }
    );
    sendResponse({ status: "triggered" });
    return;
  }

  if (msg.type === "GET_DATA") {
    chrome.storage.local.get(`data_${msg.year}`, (result) => {
      sendResponse({ data: result[`data_${msg.year}`] || null });
    });
    return true;
  }
});

function broadcastToOptionsPages(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {
    // Options page may not be open; ignore
  });
}
