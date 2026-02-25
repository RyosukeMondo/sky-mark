/**
 * Content script for Sky-Mark Flight History extension.
 *
 * Runs on www.skymark.co.jp/ja/mypage/* pages.
 * Extracts Cognito tokens from localStorage, fetches flight data,
 * parses reservation HTML, and sends structured results to background.
 */

const COGNITO_CLIENT_ID = "5e53fct9oef1na6rj7tb9gt714";
const COGNITO_ENDPOINT = "https://cognito-idp.ap-northeast-1.amazonaws.com/";
const API_ENDPOINT = "https://d3ks8eh4veag7k.cloudfront.net/mypageapi/reservedflightlist";
const RES_ENDPOINT = "https://www.res.skymark.co.jp/reserve2/main";

// ── Token Extraction ────────────────────────────────────────

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

// ── Cognito Token Refresh ───────────────────────────────────

async function refreshIdToken(refreshToken, deviceKey) {
  const payload = {
    AuthFlow: "REFRESH_TOKEN_AUTH",
    ClientId: COGNITO_CLIENT_ID,
    AuthParameters: {
      REFRESH_TOKEN: refreshToken,
      DEVICE_KEY: deviceKey || "",
    },
  };

  const resp = await fetch(COGNITO_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    throw new Error(`Cognito refresh failed: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  return data.AuthenticationResult.IdToken;
}

// ── Flight List API ─────────────────────────────────────────

async function fetchFlightList(idToken, action = 2) {
  const resp = await fetch(API_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Origin": "https://www.skymark.co.jp",
      "Referer": "https://www.skymark.co.jp/",
    },
    body: JSON.stringify({ idToken, action }),
  });

  if (!resp.ok) {
    throw new Error(`Flight list fetch failed: ${resp.status} ${resp.statusText}`);
  }

  return resp.json();
}

// ── Reservation Detail Fetch ────────────────────────────────

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
      "Origin": "https://www.skymark.co.jp",
      "Referer": "https://www.skymark.co.jp/ja/mypage/history.html",
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

  // JS variables (top of page)
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

  // Payment section - total
  r.total = 0;
  const totalMatch = html.match(/totalAmount[^>]*>\s*([\d,]+)円/s);
  if (totalMatch) {
    r.total = parseInt(totalMatch[1].replace(/,/g, ""), 10);
  }

  // Payment status
  r.payment_status = "";
  const statusMatch = html.match(/お支払い状態：<\/dt>\s*<dd>([^<]+)<\/dd>/);
  if (statusMatch) {
    r.payment_status = statusMatch[1].trim();
  }

  // Payment methods (can be multiple)
  r.payment_methods = [];
  const methodRe = /お支払い方法：<\/dt>\s*<dd>([^<]+)<\/dd>/g;
  let methodMatch;
  while ((methodMatch = methodRe.exec(html)) !== null) {
    r.payment_methods.push(methodMatch[1].trim());
  }

  // Fees
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
        quantity: quantity,
        subtotal: unitPrice * quantity,
      });
    }
  }

  // Flights table
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

  // Cancelled flights
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

  // Passengers / fare breakdown
  r.passengers = [];
  const paxSection = html.match(/id="resConf">(.*?)<\/table>/s);
  if (paxSection) {
    const paxRe = new RegExp(
      "<td[^>]*>(\\w+\\d+)</td>\\s*" +
      "<td>([^<]+)</td>\\s*" +
      "<td[^>]*>(\\d+)</td>\\s*" +
      "<td[^>]*>([^<]+)</td>\\s*" +
      "<td[^>]*>\\s*<ul>(.*?)</ul>",
      "gs"
    );
    let paxMatch;
    while ((paxMatch = paxRe.exec(paxSection[1])) !== null) {
      const paxType = paxMatch[1].trim();
      const name = paxMatch[2].replace(/&nbsp;/g, " ").trim();
      const age = paxMatch[3].trim();
      const gender = paxMatch[4].trim();

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
        type: paxType,
        name: name,
        age: /^\d+$/.test(age) ? parseInt(age, 10) : age,
        gender: gender,
        fares: fares,
      });
    }
  }

  // Contact info (from HTML table)
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

async function runExtraction(year) {
  const sendStatus = (message, progress = null) => {
    chrome.runtime.sendMessage({
      type: "STATUS",
      message,
      progress,
    });
  };

  try {
    // 1. Extract tokens from localStorage
    sendStatus("Extracting Cognito tokens...", 0);
    const tokens = extractCognitoTokens();

    if (!tokens.refreshToken) {
      throw new Error(
        "No Cognito refresh token found in localStorage. " +
        "Please log in to Skymark mypage first."
      );
    }

    // 2. Refresh the idToken
    sendStatus("Refreshing authentication token...", 5);
    const idToken = await refreshIdToken(tokens.refreshToken, tokens.deviceKey);

    // 3. Fetch flight list
    sendStatus("Fetching flight list...", 10);
    const rawList = await fetchFlightList(idToken, 2);

    // 4. Filter to target year and deduplicate PNRs
    const pnrMap = new Map();
    for (const item of rawList) {
      const hasYear = item.flight.some(
        (fl) => fl.departure_year.indexOf(`${year}年`) !== -1
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

    sendStatus(
      `Found ${uniquePnrs.length} reservations for ${year}`,
      15
    );

    if (uniquePnrs.length === 0) {
      chrome.runtime.sendMessage({
        type: "RESULT",
        data: {
          year,
          flightList: rawList,
          reservations: [],
        },
      });
      return;
    }

    // 5. Parse flight list into structured records
    const flightRecords = [];
    for (const item of rawList) {
      const flights = [];
      for (const fl of item.flight) {
        if (fl.departure_year.indexOf(`${year}年`) === -1) continue;
        flights.push({
          date: `${fl.departure_year}${fl.departure_date}`,
          flight_number: fl.flight_number,
          departure: fl.departure_airport,
          departure_time: fl.departure_time,
          arrival: fl.arrival_airport,
          arrival_time: fl.arrival_time,
          reservation_number: fl.reservation_number || "",
          board_seat: fl.board_seat || "",
        });
      }
      if (flights.length > 0) {
        flightRecords.push({
          pnr: item.pnr_id,
          id: item.id,
          lastname: item.lastname_alphabet,
          firstname: item.firstname_alphabet,
          price_status: item.price_status,
          flights,
        });
      }
    }

    // 6. Fetch and parse each reservation detail
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
          rec.pnr,
          rec.lastname,
          rec.firstname
        );
        const detail = parseReservationHtml(html);
        detail.pnr = rec.pnr;
        reservations.push(detail);
      } catch (err) {
        sendStatus(`Error fetching ${rec.pnr}: ${err.message}`, pct);
      }

      // Small delay between requests to avoid rate limiting
      if (i < uniquePnrs.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    sendStatus(`Extraction complete: ${reservations.length} reservations`, 100);

    // 7. Send results to background
    chrome.runtime.sendMessage({
      type: "RESULT",
      data: {
        year,
        flightList: rawList,
        reservations,
      },
    });
  } catch (err) {
    sendStatus(`Error: ${err.message}`, null);
    chrome.runtime.sendMessage({
      type: "ERROR",
      error: err.message,
    });
  }
}

// ── Message Listener ────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "EXTRACT") {
    runExtraction(msg.year);
    sendResponse({ status: "started" });
  }
  return true;
});
