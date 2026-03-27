"""Fetch layer — raw HTTP requests, saves HTML/JSON to raw/.

No parsing logic here. Only network I/O and disk writes.
"""

import http.cookiejar
import json
import ssl
import time
import urllib.parse
import urllib.request
from pathlib import Path

COGNITO_REGION = "ap-northeast-1"
COGNITO_CLIENT_ID = "5e53fct9oef1na6rj7tb9gt714"
API_DOMAIN = "d3ks8eh4veag7k.cloudfront.net"
RES_DOMAIN = "www.res.skymark.co.jp"


def load_cookies(cookie_path: str) -> list[dict]:
    path = Path(cookie_path)
    if not path.exists():
        raise FileNotFoundError(
            f"Cookie file not found: {cookie_path}\n"
            "Export cookies from a logged-in Skymark MyPage session "
            "(e.g., with EditThisCookie) and save as cookie.json."
        )
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(
            f"Invalid cookie file format: expected a JSON array, "
            f"got {type(data).__name__}"
        )
    return data


def _build_opener(cookies: list[dict]):
    cj = http.cookiejar.CookieJar()
    ctx = ssl.create_default_context()
    opener = urllib.request.build_opener(
        urllib.request.HTTPSHandler(context=ctx),
        urllib.request.HTTPCookieProcessor(cj),
    )
    for c in cookies:
        cookie = http.cookiejar.Cookie(
            version=0, name=c["name"], value=c["value"],
            port=None, port_specified=False,
            domain=c["domain"], domain_specified=True,
            domain_initial_dot=c["domain"].startswith("."),
            path=c["path"], path_specified=True,
            secure=c.get("secure", False),
            expires=int(c.get("expirationDate", 0)),
            discard=c.get("session", False),
            comment=None, comment_url=None,
            rest={"HttpOnly": str(c.get("httpOnly", False))},
        )
        cj.set_cookie(cookie)
    return opener


def refresh_id_token(cookies: list[dict]) -> str:
    """Get a fresh idToken using the refresh token from cookies."""
    refresh_token = None
    device_key = None
    for c in cookies:
        if "refreshToken" in c["name"]:
            refresh_token = c["value"]
        if "deviceKey" in c["name"]:
            device_key = c["value"]

    if not refresh_token:
        raise ValueError(
            "No refresh token found in cookies. "
            "Re-export cookies from a logged-in Skymark MyPage session."
        )

    url = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/"
    payload = json.dumps({
        "AuthFlow": "REFRESH_TOKEN_AUTH",
        "ClientId": COGNITO_CLIENT_ID,
        "AuthParameters": {
            "REFRESH_TOKEN": refresh_token,
            "DEVICE_KEY": device_key or "",
        },
    }).encode("utf-8")

    req = urllib.request.Request(url, data=payload, method="POST")
    req.add_header("Content-Type", "application/x-amz-json-1.1")
    req.add_header("X-Amz-Target", "AWSCognitoIdentityProviderService.InitiateAuth")
    resp = urllib.request.urlopen(req, timeout=30)
    data = json.loads(resp.read().decode("utf-8"))
    return data["AuthenticationResult"]["IdToken"]


def fetch_flight_list(id_token: str, action: int = 2) -> list[dict]:
    """Fetch flight list from mypage API. action: 1=future, 2=past, 3=cancelled."""
    url = f"https://{API_DOMAIN}/mypageapi/reservedflightlist"
    payload = json.dumps({"idToken": id_token, "action": action}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, method="POST")
    req.add_header("Content-Type", "application/json; charset=utf-8")
    req.add_header("Origin", "https://www.skymark.co.jp")
    req.add_header("Referer", "https://www.skymark.co.jp/")
    resp = urllib.request.urlopen(req, timeout=30)
    return json.loads(resp.read().decode("utf-8"))


def fetch_reservation_html(
    cookies: list[dict], pnr: str, lastname: str, firstname: str,
) -> str:
    """Fetch reservation detail HTML. Fresh opener per request (Akamai compat)."""
    opener = _build_opener(cookies)
    url = f"https://{RES_DOMAIN}/reserve2/main"
    params = {
        "request": "mypage",
        "pnr_check.x": "mypage",
        "pnrId": pnr,
        "secondname": lastname,
        "firstname": firstname,
    }
    data = urllib.parse.urlencode(params).encode("utf-8")
    req = urllib.request.Request(url, data=data)
    req.add_header("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("Origin", "https://www.skymark.co.jp")
    req.add_header("Referer", "https://www.skymark.co.jp/ja/mypage/history.html")
    req.add_header("Accept-Encoding", "identity")
    resp = opener.open(req, timeout=15)
    return resp.read().decode("utf-8", errors="replace")


def run_fetch(cookies: list[dict], year: str, raw_dir: Path, delay: float = 1.0):
    """Fetch all data and save raw files to raw_dir."""
    raw_dir.mkdir(parents=True, exist_ok=True)

    # 1. Flight list API
    print("Refreshing auth token...")
    id_token = refresh_id_token(cookies)

    print("Fetching flight list...")
    raw_list = fetch_flight_list(id_token, action=2)

    list_path = raw_dir / "flight_list.json"
    with open(list_path, "w", encoding="utf-8") as f:
        json.dump(raw_list, f, ensure_ascii=False, indent=2)
    print(f"  Saved {list_path} ({len(raw_list)} records)")

    # 2. Filter to target year
    pnrs = []
    for item in raw_list:
        has_year = any(f"{year}年" in fl["departure_year"] for fl in item["flight"])
        if has_year:
            pnrs.append({
                "pnr": item["pnr_id"],
                "lastname": item["lastname_alphabet"],
                "firstname": item["firstname_alphabet"],
            })
    # deduplicate
    seen = set()
    unique_pnrs = []
    for p in pnrs:
        if p["pnr"] not in seen:
            seen.add(p["pnr"])
            unique_pnrs.append(p)

    print(f"Found {len(unique_pnrs)} reservations for {year}")

    # 3. Fetch each reservation detail HTML
    html_dir = raw_dir / "html"
    html_dir.mkdir(exist_ok=True)

    errors = []
    for i, rec in enumerate(unique_pnrs, 1):
        pnr = rec["pnr"]
        html_path = html_dir / f"{pnr}.html"

        print(f"  [{i}/{len(unique_pnrs)}] {pnr}...", end=" ", flush=True)
        try:
            html = fetch_reservation_html(
                cookies, pnr, rec["lastname"], rec["firstname"],
            )
            html_path.write_text(html, encoding="utf-8")
            size_kb = len(html.encode("utf-8")) / 1024
            print(f"OK  ({size_kb:.1f} KB)")
            if delay > 0 and i < len(unique_pnrs):
                time.sleep(delay)
        except Exception as e:
            print(f"ERROR: {e}")
            errors.append(pnr)

    ok_count = len(unique_pnrs) - len(errors)
    print(f"\nRaw HTML saved to {html_dir}/ ({ok_count}/{len(unique_pnrs)} files)")
    if errors:
        print(f"  Failed PNRs: {', '.join(errors)}")
