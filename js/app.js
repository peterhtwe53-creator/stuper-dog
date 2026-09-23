(() => {
  'use strict';

  const STORAGE_KEY = 'moneyflow-v3';
  const THEME_KEY = 'moneyflow-theme';
  const DEFAULT_CATEGORIES = [
    ['Food & Dining', 'expense'],
    ['Transport', 'expense'],
    ['Shopping', 'expense'],
    ['Bills', 'expense'],
    ['Housing', 'expense'],
    ['Health', 'expense'],
    ['Education', 'expense'],
    ['Income', 'income'],
    ['Loan', 'income'],
    ['Loan Repayment', 'expense']
  ];

  const $ = (id) => document.getElementById(id);

  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const money = (value) => {
    const n = Number(value) || 0;
    return `${Math.round(n).toLocaleString()} MMK`;
  };

  const safeNumber = (value) => {
    const n = Number(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  };

  const monthOf = (dateValue) => {
    if (!dateValue) return '';
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return String(dateValue).slice(0, 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const monthLabel = (monthValue) => {
    if (!monthValue || !/^\d{4}-\d{2}$/.test(String(monthValue))) return '';
    const [year, month] = String(monthValue).split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>\"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));

  const toast = (msg) => {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => el.classList.remove('on'), 2200);
  };

  const getState = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
        budgets: Array.isArray(raw.budgets) ? raw.budgets : [],
        loans: Array.isArray(raw.loans) ? raw.loans : [],
        categories: Array.isArray(raw.categories) && raw.categories.length ? raw.categories : DEFAULT_CATEGORIES.map(([name, type]) => ({ name, type })),
        settings: raw.settings || {
          darkMode: true,
          syncUrl: '',
          monthReset: false
        },
        reportMonth: /^\d{4}-\d{2}$/.test(String(raw.reportMonth || '')) ? raw.reportMonth : currentMonth
      };
    } catch (_) {
      return {
        transactions: [],
        budgets: [],
        loans: [],
        categories: DEFAULT_CATEGORIES.map(([name, type]) => ({ name, type })),
        settings: { darkMode: true, syncUrl: '', monthReset: false },
        reportMonth: currentMonth
      };
    }
  };

  const saveState = (state) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  };

  const createDefaultData = () => {
    const state = getState();
    if (!state.transactions.length) {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      state.transactions = [
        { id: crypto.randomUUID?.() || String(Date.now() + Math.random()), type: 'income', category: 'Income', amount: 850000, date: `${month}-01`, note: 'Salary' },
        { id: crypto.randomUUID?.() || String(Date.now() + Math.random()), type: 'expense', category: 'Food & Dining', amount: 180000, date: `${month}-02`, note: 'Lunch' },
        { id: crypto.randomUUID?.() || String(Date.now() + Math.random()), type: 'expense', category: 'Transport', amount: 95000, date: `${month}-05`, note: 'Fuel' },
        { id: crypto.randomUUID?.() || String(Date.now() + Math.random()), type: 'expense', category: 'Shopping', amount: 220000, date: `${month}-10`, note: 'Groceries' },
        { id: crypto.randomUUID?.() || String(Date.now() + Math.random()), type: 'income', category: 'Loan', amount: 200000, date: `${month}-06`, note: 'Loan received' },
        { id: crypto.randomUUID?.() || String(Date.now() + Math.random()), type: 'expense', category: 'Loan Repayment', amount: 50000, date: `${month}-12`, note: 'Loan payback', loanId: 'loan-1' }
      ];
    }

    if (!state.budgets.length) {
      state.budgets = [
        { id: crypto.randomUUID?.() || String(Date.now() + Math.random()), category: 'Food & Dining', month: monthOf(todayISO), amount: 350000 },
        { id: crypto.randomUUID?.() || String(Date.now() + Math.random()), category: 'Transport', month: monthOf(todayISO), amount: 180000 },
        { id: crypto.randomUUID?.() || String(Date.now() + Math.random()), category: 'Shopping', month: monthOf(todayISO), amount: 250000 },
        { id: crypto.randomUUID?.() || String(Date.now() + Math.random()), category: 'Housing', month: monthOf(todayISO), amount: 400000 }
      ];
    }

    if (!state.loans.length) {
      state.loans = [
        { id: 'loan-1', name: 'Emergency Loan', principal: 600000, remaining: 350000, dueDate: `${monthOf(todayISO)}-25`, status: 'active' }
      ];
    }

    saveState(state);
  };

  const monthRange = () => {
    const arr = [];
    const start = new Date(today.getFullYear(), today.getMonth() - 12, 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 18, 1);

    for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      arr.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return arr;
  };

  const getSelectedMonth = () => {
    const state = getState();
    return /^\d{4}-\d{2}$/.test(String(state.reportMonth)) ? state.reportMonth : currentMonth;
  };

  const setSelectedMonth = (month) => {
    const state = getState();
    if (!/^\d{4}-\d{2}$/.test(String(month))) return;
    state.reportMonth = month;
    saveState(state);

    const selects = [$('monthSelect'), $('homeMonthSelect'), $('dashboardMonthSelect')];
    selects.forEach((select) => {
      if (!select) return;
      select.value = month;
    });

    render();
  };

  const loadTheme = () => {
    const saved = localStorage.getItem(THEME_KEY);
    const dark = saved === null ? true : saved === 'dark';
    document.body.classList.toggle('dark', dark);
  };

  const applyTheme = (dark) => {
    document.body.classList.toggle('dark', !!dark);
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  };

  const ensureMonthSelects = () => {
    const options = monthRange()
      .map((month) => `<option value="${escapeHtml(month)}">${escapeHtml(monthLabel(month))}</option>`)
      .join('');

    const targets = ['monthSelect', 'homeMonthSelect', 'dashboardMonthSelect'];
    targets.forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.innerHTML = options;
      const selected = getSelectedMonth();
      el.value = selected;
    });
  };

  const getTransactionsForMonth = (month) => {
    const state = getState();
    return state.transactions.filter((item) => monthOf(item.date) === month);
  };

  const getBudgetCardsForMonth = (month) => {
    const state = getState();
    return state.budgets.filter((item) => item.month === month);
  };

  const getTotal = (items, field) => items.reduce((sum, item) => sum + safeNumber(item[field]), 0);

  const getMonthSummary = (month) => {
    const state = getState();
    const all = getTransactionsForMonth(month);

    const income = all.filter((item) => item.type === 'income').reduce((sum, item) => sum + safeNumber(item.amount), 0);
    const expense = all.filter((item) => item.type === 'expense').reduce((sum, item) => sum + safeNumber(item.amount), 0);
    const loanIncome = all.filter((item) => item.type === 'income' && /loan/i.test(item.category || '')).reduce((sum, item) => sum + safeNumber(item.amount), 0);
    const loanExpense = all.filter((item) => item.type === 'expense' && /loan/i.test(item.category || '')).reduce((sum, item) => sum + safeNumber(item.amount), 0);

    const totalBudget = state.budgets
      .filter((item) => item.month === month)
      .reduce((sum, item) => sum + safeNumber(item.amount), 0);

    const net = income - expense;

    const remainingBudget = totalBudget - expense;
    const budgetUsedRatio = totalBudget ? Math.min(100, (expense / totalBudget) * 100) : 0;

    const data = {
      income,
      expense,
      net,
      totalBudget,
      remainingBudget,
      budgetUsedRatio,
      loanIncome,
      loanExpense
    };

    return data;
  };

  const getRemainingDays = (month) => {
    const [year, mon] = month.split('-').map(Number);
    if (!year || !mon) return 1;

    const lastDay = new Date(year, mon, 0).getDate();
    const todayDay = new Date().getDate();
    const monthNow = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    if (month !== monthNow) return 1;
    return Math.max(1, lastDay - todayDay + 1);
  };

  const getDailyBudget = (month) => {
    const summary = getMonthSummary(month);
    const remainingDays = getRemainingDays(month);
    const net = summary.net;
    return {
      value: remainingDays > 0 ? Math.max(0, net / remainingDays) : 0,
      remainingDays,
      net
    };
  };

  const renderHomeCards = () => {
    const monthly = getSelectedMonth();
    const summary = getMonthSummary(monthly);
    const daily = getDailyBudget(monthly);

    const cards = [
      { label: 'Net', value: money(summary.net), tone: 'net' },
      { label: 'Income', value: money(summary.income), tone: 'income' },
      { label: 'Expenses', value: money(summary.expense), tone: 'expense' },
      { label: 'Daily budget', value: money(daily.value), tone: 'budget' }
    ];

    const container = $('cards');
    if (!container) return;

    container.innerHTML = cards.map((card) => `
      <article class="panel stat ${card.tone}">
        <small>${escapeHtml(card.label)}</small>
        <strong>${escapeHtml(card.value)}</strong>
      </article>
    `).join('');

    const dailyEl = $('dailyBudgetValue');
    if (dailyEl) dailyEl.textContent = money(daily.value);

    const dailyMeta = $('dailyBudgetMeta');
    if (dailyMeta) {
      dailyMeta.textContent = `${daily.remainingDays} days remaining · Net ${money(daily.net)}`;
    }
  };

  const renderDashboard = () => {
    const month = getSelectedMonth();
    const summary = getMonthSummary(month);
    const totalBudget = summary.totalBudget;
    const spent = summary.expense;

    const cashflowEl = $('cashflow');
    if (cashflowEl) cashflowEl.textContent = money(summary.net);

    const budgetUsedEl = $('budgetUsed');
    if (budgetUsedEl) budgetUsedEl.textContent = money(spent);

    const loanBalanceEl = $('loanBalance');
    if (loanBalanceEl) {
      const totalLoanBalance = getState().loans.reduce((sum, loan) => sum + safeNumber(loan.remaining || loan.principal), 0);
      loanBalanceEl.textContent = money(totalLoanBalance);
    }

    const chartHost = $('budgetVsSpendingChart');
    if (chartHost) {
      const bars = [
        { label: 'Budget', value: totalBudget || 1, color: 'var(--primary)' },
        { label: 'Spent', value: spent || 1, color: 'var(--danger)' },
        { label: 'Net', value: Math.max(0, summary.net) || 1, color: 'var(--success)' }
      ];

      const max = Math.max(...bars.map((b) => b.value), 1);
      chartHost.innerHTML = bars.map((bar) => `
        <div class="bar-item">
          <span class="bar-label">${escapeHtml(bar.label)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(8, (bar.value / max) * 100)}%; background:${bar.color};"></div></div>
          <small>${money(bar.value)}</small>
        </div>
      `).join('');
    }

    const loanChartHost = $('loanTrendChart');
    if (loanChartHost) {
      const loans = getState().loans;
      const maxLoan = Math.max(...loans.map((loan) => safeNumber(loan.remaining || loan.principal)), 1);
      loanChartHost.innerHTML = loans.map((loan) => `
        <div class="loan-bar-item">
          <span>${escapeHtml(loan.name || 'Loan')}</span>
          <div class="loan-track"><div class="loan-fill" style="width:${Math.max(10, (safeNumber(loan.remaining || loan.principal) / maxLoan) * 100)}%;"></div></div>
          <small>${money(loan.remaining || loan.principal)}</small>
        </div>
      `).join('') || '<p>No loans yet.</p>';
    }
  };

  const renderBudgetTable = () => {
    const month = getSelectedMonth();
    const budgets = getBudgetCardsForMonth(month);
    const table = $('budgetTable');
    if (!table) return;

    if (!budgets.length) {
      table.innerHTML = '<tr><td colspan="4" class="muted">No budgets for this month</td></tr>';
      return;
    }

    const state = getState();
    const monthSpend = getTransactionsForMonth(month).filter((item) => item.type === 'expense');

    table.innerHTML = budgets.map((budget) => {
      const spent = monthSpend
        .filter((tx) => tx.category === budget.category)
        .reduce((sum, tx) => sum + safeNumber(tx.amount), 0);

      const left = safeNumber(budget.amount) - spent;
      const warn = left <= safeNumber(budget.amount) * 0.2;
      const overdue = spent > safeNumber(budget.amount);

      return `
        <tr class="${warn || overdue ? 'is-warning' : ''}">
          <td>${escapeHtml(budget.category)}</td>
          <td>${money(budget.amount)}</td>
          <td>${money(spent)}</td>
          <td>
            <span class="budget-status ${overdue ? 'danger' : warn ? 'warning' : 'ok'}">
              ${overdue ? 'Over budget' : warn ? 'Near limit' : 'On track'}
            </span>
          </td>
          <td>${money(left)}</td>
          <td>
            <button type="button" class="mini-btn danger" data-delete-budget="${escapeHtml(budget.id)}">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  };

  const renderCategoryTable = () => {
    const list = $('categoryList');
    if (!list) return;
    const state = getState();
    list.innerHTML = state.categories.map((cat) => `
      <div class="category-pod">
        <span>${escapeHtml(cat.name)}</span>
        <span class="tag ${cat.type === 'income' ? 'income' : 'expense'}">${escapeHtml(cat.type)}</span>
        <button type="button" class="mini-btn" data-delete-category="${escapeHtml(cat.name)}">Delete</button>
      </div>
    `).join('') || '<p>No categories added yet.</p>';
  };

  const renderTransactions = () => {
    const month = getSelectedMonth();
    const tx = getTransactionsForMonth(month).sort((a, b) => new Date(b.date) - new Date(a.date));
    const table = $('transactionTable');
    if (!table) return;

    if (!tx.length) {
      table.innerHTML = '<tr><td colspan="6">No transactions yet.</td></tr>';
      return;
    }

    table.innerHTML = tx.map((item) => `
      <tr>
        <td>${escapeHtml(item.date || '')}</td>
        <td>${escapeHtml(item.type || 'expense')}</td>
        <td>${escapeHtml(item.category || '')}</td>
        <td>${money(item.amount)}</td>
        <td>${escapeHtml(item.note || '')}</td>
        <td>
          <button type="button" class="mini-btn danger" data-delete-transaction="${escapeHtml(item.id)}">Delete</button>
        </td>
      </tr>
    `).join('');
  };

  const renderLoanReport = () => {
    const list = $('loanList');
    if (!list) return;

    const state = getState();
    list.innerHTML = state.loans.map((loan) => {
      const remaining = Math.max(0, safeNumber(loan.remaining || loan.principal));
      const status = remaining <= 0 ? 'Settled' : 'Active';

      return `
        <div class="loan-card">
          <div class="loan-head">
            <strong>${escapeHtml(loan.name || 'Loan')}</strong>
            <span class="tag ${status === 'Active' ? 'expense' : 'income'}">${status}</span>
          </div>
          <div class="loan-body">
            <small>Balance</small>
            <b>${money(remaining)}</b>
          </div>
        </div>
      `;
    }).join('') || '<p>No loans recorded.</p>';
  };

  const renderHomeHeader = () => {
    const greet = $('greet');
    const greetTitle = $('greetTitle');
    const focusMsg = $('focusMsg');

    const now = new Date();
    const hours = now.getHours();

    if (greet) {
      greet.textContent = hours < 12 ? 'GOOD MORNING' : hours < 18 ? 'GOOD AFTERNOON' : 'GOOD EVENING';
    }

    if (greetTitle) {
      greetTitle.textContent = hours < 12 ? 'Good morning 🌅' : hours < 18 ? 'Good afternoon ☀️' : 'Good evening 🌙';
    }

    if (focusMsg) {
      const month = getSelectedMonth();
      const summary = getMonthSummary(month);
      focusMsg.textContent = `Budget used ${money(summary.expense)} • Remaining ${money(summary.totalBudget - summary.expense)}`;
    }
  };

  const renderSettings = () => {
    const urlInput = $('syncUrl');
    if (urlInput) {
      const state = getState();
      urlInput.value = state.settings.syncUrl || '';
    }

    const resetInput = $('monthResetToggle');
    if (resetInput) {
      resetInput.checked = !!getState().settings.monthReset;
    }

    const themeToggle = $('themeToggle');
    if (themeToggle) {
      themeToggle.textContent = document.body.classList.contains('dark') ? '☀️' : '🌙';
    }
  };

  const render = () => {
    ensureMonthSelects();
    renderHomeHeader();
    renderHomeCards();
    renderDashboard();
    renderBudgetTable();
    renderTransactions();
    renderCategoryTable();
    renderLoanReport();
    renderSettings();
  };

  const validateForm = (data) => {
    const errors = [];

    if (!data.type || !['income', 'expense', 'loan'].includes(data.type)) {
      errors.push('Transaction type is required.');
    }

    if (!data.category) {
      errors.push('Category is required.');
    }

    if (!data.amount || Number(data.amount) <= 0) {
      errors.push('Amount must be greater than zero.');
    }

    if (!data.date) {
      errors.push('Date is required.');
    }

    return errors;
  };

  const addTransaction = (payload) => {
    const state = getState();
    const errors = validateForm(payload);
    if (errors.length) {
      toast(errors.join(' '));
      return false;
    }

    const tx = {
      id: crypto.randomUUID?.() || String(Date.now() + Math.random()),
      type: payload.type,
      category: payload.category,
      amount: Number(payload.amount),
      date: payload.date,
      note: payload.note || '',
      loanId: payload.loanId || ''
    };

    state.transactions.push(tx);
    saveState(state);

    const month = monthOf(tx.date);
    if (month) {
      state.reportMonth = month;
      saveState(state);
    }

    render();
    toast('Transaction saved.');
    return true;
  };

  const addBudget = (payload) => {
    const state = getState();
    const amount = Number(payload.amount);

    if (!payload.category || !payload.month || !amount || amount <= 0) {
      toast('Budget category, month and amount are required.');
      return false;
    }

    const entry = {
      id: crypto.randomUUID?.() || String(Date.now() + Math.random()),
      category: payload.category,
      month: payload.month,
      amount
    };

    const currentIndex = state.budgets.findIndex((item) => item.category === payload.category && item.month === payload.month);
    if (currentIndex >= 0) {
      state.budgets[currentIndex] = entry;
    } else {
      state.budgets.push(entry);
    }

    saveState(state);
    render();
    toast('Budget saved.');
    return true;
  };

  const addCategory = (name, type) => {
    const state = getState();
    const normalized = String(name || '').trim();
    if (!normalized || !['income', 'expense'].includes(type)) {
      toast('Category name and type are required.');
      return false;
    }

    const exists = state.categories.some((cat) => cat.name.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      toast('Category already exists.');
      return false;
    }

    state.categories.push({ name: normalized, type });
    saveState(state);
    render();
    toast('Category added.');
    return true;
  };

  const deleteBudget = (id) => {
    const state = getState();
    state.budgets = state.budgets.filter((item) => item.id !== id);
    saveState(state);
    render();
    toast('Budget deleted.');
  };

  const deleteTransaction = (id) => {
    const state = getState();
    state.transactions = state.transactions.filter((item) => item.id !== id);
    saveState(state);
    render();
    toast('Transaction deleted.');
  };

  const deleteCategory = (name) => {
    const state = getState();
    state.categories = state.categories.filter((cat) => cat.name !== name);
    saveState(state);
    render();
    toast('Category deleted.');
  };

  const resetMonthlyBudgets = () => {
    const state = getState();
    const month = getSelectedMonth();
    state.budgets = state.budgets.filter((item) => item.month !== month);
    saveState(state);
    render();
    toast('Monthly budget reset.');
  };

  const syncToGoogleSheets = async () => {
    const state = getState();
    const url = state.settings.syncUrl || '';
    if (!url) {
      toast('Add a Google Sheets sync URL in settings first.');
      return;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction: state.transactions,
          budgets: state.budgets,
          loans: state.loans,
          categories: state.categories,
          syncedAt: new Date().toISOString()
        })
      });

      if (!response.ok) throw new Error('sync failed');
      toast('Synced to Google Sheets.');
    } catch (_) {
      toast('Sync failed. Check the Apps Script URL.');
    }
  };

  const bindEvents = () => {
    document.addEventListener('change', (event) => {
      const target = event.target;

      if (target.matches('#monthSelect, #homeMonthSelect, #dashboardMonthSelect')) {
        setSelectedMonth(target.value);
      }

      if (target.matches('#syncUrl')) {
        const state = getState();
        state.settings.syncUrl = target.value.trim();
        saveState(state);
      }

      if (target.matches('#themeToggle')) {
        applyTheme(target.checked);
      }

      if (target.matches('#monthResetToggle')) {
        const state = getState();
        state.settings.monthReset = !!target.checked;
        saveState(state);
      }
    });

    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (target) {
        const action = target.dataset.action;

        if (action === 'theme-toggle') {
          const next = !document.body.classList.contains('dark');
          applyTheme(next);
          renderSettings();
          return;
        }

        if (action === 'reset-budgets') {
          resetMonthlyBudgets();
          return;
        }

        if (action === 'sync-google') {
          syncToGoogleSheets();
          return;
        }
      }

      const deleteBudgetBtn = event.target.closest('[data-delete-budget]');
      if (deleteBudgetBtn) {
        deleteBudget(deleteBudgetBtn.dataset.deleteBudget);
        return;
      }

      const deleteTxBtn = event.target.closest('[data-delete-transaction]');
      if (deleteTxBtn) {
        deleteTransaction(deleteTxBtn.dataset.deleteTransaction);
        return;
      }

      const deleteCategoryBtn = event.target.closest('[data-delete-category]');
      if (deleteCategoryBtn) {
        deleteCategory(deleteCategoryBtn.dataset.deleteCategory);
        return;
      }

      const pageBtn = event.target.closest('[data-page]');
      if (pageBtn) {
        const pages = document.querySelectorAll('.page');
        pages.forEach((page) => page.classList.remove('active'));
        const targetPage = document.getElementById(pageBtn.dataset.page);
        if (targetPage) targetPage.classList.add('active');
      }
    });

    document.addEventListener('submit', (event) => {
      const form = event.target;
      if (!form || !form.matches('form')) return;

      if (form.matches('#transactionForm')) {
        event.preventDefault();
        const payload = {
          type: form.querySelector('[name="type"]')?.value || 'expense',
          category: form.querySelector('[name="category"]')?.value || '',
          amount: form.querySelector('[name="amount"]')?.value || '',
          date: form.querySelector('[name="date"]')?.value || todayISO,
          note: form.querySelector('[name="note"]')?.value || ''
        };
        addTransaction(payload);
      }

      if (form.matches('#budgetForm')) {
        event.preventDefault();
        const payload = {
          category: form.querySelector('[name="budgetCategory"]')?.value || '',
          month: form.querySelector('[name="budgetMonth"]')?.value || getSelectedMonth(),
          amount: form.querySelector('[name="budgetAmount"]')?.value || ''
        };
        addBudget(payload);
      }

      if (form.matches('#categoryForm')) {
        event.preventDefault();
        const name = form.querySelector('[name="categoryName"]')?.value || '';
        const type = form.querySelector('[name="categoryType"]')?.value || 'expense';
        addCategory(name, type);
      }
    });
  };

  const initForms = () => {
    const state = getState();

    const transactionForm = $('transactionForm');
    if (transactionForm) {
      const categories = state.categories.map((cat) => `<option value="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`).join('');
      const categorySelect = transactionForm.querySelector('[name="category"]');
      if (categorySelect) categorySelect.innerHTML = categories || '<option value="">No categories</option>';
      const typeSelect = transactionForm.querySelector('[name="type"]');
      if (typeSelect) {
        typeSelect.innerHTML = `
          <option value="income">Income</option>
          <option value="expense">Expense</option>
          <option value="loan">Loan</option>
        `;
      }
      const dateInput = transactionForm.querySelector('[name="date"]');
      if (dateInput) dateInput.value = todayISO;
    }

    const budgetForm = $('budgetForm');
    if (budgetForm) {
      const categoryOptions = state.categories
        .filter((cat) => cat.type === 'expense')
        .map((cat) => `<option value="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`)
        .join('');
      const categorySelect = budgetForm.querySelector('[name="budgetCategory"]');
      if (categorySelect) categorySelect.innerHTML = categoryOptions || '<option value="">No expense category</option>';

      const monthInput = budgetForm.querySelector('[name="budgetMonth"]');
      if (monthInput) monthInput.value = getSelectedMonth();
    }

    const categoryForm = $('categoryForm');
    if (categoryForm) {
      const typeSelect = categoryForm.querySelector('[name="categoryType"]');
      if (typeSelect) {
        typeSelect.innerHTML = `
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        `;
      }
    }
  };

  const init = () => {
    createDefaultData();
    loadTheme();
    bindEvents();
    initForms();
    render();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();