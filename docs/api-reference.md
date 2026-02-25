# Skymark Airlines MyPage API Reference

Internal developer documentation reverse-engineered from Skymark Airlines' MyPage JavaScript source files (`skymark_config.js`, `skymark_constants.js`, `skymark_cognitofunctions.js`).

---

## Authentication

### Cognito Configuration

| Parameter | Value |
|---|---|
| User Pool ID | `ap-northeast-1_IaX4Qo8Zu` |
| Client ID | `5e53fct9oef1na6rj7tb9gt714` |
| Region | `ap-northeast-1` |
| Identity Pool ID | `ap-northeast-1:1fbb5ec0-3e06-4d83-8faf-9f4b46b139bf` |
| Identity Pool ID Suffix | `:1fbb5ec0-3e06-4d83-8faf-9f4b46b139bf` |
| Cognito Domain | `mypage-prod.auth.ap-northeast-1.amazoncognito.com` |
| Provider Key | `cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_IaX4Qo8Zu` |
| Token API Key | `d9f47019-c86c-4ba7-bde2-cfbbd857bde3` |

### Token Refresh Flow (REFRESH_TOKEN_AUTH)

Refresh an expired `idToken` using a stored `refreshToken`:

**Endpoint:** `POST https://cognito-idp.ap-northeast-1.amazonaws.com/`

**Headers:**
```
Content-Type: application/x-amz-json-1.1
X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth
```

**Request body:**
```json
{
  "AuthFlow": "REFRESH_TOKEN_AUTH",
  "ClientId": "5e53fct9oef1na6rj7tb9gt714",
  "AuthParameters": {
    "REFRESH_TOKEN": "<refreshToken from cookies>",
    "DEVICE_KEY": "<deviceKey from cookies, or empty string>"
  }
}
```

**Response:**
```json
{
  "AuthenticationResult": {
    "IdToken": "<JWT id token>",
    "AccessToken": "<JWT access token>",
    "ExpiresIn": 3600,
    "TokenType": "Bearer"
  }
}
```

The `refreshToken` cookie name contains `refreshToken` and the `deviceKey` cookie name contains `deviceKey` -- both are stored under the `CognitoIdentityServiceProvider.{CLIENT_ID}.{SUB}.*` key pattern.

### Social Login Providers

#### Google Login

**PC:**
```
https://mypage-prod.auth.ap-northeast-1.amazoncognito.com/oauth2/authorize
  ?identity_provider=Google
  &redirect_uri=https://www.skymark.co.jp/ja/mypage/callback.html
  &state={LOGIN_EXPIRE}
  &response_type=code
  &client_id=5e53fct9oef1na6rj7tb9gt714
  &scope=openid+aws.cognito.signin.user.admin
```

**SP (mobile):**
```
https://mypage-prod.auth.ap-northeast-1.amazoncognito.com/oauth2/authorize
  ?identity_provider=Google
  &redirect_uri=https://smart.skymark.co.jp/ja/mypage/callback.html
  &state={LOGIN_EXPIRE}
  &response_type=code
  &client_id=5e53fct9oef1na6rj7tb9gt714
  &scope=openid+aws.cognito.signin.user.admin
```

#### LINE Login

**PC:**
```
https://mypage-prod.auth.ap-northeast-1.amazoncognito.com/oauth2/authorize
  ?identity_provider=LINE
  &redirect_uri=https://www.skymark.co.jp/ja/mypage/callback.html
  &state={LOGIN_EXPIRE}
  &response_type=code
  &client_id=5e53fct9oef1na6rj7tb9gt714
  &scope=openid+aws.cognito.signin.user.admin
```

**SP (mobile):**
```
https://mypage-prod.auth.ap-northeast-1.amazoncognito.com/oauth2/authorize
  ?identity_provider=LINE
  &redirect_uri=https://smart.skymark.co.jp/ja/mypage/callback.html
  &state={LOGIN_EXPIRE}
  &response_type=code
  &client_id=5e53fct9oef1na6rj7tb9gt714
  &scope=openid+aws.cognito.signin.user.admin
```

Both social providers use the OAuth2 authorization code flow. The `{LOGIN_EXPIRE}` placeholder in the `state` parameter is replaced at runtime with the login expiry timestamp. The callback page at `/ja/mypage/callback.html` handles the authorization code exchange.

### localStorage Token Key Patterns

