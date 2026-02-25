/**
 * Content script for Sky-Mark Flight History extension.
 *
 * Runs on www.skymark.co.jp/ja/mypage/* pages.
 * Only responsibility: extract Cognito tokens from localStorage
 * and send them to the background service worker.
 * All HTTP requests happen in background.js (no CORS issues).
 */

const COGNITO_CLIENT_ID = "5e53fct9oef1na6rj7tb9gt714";

function extractCognitoTokens() {
  const prefix = `CognitoIdentityServiceProvider.${COGNITO_CLIENT_ID}.`;
  const tokens = { idToken: null, refreshToken: null, deviceKey: null };

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith(prefix)) continue;

    if (key.endsWith(".idToken")) {
      tokens.idToken = localStorage.getItem(key);
    } else if (key.endsWith(".refreshToken")) {
      tokens.refreshToken = localStorage.getItem(key);
    } else if (key.endsWith(".deviceKey")) {
      tokens.deviceKey = localStorage.getItem(key);
    }
  }

  return tokens;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_TOKENS") {
    sendResponse(extractCognitoTokens());
  }
  return true;
});
