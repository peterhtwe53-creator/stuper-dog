(() => {
  'use strict';

  const STORAGE_KEY = 'moneyflow-v3';
  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const currentMonth = todayISO.slice(0, 7);

  const defaultCategories = [
    ['Food & Drinks', 'expense'],
    ['Transportation', 'expense'],
    ['Family', 'expense'],
    ['Housing', 'expense'],
    ['Utilities', 'expense'],
    ['Shopping', 'expense'],
    ['Health', 'expense'],
    ['Education', 'expense'],
    ['Salary', 'income'],
    ['Bonus', 'income']
  ];

  const defaultState = {
    transactions: [],
    categories: defaultCategories.map(([name, type]) => ({ name, type })),
    budgets: [],
    goals: [],
    loans: [],
    reportMonth: currentMonth,
    settings: {
      theme: 'light',
      syncUrl: '',
      syncRevision: '',
      lastSynced: ''
    }
  };

  const $ = (id) => document.getElementById(id);

  function money(value) {
    return `${Math.round(Number(value) || 0).toLocaleString()} MMK`;
  }

  function number(value) {
    const raw = value == null ? '' : String(value);
    return Number(raw.replace(/,/g, '')) || 0;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]));
  }

  function uid(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function toast(message) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('on');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('on'), 2200);
  }

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || {};
      return {
        ...defaultState,
        ...raw,
        settings: { ...defaultState.settings, ...(raw.settings || {}) },
        categories: Array.isArray(raw.categories) && raw.categories.length ? raw.categories : defaultState.categories.slice(),
        transactions: Array.isArray(raw.transactions) ? raw.transactions : [],
        budgets: Array.isArray(raw.budgets) ? raw.budgets : [],
        goals: Array.isArray(raw.goals) ? raw.goals : [],
        loans: Array.isArray(raw.loans) ? raw.loans : []
      };
    } catch (_) {
      return JSON.parse(JSON.stringify(defaultState));
    }
  }

  let state = loadState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function monthName(key) {
    if (!key) return 'This month';
    const d = new Date(`${key}-01T00:00:00`);
    return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  }

  function monthLabelFromISO(dateIso) {
    return dateIso ? String(dateIso).slice(0, 7) : currentMonth;
  }

  function getSelectedMonth() {
    return state.reportMonth || currentMonth;
  }

  function itemsForMonth(month = getSelectedMonth()) {
    return state.transactions.filter(tx => String(tx.date || '').slice(0, 7) === month);
  }

  function getTransactionTotals(list) {
    return list.reduce((acc, tx) => {
      const amount = number(tx.amount);
      if (tx.type === 'income') acc.income += amount;
      else if (tx.type === 'expense') acc.expense += amount;
      else if (tx.type === 'credit') acc.credit += amount;
      return acc;
    }, { income: 0, expense: 0, credit: 0 });
  }

  function getCategorySpendingForMonth(month, categoryName) {
    return state.transactions
      .filter(tx => String(tx.date || '').slice(0, 7) === month && tx.type === 'expense' && String(tx.category || 'General') === String(categoryName))
      .reduce((sum, tx) => sum + number(tx.amount), 0);
  }

  function getBudgetRowsForMonth(month = getSelectedMonth()) {
    const monthBudgets = state.budgets.filter(b => String(b.month || '').slice(0, 7) === month || String(b.month) === month);
    const rows = monthBudgets.map((budget) => {
      const spent = getCategorySpendingForMonth(month, budget.name);
      const remaining = number(budget.amount) - spent;
      const usedPct = number(budget.amount) ? (spent / number(budget.amount)) * 100 : 0;
      const threshold = Number(budget.threshold || 80);
      const due = budget.dueDate || '';
      const isOverdue = Boolean(due && due < todayISO && remaining > 0);
      const isNearLimit = usedPct >= threshold;
      const isExceeded = spent > number(budget.amount);

      return {
        ...budget,
        spent,
        remaining,
        usedPct,
        threshold,
        isNearLimit,
        isExceeded,
        isOverdue
      };
    });
    return rows.sort((a, b) => b.spent - a.spent);
  }

  function budgetSummaryForMonth(month = getSelectedMonth()) {
    const rows = getBudgetRowsForMonth(month);

    const totalBudget = rows.reduce((sum, row) => sum + number(row.amount), 0);
    const totalSpent = rows.reduce((sum, row) => sum + row.spent, 0);
    const totalRemaining = totalBudget - totalSpent;
    const usedPct = totalBudget ? (totalSpent / totalBudget) * 100 : 0;
    return { rows, totalBudget, totalSpent, totalRemaining, usedPct };
  }

  function showPage(id) {
    document.querySelectorAll('.page').forEach((page) => {
      page.classList.toggle('active', page.id === id);
    });
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.page === id);
    });
  }

  function populateCategorySelect() {
    const categorySelect = $('category');
    if (categorySelect) {
      const type = state.currentType || 'expense';
      const filtered = state.categories.filter(cat => cat.type === type || (type === 'credit' && cat.type === 'expense'));
      categorySelect.innerHTML = filtered.length
        ? filtered.map(cat => `<option value="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`).join('')
        : '<option value="General">General</option>';
    }

    const budgetCategory = $('budgetCategory');
    if (budgetCategory) {
      const list = state.categories.filter(cat => cat.type === 'expense');
      budgetCategory.innerHTML = list.length
        ? list.map(cat => `<option value="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`).join('')
        : '<option value="General">General</option>';
    }
  }

  function updateMonthOptions() {
    const monthSelect = $('monthSelect');
    if (monthSelect) {
      const values = Array.from(new Set(
        state.transactions.map(tx => String(tx.date || '').slice(0, 7)).filter(Boolean)
      )).concat(state.budgets.map(b => String(b.month || '').slice(0, 7)).filter(Boolean));
      const unique = Array.from(new Set(values));
      unique.push(getSelectedMonth());
      const sorted = Array.from(new Set(unique)).sort();
      monthSelect.innerHTML = sorted.map(month => `<option value="${month}">${monthName(month)}</option>`).join('');
      monthSelect.value = getSelectedMonth();
    }
  }

  function renderHomeSummary() {
    const month = getSelectedMonth();
    const list = itemsForMonth(month);
    const totals = getTransactionTotals(list);
    const net = totals.income - totals.expense - totals.credit;

    const homeIncome = $('homeIncome');
    const homeExpense = $('homeExpense');
    const homeNet = $('homeNet');
    const homeMonth = $('homeMonth');

    if (homeIncome) homeIncome.textContent = money(totals.income);
    if (homeExpense) homeExpense.textContent = money(totals.expense);
    if (homeNet) homeNet.textContent = money(net);
    if (homeMonth) homeMonth.textContent = month;

    const recent = $('recentTransactions');
    if (recent) {
      recent.innerHTML = state.transactions.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5).map((tx) => {
        const type = String(tx.type || 'expense').toLowerCase();
        const amount = money(number(tx.amount));
        return `
          <div class="list-item">
            <div class="meta">
              <span>${escapeHtml(tx.category || 'General')}</span>
              <strong>${escapeHtml(tx.type.toUpperCase())}</strong>
            </div>
            <span class="amount-pill ${type}">${amount}</span>
          </div>
        `;
      }).join('') || '<div class=\"list-item\"><div class=\"meta\"><span>No transactions yet</span><strong>Start adding entries</strong></div></div>';
    }
  }

  function renderBudgetDashboard() {
    const month = getSelectedMonth();
    const summary = budgetSummaryForMonth(month);
    const rows = summary.rows;

    const totalBudgetEl = $('budgetTotal');
    const totalSpentEl = $('budgetSpent');
    const remainingEl = $('budgetRemaining');
    const usedPctEl = $('budgetUsedPct');
    const alertsEl = $('budgetAlerts');
    const breakdownEl = $('budgetBreakdown');
    const focusEl = $('focusBI');

    if (totalBudgetEl) totalBudgetEl.textContent = money(summary.totalBudget);
    if (totalSpentEl) totalSpentEl.textContent = money(summary.totalSpent);
    if (remainingEl) remainingEl.textContent = money(summary.totalRemaining);
    if (usedPctEl) usedPctEl.textContent = `${Math.round(summary.usedPct)}%`;

    if (alertsEl) {
      if (!rows.length) {
        alertsEl.innerHTML = '<div class="alert success"><strong>No budget set for this month.</strong><span>Use the budget form to add one.</span></div>';
        return;
      }

      alertsEl.innerHTML = rows.map((budget) => {
        let kind = 'success';
        let text = 'On track';

        if (budget.isExceeded) {
          kind = 'danger';
          text = `Exceeded by ${money(budget.spent - number(budget.amount))}`;
        } else if (budget.isNearLimit) {
          kind = 'warning';
          text = `Near limit: ${money(budget.spent)} / ${money(budget.amount)}`;
        } else if (budget.isOverdue) {
          kind = 'warning';
          text = `Overdue: remaining ${money(budget.remaining)}`;
        } else if (budget.remaining < 0) {
          kind = 'danger';
          text = `Over budget by ${money(Math.abs(budget.remaining))}`;
        }

        return `
          <div class="alert ${kind}">
            <div>
              <strong>${escapeHtml(budget.name)}</strong>
              <small>${monthName(month)} • ${budget.threshold}% alert</small>
            </div>
            <span>${text}</span>
          </div>
        `;
      }).join('');
    }

    if (breakdownEl) {
      breakdownEl.innerHTML = rows.length
        ? rows.map((budget) => {
            const percent = Math.min(100, Math.round(budget.usedPct));
            const barClass = percent >= 90 ? 'danger' : percent >= budget.threshold ? 'warning' : '';
            return `
              <div class="budget-item">
                <div class="budget-item-head">
                  <div>
                    <strong>${escapeHtml(budget.name)}</strong>
                    <span>${monthName(month)}</span>
                  </div>
                  <span>${money(budget.spent)} / ${money(budget.amount)}</span>
                </div>
                <div class="progress">
                  <div class="progress-bar ${barClass}" style="width:${percent}%"></div>
                </div>
                <div class="meta-row">
                  <span>Used ${Math.round(budget.usedPct)}%</span>
                  <span>${money(budget.remaining)} left</span>
                </div>
              </div>
            `;
          }).join('')
        : '<div class=\"alert success\"><strong>No budget data</strong><span>Add a category budget to begin tracking.</span></div>';
    }

    if (focusEl) {
      const monthList = Array.from(new Set(
        state.transactions.map(tx => String(tx.date || '').slice(0, 7)).filter(Boolean)
      )).concat(state.budgets.map(b => String(b.month || '').slice(0, 7)).filter(Boolean));
      const uniqueMonths = Array.from(new Set(monthList)).sort();

      focusEl.innerHTML = uniqueMonths.length
        ? uniqueMonths.slice(-6).map((m) => {
            const totalIncome = state.transactions
              .filter(tx => String(tx.date || '').slice(0, 7) === m && tx.type === 'income')
              .reduce((sum, tx) => sum + number(tx.amount), 0);

            const totalExpense = state.transactions
              .filter(tx => String(tx.date || '').slice(0, 7) === m && tx.type === 'expense')
              .reduce((sum, tx) => sum + number(tx.amount), 0);

            const totalBudget = state.budgets
              .filter(b => String(b.month || '').slice(0, 7) === m)
              .reduce((sum, b) => sum + number(b.amount), 0);

            return `
              <div class="focus-item">
                <span>${m}</span>
                <strong>${money(totalExpense)}</strong>
                <small>Budget ${money(totalBudget)} · Income ${money(totalIncome)}</small>
              </div>
            `;
          }).join('')
        : '<div class=\"alert success\"><strong>No monthly data</strong><span>Transactions and budgets will appear here.</span></div>';
    }
  }

  function renderTransactionsTable() {
    const rows = state.transactions.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const tableBody = $('transactionRows');
    if (!tableBody) return;

    tableBody.innerHTML = rows.length
      ? rows.map((tx) => `
          <tr>
            <td>${escapeHtml(tx.date || '')}</td>
            <td>${escapeHtml(String(tx.type || 'expense').toUpperCase())}</td>
            <td>${escapeHtml(tx.category || 'General')}</td>
            <td>${escapeHtml(tx.note || '-')}</td>
            <td>${escapeHtml(money(tx.amount || 0))}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="5">No transactions yet</td></tr>';
  }

  function renderTheme() {
    const isDark = state.settings.theme === 'dark';
    document.body.classList.toggle('dark', isDark);
    const toggle = $('switchTheme');
    if (toggle) {
      toggle.classList.toggle('on', isDark);
    }
  }

  function renderAll() {
    populateCategorySelect();
    updateMonthOptions();
    renderHomeSummary();
    renderBudgetDashboard();
    renderTransactionsTable();
    renderTheme();
  }

  function setType(type) {
    state.currentType = type;

    const formTitle = $('formTitle');
    if (formTitle) formTitle.textContent = {
      expense: 'Add Expense',
      income: 'Add Income',
      credit: 'Credit Payment'
    }[type] || 'Add Entry';

    const categorySelect = $('category');
    if (categorySelect) {
      const typeList = state.categories.filter(cat => cat.type === type || (type === 'credit' && cat.type === 'expense'));
      categorySelect.innerHTML = typeList.length
        ? typeList.map(cat => `<option value="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`).join('')
        : '<option value="General">General</option>';
    }

    document.querySelectorAll('.tab').forEach((button) => {
      button.classList.toggle('active', button.dataset.type === type);
    });
  }

  function addBudget() {
    const name = String($('budgetCategory')?.value || '').trim();
    const amount = number($('budgetAmount')?.value);
    const threshold = Number($('budgetThreshold')?.value || 80);
    const month = String($('budgetMonth')?.value || getSelectedMonth());
    const dueDate = String($('budgetDueDate')?.value || '');

    if (!name) return toast('Select a category');
    if (!amount || amount <= 0) return toast('Enter a valid budget amount');

    const exists = state.budgets.some((budget) => budget.name === name && budget.month === month);

    if (exists) {
      const current = state.budgets.find((budget) => budget.name === name && budget.month === month);
      current.amount = amount;
      current.threshold = threshold;
      current.dueDate = dueDate;
      current.updatedAt = new Date().toISOString();
      toast('Budget updated');
    } else {
      state.budgets.push({
        id: uid('budget'),
        name,
        amount,
        threshold,
        month,
        dueDate,
        createdAt: new Date().toISOString()
      });
      toast('Budget saved');
    }

    saveState();
    renderAll();
  }

  function handleSubmit(event) {
    event.preventDefault();

    const amount = number($('amount')?.value);
    if (amount <= 0) return toast('Enter an amount greater than 0');

    const type = state.currentType || 'expense';
    const category = String($('category')?.value || 'General').trim();
    const date = $('date')?.value || todayISO;
    const note = String($('note')?.value || '').trim();

    const tx = {
      id: uid('tx'),
      type,
      amount,
      date,
      category,
      note,
      createdAt: new Date().toISOString()
    };

    state.transactions.push(tx);
    saveState();
    event.target.reset();

    if ($('date')) $('date').value = todayISO;

    renderAll();
    toast(type === 'income' ? 'Income recorded' : type === 'expense' ? 'Expense recorded' : 'Credit payment added');
  }

  function clearAllTransactions() {
    if (confirm('Clear all transactions?')) {
      state.transactions = [];
      state.budgets = [];
      saveState();
      renderAll();
      toast('Data cleared');
    }
  }

  document.addEventListener('click', (event) => {
    const pageLink = event.target.closest('[data-page]');
    if (pageLink) {
      showPage(pageLink.dataset.page);
      return;
    }

    const tab = event.target.closest('[data-type]');
    if (tab) {
      setType(tab.dataset.type);
      return;
    }

    if (event.target.id === 'themeToggle') {
      state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
      saveState();
      renderTheme();
      return;
    }

    if (event.target.id === 'switchTheme') {
      state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
      saveState();
      renderTheme();
      return;
    }

    if (event.target.id === 'addBudgetBtn') {
      addBudget();
      return;
    }

    if (event.target.id === 'clearTransactionsBtn') {
      clearAllTransactions();
      return;
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.id === 'monthSelect') {
      state.reportMonth = event.target.value;
      saveState();
      renderAll();
      return;
    }

    if (event.target.id === 'budgetMonth') {
      const value = event.target.value;
      if (value) {
        const month = value;
        const budgetCategory = $('budgetCategory');
        if (budgetCategory) {
          budgetCategory.value = state.categories.find(cat => cat.type === 'expense')?.name || 'General';
        }
        state.reportMonth = month;
        saveState();
        renderAll();
      }
    }
  });

  document.addEventListener('submit', (event) => {
    if (event.target.id === 'transactionForm') {
      handleSubmit(event);
    }
  });

  function initDefaults() {
    if ($('date')) $('date').value = todayISO;
    if ($('budgetMonth')) $('budgetMonth').value = currentMonth;
    if ($('budgetDueDate')) $('budgetDueDate').value = '';
    if ($('amount')) $('amount').value = '';
    if ($('note')) $('note').value = '';
    if ($('budgetAmount')) $('budgetAmount').value = '';
    if ($('budgetThreshold')) $('budgetThreshold').value = '80';
    setType('expense');
    renderAll();
    showPage('home');
  }

  initDefaults();
})();
