const $ = id => document.getElementById(id);
const categories = ['식비', '카페·간식', '교통', '쇼핑', '주거·통신', '문화·여가', '건강', '기타'];
const money = value => new Intl.NumberFormat('ko-KR').format(value) + '원';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
let editing = null, records = [], requestId = 0, toastTimer;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4000); }
function showApp(active) { $('app').hidden = !active; $('login-screen').hidden = active; if (!active) { records = []; $('rows').replaceChildren(); $('password').value = ''; resetForm(); } }
async function api(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ledger' }, credentials: 'same-origin' });
  const data = await res.json();
  if (!res.ok) { if (res.status === 401) showApp(false); throw new Error(data.error || '요청을 처리하지 못했습니다.'); }
  return data;
}
for (const category of categories) $('category').add(new Option(category, category));
$('month').value = today().slice(0,7); $('date').value = today();
function resetForm() { editing = null; $('expense-form').reset(); $('date').value = today(); $('form-title').textContent = '새 지출 기록'; $('save').textContent = '＋ 지출 추가하기'; $('cancel').hidden = true; }
function text(tag, content, className) { const element = document.createElement(tag); element.textContent = content; if (className) element.className = className; return element; }
async function load() {
  const id = ++requestId;
  $('load-error').textContent = ''; $('rows').replaceChildren(); $('empty').hidden = true; $('visible-count').textContent = '불러오는 중…';
  $('total').textContent = '—'; $('count').textContent = '—'; $('top-category').textContent = '—'; $('top-caption').textContent = '불러오는 중…'; $('chart').replaceChildren();
  const params = new URLSearchParams({ month: $('month').value }); if ($('search-date').value) params.set('date', $('search-date').value);
  try {
    const data = await api('/api/expenses?' + params); if (id !== requestId) return;
    records = data.expenses;
    $('total').textContent = money(data.total); $('count').textContent = `${data.count}건`;
    $('total-caption').textContent = `${$('month').value.replace('-', '년 ')}월 전체 내역 기준`;
    const sorted = [...data.categories].sort((a,b) => b.total - a.total), top = sorted[0];
    $('top-category').textContent = top.total ? top.category : '아직 없어요'; $('top-caption').textContent = top.total ? `${money(top.total)} · 전체의 ${Math.round(top.total/data.total*100)}%` : '첫 지출을 기록해 보세요';
    for (const category of sorted) {
      const row = text('div', '', 'bar-row'), label = text('div', '', 'bar-label');
      label.append(text('span', category.category), text('span', money(category.total)));
      const track = text('div', '', 'track'), bar = text('div', '', 'bar');
      const percent = top.total ? category.total/top.total*100 : 0;
      bar.style.width = `${percent}%`; track.append(bar); row.append(label, track); $('chart').append(row);
    }
    $('visible-count').textContent = `${records.length}건`; $('empty').hidden = records.length !== 0;
    for (const record of records) {
      const tr = document.createElement('tr'); tr.append(text('td', record.date.replaceAll('-', '.')), text('td', record.item));
      const category = text('td',''); category.append(text('span', record.category, 'tag')); tr.append(category, text('td', money(record.amount), 'numeric'));
      const actions = text('td', '', 'numeric');
      for (const [action, label] of [['edit', '수정'], ['delete', '삭제']]) { const button = text('button', label, 'row-action'); button.dataset.action = action; button.dataset.id = record.id; button.setAttribute('aria-label', `${record.item} ${label}`); actions.append(button); }
      tr.append(actions); $('rows').append(tr);
    }
  } catch (error) { if (id === requestId) { records = []; $('load-error').textContent = error.message; $('visible-count').textContent = ''; $('top-caption').textContent = '데이터를 불러오지 못했습니다'; } }
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true; $('login-error').textContent = '';
  try { await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('password').value }) }); $('password').value = ''; showApp(true); await load(); }
  catch (error) { $('login-error').textContent = error.message; } finally { button.disabled = false; }
});
$('logout').addEventListener('click', async () => { try { await api('/api/logout', { method: 'POST' }); ++requestId; showApp(false); $('password').focus(); } catch (e) { toast(e.message); } });
$('expense-form').addEventListener('submit', async event => {
  event.preventDefault(); $('save').disabled = true;
  const body = { date: $('date').value, item: $('item').value.trim(), category: $('category').value, amount: Number($('amount').value) };
  try { await api(editing ? `/api/expenses/${editing}` : '/api/expenses', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body) }); toast(editing ? '지출 내역을 수정했습니다.' : '새로운 지출을 기록했습니다.'); $('month').value = body.date.slice(0,7); $('search-date').value = ''; resetForm(); await load(); }
  catch (error) { toast(error.message); } finally { $('save').disabled = false; }
});
$('cancel').addEventListener('click', resetForm);
$('month').addEventListener('change', () => { if (!$('month').value) return; $('search-date').value = ''; load(); });
$('search-date').addEventListener('change', () => { if ($('search-date').value) $('month').value = $('search-date').value.slice(0,7); load(); });
$('clear-filter').addEventListener('click', () => { $('search-date').value = ''; load(); });
$('rows').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]'); if (!button) return;
  const record = records.find(row => row.id === Number(button.dataset.id)); if (!record) return;
  if (button.dataset.action === 'edit') {
    editing = record.id; for (const key of ['date','item','category','amount']) $(key).value = record[key];
    $('form-title').textContent = '지출 내역 수정'; $('save').textContent = '변경 내용 저장'; $('cancel').hidden = false; $('expense-form').scrollIntoView({ behavior: 'smooth', block: 'center' }); $('item').focus();
  } else if (confirm(`“${record.item}” ${money(record.amount)} 내역을 삭제할까요?`)) {
    button.disabled = true;
    try { await api(`/api/expenses/${record.id}`, { method: 'DELETE' }); if (editing === record.id) resetForm(); toast('지출 내역을 삭제했습니다.'); await load(); }
    catch (error) { toast(error.message); button.disabled = false; }
  }
});
try { const session = await api('/api/session'); showApp(session.authenticated); if (session.authenticated) await load(); else if (!session.configured) $('login-error').textContent = '서버의 APP_PASSWORD 환경변수를 먼저 설정해 주세요.'; }
catch (error) { $('login-error').textContent = '서버에 연결할 수 없습니다. 잠시 후 새로고침해 주세요.'; }