All Cognito tokens are stored in `localStorage` under keys prefixed with `CognitoIdentityServiceProvider.{CLIENT_ID}.{SUB}`:

| Key Pattern | Value |
|---|---|
| `CognitoIdentityServiceProvider.5e53fct9oef1na6rj7tb9gt714.{SUB}.clockDrift` | `0` |
| `CognitoIdentityServiceProvider.5e53fct9oef1na6rj7tb9gt714.{SUB}.idToken` | JWT ID token |
| `CognitoIdentityServiceProvider.5e53fct9oef1na6rj7tb9gt714.{SUB}.accessToken` | JWT access token |
| `CognitoIdentityServiceProvider.5e53fct9oef1na6rj7tb9gt714.{SUB}.refreshToken` | Refresh token (~30 days validity) |
| `CognitoIdentityServiceProvider.5e53fct9oef1na6rj7tb9gt714.LastAuthUser` | The user's `sub` (Cognito user ID) |

`{SUB}` is the Cognito user's `sub` claim from the JWT, stored at the `LastAuthUser` key.

---

## API Endpoints

### Flight List

Retrieve reservation history (past, future, or cancelled flights).

**Endpoint:** `POST https://d3ks8eh4veag7k.cloudfront.net/mypageapi/reservedflightlist`

**Headers:**
```
Content-Type: application/json; charset=utf-8
Origin: https://www.skymark.co.jp
Referer: https://www.skymark.co.jp/
```

**Request body:**
```json
{
  "idToken": "<JWT id token from Cognito>",
  "action": 2
}
```

**`action` values:**

| Value | Meaning |
|---|---|
| `1` | Future flights |
| `2` | Past flights |
| `3` | Cancelled flights |

**Response:** JSON array of reservation objects. Each contains:
```json
[
  {
    "pnr_id": "SB2GU4",
    "lastname_alphabet": "YAMADA",
    "firstname_alphabet": "TARO",
    "flight": [
      {
        "departure_year": "2025年",
        ...
      }
    ],
    ...
  }
]
```

### Reservation Detail

Fetch the full reservation detail page (HTML) for a specific PNR.

**Endpoint:** `POST https://www.res.skymark.co.jp/reserve2/main`

**Headers:**
```
Content-Type: application/x-www-form-urlencoded
Origin: https://www.skymark.co.jp
Referer: https://www.skymark.co.jp/ja/mypage/history.html
User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36
Accept-Encoding: identity
```

**Request body (form-encoded):**
```
request=mypage&pnr_check.x=mypage&pnrId=SB2GU4&secondname=YAMADA&firstname=TARO
```

| Parameter | Description |
|---|---|
| `request` | Always `mypage` |
| `pnr_check.x` | Always `mypage` |
| `pnrId` | Reservation confirmation number (PNR) |
| `secondname` | Last name in alphabet (uppercase) |
| `firstname` | First name in alphabet (uppercase) |

**Response:** Full HTML page containing reservation details. Key data is embedded in JavaScript variables and HTML tables within the page.

**Important notes:**
- Requires a fresh HTTP opener/session per request (Akamai bot protection).
- Cookies from `skymark.co.jp` domain must be present in the cookie jar.
- A 1-second delay between requests is recommended to avoid rate limiting.

### Mail API

**Endpoint:** `https://d3ks8eh4veag7k.cloudfront.net/mypage/ag/mail`

Used for email-related operations (opt-in/opt-out for marketing emails, email address changes).

### Membership API

**Endpoint:** `https://d3ks8eh4veag7k.cloudfront.net/mypage/ag/membership`

Used for membership/account data retrieval and updates.

### Delete Account API

**Endpoint:** `https://d3ks8eh4veag7k.cloudfront.net/mypage/ag/delete-account-update`

Used for account deletion requests.

---

## Domains

| Purpose | Domain |
|---|---|
| PC website | `www.skymark.co.jp` |
| SP (mobile) website | `smart.skymark.co.jp` |
| Reservation system | `www.res.skymark.co.jp` |
| MyPage API (CloudFront) | `d3ks8eh4veag7k.cloudfront.net` |
| Cognito IdP | `cognito-idp.ap-northeast-1.amazonaws.com` |
| Cognito OAuth2 | `mypage-prod.auth.ap-northeast-1.amazoncognito.com` |
| Cookie domain | `skymark.co.jp` |

**Top page URLs:**
- PC: `https://www.skymark.co.jp/ja`
- SP: `https://smart.skymark.co.jp/ja`

