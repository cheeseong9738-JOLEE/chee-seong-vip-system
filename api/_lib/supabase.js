// 后端（Vercel serverless）用的 Supabase REST 小帮手，直接用 fetch 打 PostgREST，
// 不需要装 @supabase/supabase-js

const BASE = () => `${process.env.SUPABASE_URL}/rest/v1`;
const HEADERS = () => ({
  apikey: process.env.SUPABASE_ANON_KEY,
  Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
});

async function sbGet(path) {
  const res = await fetch(`${BASE()}${path}`, { headers: HEADERS() });
  if (!res.ok) throw new Error('Supabase GET failed: ' + (await res.text()));
  return res.json();
}

async function readJsonSafe(res) {
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function sbPost(path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE()}${path}`, {
    method: 'POST',
    headers: { ...HEADERS(), ...extraHeaders },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Supabase POST failed: ' + (await res.text()));
  return readJsonSafe(res);
}

async function sbPatch(path, body) {
  const res = await fetch(`${BASE()}${path}`, {
    method: 'PATCH',
    headers: HEADERS(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Supabase PATCH failed: ' + (await res.text()));
  return readJsonSafe(res);
}

async function sbDelete(path) {
  const res = await fetch(`${BASE()}${path}`, { method: 'DELETE', headers: HEADERS() });
  if (!res.ok) throw new Error('Supabase DELETE failed: ' + (await res.text()));
}

module.exports = { sbGet, sbPost, sbPatch, sbDelete };
