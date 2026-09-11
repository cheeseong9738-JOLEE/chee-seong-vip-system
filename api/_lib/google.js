const crypto = require('crypto');

// 用服务帐号的 JSON 凭证签一个 JWT，跟 Google 换 access token
// 不用 googleapis / google-auth-library 这些套件，纯 Node crypto + fetch，
// 这样 Vercel 部署不需要 npm install 任何东西
function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey);
  const jwt = `${unsigned}.${signature.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Google auth failed: ' + JSON.stringify(data));
  return data.access_token;
}

function sheetRange(a1) {
  const tab = process.env.GOOGLE_SHEET_TAB || 'VIP MEMBER';
  return `'${tab.replace(/'/g, "''")}'!${a1}`;
}

async function sheetsApi(path, options = {}) {
  const token = await getAccessToken();
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Sheets API failed: ' + JSON.stringify(data));
  return data;
}

async function getValues(a1) {
  const path = `/values/${encodeURIComponent(sheetRange(a1))}`;
  const data = await sheetsApi(path);
  return data.values || [];
}

async function updateValues(a1, values) {
  const path = `/values/${encodeURIComponent(sheetRange(a1))}?valueInputOption=RAW`;
  return sheetsApi(path, { method: 'PUT', body: JSON.stringify({ values }) });
}

async function appendRow(values) {
  const path = `/values/${encodeURIComponent(sheetRange('A1'))}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  return sheetsApi(path, { method: 'POST', body: JSON.stringify({ values: [values] }) });
}

module.exports = { getValues, updateValues, appendRow };