**MyPage callback (OAuth2 redirect):**
- PC: `https://www.skymark.co.jp/ja/mypage/callback.html`
- SP: `https://smart.skymark.co.jp/ja/mypage/callback.html`

---

## Constants

### Storage Key Prefixes

| Prefix | Storage Type | Description |
|---|---|---|
| `MyPage-SS-` | sessionStorage | Session-scoped MyPage data |
| `MyPage-LS-` | localStorage | Persistent MyPage data |
| `CognitoIdentityServiceProvider.` | localStorage | Cognito SDK token storage |
| `MyPage-Cookie-Register` | cookie | Cookie registration domain marker |

### Login Expiry Times

| Constant | Value | Unit |
|---|---|---|
| `LOGIN_EXPIRE` | `120` | Minutes (standard login) |
| `LONG_LOGIN_EXPIRE` | `30` | Days (remember me) |
| `VALID_AUTHORIZATION_TIME` | `60` | Minutes (authorization validity window) |

### Session Storage Keys (prefix: `MyPage-SS-`)

| Key Suffix | Constant | Purpose |
|---|---|---|
| `SignUp-MailAddress` | `SS_SIGNUP_MAILADDRESS` | Email used during signup |
| `LoginTo` | `SS_LOGINTO` | Redirect destination after login |
| `SnsLoginTo` | `SS_SNS_LOGINTO` | Redirect destination after social login |
| `RegistAccount-AccountData` | `SS_REGISTACCOUNT_ACCOUNTDATA` | Account registration form data |
| `RegistAccount-OptInTime` | `SS_REGISTACCOUNT_OPTINTIME` | Opt-in timestamp during registration |
| `ForgotPassword-MailAddress` | `SS_FORGOTPASSWORD_MAILADDRESS` | Email used in password reset flow |
| `ChangedEmail` | `SS_CHANGED_MAILADDRESS` | Newly changed email address |
| `TicketId` | `SS_TICKET_ID` | Current ticket ID |
| `OrderId` | `SS_ORDER_ID` | Current order ID |
| `UserId` | `SS_USER_ID` | Current user ID |
| `Query` | `SS_QUERY` | Query string data |
| `Hidden` | `SS_HIDDEN` | Hidden form field data |
| `GoSignUp-MailAddress` | `SS_GOSIGNUP_MAILADDRESS` | Email for go-to-signup flow |
| `registResultMessage` | `SS_REGISTCARD_RESULT_MESSAGE` | Card registration result message |
| `deleteCardResultMessage` | `SS_DELETECARD_RESULT_MESSAGE` | Card deletion result message |
| `SetMainCardResultMessage` | `SS_SETMAINCARD_RESULT_MESSAGE` | Main card setting result message |
| `AccountDataMessage` | `SS_ACCOUNT_DATA_MESSAGE` | Account data operation message |
| `AccountDataErrorMessage` | `SS_ACCOUNT_DATA_ERROR_MESSAGE` | Account data error message |
| `CustomerAutoInput` | `SS_CUSTOMER_AUTO_INPUT` | Auto-fill customer info flag |
| `ContactAutoInput` | `SS_CONTACT_AUTO_INPUT` | Auto-fill contact info flag |
| `SendCardSaveMail` | `SS_SEND_CARD_SAVE_MAIL` | Send card save confirmation email |
| `LoginMessage` | `SS_LOGIN_MESSAGE` | Login status message |
| `CurrentOptIn` | `SS_CURRENT_OPTIN` | Current opt-in preference |
| `AuthenticateMessage` | `SS_AUTHENTICATE_MESSAGE` | Authentication message |
| `Current-MailAddress` | `SS_CURRENT_MAILADDRESS` | Current email address |

Each session storage key also has a corresponding expiry key with the `-Expire` suffix.

### Local Storage Keys (prefix: `MyPage-LS-`)

| Key Suffix | Constant | Purpose |
|---|---|---|
| `LoginExpire` | `LS_LOGINEXPIRE` | Login expiry timestamp |
| `LastLogin` | `LS_LASTLOGIN` | Last login timestamp |
| `AuthorizationDateTime` | `LS_AUTHORIZATION_DATETIME` | Authorization timestamp |
| `RegistrationFlag` | `LS_REGISTRATION_FLAG` | Account registration status flag |
| `sub` | `LS_SUB` | Cognito user sub (ID) |

### Other Constants

