/**
 * Background service worker for Sky-Mark Flight History extension.
 *
 * All HTTP requests happen here (not in content script) to avoid CORS.
 * Content script only provides localStorage tokens.
 */

const COGNITO_CLIENT_ID = "5e53fct9oef1na6rj7tb9gt714";
const COGNITO_ENDPOINT = "https://cognito-idp.ap-northeast-1.amazonaws.com/";
const API_ENDPOINT = "https://d3ks8eh4veag7k.cloudfront.net/mypageapi/reservedflightlist";
const RES_ENDPOINT = "https://www.res.skymark.co.jp/reserve2/main";

// ── HTTP Requests ───────────────────────────────────────────

async function refreshIdToken(refreshToken, deviceKey) {
  const resp = await fetch(COGNITO_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
    },
    body: JSON.stringify({
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
        DEVICE_KEY: deviceKey || "",
      },
    }),
  });
  if (!resp.ok) {
    throw new Error(`Cognito refresh failed: ${resp.status}`);
  }
  const data = await resp.json();
  return data.AuthenticationResult.IdToken;
}

async function fetchFlightList(idToken, action = 2) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ idToken, action }),
  });
  if (!resp.ok) {
    throw new Error(`Flight list fetch failed: ${resp.status}`);
  }
  return resp.json();
}

async function fetchReservationHtml(pnr, lastname, firstname) {
  const params = new URLSearchParams({
    request: "mypage",
    "pnr_check.x": "mypage",
    pnrId: pnr,
    secondname: lastname,
    firstname: firstname,
  });
  const resp = await fetch(RES_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!resp.ok) {
    throw new Error(`Reservation fetch failed for ${pnr}: ${resp.status}`);
  }
  return resp.text();
}

// ── HTML Parsing ────────────────────────────────────────────

