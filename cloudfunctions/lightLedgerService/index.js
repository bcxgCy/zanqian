const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const BOOK_COLLECTION = 'lightLedgerBook';
const BILL_COLLECTION = 'lightLedgerBill';
const PROFILE_COLLECTION = 'lightLedgerProfile';
const BOOK_LIMIT = 5;

const EXPENSE_CATEGORIES = ['餐饮', '购物', '交通', '住房', '娱乐', '医疗', '学习', '其他'];
const INCOME_CATEGORIES = ['工资', '奖金', '理财', '副业', '退款', '其他'];

function nowTs() {
  return Date.now();
}

function safeNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toMoney(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function hasMoreThanTwoDecimals(value) {
  const text = String(value || '').trim();
  if (!text || /e/i.test(text)) return false;
  const decimal = text.split('.')[1] || '';
  return decimal.length > 2;
}

function normalizeText(value, maxLen) {
  return String(value || '').trim().slice(0, maxLen);
}

function toDateKey(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toMonthKey(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function parseMonthRange(monthKey) {
  const month = /^\d{4}-\d{2}$/.test(String(monthKey || '')) ? String(monthKey) : toMonthKey(nowTs());
  const [y, m] = month.split('-').map((v) => Number(v));
  const start = new Date(y, m - 1, 1).getTime();
  const end = new Date(y, m, 1).getTime() - 1;
  return { month, start, end };
}

function toBookClient(doc, currentBookId) {
  return {
    id: doc._id,
    name: doc.name || '账本',
    description: doc.description || '',
    isDefault: !!doc.isDefault,
    isCurrent: doc._id === currentBookId,
    createTime: safeNumber(doc.createTime, 0),
    updateTime: safeNumber(doc.updateTime, 0),
  };
}

function toBillClient(doc, bookMap) {
  const amount = toMoney(doc.amount);
  return {
    id: doc._id,
    bookId: doc.bookId,
    bookName: (bookMap && bookMap[doc.bookId] && bookMap[doc.bookId].name) || '账本',
    type: doc.type,
    category: doc.category || '其他',
    necessity: doc.necessity || 'necessary',
    remark: doc.remark || '',
    amount,
    amountText: amount.toFixed(2),
    occurTime: safeNumber(doc.occurTime, 0),
    dateKey: doc.dateKey || toDateKey(doc.occurTime || nowTs()),
    monthKey: doc.monthKey || toMonthKey(doc.occurTime || nowTs()),
    source: doc.source || '',
    createTime: safeNumber(doc.createTime, 0),
    updateTime: safeNumber(doc.updateTime, 0),
  };
}

async function ensureCollection(name) {
  try {
    await db.createCollection(name);
  } catch (err) {
    const msg = String((err && err.errMsg) || '');
    if (!msg.includes('collection exists')) {
      console.warn('createCollection failed:', name, err);
    }
  }
}

async function ensureBaseCollections() {
  await Promise.all([
    ensureCollection(BOOK_COLLECTION),
    ensureCollection(BILL_COLLECTION),
    ensureCollection(PROFILE_COLLECTION),
  ]);
}

async function ensureDefaultBook(openid) {
  const booksRes = await db.collection(BOOK_COLLECTION).where({ userId: openid }).limit(100).get();
  const books = booksRes.data || [];
  if (books.length) {
    const sorted = books.slice().sort((a, b) => safeNumber(b.updateTime, 0) - safeNumber(a.updateTime, 0));
    return sorted[0];
  }

  const ts = nowTs();
  const doc = {
    userId: openid,
    name: '日常账本',
    description: '默认账本',
    isDefault: true,
    createTime: ts,
    updateTime: ts,
  };
  const addRes = await db.collection(BOOK_COLLECTION).add({ data: doc });
  return Object.assign({ _id: addRes._id }, doc);
}

async function getProfile(openid) {
  const res = await db.collection(PROFILE_COLLECTION).where({ userId: openid }).limit(1).get();
  return (res.data || [])[0] || null;
}

async function upsertProfile(openid, patch) {
  const current = await getProfile(openid);
  const ts = nowTs();
  if (!current) {
    await db.collection(PROFILE_COLLECTION).add({
      data: Object.assign({ userId: openid, createTime: ts, updateTime: ts }, patch || {}),
    });
    return;
  }
  await db.collection(PROFILE_COLLECTION).doc(current._id).update({
    data: Object.assign({}, patch || {}, { updateTime: ts }),
  });
}

async function getBooksByUser(openid) {
  const res = await db.collection(BOOK_COLLECTION)
    .where({ userId: openid })
    .orderBy('updateTime', 'desc')
    .limit(100)
    .get();
  return res.data || [];
}

async function resolveCurrentBookId(openid, books) {
  const profile = await getProfile(openid);
  const profileBookId = profile && profile.currentBookId;
  const valid = (books || []).find((b) => b._id === profileBookId);
  if (valid) return valid._id;
  const fallback = (books || [])[0];
  if (fallback) {
    await upsertProfile(openid, { currentBookId: fallback._id });
    return fallback._id;
  }
  return '';
}

async function getBookMap(openid) {
  const books = await getBooksByUser(openid);
  const map = {};
  books.forEach((b) => {
    map[b._id] = b;
  });
  return { books, map };
}

function groupByDate(list) {
  const grouped = {};
  (list || []).forEach((item) => {
    const key = item.dateKey || '--';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });
  const keys = Object.keys(grouped).sort((a, b) => (a < b ? 1 : -1));
  return keys.map((key) => ({ dateKey: key, list: grouped[key] }));
}

function buildSummary(list) {
  let totalIncome = 0;
  let totalExpense = 0;
  let nonNecessaryExpense = 0;

  (list || []).forEach((item) => {
    const amount = toMoney(item.amount);
    if (item.type === 'income') {
      totalIncome += amount;
      return;
    }
    totalExpense += amount;
    if (item.necessity === 'nonNecessary') {
      nonNecessaryExpense += amount;
    }
  });

  totalIncome = toMoney(totalIncome);
  totalExpense = toMoney(totalExpense);
  nonNecessaryExpense = toMoney(nonNecessaryExpense);

  return {
    totalIncome,
    totalIncomeText: totalIncome.toFixed(2),
    totalExpense,
    totalExpenseText: totalExpense.toFixed(2),
    balance: toMoney(totalIncome - totalExpense),
    balanceText: toMoney(totalIncome - totalExpense).toFixed(2),
    nonNecessaryExpense,
    nonNecessaryExpenseText: nonNecessaryExpense.toFixed(2),
  };
}

function buildCategoryChart(list) {
  const map = {};
  (list || []).forEach((item) => {
    if (item.type !== 'expense') return;
    const key = item.category || '其他';
    map[key] = toMoney((map[key] || 0) + toMoney(item.amount));
  });

  const total = Object.keys(map).reduce((sum, key) => sum + map[key], 0);
  if (!(total > 0)) return [];

  const sorted = Object.keys(map)
    .map((name) => ({
      name,
      amount: toMoney(map[name]),
    }))
    .sort((a, b) => b.amount - a.amount);

  let other = 0;
  const rows = [];
  sorted.forEach((item, idx) => {
    const ratio = item.amount / total;
    if (idx >= 5 || ratio < 0.05) {
      other += item.amount;
      return;
    }
    rows.push(item);
  });
  if (other > 0) {
    rows.push({ name: '其他', amount: toMoney(other) });
  }

  return rows.map((item) => {
    const percent = total > 0 ? Math.round((item.amount / total) * 100) : 0;
    return {
      name: item.name,
      amount: item.amount,
      amountText: item.amount.toFixed(2),
      percent,
      percentText: `${percent}%`,
    };
  });
}

async function getMonthBills(openid, monthKey, bookId) {
  const query = { userId: openid, monthKey };
  if (bookId && bookId !== 'all') query.bookId = bookId;

  const res = await db.collection(BILL_COLLECTION)
    .where(query)
    .orderBy('occurTime', 'desc')
    .limit(1000)
    .get();
  return res.data || [];
}

function validateBookName(name) {
  const text = normalizeText(name, 12);
  if (!text) return { ok: false, error: '账本名称不能为空' };
  return { ok: true, value: text };
}

function validateBillPayload(payload) {
  const type = payload.type === 'income' ? 'income' : 'expense';
  const amountRaw = payload.amount;
  if (hasMoreThanTwoDecimals(amountRaw)) {
    return { ok: false, error: '金额最多保留两位小数' };
  }
  const amount = toMoney(amountRaw);
  if (!(amount > 0)) {
    return { ok: false, error: '请输入有效金额' };
  }
  if (amount > 999999.99) {
    return { ok: false, error: '金额不能超过999999.99' };
  }

  const category = normalizeText(payload.category, 10) || '其他';
  const validCategories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const finalCategory = validCategories.includes(category) ? category : '其他';

  const necessity = type === 'expense'
    ? (payload.necessity === 'nonNecessary' ? 'nonNecessary' : 'necessary')
    : 'necessary';

  const remark = normalizeText(payload.remark, 50);
  const occurTime = safeNumber(payload.occurTime, 0) || nowTs();

  return {
    ok: true,
    value: {
      bookId: String(payload.bookId || ''),
      type,
      amount,
      category: finalCategory,
      necessity,
      remark,
      occurTime,
      dateKey: toDateKey(occurTime),
      monthKey: toMonthKey(occurTime),
    },
  };
}

async function actionGetBooks(openid) {
  await ensureBaseCollections();
  await ensureDefaultBook(openid);
  const books = await getBooksByUser(openid);
  const currentBookId = await resolveCurrentBookId(openid, books);
  return {
    ok: true,
    currentBookId,
    books: books.map((b) => toBookClient(b, currentBookId)),
  };
}

async function actionGetHomeData(openid, payload) {
  await ensureBaseCollections();
  await ensureDefaultBook(openid);

  const { books, map } = await getBookMap(openid);
  const currentBookId = await resolveCurrentBookId(openid, books);
  const requestedBookId = String(payload.bookId || '') || currentBookId;
  const selectedBookId = requestedBookId === 'all'
    ? 'all'
    : ((books.find((b) => b._id === requestedBookId) && requestedBookId) || currentBookId);

  if (selectedBookId && selectedBookId !== 'all') {
    await upsertProfile(openid, { currentBookId: selectedBookId });
  }

  const { month } = parseMonthRange(payload.month);
  const bills = await getMonthBills(openid, month, selectedBookId);
  const billList = bills.map((item) => toBillClient(item, map));
  const summary = buildSummary(billList);
  const grouped = groupByDate(billList);

  return {
    ok: true,
    month,
    selectedBookId,
    currentBookId,
    books: books.map((b) => toBookClient(b, currentBookId)),
    summary,
    categoryChart: selectedBookId === 'all' ? [] : buildCategoryChart(billList),
    billGroups: grouped,
    recentBills: billList.slice(0, 30),
  };
}

async function actionCreateBook(openid, payload) {
  await ensureBaseCollections();
  await ensureDefaultBook(openid);

  const books = await getBooksByUser(openid);
  if (books.length >= BOOK_LIMIT) {
    return { ok: false, error: `最多创建${BOOK_LIMIT}个账本` };
  }

  const nameValid = validateBookName(payload.name);
  if (!nameValid.ok) return nameValid;

  const duplicated = books.find((b) => b.name === nameValid.value);
  if (duplicated) {
    return { ok: false, error: '账本名称已存在' };
  }

  const ts = nowTs();
  const doc = {
    userId: openid,
    name: nameValid.value,
    description: normalizeText(payload.description, 30),
    isDefault: false,
    createTime: ts,
    updateTime: ts,
  };
  const addRes = await db.collection(BOOK_COLLECTION).add({ data: doc });
  await upsertProfile(openid, { currentBookId: addRes._id });
  return actionGetBooks(openid);
}

async function actionUpdateBook(openid, bookId, payload) {
  await ensureBaseCollections();
  if (!bookId) return { ok: false, error: '缺少账本ID' };

  const res = await db.collection(BOOK_COLLECTION).doc(bookId).get();
  const book = res.data;
  if (!book || book.userId !== openid) return { ok: false, error: '账本不存在' };

  const nameValid = validateBookName(payload.name || book.name);
  if (!nameValid.ok) return nameValid;

  const books = await getBooksByUser(openid);
  const duplicated = books.find((b) => b._id !== bookId && b.name === nameValid.value);
  if (duplicated) {
    return { ok: false, error: '账本名称已存在' };
  }

  await db.collection(BOOK_COLLECTION).doc(bookId).update({
    data: {
      name: nameValid.value,
      description: normalizeText(payload.description, 30),
      updateTime: nowTs(),
    },
  });

  return actionGetBooks(openid);
}

async function actionDeleteBook(openid, bookId) {
  await ensureBaseCollections();
  if (!bookId) return { ok: false, error: '缺少账本ID' };

  const res = await db.collection(BOOK_COLLECTION).doc(bookId).get();
  const book = res.data;
  if (!book || book.userId !== openid) return { ok: false, error: '账本不存在' };
  if (book.isDefault) return { ok: false, error: '默认账本不可删除' };

  await db.collection(BOOK_COLLECTION).doc(bookId).remove();

  while (true) {
    const billsRes = await db.collection(BILL_COLLECTION)
      .where({ userId: openid, bookId })
      .field({ _id: true })
      .limit(100)
      .get();
    const list = billsRes.data || [];
    if (!list.length) break;
    const ids = list.map((item) => item._id);
    await db.collection(BILL_COLLECTION).where({ _id: _.in(ids) }).remove();
    if (list.length < 100) break;
  }

  const books = await getBooksByUser(openid);
  if (books.length) {
    await upsertProfile(openid, { currentBookId: books[0]._id });
  }

  return actionGetBooks(openid);
}

async function actionSetCurrentBook(openid, bookId) {
  await ensureBaseCollections();
  if (!bookId) return { ok: false, error: '缺少账本ID' };
  const res = await db.collection(BOOK_COLLECTION).doc(bookId).get();
  const book = res.data;
  if (!book || book.userId !== openid) return { ok: false, error: '账本不存在' };
  await upsertProfile(openid, { currentBookId: bookId });
  return actionGetBooks(openid);
}

async function actionSaveBill(openid, payload) {
  await ensureBaseCollections();
  await ensureDefaultBook(openid);

  const valid = validateBillPayload(payload || {});
  if (!valid.ok) return valid;

  const value = valid.value;
  if (!value.bookId) {
    const books = await getBooksByUser(openid);
    value.bookId = (books[0] && books[0]._id) || '';
  }
  if (!value.bookId) return { ok: false, error: '账本不存在' };

  const bookRes = await db.collection(BOOK_COLLECTION).doc(value.bookId).get();
  const book = bookRes.data;
  if (!book || book.userId !== openid) return { ok: false, error: '账本不存在' };

  const ts = nowTs();
  const billId = String(payload.billId || '');

  if (billId) {
    const oldRes = await db.collection(BILL_COLLECTION).doc(billId).get();
    const old = oldRes.data;
    if (!old || old.userId !== openid) return { ok: false, error: '账单不存在' };

    await db.collection(BILL_COLLECTION).doc(billId).update({
      data: Object.assign({}, value, { updateTime: ts }),
    });
    return { ok: true };
  }

  await db.collection(BILL_COLLECTION).add({
    data: Object.assign({}, value, {
      userId: openid,
      source: normalizeText(payload.source, 20) || '',
      createTime: ts,
      updateTime: ts,
    }),
  });

  return { ok: true };
}

async function actionDeleteBill(openid, billId) {
  await ensureBaseCollections();
  if (!billId) return { ok: false, error: '缺少账单ID' };

  const res = await db.collection(BILL_COLLECTION).doc(billId).get();
  const bill = res.data;
  if (!bill || bill.userId !== openid) return { ok: false, error: '账单不存在' };

  await db.collection(BILL_COLLECTION).doc(billId).remove();
  return { ok: true };
}

function applyFilters(list, payload) {
  const type = String(payload.type || 'all');
  const necessity = String(payload.necessity || 'all');
  const amountRange = String(payload.amountRange || 'all');
  const keyword = normalizeText(payload.keyword, 30).toLowerCase();

  return (list || []).filter((item) => {
    if (type !== 'all' && item.type !== type) return false;
    if (necessity !== 'all' && item.type === 'expense' && item.necessity !== necessity) return false;
    const amount = toMoney(item.amount);
    if (amountRange === 'lt50' && amount >= 50) return false;
    if (amountRange === '50to200' && (amount < 50 || amount > 200)) return false;
    if (amountRange === '200to500' && (amount < 200 || amount > 500)) return false;
    if (amountRange === 'gte500' && amount < 500) return false;
    if (keyword) {
      const text = `${item.remark || ''} ${item.category || ''}`.toLowerCase();
      if (!text.includes(keyword)) return false;
    }
    return true;
  });
}

async function actionGetAllBills(openid, payload) {
  await ensureBaseCollections();
  await ensureDefaultBook(openid);

  const { books, map } = await getBookMap(openid);
  const currentBookId = await resolveCurrentBookId(openid, books);
  const requestedBookId = String(payload.bookId || currentBookId || 'all');
  const selectedBookId = requestedBookId === 'all'
    ? 'all'
    : ((books.find((b) => b._id === requestedBookId) && requestedBookId) || currentBookId || 'all');
  const { month } = parseMonthRange(payload.month);
  const page = Math.max(1, safeNumber(payload.page, 1));
  const pageSize = Math.min(100, Math.max(10, safeNumber(payload.pageSize, 20)));

  const rawList = await getMonthBills(openid, month, selectedBookId);
  const all = rawList.map((item) => toBillClient(item, map));
  const filtered = applyFilters(all, payload);

  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const list = filtered.slice(start, end);

  return {
    ok: true,
    month,
    selectedBookId,
    books: books.map((b) => toBookClient(b, currentBookId)),
    total: filtered.length,
    hasMore: end < filtered.length,
    list,
  };
}

async function actionCreateBillFromCooling(openid, payload) {
  await ensureBaseCollections();
  await ensureDefaultBook(openid);

  const goodsName = normalizeText(payload.goodsName, 50);
  const price = payload.price;
  if (!goodsName) return { ok: false, error: '缺少消费名称' };

  const bookId = String(payload.bookId || '');
  const occurTime = safeNumber(payload.occurTime, 0) || nowTs();

  return actionSaveBill(openid, {
    bookId,
    type: 'expense',
    amount: price,
    category: normalizeText(payload.category, 10) || '购物',
    necessity: 'nonNecessary',
    remark: goodsName,
    occurTime,
    source: 'cooling',
  });
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const action = String(event.action || '');

  try {
    if (action === 'getHomeData') return actionGetHomeData(OPENID, event.payload || {});
    if (action === 'getBooks') return actionGetBooks(OPENID);
    if (action === 'createBook') return actionCreateBook(OPENID, event.payload || {});
    if (action === 'updateBook') return actionUpdateBook(OPENID, event.bookId, event.payload || {});
    if (action === 'deleteBook') return actionDeleteBook(OPENID, event.bookId);
    if (action === 'setCurrentBook') return actionSetCurrentBook(OPENID, event.bookId);
    if (action === 'saveBill') return actionSaveBill(OPENID, event.payload || {});
    if (action === 'deleteBill') return actionDeleteBill(OPENID, event.billId);
    if (action === 'getAllBills') return actionGetAllBills(OPENID, event.payload || {});
    if (action === 'createBillFromCooling') return actionCreateBillFromCooling(OPENID, event.payload || {});

    return { ok: false, error: `未知操作：${action}` };
  } catch (err) {
    console.error('lightLedgerService error', err);
    return { ok: false, error: (err && err.message) || '操作失败，请稍后重试' };
  }
};
