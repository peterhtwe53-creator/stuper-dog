(() => {
  'use strict';

  const KEY = 'moneyflow-v3';
  const $ = (id) => document.getElementById(id);
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const currentMonth = todayISO.slice(0, 7);

  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch (_) {
      return {};
    }
  };

  const save = (state) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (_) {}
  };

  const num = (value) => Number(String(value ?? '').replace(/,/g, '')) || 0;
  const money = (value) => `${Math.round(num(value)).toLocaleString()} MMK`;
  const monthOf = (value) => String(value || '').slice(0, 7);
  const monthLabel = (value) => {
    const [year, month] = String(value).split('-').map(Number);
    return year && month
      ? new Date(year, month - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' })
      : value;
  };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  function stateWithDefaults() {
    const raw = read();
    return {
      ...raw,
      transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
      budgets: Array.isArray(raw.budgets) ? raw.budgets : [],
      loans: Array.isArray(raw.loans) ? raw.loans : [],
      categories: Array.isArray(raw.categories) ? raw.categories : [],
      reportMonth: /^\d{4}-\d{2}$/.test(String(raw.reportMonth || '')) ? raw.reportMonth : currentMonth,
      settings: raw.settings || {}
    };
  }

  // Keep a useful selectable range even before the user has saved data in a month.
  function monthRange() {
    const result = [];
    const start = new Date(today.getFullYear(), today.getMonth() - 24, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 24, 1);
    for (const cursor = new Date(start); cursor <= end; cursor.setMonth(cursor.getMonth() + 1)) {
      result.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    }
    return result;
  }

  function availableMonths(state) {
    return Array.from(new Set([
      ...monthRange(),
      state.reportMonth,
      ...state.transactions.map((item) => monthOf(item.date)),
      ...state.budgets.map((item) => monthOf(item.month))
    ].filter((value) => /^\d{4}-\d{2}$/.test(value)))).sort();
  }

  function setReportMonth(value) {
    if (!/^\d{4}-\d{2}$/.test(String(value))) return;
    const state = stateWithDefaults();
    state.reportMonth = value;
    save(state);

    const primary = $('monthSelect');
    if (primary && primary.value !== value) primary.value = value;

    const home = $('homeMonthSelect');
    if (home && home.value !== value) home.value = value;

    // app.js listens for the existing monthSelect change event.
    if (primary) primary.dispatchEvent(new Event('change', { bubbles: true }));
    window.dispatchEvent(new CustomEvent('moneyflow:monthchange', { detail: { month: value } }));
  }

  function ensureHomeMonthSelector() {
    const badge = document.querySelector('#home .month-badge');
    if (!badge) return;

    let select = $('homeMonthSelect');
    if (!select) {
      badge.innerHTML = '<label class="month-picker"><span>Reporting month</span><select id="homeMonthSelect" aria-label="Select home reporting month"></select></label>';
      select = $('homeMonthSelect');
      select.addEventListener('change', (event) => setReportMonth(event.target.value));
    }
  }

  function renderMonthSelectors() {
    const state = stateWithDefaults();
    const options = availableMonths(state).map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(monthLabel(value))}</option>`).join('');

    ['monthSelect', 'homeMonthSelect'].forEach((id) => {
      const select = $(id);
      if (!select) return;
      select.innerHTML = options;
      select.value = state.reportMonth;
    });
  }

  function currentMonthBudget(state) {
    const selected = state.reportMonth;
    const transactions = state.transactions.filter((item) => monthOf(item.date) === selected);

    // Loan receipts are liabilities, not disposable income.
    const income = transactions
      .filter((item) => item.type === 'income' && !item.loanId)
      .reduce((sum, item) => sum + num(item.amount), 0);
    const expenses = transactions
      .filter((item) => item.type === 'expense' && !item.loanId)
      .reduce((sum, item) => sum + num(item.amount), 0);
    const credit = transactions
      .filter((item) => item.type === 'credit')
      .reduce((sum, item) => sum + num(item.amount), 0);
    const net = income - expenses - credit;

    if (selected !== currentMonth) {
      return { daily: 0, remainingDays: 0, net, historical: true };
    }

    const [year, month] = selected.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const remainingDays = Math.max(1, daysInMonth - today.getDate() + 1);

    return {
      daily: Math.max(0, net) / remainingDays,
      remainingDays,
      net,
      historical: false
    };
  }

  function ensureDailyBudgetCard() {
    if ($('dailyBudgetCard')) return;

    const host = document.querySelector('#home .cards') || document.querySelector('#home .summary-grid');
    if (!host) return;

    const card = document.createElement('article');
    card.id = 'dailyBudgetCard';
    card.className = 'panel stat daily-budget-card';
    card.innerHTML = '<small>Daily safe budget</small><strong id="dailyBudgetAmount">—</strong><span id="dailyBudgetMeta">Current month only</span>';
    host.appendChild(card);
  }

  function renderDailyBudget() {
    const state = stateWithDefaults();
    const result = currentMonthBudget(state);
    const amount = $('dailyBudgetAmount');
    const meta = $('dailyBudgetMeta');

    if (amount) amount.textContent = result.historical ? '—' : money(result.daily);
    if (meta) {
      meta.textContent = result.historical
        ? 'Available for the current month only'
        : `${result.remainingDays} day${result.remainingDays === 1 ? '' : 's'} remaining · Net ${money(result.net)}`;
    }
  }

  function refresh() {
    ensureHomeMonthSelector();
    ensureDailyBudgetCard();
    renderMonthSelectors();
    renderDailyBudget();
  }

  function run() {
    refresh();

    // Refresh only when data or the selected month changes; no polling loop.
    window.addEventListener('storage', refresh);
    window.addEventListener('moneyflow:monthchange', refresh);
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-page], [data-type], #addBudgetBtn, [data-delete-budget], [data-delete-transaction], #clearTransactionsBtn')) {
        requestAnimationFrame(refresh);
      }
    });
    document.addEventListener('submit', () => requestAnimationFrame(refresh));
    document.addEventListener('change', (event) => {
      if (event.target.id === 'monthSelect' || event.target.id === 'homeMonthSelect') {
        setReportMonth(event.target.value);
      } else if (event.target.id === 'syncUrl' || event.target.id === 'budgetMonth') {
        requestAnimationFrame(refresh);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
})();
