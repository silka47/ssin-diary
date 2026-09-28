const firebaseConfig = {
  apiKey: "AIzaSyCZDHqPwMylTwgV6mmlu6PtYnNAmhgZcNg",
  authDomain: "ssin-88d57.firebaseapp.com",
  projectId: "ssin-88d57",
  storageBucket: "ssin-88d57.firebasestorage.app",
  messagingSenderId: "771382646298",
  appId: "1:771382646298:web:fe267ac695fa587997a3a3",
  measurementId: "G-FJ0S3L9NJ9"
};

let db = null;
if (typeof firebase !== 'undefined' && firebaseConfig.apiKey !== 'YOUR_API_KEY') {
  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
  } catch(e) { console.warn("Firebase fallback:", e); }
}

document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.error);

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const now = new Date();

  function formatDateBadge(d) { return `_${d.getMonth() + 1}/${d.getDate()} ${dayNames[d.getDay()]}`; }

  function parseDateKey(dateStr, fallbackYear) {
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
    if (!dateStr || typeof dateStr !== 'string') return `${y}-${m}-${d}`;
    const nums = dateStr.match(/\d+/g);
    if (nums && nums.length >= 2) {
      const monthNum = Number(nums.at(0)), dayNum = Number(nums.at(1));
      if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
        return `${fallbackYear}-${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      }
    }
    return `${y}-${m}-${d}`;
  }

  // 정확히 직전 하루 전(D-1) 계산 함수
  function getYesterdayDateKey(dateKey) {
    const nums = dateKey.match(/\d+/g);
    if (!nums || nums.length < 3) return '';
    const dt = new Date(Number(nums.at(0)), Number(nums.at(1)) - 1, Number(nums.at(2)));
    dt.setDate(dt.getDate() - 1);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  }

  const dateInput = document.getElementById('diary-date');
  const userNameInput = document.getElementById('user-name');
  const syncKeyInput = document.getElementById('sync-key');
  const saveStatusText = document.getElementById('save-status-text');
  const toast = document.getElementById('toast');

  const todayList = document.getElementById('today-schedule-list');
  const tomorrowList = document.getElementById('tomorrow-schedule-list');
  const addTodayBtn = document.getElementById('add-today-row-btn');
  const addTomorrowBtn = document.getElementById('add-tomorrow-row-btn');
  const importYesterdayBtn = document.getElementById('import-yesterday-btn');

  let calCurrentYear = now.getFullYear(), calCurrentMonth = now.getMonth();
  const realTodayKey = `${calCurrentYear}-${String(calCurrentMonth + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  let activeDateKey = realTodayKey;

  const diaryTextFieldIds = [
    'media-search', 'media-sns', 'media-video', 'media-etc',
    'meditation-chapter', 'meditation-content', 'faith-emotion',
    'faith-situation', 'faith-desire', 'faith-lesson',
    'faith-gratitude-1', 'faith-gratitude-2', 'faith-repent-1',
    'faith-repent-2', 'prayer-content'
  ];

  function getSyncId() { return (syncKeyInput && syncKeyInput.value.trim()) || 'my-diary'; }

  // 다크 모드
  const themeToggleBtn = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('app_theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  applyTheme(savedTheme);
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const nextTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
    });
  }
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('app_theme', t);
    if (themeToggleBtn) themeToggleBtn.textContent = t === 'dark' ? '☀️' : '🌙';
  }

  function createTodayCard(item = { time: '', text: '', status: '' }) {
    const card = document.createElement('div');
    card.className = 'schedule-card-item';
    card.dataset.status = item.status || '';
    card.innerHTML = `
      <div class="item-inputs-row">
        <div class="input-cell time-cell"><span class="cell-label">시간</span><input type="text" class="cell-box-input today-time-input" value="${item.time || ''}"></div>
        <div class="input-cell text-cell"><span class="cell-label">내용</span><input type="text" class="cell-box-input today-text-input" value="${item.text || ''}"></div>
      </div>
      <div class="item-actions-row">
        <div class="ox-btn-group">
          <button type="button" class="ox-tag-btn ox-o${item.status === 'O' ? ' active-o' : ''}">⭕️ 완료</button>
          <button type="button" class="ox-tag-btn ox-x${item.status === 'X' ? ' active-x' : ''}">❌ 미완료</button>
        </div>
        <button type="button" class="item-del-btn">✕ 삭제</button>
      </div>`;
    const btnO = card.querySelector('.ox-o'), btnX = card.querySelector('.ox-x');
    btnO.addEventListener('click', () => {
      card.dataset.status = card.dataset.status === 'O' ? '' : 'O';
      btnO.classList.toggle('active-o', card.dataset.status === 'O');
      btnX.classList.remove('active-x');
      autoSaveLocal();
    });
    btnX.addEventListener('click', () => {
      card.dataset.status = card.dataset.status === 'X' ? '' : 'X';
      btnX.classList.toggle('active-x', card.dataset.status === 'X');
      btnO.classList.remove('active-o');
      autoSaveLocal();
    });
    card.querySelector('.item-del-btn').addEventListener('click', () => {
      card.remove();
      if (todayList.children.length === 0) todayList.appendChild(createTodayCard());
      autoSaveLocal();
    });
    card.querySelectorAll('input').forEach(inp => inp.addEventListener('input', autoSaveLocal));
    return card;
  }

  function createTomorrowCard(item = { start: '', end: '', text: '' }) {
    const card = document.createElement('div');
    card.className = 'schedule-card-item';
    card.innerHTML = `
      <div class="item-inputs-row">
        <div class="input-cell time-range-cell">
          <span class="cell-label">시간</span>
          <div class="time-range-wrap"><input type="text" class="cell-box-input tomorrow-start-input" value="${item.start || ''}"><span class="range-tilde">~</span><input type="text" class="cell-box-input tomorrow-end-input" value="${item.end || ''}"></div>
        </div>
        <div class="input-cell text-cell"><span class="cell-label">내용</span><input type="text" class="cell-box-input tomorrow-text-input" value="${item.text || ''}"></div>
      </div>
      <div class="item-actions-row right-only"><button type="button" class="item-del-btn">✕ 삭제</button></div>`;
    card.querySelector('.item-del-btn').addEventListener('click', () => {
      card.remove();
      if (tomorrowList.children.length === 0) tomorrowList.appendChild(createTomorrowCard());
      autoSaveLocal();
    });
    card.querySelectorAll('input').forEach(inp => inp.addEventListener('input', autoSaveLocal));
    return card;
  }

  if (addTodayBtn) addTodayBtn.addEventListener('click', () => todayList.appendChild(createTodayCard()));
  if (addTomorrowBtn) addTomorrowBtn.addEventListener('click', () => tomorrowList.appendChild(createTomorrowCard()));

  function getTodayScheduleData() {
    const list = [];
    if (!todayList) return list;
    todayList.querySelectorAll('.schedule-card-item').forEach(c => {
      const time = c.querySelector('.today-time-input')?.value.trim() || '';
      const text = c.querySelector('.today-text-input')?.value.trim() || '';
      const status = c.dataset.status || '';
      if (time || text || status) list.push({ time, text, status });
    });
    return list;
  }

  function getTomorrowScheduleData() {
    const list = [];
    if (!tomorrowList) return list;
    tomorrowList.querySelectorAll('.schedule-card-item').forEach(c => {
      const start = c.querySelector('.tomorrow-start-input')?.value.trim() || '';
      const end = c.querySelector('.tomorrow-end-input')?.value.trim() || '';
      const text = c.querySelector('.tomorrow-text-input')?.value.trim() || '';
      if (start || end || text) list.push({ start, end, text });
    });
    return list;
  }

  // 오직 직전 하루 전(D-1)의 내일 계획만 조회
  function getD1TomorrowPlan(dateKey) {
    const yKey = getYesterdayDateKey(dateKey);
    const raw = localStorage.getItem('block_tomorrow_' + yKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter(it => (it.start && it.start.trim()) || (it.end && it.end.trim()) || (it.text && it.text.trim()));
        }
      } catch(e) {}
    }
    return null;
  }

  // 날짜별 로드 및 D-1 엄격 연동
  async function loadDataForDate(dateKey) {
    todayList.innerHTML = ''; tomorrowList.innerHTML = '';
    let entryData = null;

    if (db) {
      try {
        const doc = await db.collection('diaries').doc(getSyncId()).collection('entries').doc(dateKey).get();
        if (doc.exists) entryData = doc.data();
      } catch(e) { console.warn("Cloud read failed:", e); }
    }

    if (!entryData) {
      const localTxt = localStorage.getItem('diary_text_' + dateKey);
      const localToday = localStorage.getItem('block_today_' + dateKey);
      const localTomorrow = localStorage.getItem('block_tomorrow_' + dateKey);
      entryData = {
        textData: localTxt ? JSON.parse(localTxt) : {},
        todayItems: localToday ? JSON.parse(localToday) : [],
        tomorrowItems: localTomorrow ? JSON.parse(localTomorrow) : []
      };
    }

    diaryTextFieldIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = (entryData.textData && entryData.textData[id]) || '';
    });

    const validToday = (entryData.todayItems || []).filter(it => (it.time && it.time.trim()) || (it.text && it.text.trim()) || it.status);
    if (validToday.length > 0) {
      validToday.forEach(it => todayList.appendChild(createTodayCard(it)));
    } else {
      // 오늘 일정이 비어있다면 -> 오직 '어제(D-1)' 계획만 확인! 없으면 빈칸 유지
      const d1Plan = getD1TomorrowPlan(dateKey);
      if (d1Plan && d1Plan.length > 0) {
        d1Plan.forEach(it => {
          const t = (it.start && it.end) ? `${it.start}~${it.end}` : (it.start || it.end || '');
          todayList.appendChild(createTodayCard({ time: t, text: it.text || '', status: '' }));
        });
        showToast('어제 계획했던 일정을 오늘 일정으로 불러왔습니다 ✨');
      } else {
        todayList.appendChild(createTodayCard());
      }
    }

    const validTomorrow = (entryData.tomorrowItems || []).filter(it => (it.start && it.start.trim()) || (it.end && it.end.trim()) || (it.text && it.text.trim()));
    if (validTomorrow.length > 0) {
      validTomorrow.forEach(it => tomorrowList.appendChild(createTomorrowCard(it)));
    } else {
      tomorrowList.appendChild(createTomorrowCard());
    }
  }

  // 어제 계획 불러오기 수동 버튼
  if (importYesterdayBtn) {
    importYesterdayBtn.addEventListener('click', () => {
      const d1Plan = getD1TomorrowPlan(activeDateKey);
      if (d1Plan && d1Plan.length > 0) {
        if (getTodayScheduleData().length === 0) todayList.innerHTML = '';
        d1Plan.forEach(it => {
          const t = (it.start && it.end) ? `${it.start}~${it.end}` : (it.start || it.end || '');
          todayList.appendChild(createTodayCard({ time: t, text: it.text || '', status: '' }));
        });
        saveDraft(false);
        showToast('어제 계획했던 일정을 성공적으로 불러왔습니다 ✨');
      } else {
        showToast('어제 작성된 내일 계획이 없습니다 (빈칸 유지).');
      }
    });
  }

  // 통합 저장 로직 (DB & 로컬 동시 저장)
  async function saveDraft(showSuccessToast = false) {
    const textData = {};
    diaryTextFieldIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) textData[id] = el.value;
    });
    const todayItems = getTodayScheduleData();
    const tomorrowItems = getTomorrowScheduleData();

    // 1. 로컬 저장
    localStorage.setItem('diary_text_' + activeDateKey, JSON.stringify(textData));
    localStorage.setItem('block_today_' + activeDateKey, JSON.stringify(todayItems));
    localStorage.setItem('block_tomorrow_' + activeDateKey, JSON.stringify(tomorrowItems));
    if (userNameInput) localStorage.setItem('user_name', userNameInput.value.trim());
    if (syncKeyInput) localStorage.setItem('sync_key', syncKeyInput.value.trim());

    // 2. 클라우드 DB 저장 (Firebase 활성화 시)
    if (db) {
      try {
        await db.collection('diaries').doc(getSyncId()).collection('entries').doc(activeDateKey).set({
          dateKey: activeDateKey,
          textData,
          todayItems,
          tomorrowItems,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch(e) { console.warn("Cloud save error:", e); }
    }

    if (saveStatusText) {
      const timeStr = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      saveStatusText.textContent = `저장됨 (${timeStr})`;
    }
    if (showSuccessToast) showToast('진행상황이 클라우드와 기기에 안전하게 저장되었습니다 💾');
  }

  function autoSaveLocal() { saveDraft(false); }

  // 🌟 [💾 저장하기] 전용 버튼 클릭
  const saveBtn = document.getElementById('save-btn');
  if (saveBtn) saveBtn.addEventListener('click', () => saveDraft(true));

  // 🌟 [📋 작성 완료 및 복사] 전용 버튼 클릭
  const copyBtn = document.getElementById('copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      await saveDraft(false);
      const name = (userNameInput ? userNameInput.value.trim() : '') || '준영';
      const date = (dateInput ? dateInput.value.trim() : '') || formatDateBadge(now);
      const v = (id) => document.getElementById(id)?.value || '';

      const todayLines = getTodayScheduleData().map(it => {
        let line = `${it.time} ${it.text}`.trim();
        if (it.status === 'O') line += ' ⭕️'; else if (it.status === 'X') line += ' ❌';
        return line;
      }).filter(l => l.length > 0).join('\n');

      const tomorrowLines = getTomorrowScheduleData().map(it => {
        const t = (it.start && it.end) ? `${it.start}~${it.end}` : (it.start || it.end || '');
        return `${t} ${it.text}`.trim();
      }).filter(l => l.length > 0).join('\n');

      const formattedText = `🪽${name}의 스신말기🪽 ${date}
🤍step.1 스케줄
⏰오늘(⭕️❌)
${todayLines}
⏰내일
${tomorrowLines}
∞----------------------------𓏲𓎨ෆ ̖́-
🤍step.2 미디어 디톡스
▫️오늘 사용량

검색 : ${v('media-search')}
커뮤니티,SNS,유튜브 : ${v('media-sns')}
영상물 : ${v('media-video')}
기타 : ${v('media-etc')}
∞----------------------------𓏲𓎨ෆ ̖́-
🤍step.3 묵상
🕯️성경 장: ${v('meditation-chapter')}
와닿은 구절 & 와닿은 이유 및 느낀점:
${v('meditation-content')}
∞----------------------------𓏲𓎨ෆ ̖́-
🤍step.4 신앙일기
•오늘 느낀 감정의 종류
: ${v('faith-emotion')}

감정을 느낀 상황은 무엇인가요?
: ${v('faith-situation')}
나의 본심찾기 (나의 욕구:내가 원한 것)
: ${v('faith-desire')}
이 일을 통해 하나님께서 내게 알려주시고 싶으신 것은 무엇이었을까? (하나님의 도우심, 깨달은 점)
: ${v('faith-lesson')}
💛감사한 점

${v('faith-gratitude-1')}
${v('faith-gratitude-2')}
🙏🏻회개할 점

${v('faith-repent-1')}
${v('faith-repent-2')}
∞----------------------------𓏲𓎨ෆ ̖́-
🤍step.5 기도문
${v('prayer-content')}
🧎🏻시 62:1 나의 영혼이 잠잠히 하나님만 바람이여 나의 구원이 그에게서 나는도다`;

      try {
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(formattedText);
        else {
          const temp = document.createElement('textarea'); temp.value = formattedText;
          temp.style.position = 'fixed'; temp.style.left = '-9999px';
          document.body.appendChild(temp); temp.select(); document.execCommand('copy');
          document.body.removeChild(temp);
        }

        const completedList = getCompletedDates();
        if (!completedList.includes(activeDateKey)) {
          completedList.push(activeDateKey);
          localStorage.setItem('completed_dates', JSON.stringify(completedList));
          if (db) {
            db.collection('diaries').doc(getSyncId()).collection('meta').doc('status').set({ completedDates: completedList }, { merge: true });
          }
        }
        renderCalendar(calCurrentYear, calCurrentMonth);
        showToast('일기가 복사되고 완료(✅) 처리되었습니다 📋');
      } catch(e) { showToast('복사 권한 오류가 발생했습니다.'); }
    });
  }

  // 초기화 버튼
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('현재 날짜의 내용을 초기화하시겠습니까?')) {
        diaryTextFieldIds.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        todayList.innerHTML = ''; tomorrowList.innerHTML = '';
        todayList.appendChild(createTodayCard()); tomorrowList.appendChild(createTomorrowCard());
        autoSaveLocal();
        showToast('초기화되었습니다.');
      }
    });
  }

  // 달력
  const calTitle = document.getElementById('calendar-title'), calDaysContainer = document.getElementById('calendar-days');
  const statDone = document.getElementById('stat-done'), statMissed = document.getElementById('stat-missed');
  function getCompletedDates() {
    const raw = localStorage.getItem('completed_dates');
    return raw ? JSON.parse(raw) : [];
  }
  function renderCalendar(year, month) {
    if (!calTitle || !calDaysContainer) return;
    calTitle.textContent = `${year}.${String(month + 1).padStart(2, '0')}`;
    calDaysContainer.innerHTML = '';
    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const completedList = getCompletedDates();
    let monthDoneCount = 0, monthMissedCount = 0;

    for (let i = 0; i < firstDayIndex; i++) calDaysContainer.appendChild(document.createElement('div'));
    for (let day = 1; day <= lastDate; day++) {
      const dayDiv = document.createElement('div');
      dayDiv.textContent = day;
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (dateKey === realTodayKey) dayDiv.classList.add('today');
      if (completedList.includes(dateKey)) { dayDiv.classList.add('completed'); monthDoneCount++; }
      else if (dateKey < realTodayKey) { dayDiv.classList.add('missed'); monthMissedCount++; }

      dayDiv.addEventListener('click', async () => {
        await saveDraft(false);
        const targetDate = new Date(year, month, day);
        if (dateInput) dateInput.value = formatDateBadge(targetDate);
        activeDateKey = dateKey;
        await loadDataForDate(activeDateKey);
        showToast(`${month + 1}월 ${day}일 기록으로 이동했습니다.`);
      });
      calDaysContainer.appendChild(dayDiv);
    }
    if (statDone) statDone.textContent = `작성: ${monthDoneCount}일`;
    if (statMissed) statMissed.textContent = `미작성: ${monthMissedCount}일`;
  }

  document.getElementById('prev-month-btn')?.addEventListener('click', () => {
    calCurrentMonth--; if (calCurrentMonth < 0) { calCurrentMonth = 11; calCurrentYear--; }
    renderCalendar(calCurrentYear, calCurrentMonth);
  });
  document.getElementById('next-month-btn')?.addEventListener('click', () => {
    calCurrentMonth++; if (calCurrentMonth > 11) { calCurrentMonth = 0; calCurrentYear++; }
    renderCalendar(calCurrentYear, calCurrentMonth);
  });

  // 초기화 실행
  const savedUser = localStorage.getItem('user_name');
  if (savedUser && userNameInput) userNameInput.value = savedUser;
  const savedSync = localStorage.getItem('sync_key');
  if (savedSync && syncKeyInput) syncKeyInput.value = savedSync;

  if (dateInput) dateInput.value = formatDateBadge(now);
  activeDateKey = realTodayKey;

  renderCalendar(calCurrentYear, calCurrentMonth);
  loadDataForDate(activeDateKey);
  setInterval(autoSaveLocal, 5000);

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg; toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }
});
