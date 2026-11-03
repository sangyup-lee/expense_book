import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { neon } from '@neondatabase/serverless';
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '8kb' }));
app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD'].includes(req.method) && req.get('X-Requested-With') !== 'ledger') return res.status(403).json({ error: '허용되지 않은 요청입니다.' });
  next();
});
const equal = (a, b) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
const sign = value => createHmac('sha256', process.env.APP_PASSWORD).update('ledger-session:' + value).digest('hex');
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production' || !!process.env.VERCEL, sameSite: 'strict', path: '/' });
function authenticated(req) {
  if (!process.env.APP_PASSWORD) return false;
  const token = /(?:^|;\s*)session=([^;]+)/.exec(req.headers.cookie || '')?.[1] || '';
  const [expires, signature] = token.split('.');
  return /^\d+$/.test(expires || '') && Number(expires) > Date.now() && Number(expires) <= Date.now() + 86400000 && equal(signature || '', sign(expires));
}
app.get('/api/session', (req, res) => res.json({ authenticated: authenticated(req), configured: !!process.env.APP_PASSWORD }));
app.post('/api/login', rateLimit({ windowMs: 15 * 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: '시도가 너무 많습니다. 15분 후 다시 시도해 주세요.' } }), (req, res) => {
  if (!process.env.APP_PASSWORD) return res.status(503).json({ error: '서버의 APP_PASSWORD 환경변수를 설정해 주세요.' });
  if (typeof req.body?.password !== 'string' || !equal(req.body.password, process.env.APP_PASSWORD)) return res.status(401).json({ error: '비밀번호가 올바르지 않습니다.' });
  const expires = String(Date.now() + 86400000);
  res.cookie('session', expires + '.' + sign(expires), { ...cookieOptions(), maxAge: 86400000 }).json({ ok: true });
});
app.post('/api/logout', (_req, res) => res.clearCookie('session', cookieOptions()).json({ ok: true }));
app.use('/api', (req, res, next) => authenticated(req) ? next() : res.status(401).json({ error: '로그인이 필요합니다.' }));
let sql, ready;
async function db() {
  if (!process.env.DATABASE_URL) { const error = new Error('DATABASE_URL'); error.status = 503; throw error; }
  sql ||= neon(process.env.DATABASE_URL);
  ready ||= sql`CREATE TABLE IF NOT EXISTS expenses (id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY, date DATE NOT NULL, item VARCHAR(100) NOT NULL, category VARCHAR(30) NOT NULL, amount BIGINT NOT NULL CHECK (amount > 0 AND amount <= 999999999), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`.catch(e => { ready = undefined; throw e; });
  await ready;
  return sql;
}
export const categories = ['식비', '카페·간식', '교통', '쇼핑', '주거·통신', '문화·여가', '건강', '기타'];
export function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && value.slice(0,4) >= '1900' && value.slice(0,4) <= '9999' && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value; }
export function validExpense(body) { return body && validDate(body.date) && typeof body.item === 'string' && body.item.trim().length > 0 && body.item.trim().length <= 100 && categories.includes(body.category) && Number.isSafeInteger(body.amount) && body.amount > 0 && body.amount <= 999999999; }
app.get('/api/expenses', async (req, res) => {
  const month = req.query.month;
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !validDate(month + '-01') || (req.query.date && (!validDate(req.query.date) || !req.query.date.startsWith(month)))) return res.status(400).json({ error: '날짜를 확인해 주세요.' });
  const q = await db();
  const start = month + '-01';
  const rows = await q`SELECT id, to_char(date, 'YYYY-MM-DD') AS date, item, category, amount::float8 AS amount FROM expenses WHERE date >= ${start}::date AND date < ${start}::date + INTERVAL '1 month' ORDER BY date DESC, id DESC`;
  const totals = categories.map(category => ({ category, total: rows.filter(r => r.category === category).reduce((sum, r) => sum + r.amount, 0) }));
  res.json({ expenses: req.query.date ? rows.filter(r => r.date === req.query.date) : rows, total: rows.reduce((sum, r) => sum + r.amount, 0), count: rows.length, categories: totals });
});
app.post('/api/expenses', async (req, res) => {
  if (!validExpense(req.body)) return res.status(400).json({ error: '날짜, 항목, 카테고리와 금액(1~999,999,999원)을 확인해 주세요.' });
  const { date, item, category, amount } = req.body; const q = await db();
  const [row] = await q`INSERT INTO expenses (date,item,category,amount) VALUES (${date},${item.trim()},${category},${amount}) RETURNING id`;
  res.status(201).json(row);
});
app.use('/api/expenses/:id', (req, res, next) => /^\d+$/.test(req.params.id) && Number(req.params.id) <= 2147483647 ? next() : res.status(400).json({ error: '잘못된 내역 ID입니다.' }));
app.put('/api/expenses/:id', async (req, res) => {
  if (!validExpense(req.body)) return res.status(400).json({ error: '입력 내용을 확인해 주세요.' });
  const { date, item, category, amount } = req.body; const q = await db();
  const rows = await q`UPDATE expenses SET date=${date}, item=${item.trim()}, category=${category}, amount=${amount} WHERE id=${req.params.id} RETURNING id`;
  res.status(rows.length ? 200 : 404).json(rows.length ? rows[0] : { error: '내역이 없습니다.' });
});
app.delete('/api/expenses/:id', async (req, res) => {
  const q = await db(); const rows = await q`DELETE FROM expenses WHERE id=${req.params.id} RETURNING id`;
  res.status(rows.length ? 200 : 404).json(rows.length ? { ok: true } : { error: '내역이 없습니다.' });
});
app.use('/api', (_req, res) => res.status(404).json({ error: 'API를 찾을 수 없습니다.' }));
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')));
app.use((err, _req, res, _next) => {
  const status = err.status === 400 ? 400 : err.status === 503 ? 503 : 500;
  res.status(status).json({ error: status === 400 ? '올바른 JSON 요청이 필요합니다.' : status === 503 ? '서버의 DATABASE_URL 환경변수를 설정해 주세요.' : '데이터베이스 요청을 처리하지 못했습니다. 연결 설정을 확인해 주세요.' });
});
if (!process.env.VERCEL && process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) app.listen(process.env.PORT || 3000, () => console.log(`가계부 실행: http://localhost:${process.env.PORT || 3000}`));
export default app;
