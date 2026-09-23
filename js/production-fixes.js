(() => {
  'use strict';
  const KEY = 'moneyflow-v3';
  const $ = (id) => document.getElementById(id);
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const currentMonth = todayISO.slice(0, 7);
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } };
  const write = (s) => localStorage.setItem(KEY, JSON.stringify(s));
  const num = (v) => Number(String(v ?? '').replace(/,/g, '')) || 0;
  const money = (v) => `${Math.round(num(v)).toLocaleString()} MMK`;
  const monthOf = (v) => String(v || '').slice(0, 7);
  const uid = (p) => `${p}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const toast = (m) => { const e = $('toast'); if (!e) return; e.textContent = m; e.classList.add('on'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('on'), 2400); };
  const state = () => { const s = read(); s.transactions = Array.isArray(s.transactions) ? s.transactions : []; s.categories = Array.isArray(s.categories) ? s.categories : []; s.budgets = Array.isArray(s.budgets) ? s.budgets : []; s.loans = Array.isArray(s.loans) ? s.loans : []; s.settings = s.settings || {}; s.reportMonth = /^\d{4}-\d{2}$/.test(s.reportMonth) ? s.reportMonth : currentMonth; return s; };

  function months(s) {
    const result = new Set([s.reportMonth]);
    const start = new Date(today.getFullYear(), today.getMonth() - 24, 1);
    for (let i = 0; i < 49; i += 1) { const d = new Date(start.getFullYear(), start.getMonth() + i, 1); result.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
    s.transactions.forEach(t => result.add(monthOf(t.date))); s.budgets.forEach(b => result.add(monthOf(b.month)));
    return [...result].filter(x => /^\d{4}-\d{2}$/.test(x)).sort();
  }
  function refreshMonths() { const s = state(); const html = months(s).map(m => `<option value="${m}">${new Date(`${m}-01T00:00:00`).toLocaleString('en', { month: 'long', year: 'numeric' })}</option>`).join(''); ['monthSelect', 'homeMonthSelect', 'dashboardMonthSelect'].forEach(id => { const e = $(id); if (e) { e.innerHTML = html; e.value = s.reportMonth; } }); const bm = document.querySelector('[name="budgetMonth"]'); if (bm) { bm.innerHTML = html; bm.value = s.reportMonth; } }
  function dailyBudget(s) { const list = s.transactions.filter(t => monthOf(t.date) === s.reportMonth); const income = list.filter(t => t.type === 'income' && !t.loanId).reduce((a, t) => a + num(t.amount), 0); const expense = list.filter(t => t.type === 'expense' && !t.loanId).reduce((a, t) => a + num(t.amount), 0); const credit = list.filter(t => t.type === 'credit').reduce((a, t) => a + num(t.amount), 0); const net = income - expense - credit; if (s.reportMonth !== currentMonth) return { value: 0, days: 0, net, historical: true }; const [y, m] = s.reportMonth.split('-').map(Number); const days = new Date(y, m, 0).getDate() - today.getDate() + 1; return { value: Math.max(0, net) / Math.max(1, days), days: Math.max(1, days), net, historical: false }; }
  function renderDaily() { const s = state(); const d = dailyBudget(s); const value = $('dailyBudgetValue'); const meta = $('dailyBudgetMeta'); if (value) value.textContent = d.historical ? '—' : money(d.value); if (meta) meta.textContent = d.historical ? 'Current month only' : `${d.days} day${d.days === 1 ? '' : 's'} remaining · Disposable net ${money(d.net)}`; }
  function ensureLoanPayback() { const form = $('transactionForm'); if (!form || form.querySelector('[name="loanId"]')) return; const type = form.querySelector('[name="type"]'); if (type) type.insertAdjacentHTML('beforeend', '<option value="payback">Payback loan</option>'); const label = document.createElement('label'); label.id = 'loanPaybackField'; label.hidden = true; label.innerHTML = '<span>Loan to repay</span><select name="loanId" aria-label="Loan to repay"></select>'; form.insertBefore(label, form.querySelector('button')); if (type) type.addEventListener('change', () => { label.hidden = type.value !== 'payback'; renderLoans(); }); renderLoans(); }
  function renderLoans() { const select = document.querySelector('[name="loanId"]'); if (!select) return; const s = state(); const loans = s.loans.filter(l => num(l.remaining) > 0); select.innerHTML = loans.map(l => `<option value="${l.id}">${l.name || 'Loan'} · ${money(l.remaining)} remaining</option>`).join('') || '<option value="">No active loans</option>'; select.disabled = !loans.length; }
  function captureTransaction(event) { if (!event.target.matches('#transactionForm')) return; const form = event.target; const type = form.querySelector('[name="type"]')?.value || 'expense'; if (type !== 'payback' && type !== 'loan') return; event.preventDefault(); event.stopImmediatePropagation(); const amount = num(form.querySelector('[name="amount"]')?.value); const date = form.querySelector('[name="date"]')?.value || todayISO; const note = form.querySelector('[name="note"]')?.value?.trim() || ''; if (!amount) return toast('Enter a valid amount.'); const s = state(); const tx = { id: uid('tx'), type: type === 'payback' ? 'expense' : 'income', amount, date, note, category: type === 'payback' ? 'Loan Repayment' : 'Loan', loanId: '', createdAt: new Date().toISOString() }; if (type === 'loan') { tx.loanId = uid('loan'); s.loans.push({ id: tx.loanId, name: note || 'Loan', principal: amount, remaining: amount, date, note }); } else { const id = form.querySelector('[name="loanId"]')?.value; const loan = s.loans.find(l => String(l.id) === String(id)); if (!loan) return toast('Select an active loan.'); if (amount > num(loan.remaining)) return toast('Payback cannot exceed remaining loan.'); tx.loanId = loan.id; } s.transactions.push(tx); write(s); form.reset(); refresh(); toast(type === 'loan' ? 'Loan recorded as liability income.' : 'Payback recorded as expense.'); }
  function refresh() { const s = state(); refreshMonths(); ensureLoanPayback(); renderDaily(); renderLoans(); }
  async function sync() { const s = state(); const url = String(s.settings.syncUrl || '').trim(); if (!url) return toast('Add the Apps Script URL first.'); try { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'replaceAll', transactions: s.transactions, categories: s.categories, budgets: s.budgets, loans: s.loans, goals: s.goals }) }); const data = await r.json(); if (!r.ok || !data.ok) throw Error(data.error || 'Sync failed'); toast('Synced to Google Sheets.'); } catch (e) { toast(e.message || 'Sync failed.'); } }
  document.addEventListener('submit', captureTransaction, true);
  document.addEventListener('change', (e) => { if (['monthSelect', 'homeMonthSelect', 'dashboardMonthSelect'].includes(e.target.id)) { const s = state(); s.reportMonth = e.target.value; write(s); refresh(); } if (e.target.id === 'syncUrl') { const s = state(); s.settings.syncUrl = e.target.value.trim(); write(s); } });
  document.addEventListener('click', (e) => { const action = e.target.closest('[data-action]')?.dataset.action; if (action === 'sync-google') sync(); });
  window.addEventListener('storage', refresh);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true }); else refresh();
})();