| Constant | Value | Description |
|---|---|---|
| `RESERVED_FLIGHT_LIST_DISPLAY_COUNT` | `5` | Number of flights shown per page |
| `MYPAGE_ACCOUNT_PREFIX` | `MYPAGE_ID_` | Account ID prefix |
| `AUTO_INPUT_TRUE` | `1` | Flag value for auto-input enabled |
| `SEND_CARD_SAVE_MAIL` | `1` | Flag value to send card save email |
| `MBHD_USER_ID` | `6385` | Mobile HD user ID |
| `INET_USER_ID` | `2466` | Internet user ID |
| `REGISTACCOUNT_DATE_INIT_VALUE` | `-` | Initial value for date fields in registration |
| `LOGIN_FAILURE_MSG` | `Incorrect username or password.` | Cognito login failure (English) |
| `ACCOUNT_LOCK_MSG` | `Password attempts exceeded` | Cognito account lock (English) |

### Validation Patterns

| Field | Pattern | Description |
|---|---|---|
| Email | `/^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)\|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])\|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/` | Standard email validation |
| Password | `/^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])[A-Za-z0-9!@#\$%\^&\*\(\)_\+\-=\[\]\{\}\|']{8,128}$/` | Min 8 chars, max 128, requires uppercase + lowercase + digit |
| Name | `/^[A-Z]+[A-Z-]+$/` | Uppercase letters and hyphens only |
| Phone | `/^0\d{9,10}$/` | Japanese phone: starts with 0, 10-11 digits total |
| Card Number | `/^[0-9]+$/` | Digits only |
| Security Code | `/^[0-9]+$/` | Digits only |
| Zipcode (format 1) | `/^[0-9]{7}$/` | 7 digits without hyphen |
| Zipcode (format 2) | `/^\d{3}-\d{4}$/` | 3 digits, hyphen, 4 digits |

---

## Error Messages

### Error Messages (MSG_E001 -- MSG_E052)

| Code | Japanese Message | Context |
|---|---|---|
| `MSG_E001` | メールアドレスが入力されていません。 | Email not entered |
| `MSG_E002` | パスワードが入力されていません。 | Password not entered |
| `MSG_E003` | メールアドレス・パスワードが一致しません。 | Email/password mismatch |
| `MSG_E004` | メールアドレスが正しく入力されていません。 | Invalid email format |
| `MSG_E005` | 確認コードが入力されていません。 | Verification code not entered |
| `MSG_E006` | パスワード（確認）が入力されていません。 | Password confirmation not entered |
| `MSG_E007` | パスワードが一致しません。 | Password mismatch |
| `MSG_E008` | パスワードが正しく入力されていません。 | Invalid password format |
| `MSG_E009` | 確認コードが一致しません。 | Verification code mismatch |
| `MSG_E010` | 確認コードの有効期限が過ぎています。最初からやり直してください。 | Verification code expired |
| `MSG_E011` | 入力したメールアドレスは既に登録されています。 | Email already registered |
| `MSG_E014` | 氏名（姓）が入力されていません。 | Last name not entered |
| `MSG_E015` | 氏名（名）が入力されていません。 | First name not entered |
| `MSG_E016` | 氏名（姓）が正しく入力されていません。半角英字で入力してください。 | Invalid last name (use half-width alpha) |
| `MSG_E017` | 氏名（名）が正しく入力されていません。半角英字で入力してください。 | Invalid first name (use half-width alpha) |
| `MSG_E018` | 名（漢字）が入力されていません。 | First name (kanji) not entered |
| `MSG_E019` | 姓（漢字）が入力されていません。 | Last name (kanji) not entered |
| `MSG_E020` | 性別が選択されていません。 | Gender not selected |
| `MSG_E021` | 電話番号が入力されていません。 | Phone number not entered |
| `MSG_E022` | 電話番号が正しく入力されていません。 | Invalid phone number |
| `MSG_E023` | 郵便番号が入力されていません。 | Zipcode not entered |
| `MSG_E024` | 郵便番号が正しく入力されていません。 | Invalid zipcode |
| `MSG_E025` | メール配信のご希望が選択されていません。 | Email preference not selected |
| `MSG_E026` | セキュリティコードが入力されていません。 | Security code not entered |
| `MSG_E027` | セキュリティコードが正しく入力されていません。 | Invalid security code |
| `MSG_E028` | クレジットカードの承認がおりませんでした。内容をお確かめのうえ再度操作をお試しいただくか、ご契約されているクレジットカード会社までお問い合わせください。 | Credit card authorization failed |
| `MSG_E030` | 現在のパスワードが入力されていません。 | Current password not entered |
| `MSG_E031` | 新規パスワードが入力されていません。 | New password not entered |
| `MSG_E032` | 新規パスワード（確認）が入力されていません。 | New password confirmation not entered |
| `MSG_E033` | 新規パスワードが一致しません。 | New password mismatch |
| `MSG_E034` | 新規パスワードが正しく入力されていません。 | Invalid new password format |
| `MSG_E035` | 現在のパスワードが一致しません。 | Current password mismatch |
| `MSG_E036` | カード番号が入力されていません。 | Card number not entered |
| `MSG_E037` | カード番号が正しく入力されていません。 | Invalid card number |
| `MSG_E038` | 名義（姓）が入力されていません。 | Card holder last name not entered |
| `MSG_E039` | 名義（名）が入力されていません。 | Card holder first name not entered |
| `MSG_E040` | 名義（姓）が正しく入力されていません。半角英字で入力してください。 | Invalid card holder last name (use half-width alpha) |
| `MSG_E041` | 名義（名）が正しく入力されていません。半角英字で入力してください。 | Invalid card holder first name (use half-width alpha) |
| `MSG_E043` | エラーが発生いたしました。大変お手数ですが、トップページより再度、操作をお願いいたします。 | General error, retry from top page |
| `MSG_E044` | カードが選択されていません。 | No card selected |
| `MSG_E045` | エラーが発生いたしました。大変お手数ですが、予約センターまでお問合せ下さい。 | Error, contact reservation center |
| `MSG_E046` | ログインの有効期限が切れました。大変お手数ですが、再度ログインをお願いいたします。 | Login session expired |
| `MSG_E047` | アカウントがロックされています。大変お手数ですが、時間を置いてから再度ログインをお願いいたします。 | Account locked |
| `MSG_E048` | 生年月日が選択されていません。 | Date of birth not selected |
| `MSG_E049` | 入力された郵便番号は存在しません。 | Zipcode does not exist |
| `MSG_E050` | 住所（市区町村）に使用できない文字が含まれています。 | Invalid characters in city/ward field |
| `MSG_E051` | 住所（以降の住所）に使用できない文字が含まれています。 | Invalid characters in address field |
| `MSG_E052` | 住所（建物名等）に使用できない文字が含まれています。 | Invalid characters in building name field |

