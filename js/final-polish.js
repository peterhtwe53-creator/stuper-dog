(() => {
  'use strict';

  const KEY = 'moneyflow-v3';
  const $ = id => document.getElementById(id);
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const money = value => `${Math.round(Number(value) || 0).toLocaleString()} MMK`;
  const num = value => Number(String(value ?? '').replace(/,/g, '')) || 0;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (_) { return {}; } };
  const monthOf = value => String(value || '').slice(0, 7);
  const selectedMonth = state => state.reportMonth || todayISO.slice(0, 7);
  const monthName = value => new Date(`${value}-01T00:00:00`).toLocaleString('en', { month: 'long', year: 'numeric' });
  const toast = message => { const el = $('toast'); if (!el) return; el.textContent = message; el.classList.add('on'); clearTimeout(el._enhanceTimer); el._enhanceTimer = setTimeout(() => el.classList.remove('on'), 2400); };

  function monthOptions(state) {
    const values = new Set([selectedMonth(state), ...(state.transactions || []).map(t => monthOf(t.date)), ...(state.budgets || []).map(b => monthOf(b.month))]);
    return [...values].filter(Boolean).sort().map(month => `<option value="${esc(month)}">${esc(monthName(month))}</option>`).join('');
  }

  function changeMonth(month) {
    const state = read();
    state.reportMonth = month;
    localStorage.setItem(KEY, JSON.stringify(state));
    const dashboardSelect = $('monthSelect');
    if (dashboardSelect) { dashboardSelect.value = month; dashboardSelect.dispatchEvent(new Event('change', { bubbles: true })); }
    window.dispatchEvent(new CustomEvent('moneyflow:monthchange', { detail: { month } }));
  }

  function injectHomeMonth() {
    const badge = document.querySelector('#home .month-badge');
    if (!badge || $('homeMonthSelect')) return;
    badge.innerHTML = `<label class="month-picker"><span>Reporting month</span><select id="homeMonthSelect" aria-label="Select reporting month"></select></label>`;
    $('homeMonthSelect').addEventListener('change', e => changeMonth(e.target.value));
  }

  function syncMonthPickers() {
    const state = read();
    const value = selectedMonth(state);
    ['homeMonthSelect', 'monthSelect'].forEach(id => { const el = $(id); if (!el) return; el.innerHTML = monthOptions(state); el.value = value; });
    const label = $('homeMonth'); if (label) label.textContent = value;
  }

  function transactionTotals(state, month) {
    return (state.transactions || []).filter(t => monthOf(t.date) === month).reduce((out, t) => {
      const amount = num(t.amount);
      if (t.type === 'income') out.income += amount;
      if (t.type === 'expense') out.expense += amount;
      if (t.type === 'credit') out.credit += amount;
      return out;
    }, { income: 0, expense: 0, credit: 0 });
  }

  function dailyBudget(state, month) {
    const totals = transactionTotals(state, month);
    const net = totals.income - totals.expense - totals.credit;
    const [year, monthNumber] = month.split('-').map(Number);
    const isCurrentMonth = month === todayISO.slice(0, 7);
    const daysInMonth = new Date(year, monthNumber, 0).getDate();
    const elapsedDay = isCurrentMonth ? today.getDate() : daysInMonth;
    const remainingDays = isCurrentMonth ? Math.max(1, daysInMonth - elapsedDay + 1) : 1;
    return { net, remainingDays, daily: Math.max(0, net) / remainingDays };
  }

  function injectDailyBudget() {
    if ($('dailyBudgetCard')) return;
    const host = document.querySelector('#home .summary-grid, #home .cards.three');
    if (!host) return;
    const card = document.createElement('article');
    card.id = 'dailyBudgetCard';
    card.className = 'panel stat daily-budget-card';
    card.innerHTML = '<small>Daily budget</small><strong id="dailyBudgetAmount">0 MMK</strong><span id="dailyBudgetMeta">Based on remaining net</span>';
    host.appendChild(card);
  }

  function renderDailyBudget() {
    const state = read();
    const result = dailyBudget(state, selectedMonth(state));
    const amount = $('dailyBudgetAmount');
    const meta = $('dailyBudgetMeta');
    if (amount) amount.textContent = money(result.daily);
    if (meta) meta.textContent = `${result.remainingDays} day${result.remainingDays === 1 ? '' : 's'} remaining · Net ${money(result.net)}`;
  }

  function createChartPanel() {
    const dashboard = $('dashboard');
    if (!dashboard) return;
    if (!$('customCharts')) {
      const panel = document.createElement('div');
      panel.id = 'customCharts';
      panel.className = 'two-col chart-panels';
      panel.innerHTML = `<div class="panel chart-card"><div class="section-head"><div><small class="eyebrow">VISUAL ANALYTICS</small><h3>Budget utilisation</h3></div></div><canvas id="budgetChart" height="220" aria-label="Budget utilisation chart"></canvas></div><div class="panel chart-card"><div class="section-head"><div><small class="eyebrow">LIABILITY BI</small><h3>Loan vs payback trend</h3></div></div><canvas id="loanChart" height="220" aria-label="Loan received versus payback chart"></canvas><div id="loanChartLegend" class="chart-legend"></div></div>`;
      dashboard.appendChild(panel);
    }
  }

  function drawBars(canvas, rows, colors) {
    if (!canvas || !canvas.getContext) return;
    const width = Math.max(260, canvas.clientWidth || 520);
    const height = 220;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio; canvas.height = height * ratio; canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
    const max = Math.max(1, ...rows.flatMap(row => row.values));
    const gap = 12; const groupWidth = Math.max(34, (width - gap * (rows.length + 1)) / Math.max(1, rows.length));
    rows.forEach((row, index) => {
      const x = gap + index * (groupWidth + gap); const barWidth = Math.max(8, (groupWidth - 8) / row.values.length);
      row.values.forEach((value, valueIndex) => { const barHeight = Math.max(2, value / max * 145); ctx.fillStyle = colors[valueIndex]; ctx.beginPath(); ctx.roundRect(x + valueIndex * (barWidth + 4), 172 - barHeight, barWidth, barHeight, 5); ctx.fill(); });
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted') || '#94a3b8'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(row.label, x + groupWidth / 2, 198);
    });
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--line') || '#263449'; ctx.beginPath(); ctx.moveTo(0, 173); ctx.lineTo(width, 173); ctx.stroke();
  }

  function renderCharts() {
    const state = read(); const month = selectedMonth(state); const budgets = (state.budgets || []).filter(b => monthOf(b.month) === month);
    const budgetRows = budgets.map(b => { const spent = (state.transactions || []).filter(t => monthOf(t.date) === month && t.type === 'expense' && !t.loanId && String(t.category) === String(b.name || b.category)).reduce((sum, t) => sum + num(t.amount), 0); return { label: String(b.name || b.category).slice(0, 9), values: [num(b.amount), spent] }; });
    drawBars($('budgetChart'), budgetRows.slice(0, 8), ['#4f8cff', '#22d3ee']);
    const months = [...new Set((state.transactions || []).map(t => monthOf(t.date)).filter(Boolean))].sort().slice(-6);
    const loanRows = months.map(m => ({ label: m.slice(5), values: [ (state.transactions || []).filter(t => monthOf(t.date) === m && t.type === 'income' && t.loanId).reduce((s, t) => s + num(t.amount), 0), (state.transactions || []).filter(t => monthOf(t.date) === m && t.type === 'expense' && t.loanId).reduce((s, t) => s + num(t.amount), 0) ] }));
    drawBars($('loanChart'), loanRows, ['#8b5cf6', '#fb7185']);
    const legend = $('loanChartLegend'); if (legend) legend.innerHTML = '<span><i class="legend-dot loan"></i>Received as income</span><span><i class="legend-dot payback"></i>Payback expense</span>';
  }

  function injectLoanReport() {
    if ($('loanReport')) return;
    const host = $('dashboard'); if (!host) return;
    const panel = document.createElement('div'); panel.id = 'loanReport'; panel.className = 'panel loan-report';
    panel.innerHTML = '<div class="section-head"><div><small class="eyebrow">LIABILITY REPORT</small><h3>Loan position</h3></div></div><div id="loanReportStats" class="loan-report-stats"></div>';
    const anchor = $('customCharts'); host.insertBefore(panel, anchor || null);
  }

  function renderLoanReport() {
    const state = read(); const month = selectedMonth(state); const list = state.transactions || [];
    const received = list.filter(t => monthOf(t.date) === month && t.type === 'income' && t.loanId).reduce((s, t) => s + num(t.amount), 0);
    const payback = list.filter(t => monthOf(t.date) === month && t.type === 'expense' && t.loanId).reduce((s, t) => s + num(t.amount), 0);
    const outstanding = (state.loans || []).reduce((s, loan) => s + Math.max(0, num(loan.remaining)), 0);
    const host = $('loanReportStats'); if (host) host.innerHTML = `<div><small>Received</small><strong>${money(received)}</strong></div><div><small>Payback</small><strong>${money(payback)}</strong></div><div><small>Outstanding</small><strong>${money(outstanding)}</strong></div>`;
  }

  function injectFab() {
    if ($('mobileFab')) return;
    const fab = document.createElement('div'); fab.id = 'mobileFab'; fab.className = 'mobile-fab'; fab.innerHTML = '<button type="button" class="fab-main" aria-label="Open quick actions" aria-expanded="false">＋</button><div class="fab-actions" aria-hidden="true"><button type="button" data-page="add" data-type="expense" aria-label="Add expense">− Expense</button><button type="button" data-page="add" data-type="income" aria-label="Add income">＋ Income</button><button type="button" data-page="add" data-type="loan" aria-label="Record loan">↗ Loan</button></div>';
    document.body.appendChild(fab);
    const main = fab.querySelector('.fab-main'); main.addEventListener('click', () => { const open = fab.classList.toggle('open'); main.setAttribute('aria-expanded', String(open)); fab.querySelector('.fab-actions').setAttribute('aria-hidden', String(!open)); });
    fab.addEventListener('click', event => { const action = event.target.closest('[data-type]'); if (!action) return; const tab = document.querySelector(`[data-type="${action.dataset.type}"]`); if (tab) tab.click(); fab.classList.remove('open'); main.setAttribute('aria-expanded', 'false'); });
  }

  function renderAllEnhancements() { injectHomeMonth(); injectDailyBudget(); createChartPanel(); injectLoanReport(); injectFab(); syncMonthPickers(); renderDailyBudget(); renderCharts(); renderLoanReport(); }
  function run() { renderAllEnhancements(); window.addEventListener('resize', renderCharts, { passive: true }); window.addEventListener('storage', renderAllEnhancements); window.addEventListener('moneyflow:monthchange', renderAllEnhancements); setInterval(renderAllEnhancements, 30000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true }); else run();
})();