function parseReservationHtml(html) {
  const r = {};

  function jsVar(name) {
    const m = html.match(new RegExp(`const\\s+${name}\\s*=\\s*'([^']*)'`));
    return m ? m[1] : "";
  }

  r.ticket_id = jsVar("mpTicketId");
  r.order_id = jsVar("mpOrderId");
  r.user_id = jsVar("mpUserId");
  r.language = jsVar("mpLanguage");
  r.email = jsVar("mpMailAddress");
  r.lastname_alphabet = jsVar("mpLastnameAlphabet");
  r.firstname_alphabet = jsVar("mpFirstnameAlphabet");
  r.lastname_kanji = jsVar("mpLastnameKanji");
  r.firstname_kanji = jsVar("mpFirstnameKanji");
  r.gender = jsVar("mpGender");
  r.age = jsVar("mpAge");
  r.phone_number = jsVar("mpPhoneNumber");
  r.phone_contact = jsVar("mpPhoneContact");

  r.total = 0;
  const totalMatch = html.match(/totalAmount[^>]*>\s*([\d,]+)円/s);
  if (totalMatch) {
    r.total = parseInt(totalMatch[1].replace(/,/g, ""), 10);
  }

  r.payment_status = "";
  const statusMatch = html.match(/お支払い状態：<\/dt>\s*<dd>([^<]+)<\/dd>/);
  if (statusMatch) {
    r.payment_status = statusMatch[1].trim();
  }

  r.payment_methods = [];
  const methodRe = /お支払い方法：<\/dt>\s*<dd>([^<]+)<\/dd>/g;
  let methodMatch;
  while ((methodMatch = methodRe.exec(html)) !== null) {
    r.payment_methods.push(methodMatch[1].trim());
  }

  r.fees = [];
  const feeRe = /(?:>|\n)\s*([^\s<>][^<>]*?／[\d,]+円×\d+)/g;
  let feeMatch;
  while ((feeMatch = feeRe.exec(html)) !== null) {
    const fm = feeMatch[1].trim().match(/(.+?)／([\d,]+)円×(\d+)/);
    if (fm) {
      const unitPrice = parseInt(fm[2].replace(/,/g, ""), 10);
      const quantity = parseInt(fm[3], 10);
      r.fees.push({
        type: fm[1].trim(),
        unit_price: unitPrice,
        quantity,
        subtotal: unitPrice * quantity,
      });
    }
  }

  r.flights = [];
  const flightRe = new RegExp(
    "<td>(\\d{4}年\\d+月\\d+日\\([^)]+\\))</td>\\s*" +
    "<td><p>(SKY\\d+)</p>" +
    '(?:.*?title="([^"]*)")?' +
    ".*?</td>\\s*" +
    '<td class="depAirport">([^<]+)</td>\\s*' +
    "<td><p>(\\d+:\\d+)</p></td>\\s*" +
    '<td class="arrAirport">([^<]+)</td>\\s*' +
    "<td><p>(\\d+:\\d+)</p></td>\\s*" +
    '<td class="fareText">' +
    "(?:<a[^>]*>)?([^<]+)(?:</a>)?" +
    ".*?</td>\\s*" +
    '<td class="reserveNumber">(\\d+)</td>',
    "gs"
  );
  let flightMatch;
  while ((flightMatch = flightRe.exec(html)) !== null) {
    r.flights.push({
      date: flightMatch[1],
      flight: flightMatch[2],
      aircraft: flightMatch[3] || "",
      dep: flightMatch[4],
      dep_time: flightMatch[5],
      arr: flightMatch[6],
      arr_time: flightMatch[7],
      fare_type: flightMatch[8].trim(),
      res_no: flightMatch[9],
    });
  }

  r.cancelled_flights = [];
  const cancelSection = html.match(/お取消便情報.*?<\/table>/s);
  if (cancelSection) {
    const cancelRe = new RegExp(
      "<td>(\\d{4}年\\d+月\\d+日\\([^)]+\\))</td>\\s*" +
      "<td><p>(SKY\\d+)</p>.*?</td>\\s*" +
      '<td class="depAirport">([^<]+)</td>\\s*' +
      "<td><p>(\\d+:\\d+)</p></td>\\s*" +
      '<td class="arrAirport">([^<]+)</td>\\s*' +
      "<td><p>(\\d+:\\d+)</p></td>",
      "gs"
    );
    let cancelMatch;
    while ((cancelMatch = cancelRe.exec(cancelSection[0])) !== null) {
      r.cancelled_flights.push({
        date: cancelMatch[1],
        flight: cancelMatch[2],
        dep: cancelMatch[3],
        dep_time: cancelMatch[4],
        arr: cancelMatch[5],
        arr_time: cancelMatch[6],
      });
    }
  }

  r.passengers = [];
  const paxSection = html.match(/id="resConf">(.*?)<\/table>/s);
  if (paxSection) {
    const paxRe = new RegExp(
      "<td[^>]*>([^<]+\\d+)</td>\\s*" +
      "<td>([^<]+)</td>\\s*" +
      "<td[^>]*>(\\d+)</td>\\s*" +
      "<td[^>]*>([^<]+)</td>\\s*" +
      "<td[^>]*>\\s*<ul>(.*?)</ul>",
      "gs"
    );
    let paxMatch;
    while ((paxMatch = paxRe.exec(paxSection[1])) !== null) {
      const fares = [];
      const fareRe = /<li>(SKY\d+)／(.*?)／([\d,]+)円／([^／]+)／([^<]+)<\/li>/g;
      let fareMatch;
      while ((fareMatch = fareRe.exec(paxMatch[5])) !== null) {
        fares.push({
          flight: fareMatch[1],
          fare_type: fareMatch[2].replace(/<[^>]+>/g, "").trim(),
          amount: parseInt(fareMatch[3].replace(/,/g, ""), 10),
          seat: fareMatch[4].trim(),
          seat_fee: fareMatch[5].trim(),
        });
      }
      r.passengers.push({
        type: paxMatch[1].trim(),
        name: paxMatch[2].replace(/&nbsp;/g, " ").trim(),
        age: /^\d+$/.test(paxMatch[3]) ? parseInt(paxMatch[3], 10) : paxMatch[3],
        gender: paxMatch[4].trim(),
        fares,
      });
    }
  }

  const contactSection = html.match(/id="resConf2">(.*?)<\/table>/s);
  if (contactSection) {
    const phoneMatch = contactSection[1].match(
      /class="tdc">(\d+)<br\s*\/?>.*?(\S+／\S+)/s
    );
    if (phoneMatch) {
      r.contact_phone = phoneMatch[1];
      r.contact_phone_type = phoneMatch[2].trim();
    }
    const emailMatch = contactSection[1].match(
      /class="tdc">\s*\n?\s*\n?\s*([^\s<]+@[^\s<]+)/
    );
    if (emailMatch) {
      r.contact_email = emailMatch[1].trim();
    }
  }

  return r;
}

