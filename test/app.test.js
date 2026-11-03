import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { app, validExpense, validDate } from '../server.js';
let server, base;
before(async () => { process.env.APP_PASSWORD = 'test-only-long-password'; delete process.env.DATABASE_URL; server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => new Promise(resolve => server.close(resolve)));
const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'ledger' };
test('date and amount validation rejects impossible dates and unsafe input', () => {
  assert.equal(validDate('2026-02-30'), false); assert.equal(validDate('2024-02-29'), true);
  const expense = { date: '2026-11-03', item: '점심', category: '식비', amount: 10000 };
  assert.ok(validExpense(expense));
  for (const amount of [-1, 0, 1.2, 1e10, '100']) assert.equal(validExpense({ ...expense, amount }), false);
  assert.equal(validExpense({ ...expense, category: 'invalid' }), false);
});
test('static UI is served and secret files are inaccessible', async () => {
  const page = await fetch(base); assert.equal(page.status, 200); assert.match(await page.text(), /하루장부/);
  assert.equal((await fetch(base + '/.env')).status, 404);
  assert.equal((await fetch(base + '/server.js')).status, 404);
});
test('API requires login, validates CSRF header, and rejects wrong password', async () => {
  assert.equal((await fetch(base + '/api/expenses?month=2026-11')).status, 401);
  assert.equal((await fetch(base + '/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' })).status, 403);
  assert.equal((await fetch(base + '/api/login', { method:'POST', headers, body:JSON.stringify({password:'wrong'}) })).status, 401);
});
test('signed cookie authenticates, validates input, reports missing DB, and rejects tampering', async () => {
  const login = await fetch(base + '/api/login', { method:'POST', headers, body:JSON.stringify({password:process.env.APP_PASSWORD}) });
  assert.equal(login.status, 200); const raw = login.headers.get('set-cookie'); assert.match(raw,/HttpOnly/); assert.match(raw,/SameSite=Strict/); const cookie = raw.split(';')[0];
  const authenticatedHeaders = { ...headers, Cookie: cookie };
  assert.equal((await fetch(base+'/api/session', {headers:authenticatedHeaders}).then(r=>r.json())).authenticated,true);
  assert.equal((await fetch(base+'/api/expenses?month=invalid', {headers:authenticatedHeaders})).status,400);
  assert.equal((await fetch(base+'/api/expenses', {method:'POST',headers:authenticatedHeaders,body:'{}'})).status,400);
  assert.equal((await fetch(base+'/api/expenses?month=2026-11', {headers:authenticatedHeaders})).status,503);
  assert.equal((await fetch(base+'/api/expenses?month=2026-11', {headers:{Cookie:cookie+'tampered'}})).status,401);
  const logout = await fetch(base+'/api/logout', {method:'POST',headers:authenticatedHeaders}); assert.match(logout.headers.get('set-cookie'),/Expires=Thu, 01 Jan 1970/);
});
