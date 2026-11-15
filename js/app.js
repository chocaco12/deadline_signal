const form = document.querySelector('#signal-form');
const taskInput = document.querySelector('#task-name');
const deadlineInput = document.querySelector('#deadline');
const neededInput = document.querySelector('#needed-hours');
const dailyList = document.querySelector('#daily-list');
const dailyPlaceholder = document.querySelector('#daily-placeholder');
const result = document.querySelector('#result');
const errorSummary = document.querySelector('#error-summary');
const changeNotice = document.querySelector('#change-notice');
const savedDays = new Map();
let visibleDays = [];

const HALF_HOUR = 30 * 60 * 1000;
const MAX_DAYS = 366;

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daySerial(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

function formatHours(units) {
  return `${units / 2}시간`;
}

function setError(input, message) {
  const messageElement = document.getElementById(`${input.id}-error`);
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (messageElement) {
    messageElement.textContent = message;
    messageElement.hidden = !message;
  }
}

function clearErrors() {
  form.querySelectorAll('input').forEach(input => setError(input, ''));
  errorSummary.hidden = true;
}

function hideResult() {
  if (!result.hidden) {
    result.hidden = true;
    changeNotice.textContent = '입력이 바뀌었어요. 다시 비교해 주세요.';
    changeNotice.hidden = false;
  }
}

function deadlineStatus(now) {
  if (!deadlineInput.value) return { error: '마감 날짜와 시각을 입력해 주세요.' };
  const date = new Date(deadlineInput.value);
  if (!Number.isFinite(date.getTime())) return { error: '올바른 마감 날짜와 시각을 입력해 주세요.' };
  if (date <= now) return { error: '마감은 현재보다 늦은 날짜와 시간으로 입력해 주세요.' };
  if (daySerial(date) - daySerial(now) >= MAX_DAYS) return { error: '마감은 오늘부터 1년 이내로 입력해 주세요.' };
  return { date };
}

function halfHourUnits(value, zeroAllowed) {
  if (value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || (zeroAllowed ? number < 0 : number <= 0)) return null;
  const units = number * 2;
  return Number.isSafeInteger(units) ? units : null;
}

function maxUnits(day, now, deadline) {
  const nextDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  const start = Math.max(day.getTime(), now.getTime());
  const end = Math.min(nextDay.getTime(), deadline.getTime());
  return Math.max(0, Math.floor((end - start) / HALF_HOUR));
}

function daysThrough(deadline, now) {
  const days = [];
  for (let offset = 0; offset < MAX_DAYS; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    if (daySerial(day) > daySerial(deadline)) break;
    days.push(day);
  }
  return days;
}

function dayLabel(day, now) {
  const label = `${day.getMonth() + 1}월 ${day.getDate()}일`;
  return dayKey(day) === dayKey(now) ? `${label} (오늘)` : label;
}

function renderDays(days, now, deadline) {
  dailyList.replaceChildren();
  for (const day of days) {
    const key = dayKey(day);
    const limit = maxUnits(day, now, deadline);
    const item = document.createElement('div');
    item.className = 'daily-item';
    item.dataset.day = key;

    const label = document.createElement('label');
    label.htmlFor = `day-${key}`;
    label.textContent = dayLabel(day, now);
    const hint = document.createElement('p');
    hint.className = 'daily-hint';
    hint.id = `day-${key}-hint`;
    hint.textContent = `최대 ${formatHours(limit)}${limit === 0 ? ' · 남은 시간이 30분 미만입니다.' : ''}`;
    const input = document.createElement('input');
    input.id = `day-${key}`;
    input.type = 'number';
    input.inputMode = 'decimal';
    input.min = '0';
    input.max = String(limit / 2);
    input.step = '0.5';
    input.value = savedDays.get(key) ?? '0';
    input.setAttribute('aria-describedby', `${input.id}-hint ${input.id}-error`);
    const error = document.createElement('p');
    error.className = 'field-error';
    error.id = `${input.id}-error`;
    error.hidden = true;
    item.append(label, hint, input, error);
    dailyList.append(item);
  }
}

function syncDays(deadline, now) {
  if (!deadline) {
    visibleDays = [];
    dailyList.hidden = true;
    dailyPlaceholder.hidden = false;
    dailyList.replaceChildren();
    return false;
  }
  const days = daysThrough(deadline, now);
  const keys = days.map(dayKey);
  const changed = keys.length !== visibleDays.length || keys.some((key, i) => key !== visibleDays[i]);
  if (changed) {
    for (const input of dailyList.querySelectorAll('input')) savedDays.set(input.id.slice(4), input.value);
    const allowed = new Set(keys);
    for (const key of savedDays.keys()) if (!allowed.has(key)) savedDays.delete(key);
    renderDays(days, now, deadline);
    visibleDays = keys;
  } else {
    days.forEach((day, i) => {
      const item = dailyList.children[i];
      const limit = maxUnits(day, now, deadline);
      item.querySelector('input').max = String(limit / 2);
      item.querySelector('.daily-hint').textContent = `최대 ${formatHours(limit)}${limit === 0 ? ' · 남은 시간이 30분 미만입니다.' : ''}`;
    });
  }
  dailyList.hidden = false;
  dailyPlaceholder.hidden = true;
  return changed;
}

function showResult(task, needed, available) {
  const signal = available < needed ? 'red' : 5 * available < 6 * needed ? 'yellow' : 'green';
  const labels = { red: '🔴 시간 부족', yellow: '🟡 빠듯함', green: '🟢 여유 있음' };
  const guidance = {
    red: '지금 계획으로는 시간이 부족해요. 작업량을 줄이거나 이 과제에 쓸 시간을 더 확보해 보세요.',
    yellow: '끝낼 시간은 있지만 여유가 적어요. 예상보다 오래 걸릴 수 있는 작업을 확인해 보세요.',
    green: '입력한 계획에서는 20% 이상의 시간 여유가 있어요.'
  };
  result.className = `result card ${signal}`;
  document.querySelector('#result-heading').textContent = `${task} 비교 결과`;
  document.querySelector('#signal-badge').textContent = labels[signal];
  document.querySelector('#result-difference').textContent = available < needed
    ? `${formatHours(needed - available)} 부족해요`
    : `${formatHours(available - needed)} 여유가 있어요`;
  document.querySelector('#result-task').textContent = `${task} · 기기 현지 시각 기준`;
  document.querySelector('#result-needed').textContent = formatHours(needed);
  document.querySelector('#result-available').textContent = formatHours(available);
  document.querySelector('#result-guidance').textContent = guidance[signal];
  result.hidden = false;
  changeNotice.hidden = true;
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

form.addEventListener('input', event => {
  if (!(event.target instanceof HTMLInputElement)) return;
  hideResult();
  setError(event.target, '');
  errorSummary.hidden = true;
  if (event.target.closest('.daily-item')) savedDays.set(event.target.id.slice(4), event.target.value);
  if (event.target === deadlineInput) {
    const now = new Date();
    const status = deadlineStatus(now);
    syncDays(status.date, now);
    if (status.error && deadlineInput.value) setError(deadlineInput, status.error);
  }
});

form.addEventListener('submit', event => {
  event.preventDefault();
  hideResult();
  clearErrors();
  const now = new Date();
  const status = deadlineStatus(now);
  const task = taskInput.value.trim();
  const needed = halfHourUnits(neededInput.value, false);
  let firstInvalid = null;
  function fail(input, message) {
    setError(input, message);
    if (!firstInvalid) firstInvalid = input;
  }
  if (!task) fail(taskInput, '과제명을 입력해 주세요.');
  if (status.error) fail(deadlineInput, status.error);
  if (needed === null) fail(neededInput, '필요한 시간은 0.5시간 단위의 양수로 입력해 주세요.');

  const oldDays = [...visibleDays];
  syncDays(status.date, now);
  if (status.date && oldDays.length && (oldDays.length !== visibleDays.length || oldDays.some((key, i) => key !== visibleDays[i]))) {
    changeNotice.textContent = '날짜 목록이 현재 시각에 맞게 갱신됐어요. 시간을 확인한 뒤 다시 비교해 주세요.';
    changeNotice.hidden = false;
    return;
  }

  let available = 0;
  if (status.date) for (const input of dailyList.querySelectorAll('input')) {
    const units = halfHourUnits(input.value, true);
    const limit = Number(input.max) * 2;
    if (units === null) fail(input, '0.5시간 단위의 0 이상 숫자를 입력해 주세요.');
    else if (units > limit) fail(input, `${input.closest('.daily-item').querySelector('label').textContent}은 최대 ${formatHours(limit)}까지만 입력할 수 있어요.`);
    else available += units;
  }
  if (firstInvalid) {
    errorSummary.textContent = '입력을 확인해 주세요. 오류가 있는 항목으로 이동합니다.';
    errorSummary.hidden = false;
    firstInvalid.focus();
    return;
  }
  showResult(task, needed, available);
});
