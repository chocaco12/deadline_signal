const form = document.querySelector('#signal-form');
const taskInput = document.querySelector('#task-name');
const deadlineInput = document.querySelector('#deadline');
const neededInput = document.querySelector('#needed-hours');
const averageInput = document.querySelector('#average-hours');
const result = document.querySelector('#result');
const errorSummary = document.querySelector('#error-summary');
const changeNotice = document.querySelector('#change-notice');

const HALF_HOUR = 30 * 60 * 1000;
const MAX_DAYS = 366;

function daySerial(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
}

function formatHours(units) {
  return `${units / 2}시간`;
}

function setError(input, message) {
  const messageElement = document.getElementById(`${input.id}-error`);
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  messageElement.textContent = message;
  messageElement.hidden = !message;
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

function estimateAvailable(now, deadline, averageUnits) {
  let available = 0;
  let days = 0;
  let cappedDays = 0;
  for (let offset = 0; offset < MAX_DAYS; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    if (daySerial(day) > daySerial(deadline)) break;
    const limit = maxUnits(day, now, deadline);
    available += Math.min(averageUnits, limit);
    if (limit < averageUnits) cappedDays++;
    days++;
  }
  return { available, days, cappedDays };
}

function showResult(task, needed, average, estimate) {
  const available = estimate.available;
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
  document.querySelector('#result-basis').textContent = `하루 평균 ${formatHours(average)} × 오늘부터 마감일까지 ${estimate.days}일${estimate.cappedDays ? ` · ${estimate.cappedDays}일은 실제 남은 시간까지만 반영` : ''}`;
  result.hidden = false;
  changeNotice.hidden = true;
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

form.addEventListener('input', event => {
  if (!(event.target instanceof HTMLInputElement)) return;
  hideResult();
  setError(event.target, '');
  errorSummary.hidden = true;
  if (event.target === deadlineInput && deadlineInput.value) {
    const status = deadlineStatus(new Date());
    if (status.error) setError(deadlineInput, status.error);
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
  const average = halfHourUnits(averageInput.value, true);
  let firstInvalid = null;
  function fail(input, message) {
    setError(input, message);
    if (!firstInvalid) firstInvalid = input;
  }
  if (!task) fail(taskInput, '과제명을 입력해 주세요.');
  if (status.error) fail(deadlineInput, status.error);
  if (needed === null) fail(neededInput, '필요한 시간은 0.5시간 단위의 양수로 입력해 주세요.');
  if (average === null || average > 48) fail(averageInput, '하루 평균 가능 시간은 0~24시간 사이에서 0.5시간 단위로 입력해 주세요.');
  if (firstInvalid) {
    errorSummary.textContent = '입력을 확인해 주세요. 오류가 있는 항목으로 이동합니다.';
    errorSummary.hidden = false;
    firstInvalid.focus();
    return;
  }
  showResult(task, needed, average, estimateAvailable(now, status.date, average));
});
