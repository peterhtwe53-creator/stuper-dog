(() => {
  'use strict';

  const KEY = 'moneyflow-v3';
  const $ = (id) => document.getElementById(id);

  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);

  const defaults = [
    ['Food & Drinks', 'expense'],
    ['Transportation', 'expense'],
    ['Family', 'expense'],
    ['Housing', 'expense'],
    ['Utilities', 'expense'],
    ['Shopping', 'expense'],
    ['Health', 'expense'],
    ['Education', 'expense'],
    ['Salary', 'income'],
    ['Bonus', 'income'],
    ['Loan', 'income']
  ];

  const fallback = {
    transactions: [],
    categories: defaults.map(([name, type]) => ({ name, type })),
    budgets: [],
    goals: [],
    loans: [],
    reportMonth: currentMonth,
    settings: {
      theme: 'dark',
      syncUrl: '',
      syncRevision: '',
      lastSynced: ''
    }
  };

  let syncing = false;

  function uid(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function num(value) {
    const n = Number(String(value == null ? '' : value).replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function money(value) {
    return `${Math.round(num(value)).toLocaleString()} MMK`;
  }

  function monthOf(value) {
    return String(value || '').slice(0, 7);
  }

  function monthLabel(monthValue) {
    const m = String(monthValue || currentMonth);
    if (!/^\d{4}-\d{2}$/.test(m)) return m;
    const [year, month] = m.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleString('en-US', {
      month: 'long',
      year: 'numeric'
    });
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      const merged = {
        ...fallback,
        ...raw,
        settings: { ...fallback.settings, ...(raw.settings || {}) }
      };

      merged.transactions = Array.isArray(raw.transactions) ? raw.transactions : [];
      merged.categories = Array.isArray(raw.categories) && raw.categories.length ? raw.categories : fallback.categories.slice();
      merged.budgets = Array.isArray(raw.budgets) ? raw.budgets : [];
      merged.goals = Array.isArray(raw.goals) ? raw.goals : [];
      merged.loans = Array.isArray(raw.loans) ? raw.loans : [];
      merged.reportMonth = /^\d{4}-\d{2}$/.test(String(raw.reportMonth || '')) ? raw.reportMonth : currentMonth;

      return merged;
    } catch (_) {
      return JSON.parse(JSON.stringify(fallback));
    }
  }

  let state = load();

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function normalizeState() {
    if (!state.settings) state.settings = {};
    state.settings = { ...fallback.settings, ...state.settings };

    if (!Array.isArray(state.categories) || !state.categories.length) {
      state.categories = fallback.categories.slice();
    }

    ['transactions', 'budgets', 'goals', 'loans'].forEach((key) => {
      if (!Array.isArray(state[key])) state[key] = [];
    });

    state.reportMonth = /^\d{4}-\d{2}$/.test(String(state.reportMonth || '')) ? state.reportMonth : currentMonth;

    state.transactions = state.transactions.map((tx) => {
      const item = { ...tx };
      const category = String(item.category || '').toLowerCase();

      if (item.type === 'loan' || category === 'loan' || category === 'loan received') {
        item.type = 'income';
        item.category = 'Loan';
        item.loanId = item.loanId || uid('loan');
      }

      if (category === 'loan repayment' || category === 'loan payback' || category === 'loan repayment payback') {
        item.type = 'expense';
        item.category = 'Loan Repayment';
      }

      return item;
    });

    rebuildMissingLoans();
    save();
  }

  function cleanLoanName(tx) {
    return String(tx.note || tx.category || 'Loan').trim() || 'Loan';
  }

  function rebuildMissingLoans() {
    state.transactions.filter((tx) => tx.type === 'income' && tx.loanId).forEach((tx) => {
      if (!state.loans.some((loan) => String(loan.id) === String(tx.loanId))) {
        state.loans.push({
          id: tx.loanId,
          name: cleanLoanName(tx),
          principal: num(tx.amount),
          remaining: num(tx.amount),
          date: tx.date || today,
          note: tx.note || '',
          createdAt: tx.createdAt || new Date().toISOString()
        });
      }
    });
  }

  function totals(list) {
    return list.reduce((result, tx) => {
      const amount = num(tx.amount);
      if (tx.type === 'income') result.income += amount;
      else if (tx.type === 'expense') result.expense += amount;
      else if (tx.type === 'credit') result.credit += amount;
      return result;
    }, { income: 0, expense: 0, credit: 0 });
  }

  function loanReceived(list) {
    return list.filter((tx) => tx.type === 'income' && tx.loanId).reduce((sum, tx) => sum + num(tx.amount), 0);
  }

  function loanPaybacks(list) {
    return list.filter((tx) => tx.type === 'expense' && tx.loanId).reduce((sum, tx) => sum + num(tx.amount), 0);
  }

  function outstandingLoans() {
    return state.loans.reduce((sum, loan) => sum + Math.max(0, num(loan.remaining)), 0);
  }

  function categoryRows(list) {
    const grouped = {};
    list.filter((tx) => tx.type === 'expense' && !tx.loanId).forEach((tx) => {
      const key = tx.category || 'General';
      grouped[key] = (grouped[key] || 0) + num(tx.amount);
    });
    return Object.entries(grouped)
      .sort((a, b) => b[1] - a[1])
      .map(([name, amount]) => ({ name, amount }));
  }

  function monthlyRows() {
    const grouped = {};
    state.transactions.forEach((tx) => {
      const key = monthOf(tx.date);
      if (!key) return;
      if (!grouped[key]) grouped[key] = { month: key, income: 0, expense: 0, credit: 0, loan: 0, payback: 0 };
      const amount = num(tx.amount);

      if (tx.type === 'income') {
        grouped[key].income += amount;
        if (tx.loanId) grouped[key].loan += amount;
      }

      if (tx.type === 'expense') {
        grouped[key].expense += amount;
        if (tx.loanId) grouped[key].payback += amount;
      }

      if (tx.type === 'credit') grouped[key].credit += amount;
    });

    return Object.values(grouped).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
  }

  function currentBudgetData() {
    const monthValue = state.reportMonth || currentMonth;
    const txs = state.transactions.filter((tx) => monthOf(tx.date) === monthValue);

    const income = txs.filter((tx) => tx.type === 'income' && !tx.loanId).reduce((sum, tx) => sum + num(tx.amount), 0);
    const expense = txs.filter((tx) => tx.type === 'expense' && !tx.loanId).reduce((sum, tx) => sum + num(tx.amount), 0);
    const credit = txs.filter((tx) => tx.type === 'credit').reduce((sum, tx) => sum + num(tx.amount), 0);

    const net = income - expense - credit;

    if (monthValue !== currentMonth) {
      return { net, daily: 0, remainingDays: 0, historical: true };
    }

    const [year, month] = monthValue.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const day = new Date().getDate();
    const remainingDays = Math.max(1, daysInMonth - day + 1);

    return {
      net,
      daily: Math.max(0, net) / remainingDays,
      remainingDays,
      historical: false
    };
  }

  function showPage(pageId) {
    document.querySelectorAll('.page').forEach((page) => {
      page.classList.toggle('active', page.id === pageId);
    });

    document.querySelectorAll('[data-page]').forEach((button) => {
      button.classList.toggle('active', button.dataset.page === pageId);
    });
  }

  function populateCategories() {
    const select = $('category');
    if (!select) return;

    const type = state.currentType || 'expense';
    const list = state.categories.filter((category) => category.type === type);
    select.innerHTML = list.length
      ? list.map((category) => `<option value="${esc(category.name)}">${esc(category.name)}</option>`).join('')
      : '<option value="General">General</option>';

    if (state.currentType === 'loan') {
      select.innerHTML = '<option value="Loan">Loan</option>';
    }

    if (state.currentType === 'payback') {
      select.innerHTML = '<option value="Loan Repayment">Loan Repayment</option>';
    }
  }

  function renderLoanSelect() {
    const select = $('loanSelect');
    if (!select) return;

    const activeLoans = state.loans.filter((loan) => num(loan.remaining) > 0);
    select.innerHTML = activeLoans.length
      ? activeLoans.map((loan) => `<option value="${esc(loan.id)}">${esc(loan.name || 'Loan')} (${money(loan.remaining)})</option>`).join('')
      : '<option value="">No active loan</option>';

    select.disabled = !activeLoans.length;
  }

  function setType(type) {
    state.currentType = type || 'expense';

    const titles = {
      expense: 'Add Expense',
      income: 'Add Income',
      loan: 'Add Loan',
      payback: 'Add Loan Payback',
      credit: 'Add Credit Payment'
    };

    if ($('formTitle')) $('formTitle').textContent = titles[type] || 'Add Entry';
    if ($('amount')) $('amount').value = '';
    if ($('note')) $('note').value = '';

    if ($('loanSelect')) {
      $('loanSelect').disabled = type !== 'payback';
      $('loanSelect').closest('.field')?.classList.toggle('hidden', type !== 'payback');
    }

    document.querySelectorAll('.tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.type === type || button.dataset.add === type);
    });

    populateCategories();
    renderLoanSelect();
  }

  function updateMonthOptions() {
    const select = $('month');
    if (!select) return;

    const values = Array.from(new Set(state.transactions.map((tx) => monthOf(tx.date)).filter(Boolean)));
    if (!values.includes(state.reportMonth)) values.push(state.reportMonth);
    select.innerHTML = values
      .sort()
      .map((monthValue) => `<option value="${monthValue}">${monthLabel(monthValue)}</option>`)
      .join('');

    select.value = state.reportMonth;
  }

  function renderHome() {
    const monthList = state.transactions.filter((tx) => monthOf(tx.date) === state.reportMonth);
    const totalsNow = totals(monthList);
    const net = totalsNow.income - totalsNow.expense - totalsNow.credit;

    const incomeEl = $('income');
    const expenseEl = $('expense');
    const creditEl = $('credit');
    const remainingEl = $('remaining');

    if (incomeEl) incomeEl.textContent = money(totalsNow.income);
    if (expenseEl) expenseEl.textContent = money(totalsNow.expense);
    if (creditEl) creditEl.textContent = money(totalsNow.credit);
    if (remainingEl) remainingEl.textContent = money(net);

    const loanEl = $('loan');
    if (loanEl) loanEl.textContent = money(loanPaybacks(monthList));

    const loanSummaryEl = $('loanSummary');
    if (loanSummaryEl) loanSummaryEl.textContent = money(outstandingLoans());

    const txCountEl = $('txCount');
    if (txCountEl) txCountEl.textContent = `Activity (${monthList.length})`;

    const recent = $('recent');
    if (recent) {
      recent.innerHTML = monthList
        .slice()
        .reverse()
        .slice(0, 8)
        .map((tx) => `
          <div class="row">
            <span>${esc(tx.type.toUpperCase())} ${esc(tx.category || 'General')}</span>
            <b>${money(tx.amount)}</b>
          </div>
        `).join('') || '<div class="empty">No recent items yet.</div>';
    }

    const breakdown = $('breakdown');
    if (breakdown) {
      breakdown.innerHTML = categoryRows(monthList).slice(0, 5).map((row) => `
        <div class="row">
          <span>${esc(row.name)}</span>
          <b>${money(row.amount)}</b>
        </div>
      `).join('') || '<div class="empty">No spend categories yet.</div>';
    }
  }

  function renderBudgetAlerts() {
    const host = $('budgetAlerts');
    if (!host) return;

    const monthBudgets = (state.budgets || []).filter((budget) => monthOf(budget.month) === state.reportMonth);
    if (!monthBudgets.length) {
      host.innerHTML = '<div class="alert success"><strong>No active budgets</strong><span>Set a category budget for this month.</span></div>';
      return;
    }

    const rows = monthBudgets.map((budget) => {
      const spent = state.transactions
        .filter((tx) => monthOf(tx.date) === state.reportMonth && tx.type === 'expense' && !tx.loanId && String(tx.category) === String(budget.name))
        .reduce((sum, tx) => sum + num(tx.amount), 0);

      const max = num(budget.amount);
      const pct = max ? (spent / max) * 100 : 0;

      let level = 'success';
      if (pct >= 80 && pct < 100) level = 'warning';
      if (pct >= 100) level = 'danger';

      return { budget, spent, pct, level };
    });

    host.innerHTML = rows.map(({ budget, spent, pct, level }) => `
      <div class="alert ${level}">
        <strong>${esc(budget.name || 'Budget')}</strong>
        <span>${money(spent)} / ${money(budget.amount)} · ${Math.round(pct)}%</span>
      </div>
    `).join('');
  }

  function renderReports() {
    const monthList = state.transactions.filter((tx) => monthOf(tx.date) === state.reportMonth);
    const totalsNow = totals(monthList);
    const categories = categoryRows(monthList);
    const overallNet = totalsNow.income - totalsNow.expense - totalsNow.credit;

    const cashflowEl = $('cashflow');
    const spentEl = $('spent');
    const remainingEl = $('remaining');
    const topSpendEl = $('topSpend');
    const topAmtEl = $('topAmt');
    const rhythmEl = $('rhythm');

    if (cashflowEl) cashflowEl.textContent = money(overallNet);
    if (spentEl) spentEl.textContent = money(totalsNow.expense);
    if (remainingEl) remainingEl.textContent = money(overallNet);
    if (topSpendEl) topSpendEl.textContent = categories[0] ? categories[0].name : '—';
    if (topAmtEl) topAmtEl.textContent = categories[0] ? money(categories[0].amount) : '0 MMK';
    if (rhythmEl) rhythmEl.textContent = String(monthList.length);

    const daily = currentBudgetData();
    const dailyBudgetEl = $('dailyBudgetAmount');
    if (dailyBudgetEl) dailyBudgetEl.textContent = daily.historical ? '—' : money(daily.daily);

    const dailyMetaEl = $('dailyBudgetMeta');
    if (dailyMetaEl) {
      dailyMetaEl.textContent = daily.historical
        ? 'Current month only'
        : `${daily.remainingDays} day${daily.remainingDays === 1 ? '' : 's'} left · net ${money(daily.net)}`;
    }

    const reportList = $('reportList');
    if (reportList) {
      reportList.innerHTML = categories.length
        ? categories.slice(0, 5).map((row) => `<li><span>${esc(row.name)}</span><b>${money(row.amount)}</b></li>`).join('')
        : '<li><span>No spending</span><b>0 MMK</b></li>';
    }

    renderTrendChart();
    renderLoanBI();
  }

  function renderTrendChart() {
    const canvas = $('chart');
    if (!canvas || !canvas.getContext) return;

    const rows = monthlyRows();
    if (!rows.length) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }

    const ctx = canvas.getContext('2d');
    const width = Math.max(300, canvas.clientWidth || 600);
    const height = 220;
    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    const max = Math.max(1, ...rows.flatMap((row) => [row.income, row.expense + row.credit]));
    const step = width / Math.max(1, rows.length);

    rows.forEach((row, index) => {
      const x = step * index + step / 2;

      const incomeHeight = (row.income / max) * 150;
      const outflowHeight = ((row.expense + row.credit) / max) * 150;

      const incomeX = x - 18;
      const outflowX = x + 4;

      ctx.fillStyle = '#34d399';
      ctx.fillRect(incomeX, 175 - incomeHeight, 14, incomeHeight);

      ctx.fillStyle = '#f97316';
      ctx.fillRect(outflowX, 175 - outflowHeight, 14, outflowHeight);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(row.month.slice(5), x, 198);
    });
  }

  function renderLoanBI() {
    const host = $('loanBI');
    if (!host) return;

    const monthList = state.transactions.filter((tx) => monthOf(tx.date) === state.reportMonth);
    const received = loanReceived(monthList);
    const payback = loanPaybacks(monthList);

    host.innerHTML = `
      <div class="loan-bi-grid">
        <div class="loan-bi-stat">
          <small>Loan received</small>
          <strong>${money(received)}</strong>
        </div>
        <div class="loan-bi-stat">
          <small>Loan payback</small>
          <strong>${money(payback)}</strong>
        </div>
        <div class="loan-bi-stat">
          <small>Outstanding</small>
          <strong>${money(outstandingLoans())}</strong>
        </div>
      </div>
    `;
  }

  function renderTransactions() {
    const body = $('rows');
    if (!body) return;

    body.innerHTML = state.transactions
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .map((tx) => `
        <tr>
          <td>${esc(tx.date || '')}</td>
          <td>${esc(tx.category || 'General')}</td>
          <td>${esc(tx.type || 'expense')}</td>
          <td>${money(tx.amount)}</td>
          <td>${esc(tx.note || '')}</td>
          <td>
            <button type="button" data-delete="${esc(tx.id)}">Delete</button>
          </td>
        </tr>
      `).join('');
  }

  function renderCategories() {
    const host = $('cats');
    if (!host) return;

    host.innerHTML = (state.categories || []).map((category, index) => `
      <div class="row">
        <span>${esc(category.name)} <small>${esc(category.type)}</small></span>
        <button type="button" data-delete-category="${index}">Delete</button>
      </div>
    `).join('');
  }

  function renderBudgets() {
    const host = $('budgets');
    if (!host) return;

    host.innerHTML = (state.budgets || []).map((budget, index) => `
      <div class="row">
        <span>${esc(budget.name)} <small>${monthLabel(budget.month || state.reportMonth)}</small></span>
        <b>${money(budget.amount)}</b>
        <button type="button" data-delete-budget="${index}">Delete</button>
      </div>
    `).join('');
  }

  function theme() {
    const dark = state.settings.theme === 'dark';
    document.body.classList.toggle('dark', dark);

    const switchEl = $('switch');
    if (switchEl) switchEl.classList.toggle('on', dark);
  }

  function api(action, payload) {
    if (!state.settings.syncUrl) throw new Error('Add the Apps Script URL first.');
    const response = await fetch(state.settings.syncUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload })
    });
    const result = await response.json().catch(() => ({}));
    if (!result.ok) throw new Error(result.error || 'Sync failed.');
    return result.data || result;
  }

  async function pull() {
    if (syncing) return;
    syncing = true;
    try {
      const data = await api('getAll');
      if (data && Array.isArray(data.transactions)) state.transactions = data.transactions;
      if (data && Array.isArray(data.categories)) state.categories = data.categories;
      if (data && Array.isArray(data.budgets)) state.budgets = data.budgets;
      if (data && Array.isArray(data.goals)) state.goals = data.goals;
      if (data && Array.isArray(data.loans)) state.loans = data.loans;
      state.settings.syncRevision = data.revision || state.settings.syncRevision;
      save();
      render();
      toast('Pulled from Google Sheets');
    } catch (error) {
      toast(error.message || 'Sync failed');
    } finally {
      syncing = false;
    }
  }

  async function push() {
    if (syncing) return;
    syncing = true;
    try {
      const data = await api('replaceAll', {
        transactions: state.transactions,
        categories: state.categories,
        budgets: state.budgets,
        goals: state.goals,
        loans: state.loans
      });

      state.settings.syncRevision = data.revision || state.settings.syncRevision;
      state.settings.lastSynced = new Date().toISOString();
      save();
      render();
      toast('Pushed to Google Sheets');
    } catch (error) {
      toast(error.message || 'Sync failed');
    } finally {
      syncing = false;
    }
  }

  function validateBudgetAndCategory() {
    const type = state.currentType || 'expense';
    const name = $('newCat') ? ($('newCat').value || '').trim() : '';
    const typeSelect = $('newType') ? $('newType').value : 'expense';

    if (name) {
      const exists = state.categories.some((category) => {
        return category.name.toLowerCase() === name.toLowerCase() && category.type === typeSelect;
      });

      if (exists) {
        toast('Category already exists.');
        return false;
      }
    }

    const activeCategory = $('category') ? $('category').value : '';
    if (type === 'payback' && !activeCategory) {
      toast('Choose a loan repayment category.');
      return false;
    }

    return true;
  }

  function bindUI() {
    if ($('syncUrl')) $('syncUrl').value = state.settings.syncUrl || '';
    if ($('month')) $('month').value = state.reportMonth || currentMonth;
    if ($('monthSelect')) $('monthSelect').value = state.reportMonth || currentMonth;
    renderCategories();
    renderBudgets();
  }

  function render() {
    normalizeState();
    bindUI();
    populateCategories();
    renderLoanSelect();
    updateMonthOptions();
    renderHome();
    renderReports();
    renderBudgetAlerts();
    renderTransactions();
    theme();
  }

  document.addEventListener('click', (event) => {
    const page = event.target.closest('[data-page]');
    if (page) {
      showPage(page.dataset.page);
      return;
    }

    const add = event.target.closest('[data-add]');
    if (add) {
      setType(add.dataset.add);
      showPage('add');
      return;
    }

    const tab = event.target.closest('[data-type]');
    if (tab) {
      setType(tab.dataset.type);
      showPage('add');
      return;
    }

    const del = event.target.closest('[data-delete]');
    if (del) {
      const id = del.dataset.delete;
      state.transactions = state.transactions.filter((tx) => String(tx.id) !== String(id));
      save();
      render();
      return;
    }

    const delCategory = event.target.closest('[data-delete-category]');
    if (delCategory) {
      const index = Number(delCategory.dataset.deleteCategory);
      if (!Number.isNaN(index)) {
        state.categories.splice(index, 1);
        save();
        render();
      }
      return;
    }

    const delBudget = event.target.closest('[data-delete-budget]');
    if (delBudget) {
      const index = Number(delBudget.dataset.deleteBudget);
      if (!Number.isNaN(index)) {
        state.budgets.splice(index, 1);
        save();
        render();
      }
      return;
    }

    const syncButton = event.target.closest('#pull, [data-sync=\"pull\"]');
    if (syncButton) {
      pull();
      return;
    }

    if (event.target.closest('#push, [data-sync=\"push\"]')) {
      push();
      return;
    }

    if (event.target.id === 'theme' || event.target.id === 'switch') {
      state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
      save();
      theme();
      return;
    }

    if (event.target.id === 'addCat') {
      const name = ($('newCat')?.value || '').trim();
      const type = $('newType')?.value || 'expense';
      if (!name) {
        toast('Enter a category name');
        return;
      }

      const exists = state.categories.some((category) => category.name.toLowerCase() === name.toLowerCase() && category.type === type);
      if (exists) {
        toast('Category already exists');
        return;
      }

      state.categories.push({ name, type });
      save();
      render();
      toast('Category added');
      return;
    }

    if (event.target.id === 'addBudget') {
      const name = ($('budgetName')?.value || '').trim();
      const amount = num($('budgetAmount')?.value || 0);
      const month = ($('budgetMonth')?.value || state.reportMonth || currentMonth).trim();

      if (!name || amount <= 0) {
        toast('Enter a valid budget name and amount');
        return;
      }

      const entry = { name, amount, month };
      const exists = state.budgets.some((budget) => budget.name === name && monthOf(budget.month) === month);
      if (exists) {
        toast('Budget already exists for this month');
        return;
      }

      state.budgets.push(entry);
      save();
      render();
      toast('Budget saved');
      return;
    }

    if (event.target.id === 'clear') {
      if (confirm('Clear all transactions?')) {
        state.transactions = [];
        state.loans = [];
        state.budgets = [];
        save();
        render();
      }
      return;
    }

    if (event.target.id === 'export') {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'moneyflow-export.json';
      link.click();
      URL.revokeObjectURL(link.href);
      return;
    }
  });

  document.addEventListener('change', (event) => {
    if (!event.target) return;

    if (event.target.id === 'month' || event.target.id === 'monthSelect') {
      state.reportMonth = event.target.value || currentMonth;
      save();
      render();
      return;
    }

    if (event.target.id === 'syncUrl') {
      state.settings.syncUrl = event.target.value.trim();
      save();
    }
  });

  document.addEventListener('submit', (event) => {
    if (event.target.id !== 'form') return;
    event.preventDefault();

    const amount = num($('amount')?.value || 0);
    if (amount <= 0) {
      toast('Enter an amount greater than 0');
      return;
    }

    const type = state.currentType || 'expense';
    const date = $('date')?.value || today;
    const note = ($('note')?.value || '').trim();
    const category = $('category')?.value || 'General';

    if (type !== 'loan' && !category) {
      toast('Select a valid category');
      return;
    }

    const tx = {
      id: uid('tx'),
      type,
      amount,
      date,
      category,
      note,
      loanId: '',
      createdAt: new Date().toISOString()
    };

    if (type === 'loan') {
      const loanId = uid('loan');
      tx.type = 'income';
      tx.category = 'Loan';
      tx.loanId = loanId;

      state.loans.push({
        id: loanId,
        name: note || 'Loan',
        principal: amount,
        remaining: amount,
        date,
        note,
        createdAt: tx.createdAt
      });
    } else if (type === 'payback') {
      const selectedLoanId = $('loanSelect')?.value || '';
      const loan = state.loans.find((item) => String(item.id) === String(selectedLoanId));
      if (!loan) {
        toast('Select an active loan to repay');
        return;
      }

      if (amount > num(loan.remaining)) {
        toast('Payback cannot exceed remaining loan balance');
        return;
      }

      tx.type = 'expense';
      tx.category = 'Loan Repayment';
      tx.loanId = selectedLoanId;
      loan.remaining = Math.max(0, num(loan.remaining) - amount);
    } else if (type === 'credit') {
      tx.type = 'credit';
    } else {
      tx.type = type;
    }

    state.transactions.push(tx);
    save();
    event.target.reset();
    if ($('date')) $('date').value = today;
    render();
    toast(type === 'loan' ? 'Loan received and recorded as income' : type === 'payback' ? 'Loan payback recorded as expense' : 'Saved');
  });

  function init() {
    normalizeState();
    setType(state.currentType || 'expense');
    render();
    showPage('home');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