Note: `MSG_E012`, `MSG_E013`, `MSG_E029`, `MSG_E042` are not defined in the source -- these codes are skipped.

### Info Messages (MSG_I001 -- MSG_I017)

| Code | Japanese Message | Context |
|---|---|---|
| `MSG_I001` | クレジットカードの登録が完了しました。 | Card registration complete |
| `MSG_I002` | クレジットカードの削除が完了しました。 | Card deletion complete |
| `MSG_I003` | メインカードの設定が完了しました。 | Main card set |
| `MSG_I004` | アカウント登録： メインカードとして登録 | Registration: register as main card |
| `MSG_I005` | アカウント登録： メインカードにせず登録 | Registration: register without main card |
| `MSG_I006` | アカウント登録： 登録しない | Registration: do not register |
| `MSG_I007` | この決済で使用するクレジットカードの情報を、通常利用（メインカード）として登録します。 | Save payment card as main card |
| `MSG_I008` | この決済で使用するクレジットカードの情報を登録します（メインカード設定なし）。 | Save payment card (not as main) |
| `MSG_I009` | この決済で使用するクレジットカードの情報は登録しません。 | Do not save payment card |
| `MSG_I010` | クレジットカード情報の登録が完了しました。登録した情報はマイページで編集・削除ができます。 | Card info saved, editable in MyPage |
| `MSG_I012` | 再度メールアドレス・パスワードの入力が必要になります。よろしいですか？ | Re-authentication required confirmation |
| `MSG_I013` | 処理中です。しばらくお待ちください。 | Processing, please wait |
| `MSG_I014` | 現在登録されているクレジットカードはありません。 | No registered credit cards |
| `MSG_I016` | 予約便一覧への登録が完了しました。予約便一覧をご確認ください。 | Added to reservation list |
| `MSG_I017` | アカウント情報の更新が完了しました。 | Account info updated |

Note: `MSG_I011`, `MSG_I015` are not defined in the source -- these codes are skipped.