// ── Extraction Orchestrator ─────────────────────────────────

async function runExtraction(year, tabId) {
  const sendStatus = (message, progress = null) => {
    broadcastToOptionsPages({ type: "STATUS", message, progress });
  };

  try {
    // 1. Get tokens from content script's localStorage access
    sendStatus("Extracting Cognito tokens...", 0);
    const tokens = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tabId, { type: "GET_TOKENS" }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (!tokens || !tokens.refreshToken) {
      throw new Error(
        "No Cognito refresh token found. Log in to Skymark mypage first."
      );
    }

    // 2. Refresh idToken
    sendStatus("Refreshing authentication token...", 5);
    const idToken = await refreshIdToken(tokens.refreshToken, tokens.deviceKey);

    // 3. Fetch flight list
    sendStatus("Fetching flight list...", 10);
    const rawList = await fetchFlightList(idToken, 2);

    // 4. Filter + deduplicate PNRs
    const pnrMap = new Map();
    for (const item of rawList) {
      const hasYear = item.flight.some(
        (fl) => fl.departure_year.includes(`${year}年`)
      );
      if (hasYear && !pnrMap.has(item.pnr_id)) {
        pnrMap.set(item.pnr_id, {
          pnr: item.pnr_id,
          lastname: item.lastname_alphabet,
          firstname: item.firstname_alphabet,
        });
      }
    }
    const uniquePnrs = Array.from(pnrMap.values());
    sendStatus(`Found ${uniquePnrs.length} reservations for ${year}`, 15);

    if (uniquePnrs.length === 0) {
      chrome.storage.local.set(
        { [`data_${year}`]: { year, flightList: rawList, reservations: [] } },
        () => broadcastToOptionsPages({ type: "DATA_READY", year })
      );
      return;
    }

    // 5. Fetch + parse each reservation
    const reservations = [];
    for (let i = 0; i < uniquePnrs.length; i++) {
      const rec = uniquePnrs[i];
      const pct = 15 + Math.round(((i + 1) / uniquePnrs.length) * 80);
      sendStatus(
        `Fetching reservation ${i + 1}/${uniquePnrs.length}: ${rec.pnr}`,
        pct
      );

      try {
        const html = await fetchReservationHtml(
          rec.pnr, rec.lastname, rec.firstname
        );
        const detail = parseReservationHtml(html);
        detail.pnr = rec.pnr;
        reservations.push(detail);
      } catch (err) {
        sendStatus(`Error fetching ${rec.pnr}: ${err.message}`, pct);
      }

      if (i < uniquePnrs.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    sendStatus(`Complete: ${reservations.length} reservations`, 100);

    // 6. Store results
    const data = { year, flightList: rawList, reservations };
    chrome.storage.local.set({ [`data_${year}`]: data }, () => {
      broadcastToOptionsPages({ type: "DATA_READY", year });
    });
  } catch (err) {
    broadcastToOptionsPages({ type: "ERROR", error: err.message });
  }
}

// ── Message Router ──────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "TRIGGER_EXTRACT") {
    chrome.tabs.query(
      { url: "*://www.skymark.co.jp/ja/mypage/*" },
      (tabs) => {
        if (!tabs || tabs.length === 0) {
          broadcastToOptionsPages({
            type: "STATUS",
            message:
              "No Skymark mypage tab found. Open https://www.skymark.co.jp/ja/mypage/ in another tab first.",
          });
          return;
        }
        runExtraction(msg.year, tabs[0].id);
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
  chrome.runtime.sendMessage(msg).catch(() => {});
}
