(() => {
  'use strict';

  const KEY = 'moneyflow-v3';
  const $ = (id) => document.getElementById(id);

  const today = new Date();
  const todayISO = today.toISOString().slice(0, 10);
  const currentMonth = todayISO.slice(0, 7);

  const defaultCategories = [
    ['General', 'expense'],
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

  const defaults = {
    transactions: [],
    categories: defaultCategories.map(([name, type]) => ({
      id: uid('category'),
      name,
      type,
      createdAt: new Date().toISOString()
    })),
    budgets: [],
    loans: [],
    goals: [],
    reportMonth: currentMonth,
    currentType: 'expense',
    settings: {
      theme: 'dark',
      syncUrl: '',
      syncRevision: '',
      lastSynced: ''
    }
  };

  let state = loadState();
  let syncing = false;

  function uid(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function num(value) {
    const result = Number(String(value ?? '').replace(/,/g, ''));
    return Number.isFinite(result) ? result : 0;
  }

  function money(value) {
    return `${Math.round(num(value)).toLocaleString()} MMK`;
  }

  function monthOf(value) {
    return String(value || '').slice(0, 7);
  }

  function monthLabel(monthValue) {
    if (!/^\d{4}-\d{2}$/.test(String(monthValue))) return monthValue;
    const [year, month] = monthValue.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleString('en-US', {
      month: 'long',
      year: 'numeric'
    });
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');

      const result = {
        ...defaults,
        ...raw,
        settings: {
          ...defaults.settings,
          ...(raw.settings || {})
        }
      };

      result.transactions = Array.isArray(raw.transactions) ? raw.transactions : [];
      result.categories = Array.isArray(raw.categories) && raw.categories.length
        ? raw.categories
        : structuredClone(defaults.categories);
      result.budgets = Array.isArray(raw.budgets) ? raw.budgets : [];
      result.loans = Array.isArray(raw.loans) ? raw.loans : [];
      result.goals = Array.isArray(raw.goals) ? raw.goals : [];
      result.reportMonth = /^\d{4}-\d{2}$/.test(String(raw.reportMonth || ''))
        ? raw.reportMonth
        : currentMonth;

      return result;
    } catch (_) {
      return structuredClone(defaults);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (_) {
      showToast('Unable to save local data.');
    }
  }

  function showToast(message) {
    const toast = $('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('on');

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('on'), 2600);
  }

  function normalizeState() {
    state.settings = {
      ...defaults.settings,
      ...(state.settings || {})
    };

    if (!Array.isArray(state.transactions)) state.transactions = [];
    if (!Array.isArray(state.categories) || !state.categories.length) {
      state.categories = structuredClone(defaults.categories);
    }
    if (!Array.isArray(state.budgets)) state.budgets = [];
    if (!Array.isArray(state.loans)) state.loans = [];
    if (!Array.isArray(state.goals)) state.goals = [];

    if (!/^\d{4}-\d{2}$/.test(String(state.reportMonth || ''))) {
      state.reportMonth = currentMonth;
    }

    state.transactions = state.transactions.map((transaction) => {
      const item = {
        ...transaction,
        id: transaction.id || uid('transaction'),
        amount: num(transaction.amount),
        date: transaction.date || todayISO,
        category: transaction.category || 'General',
        note: transaction.note || '',
        createdAt: transaction.createdAt || new Date().toISOString()
      };

      const category = String(item.category).toLowerCase();

      if (
        item.type === 'loan' ||
        category === 'loan' ||
        category === 'loan received'
      ) {
        item.type = 'income';
        item.category = 'Loan';
        item.loanId = item.loanId || uid('loan');
      }

      if (
        category === 'loan repayment' ||
        category === 'loan payback'
      ) {
        item.type = 'expense';
        item.category = 'Loan Repayment';
      }

      return item;
    });

    rebuildLoans();
    saveState();
  }

  function rebuildLoans() {
    state.transactions
      .filter((transaction) => transaction.type === 'income' && transaction.loanId)
      .forEach((transaction) => {
        if (!state.loans.some((loan) => String(loan.id) === String(transaction.loanId))) {
          state.loans.push({
            id: transaction.loanId,
            name: transaction.note || 'Loan',
            principal: num(transaction.amount),
            remaining: num(transaction.amount),
            date: transaction.date,
            note: transaction.note || '',
            createdAt: transaction.createdAt
          });
        }
      });

    state.loans = state.loans.map((loan) => {
      const received = state.transactions
        .filter((transaction) =>
          transaction.type === 'income' &&
          String(transaction.loanId) === String(loan.id)
        )
        .reduce((sum, transaction) => sum + num(transaction.amount), 0);

      const paid = state.transactions
        .filter((transaction) =>
          transaction.type === 'expense' &&
          String(transaction.loanId) === String(loan.id)
        )
        .reduce((sum, transaction) => sum + num(transaction.amount), 0);

      return {
        ...loan,
        principal: received || num(loan.principal),
        remaining: Math.max(0, (received || num(loan.principal)) - paid)
      };
    });
  }

  function selectedTransactions(month = state.reportMonth) {
    return state.transactions.filter((transaction) => monthOf(transaction.date) === month);
  }

  function totals(transactions) {
    return transactions.reduce((result, transaction) => {
      const amount = num(transaction.amount);

      if (transaction.type === 'income') result.income += amount;
      if (transaction.type === 'expense') result.expense += amount;
      if (transaction.type === 'credit') result.credit += amount;

      return result;
    }, {
      income: 0,
      expense: 0,
      credit: 0
    });
  }

  function disposableDailyBudget() {
    const month = state.reportMonth;
    const transactions = selectedTransactions(month);

    const income = transactions
      .filter((transaction) => transaction.type === 'income' && !transaction.loanId)
      .reduce((sum, transaction) => sum + num(transaction.amount), 0);

    const expenses = transactions
      .filter((transaction) => transaction.type === 'expense' && !transaction.loanId)
      .reduce((sum, transaction) => sum + num(transaction.amount), 0);

    const credit = transactions
      .filter((transaction) => transaction.type === 'credit')
      .reduce((sum, transaction) => sum + num(transaction.amount), 0);

    const net = income - expenses - credit;

    if (month !== currentMonth) {
      return {
        daily: 0,
        net,
        remainingDays: 0,
        historical: true
      };
    }

    const [year, monthNumber] = month.split('-').map(Number);
    const daysInMonth = new Date(year, monthNumber, 0).getDate();
    const remainingDays = Math.max(1, daysInMonth - today.getDate() + 1);

    return {
      daily: Math.max(0, net) / remainingDays,
      net,
      remainingDays,
      historical: false
    };
  }

  function setPage(pageId) {
    document.querySelectorAll('.page').forEach((page) => {
      page.classList.toggle('active', page.id === pageId);
    });

    document.querySelectorAll('.nav-item').forEach((button) => {
      button.classList.toggle('active', button.dataset.page === pageId);
    });

    const title = {
      home: 'Overview',
      dashboard: 'Insights',
      add: 'Add record',
      transactions: 'Transactions',
      settings: 'Settings'
    }[pageId];

    if ($('pageTitle')) $('pageTitle').textContent = title || 'MoneyFlow';

    $('sidebar')?.classList.remove('open');
  }

  function renderMonthSelectors() {
    const months = Array.from(new Set([
      state.reportMonth,
      ...state.transactions.map((transaction) => monthOf(transaction.date)),
      ...state.budgets.map((budget) => monthOf(budget.month))
    ].filter(Boolean))).sort();

    const options = months.map((month) => `
      <option value="${esc(month)}">${esc(monthLabel(month))}</option>
    `).join('');

    ['homeMonthSelect', 'dashboardMonthSelect'].forEach((id) => {
      const select = $(id);
      if (!select) return;

      select.innerHTML = options;
      select.value = state.reportMonth;
    });
  }

  function renderCategories() {
    const transactionCategory = $('category');
    const budgetCategory = $('budgetCategory');

    const transactionType = state.currentType === 'payback'
      ? 'expense'
      : state.currentType === 'loan'
        ? 'income'
        : state.currentType;

    const validCategories = state.categories.filter((category) => category.type === transactionType);

    if (transactionCategory) {
      if (state.currentType === 'loan') {
        transactionCategory.innerHTML = '<option value="Loan">Loan liability income</option>';
      } else if (state.currentType === 'payback') {
        transactionCategory.innerHTML = '<option value="Loan Repayment">Loan repayment expense</option>';
      } else {
        transactionCategory.innerHTML = validCategories.length
          ? validCategories.map((category) => `
              <option value="${esc(category.name)}">${esc(category.name)}</option>
            `).join('')
          : '<option value="">Create a category first</option>';
      }
    }

    if (budgetCategory) {
      const expenseCategories = state.categories.filter((category) => category.type === 'expense');

      budgetCategory.innerHTML = expenseCategories.length
        ? expenseCategories.map((category) => `
            <option value="${esc(category.name)}">${esc(category.name)}</option>
          `).join('')
        : '<option value="">Create an expense category first</option>';
    }
  }

  function renderLoanSelector() {
    const select = $('loanSelect');
    if (!select) return;

    const activeLoans = state.loans.filter((loan) => num(loan.remaining) > 0);

    select.innerHTML = activeLoans.length
      ? activeLoans.map((loan) => `
          <option value="${esc(loan.id)}">
            ${esc(loan.name || 'Loan')} · ${money(loan.remaining)} remaining
          </option>
        `).join('')
      : '<option value="">No active loans</option>';

    select.disabled = state.currentType !== 'payback' || !activeLoans.length;
  }

  function setEntryType(type) {
    state.currentType = type;

    const title = {
      expense: 'Add expense',
      income: 'Add income',
      loan: 'Record loan received',
      payback: 'Record loan payback',
      credit: 'Add credit payment'
    }[type] || 'Add transaction';

    if ($('addTitle')) $('addTitle').textContent = title;
    if ($('loanWrapper')) $('loanWrapper').hidden = type !== 'payback';
    if ($('categoryWrapper')) $('categoryWrapper').hidden = type === 'payback';

    document.querySelectorAll('[data-entry-type]').forEach((button) => {
      button.classList.toggle('active', button.dataset.entryType === type);
    });

    renderCategories();
    renderLoanSelector();
  }

  function renderHome() {
    const transactions = selectedTransactions();
    const summary = totals(transactions);
    const net = summary.income - summary.expense - summary.credit;
    const daily = disposableDailyBudget();

    if ($('homeIncome')) $('homeIncome').textContent = money(summary.income);
    if ($('homeExpense')) $('homeExpense').textContent = money(summary.expense);
    if ($('homeNet')) $('homeNet').textContent = money(net);

    if ($('dailyBudget')) $('dailyBudget').textContent = daily.historical ? '—' : money(daily.daily);
    if ($('dailyBudgetMeta')) {
      $('dailyBudgetMeta').textContent = daily.historical
        ? 'Current month only'
        : `${daily.remainingDays} day${daily.remainingDays === 1 ? '' : 's'} left`;
    }

    if ($('homeMessage')) {
      $('homeMessage').textContent = net >= 0
        ? 'Your cash flow is currently positive.'
        : 'Your spending is above your income for this month.';
    }

    const recent = $('recentList');

    if (recent) {
      recent.innerHTML = transactions
        .slice()
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 8)
        .map(renderTransactionRow)
        .join('') || '<div class="list-row"><span class="muted">No transactions this month.</span></div>';
    }

    const received = transactions
      .filter((transaction) => transaction.type === 'income' && transaction.loanId)
      .reduce((sum, transaction) => sum + num(transaction.amount), 0);

    const paid = transactions
      .filter((transaction) => transaction.type === 'expense' && transaction.loanId)
      .reduce((sum, transaction) => sum + num(transaction.amount), 0);

    const outstanding = state.loans.reduce((sum, loan) => sum + num(loan.remaining), 0);

    if ($('homeLoanSummary')) {
      $('homeLoanSummary').innerHTML = `
        <div class="loan-stat">
          <small>Received this month</small>
          <strong>${money(received)}</strong>
        </div>
        <div class="loan-stat">
          <small>Paid this month</small>
          <strong>${money(paid)}</strong>
        </div>
        <div class="loan-stat">
          <small>Total outstanding</small>
          <strong>${money(outstanding)}</strong>
        </div>
      `;
    }
  }

  function renderTransactionRow(transaction) {
    const isIncome = transaction.type === 'income';
    const label = transaction.loanId && isIncome
      ? 'Loan income'
      : transaction.loanId && transaction.type === 'expense'
        ? 'Loan payback'
        : transaction.type;

    return `
      <div class="list-row">
        <div class="list-main">
          <strong>${esc(transaction.category || 'General')}</strong>
          <small>${esc(transaction.date || '')} · ${esc(transaction.note || label)}</small>
        </div>
        <span class="${isIncome ? 'amount-income' : 'amount-expense'}">
          ${isIncome ? '+' : '-'}${money(transaction.amount)}
        </span>
      </div>
    `;
  }

  function budgetRows() {
    return state.budgets
      .filter((budget) => monthOf(budget.month) === state.reportMonth)
      .map((budget) => {
        const spent = state.transactions
          .filter((transaction) =>
            monthOf(transaction.date) === state.reportMonth &&
            transaction.type === 'expense' &&
            !transaction.loanId &&
            String(transaction.category) === String(budget.name)
          )
          .reduce((sum, transaction) => sum + num(transaction.amount), 0);

        const amount = num(budget.amount);
        const percent = amount ? spent / amount * 100 : 0;
        const overdue = budget.dueDate && budget.dueDate < todayISO && spent < amount;

        return {
          ...budget,
          spent,
          amount,
          percent,
          overdue
        };
      });
  }

  function renderBudgetDashboard() {
    const rows = budgetRows();
    const totalBudget = rows.reduce((sum, row) => sum + row.amount, 0);
    const totalSpent = rows.reduce((sum, row) => sum + row.spent, 0);
    const remaining = totalBudget - totalSpent;

    if ($('totalBudget')) $('totalBudget').textContent = money(totalBudget);
    if ($('totalSpent')) $('totalSpent').textContent = money(totalSpent);
    if ($('totalRemaining')) $('totalRemaining').textContent = money(remaining);
    if ($('budgetUsed')) $('budgetUsed').textContent = `${totalBudget ? Math.round(totalSpent / totalBudget * 100) : 0}%`;

    const alerts = $('budgetAlerts');

    if (alerts) {
      alerts.innerHTML = rows.length
        ? rows.map((row) => {
            let type = 'success';
            let message = 'On track';

            if (row.percent >= 100) {
              type = 'danger';
              message = `Exceeded by ${money(row.spent - row.amount)}`;
            } else if (row.percent >= Number(row.threshold || 80)) {
              type = 'warning';
              message = `Near limit · ${Math.round(row.percent)}% used`;
            } else if (row.overdue) {
              type = 'warning';
              message = `Overdue · ${money(row.amount - row.spent)} remaining`;
            }

            return `
              <div class="alert ${type}" role="status" tabindex="0">
                <strong>${esc(row.name)}</strong>
                <span>${message}</span>
              </div>
            `;
          }).join('')
        : '<div class="alert success"><strong>No active budgets</strong><span>Add a budget to begin tracking.</span></div>';
    }
  }

  function drawBars(canvas, rows, colors) {
    if (!canvas || !canvas.getContext) return;

    const width = Math.max(280, canvas.clientWidth || 500);
    const height = 240;
    const ratio = window.devicePixelRatio || 1;

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext('2d');
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const max = Math.max(1, ...rows.flatMap((row) => row.values));
    const gap = 15;
    const groupWidth = Math.max(38, (width - gap * (rows.length + 1)) / Math.max(1, rows.length));

    rows.forEach((row, index) => {
      const x = gap + index * (groupWidth + gap);
      const barWidth = Math.max(8, (groupWidth - 10) / row.values.length);

      row.values.forEach((value, valueIndex) => {
        const barHeight = Math.max(5, value / max * 155);
        const y = 180 - barHeight;
        const barX = x + valueIndex * (barWidth + 4);

        context.fillStyle = colors[valueIndex] || '#4f8cff';

        if (typeof context.roundRect === 'function') {
          context.beginPath();
          context.roundRect(barX, y, barWidth, barHeight, 6);
          context.fill();
        } else {
          context.fillRect(barX, y, barWidth, barHeight);
        }
      });

      context.fillStyle = getComputedStyle(document.body).getPropertyValue('--muted') || '#94a3b8';
      context.font = '11px system-ui';
      context.textAlign = 'center';
      context.fillText(row.label, x + groupWidth / 2, 207);
    });

    context.strokeStyle = getComputedStyle(document.body).getPropertyValue('--line') || '#263449';
    context.beginPath();
    context.moveTo(0, 181);
    context.lineTo(width, 181);
    context.stroke();
  }

  function renderCharts() {
    const budgetRowsForChart = budgetRows().slice(0, 8).map((row) => ({
      label: String(row.name).slice(0, 9),
      values: [row.amount, row.spent]
    }));

    drawBars($('budgetChart'), budgetRowsForChart, ['#4f8cff', '#22d3ee']);

    const months = Array.from(new Set(
      state.transactions.map((transaction) => monthOf(transaction.date)).filter(Boolean)
    )).sort().slice(-6);

    const loanRows = months.map((month) => ({
      label: month.slice(5),
      values: [
        state.transactions
          .filter((transaction) =>
            monthOf(transaction.date) === month &&
            transaction.type === 'income' &&
            transaction.loanId
          )
          .reduce((sum, transaction) => sum + num(transaction.amount), 0),

        state.transactions
          .filter((transaction) =>
            monthOf(transaction.date) === month &&
            transaction.type === 'expense' &&
            transaction.loanId
          )
          .reduce((sum, transaction) => sum + num(transaction.amount), 0)
      ]
    }));

    drawBars($('loanChart'), loanRows, ['#8b5cf6', '#fb7185']);
  }

  function renderLoanReport() {
    const transactions = selectedTransactions();

    const received = transactions
      .filter((transaction) => transaction.type === 'income' && transaction.loanId)
      .reduce((sum, transaction) => sum + num(transaction.amount), 0);

    const paid = transactions
      .filter((transaction) => transaction.type === 'expense' && transaction.loanId)
      .reduce((sum, transaction) => sum + num(transaction.amount), 0);

    const outstanding = state.loans.reduce((sum, loan) => sum + num(loan.remaining), 0);

    const report = $('loanReport');

    if (report) {
      report.innerHTML = `
        <div class="loan-stat">
          <small>Received this month</small>
          <strong>${money(received)}</strong>
        </div>
        <div class="loan-stat">
          <small>Paid this month</small>
          <strong>${money(paid)}</strong>
        </div>
        <div class="loan-stat">
          <small>Total outstanding</small>
          <strong>${money(outstanding)}</strong>
        </div>
      `;
    }
  }

  function renderMonthlyFlow() {
    const host = $('monthlyFlow');
    if (!host) return;

    const months = Array.from(new Set(
      state.transactions.map((transaction) => monthOf(transaction.date)).filter(Boolean)
    )).sort().slice(-6);

    host.innerHTML = months.map((month) => {
      const summary = totals(selectedTransactions(month));
      return `
        <div class="flow-row">
          <strong>${esc(monthLabel(month))}</strong>
          <span class="muted">
            Income ${money(summary.income)} · Spending ${money(summary.expense)}
          </span>
        </div>
      `;
    }).join('') || '<div class="flow-row"><span class="muted">No monthly data yet.</span></div>';
  }

  function renderTransactions() {
    const body = $('transactionRows');
    if (!body) return;

    const transactions = state.transactions
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    if ($('transactionCount')) {
      $('transactionCount').textContent = `${transactions.length} record${transactions.length === 1 ? '' : 's'}`;
    }

    body.innerHTML = transactions.length
      ? transactions.map((transaction) => `
          <tr>
            <td>${esc(transaction.date)}</td>
            <td>${esc(transaction.type)}</td>
            <td>${esc(transaction.category || 'General')}</td>
            <td>${esc(transaction.note || '—')}</td>
            <td>${transaction.type === 'income' ? '+' : '-'}${money(transaction.amount)}</td>
            <td>
              <button class="danger-button small-button" type="button" data-delete-transaction="${esc(transaction.id)}">
                Delete
              </button>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="6">No transactions recorded.</td></tr>';
  }

  function renderManagement() {
    const categoryList = $('categoryList');
    if (categoryList) {
      categoryList.innerHTML = state.categories.map((category) => `
        <div class="management-row">
          <span>
            <strong>${esc(category.name)}</strong>
            <small class="muted">${esc(category.type)}</small>
          </span>
          <button class="danger-button small-button" type="button" data-delete-category="${esc(category.id)}">
            Delete
          </button>
        </div>
      `).join('');
    }

    const budgetList = $('budgetList');
    if (budgetList) {
      budgetList.innerHTML = state.budgets.length
        ? state.budgets.map((budget) => `
            <div class="management-row">
              <span>
                <strong>${esc(budget.name)}</strong>
                <small class="muted">${esc(monthLabel(budget.month))} · ${money(budget.amount)}</small>
              </span>
              <button class="danger-button small-button" type="button" data-delete-budget="${esc(budget.id)}">
                Delete
              </button>
            </div>
          `).join('')
        : '<div class="management-row"><span class="muted">No budgets yet.</span></div>';
    }
  }

  function renderTheme() {
    const dark = state.settings.theme === 'dark';

    document.body.classList.toggle('dark', dark);

    const toggle = $('themeSwitch');
    if (toggle) toggle.classList.toggle('on', dark);

    if ($('themeButtonText')) {
      $('themeButtonText').textContent = dark ? 'Light mode' : 'Dark mode';
    }

    if ($('topThemeButton')) {
      $('topThemeButton').textContent = dark ? '☀' : '☾';
    }
  }

  function render() {
    normalizeState();
    renderMonthSelectors();
    renderCategories();
    renderLoanSelector();
    renderHome();
    renderBudgetDashboard();
    renderCharts();
    renderLoanReport();
    renderMonthlyFlow();
    renderTransactions();
    renderManagement();
    renderTheme();

    if ($('date')) $('date').value = todayISO;
    if ($('budgetMonth')) $('budgetMonth').value = state.reportMonth;
    if ($('syncUrl')) $('syncUrl').value = state.settings.syncUrl || '';
  }

  function validateCategoryForTransaction() {
    if (state.currentType === 'loan' || state.currentType === 'payback') return true;

    const selected = $('category')?.value || '';
    const type = state.currentType;
    const valid = state.categories.some((category) => category.name === selected && category.type === type);

    if (!valid) {
      showToast('Create and select a valid category first.');
      $('category')?.focus();
      return false;
    }

    return true;
  }

  function handleTransactionSubmit(event) {
    event.preventDefault();

    const amount = num($('amount')?.value);
    const date = $('date')?.value || todayISO;

    if (!amount || amount <= 0) {
      showToast('Enter an amount greater than zero.');
      $('amount')?.focus();
      return;
    }

    if (!date) {
      showToast('Select a valid date.');
      $('date')?.focus();
      return;
    }

    if (!validateCategoryForTransaction()) return;

    const note = ($('note')?.value || '').trim();

    const transaction = {
      id: uid('transaction'),
      type: state.currentType,
      amount,
      date,
      category: $('category')?.value || '',
      note,
      loanId: '',
      createdAt: new Date().toISOString()
    };

    if (state.currentType === 'loan') {
      const loanId = uid('loan');

      transaction.type = 'income';
      transaction.category = 'Loan';
      transaction.loanId = loanId;

      state.loans.push({
        id: loanId,
        name: note || 'Loan',
        principal: amount,
        remaining: amount,
        date,
        note,
        createdAt: transaction.createdAt
      });
    }

    if (state.currentType === 'payback') {
      const selectedLoanId = $('loanSelect')?.value || '';
      const loan = state.loans.find((item) => String(item.id) === String(selectedLoanId));

      if (!loan) {
        showToast('Select an active loan to repay.');
        $('loanSelect')?.focus();
        return;
      }

      if (amount > num(loan.remaining)) {
        showToast('Payback cannot exceed the remaining loan.');
        $('amount')?.focus();
        return;
      }

      transaction.type = 'expense';
      transaction.category = 'Loan Repayment';
      transaction.loanId = selectedLoanId;
    }

    state.transactions.push(transaction);
    saveState();

    event.target.reset();
    if ($('date')) $('date').value = todayISO;

    render();
    showToast(
      state.currentType === 'loan'
        ? 'Loan recorded as liability income.'
        : state.currentType === 'payback'
          ? 'Payback recorded and deducted from the loan.'
          : 'Transaction saved.'
    );
  }

  function handleBudgetSubmit(event) {
    event.preventDefault();

    const name = $('budgetCategory')?.value || '';
    const amount = num($('budgetAmount')?.value);
    const month = $('budgetMonth')?.value || state.reportMonth;
    const threshold = num($('budgetThreshold')?.value || 80);
    const dueDate = $('budgetDueDate')?.value || '';

    if (!name) {
      showToast('Create an expense category before adding a budget.');
      $('budgetCategory')?.focus();
      return;
    }

    if (!amount || amount <= 0) {
      showToast('Enter a valid budget amount.');
      $('budgetAmount')?.focus();
      return;
    }

    if (!/^\d{4}-\d{2}$/.test(month)) {
      showToast('Select a valid budget month.');
      $('budgetMonth')?.focus();
      return;
    }

    if (threshold < 1 || threshold > 100) {
      showToast('Alert threshold must be between 1 and 100.');
      $('budgetThreshold')?.focus();
      return;
    }

    const existing = state.budgets.find((budget) =>
      budget.name === name && monthOf(budget.month) === month
    );

    if (existing) {
      existing.amount = amount;
      existing.threshold = threshold;
      existing.dueDate = dueDate;
      showToast('Budget updated.');
    } else {
      state.budgets.push({
        id: uid('budget'),
        name,
        amount,
        threshold,
        dueDate,
        month,
        createdAt: new Date().toISOString()
      });
      showToast('Budget saved.');
    }

    state.reportMonth = month;
    saveState();
    render();
  }

  function handleCategorySubmit(event) {
    event.preventDefault();

    const name = ($('newCategory')?.value || '').trim();
    const type = $('newCategoryType')?.value || 'expense';

    if (!name) {
      showToast('Enter a category name.');
      $('newCategory')?.focus();
      return;
    }

    const exists = state.categories.some((category) =>
      category.name.toLowerCase() === name.toLowerCase() &&
      category.type === type
    );

    if (exists) {
      showToast('This category already exists.');
      $('newCategory')?.focus();
      return;
    }

    state.categories.push({
      id: uid('category'),
      name,
      type,
      createdAt: new Date().toISOString()
    });

    saveState();
    event.target.reset();
    render();
    showToast('Category added.');
  }

  function deleteTransaction(id) {
    state.transactions = state.transactions.filter((transaction) => String(transaction.id) !== String(id));
    rebuildLoans();
    saveState();
    render();
    showToast('Transaction deleted.');
  }

  function deleteBudget(id) {
    state.budgets = state.budgets.filter((budget) => String(budget.id) !== String(id));
    saveState();
    render();
    showToast('Budget deleted.');
  }

  function deleteCategory(id) {
    const category = state.categories.find((item) => String(item.id) === String(id));
    if (!category) return;

    const inUse = state.transactions.some((transaction) => transaction.category === category.name) ||
      state.budgets.some((budget) => budget.name === category.name);

    if (inUse) {
      showToast('This category is used by transactions or budgets.');
      return;
    }

    state.categories = state.categories.filter((item) => String(item.id) !== String(id));
    saveState();
    render();
    showToast('Category deleted.');
  }

  function resetSelectedMonth() {
    const month = $('budgetMonth')?.value || state.reportMonth;

    if (!confirm(`Delete all budgets for ${monthLabel(month)}?`)) return;

    state.budgets = state.budgets.filter((budget) => monthOf(budget.month) !== month);
    saveState();
    render();
    showToast('Selected month budgets reset.');
  }

  async function requestApi(action, payload = {}) {
    const url = String(state.settings.syncUrl || '').trim();

    if (!url) {
      throw new Error('Add the Google Apps Script URL first.');
    }

    if (!/^https:\/\//i.test(url)) {
      throw new Error('Sync URL must start with https://');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        action,
        ...payload
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.ok) {
      throw new Error(result.error || `Sync failed (${response.status})`);
    }

    return result.data || result;
  }

  async function testSync() {
    if (syncing) return;
    syncing = true;

    try {
      await requestApi('status');
      updateSyncStatus('Connection successful.');
      showToast('Google Sheets connection works.');
    } catch (error) {
      updateSyncStatus(error.message);
      showToast(error.message);
    } finally {
      syncing = false;
    }
  }

  async function pullSync() {
    if (syncing) return;
    syncing = true;

    try {
      const data = await requestApi('getAll');

      if (Array.isArray(data.transactions)) state.transactions = data.transactions;
      if (Array.isArray(data.categories) && data.categories.length) state.categories = data.categories;
      if (Array.isArray(data.budgets)) state.budgets = data.budgets;
      if (Array.isArray(data.loans)) state.loans = data.loans;
      if (Array.isArray(data.goals)) state.goals = data.goals;

      state.settings.syncRevision = data.revision || '';
      state.settings.lastSynced = new Date().toISOString();

      saveState();
      render();

      updateSyncStatus(`Pulled at ${new Date().toLocaleString()}`);
      showToast('Latest data pulled.');
    } catch (error) {
      updateSyncStatus(error.message);
      showToast(error.message);
    } finally {
      syncing = false;
    }
  }

  async function pushSync() {
    if (syncing) return;
    syncing = true;

    try {
      const data = await requestApi('replaceAll', {
        transactions: state.transactions,
        categories: state.categories,
        budgets: state.budgets,
        goals: state.goals,
        loans: state.loans
      });

      state.settings.syncRevision = data.revision || '';
      state.settings.lastSynced = new Date().toISOString();

      saveState();
      render();

      updateSyncStatus(`Pushed at ${new Date().toLocaleString()}`);
      showToast('Changes pushed to Google Sheets.');
    } catch (error) {
      updateSyncStatus(error.message);
      showToast(error.message);
    } finally {
      syncing = false;
    }
  }

  function updateSyncStatus(message) {
    if ($('syncStatus')) $('syncStatus').textContent = message;
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `moneyflow-${todayISO}.json`;
    link.click();

    URL.revokeObjectURL(url);
  }

  function importJson(file) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);

        if (
          !imported ||
          !Array.isArray(imported.transactions) ||
          !Array.isArray(imported.categories)
        ) {
          throw new Error('Invalid MoneyFlow export.');
        }

        state = {
          ...state,
          ...imported,
          settings: {
            ...state.settings,
            ...(imported.settings || {})
          }
        };

        normalizeState();
        render();
        showToast('Data imported.');
      } catch (error) {
        showToast(error.message || 'Invalid JSON file.');
      }
    };

    reader.readAsText(file);
  }

  function toggleTheme() {
    state.settings.theme = state.settings.theme === 'dark' ? 'light' : 'dark';
    saveState();
    renderTheme();
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const pageButton = event.target.closest('[data-page]');
      if (pageButton) {
        setPage(pageButton.dataset.page);
        return;
      }

      const entryButton = event.target.closest('[data-entry-type]');
      if (entryButton) {
        setEntryType(entryButton.dataset.entryType);
        setPage('add');
        return;
      }

      const deleteTransactionButton = event.target.closest('[data-delete-transaction]');
      if (deleteTransactionButton) {
        if (confirm('Delete this transaction?')) {
          deleteTransaction(deleteTransactionButton.dataset.deleteTransaction);
        }
        return;
      }

      const deleteBudgetButton = event.target.closest('[data-delete-budget]');
      if (deleteBudgetButton) {
        if (confirm('Delete this budget?')) {
          deleteBudget(deleteBudgetButton.dataset.deleteBudget);
        }
        return;
      }

      const deleteCategoryButton = event.target.closest('[data-delete-category]');
      if (deleteCategoryButton) {
        if (confirm('Delete this category?')) {
          deleteCategory(deleteCategoryButton.dataset.deleteCategory);
        }
        return;
      }

      if (
        event.target.id === 'themeButton' ||
        event.target.closest('#themeButton') ||
        event.target.id === 'topThemeButton' ||
        event.target.id === 'themeSwitch'
      ) {
        toggleTheme();
        return;
      }

      if (event.target.id === 'mobileMenu') {
        $('sidebar')?.classList.toggle('open');
        return;
      }

      if (event.target.id === 'clearButton') {
        if (confirm('Clear all transactions and loans?')) {
          state.transactions = [];
          state.loans = [];
          saveState();
          render();
          showToast('Transactions cleared.');
        }
      }

      if (event.target.id === 'resetMonthButton') {
        resetSelectedMonth();
      }

      if (event.target.id === 'testSync') testSync();
      if (event.target.id === 'pullSync') pullSync();
      if (event.target.id === 'pushSync') pushSync();
      if (event.target.id === 'exportButton') exportJson();
    });

    document.addEventListener('change', (event) => {
      if (event.target.id === 'homeMonthSelect' || event.target.id === 'dashboardMonthSelect') {
        state.reportMonth = event.target.value;
        saveState();
        render();
      }

      if (event.target.id === 'syncUrl') {
        state.settings.syncUrl = event.target.value.trim();
        saveState();
      }

      if (event.target.id === 'importButton') {
        importJson(event.target.files?.[0]);
        event.target.value = '';
      }
    });

    $('transactionForm')?.addEventListener('submit', handleTransactionSubmit);
    $('budgetForm')?.addEventListener('submit', handleBudgetSubmit);
    $('categoryForm')?.addEventListener('submit', handleCategorySubmit);

    document.querySelectorAll('form').forEach((form) => {
      form.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.target.tagName === 'INPUT') {
          event.preventDefault();
        }
      });
    });
  }

  function init() {
    normalizeState();
    setEntryType('expense');
    bindEvents();
    render();
    setPage('home');
  }

  init();
})();