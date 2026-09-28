document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
  }

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const now = new Date();

  function formatDateBadge(d) {
    return `_${d.getMonth() + 1}/${d.getDate()} ${dayNames[d.getDay()]}`;
  }

  // 정확한 YYYY-MM-DD 추출
  function parseDateKey(dateStr, fallbackYear) {
    const match = (dateStr || '').match(/(\d{1,2})\s*[\/\.]\s*(\d{1,2})/);
    if (match && match && match) {
      const month = String(match).padStart(2, '0');
      const day = String(match).padStart(2, '0');
      return `${fallbackYear}-${month}-${day}`;
    }
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  // 어제 날짜(YYYY-MM-DD) 계산
  function getYesterdayDateKey(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  const dateInput = document.getElementById('diary-date');
  const userNameInput = document.getElementById('user-name');
  const saveStatusText = document.getElementById('save-status-text');
  const toast = document.getElementById('toast');

  const todayList = document.getElementById('today-schedule-list');
  const tomorrowList = document.getElementById('tomorrow-schedule-list');
  const addTodayBtn = document.getElementById('add-today-row-btn');
  const addTomorrowBtn = document.getElementById('add-tomorrow-row-btn');

  let calCurrentYear = now.getFullYear();
  let calCurrentMonth = now.getMonth();

  let activeDateKey = parseDateKey(dateInput.value || formatDateBadge(now), calCurrentYear);

  const generalFieldIds = [
    'user-name', 'diary-date',
    'media-search', 'media-sns', 'media-video', 'media-etc',
    'meditation-chapter', 'meditation-content',
    'faith-emotion', 'faith-situation', 'faith-desire', 'faith-lesson',
    'faith-gratitude-1', 'faith-gratitude-2',
    'faith-repent-1', 'faith-repent-2',
    'prayer-content'
  ];

  // --- 1. 다크 모드 토글 ---
  const themeToggleBtn = document.getElementById('theme-toggle');
  const savedTheme = localStorage.getItem('app_theme') || 
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  
  applyTheme(savedTheme);

  themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  });

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app_theme', theme);
    themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
    const themeMeta = document.getElementById('theme-color-meta');
    if (themeMeta) {
      themeMeta.setAttribute('content', theme === 'dark' ? '#111318' : '#ffffff');
    }
  }

  // --- 2. 오늘 일정 카드 아이템 생성 ---
  function createTodayCard(item = { time: '', text: '', status: '' }) {
    const card = document.createElement('div');
    card.className = 'schedule-card-item';
    card.dataset.status = item.status || '';

    card.innerHTML = `
      <div class="item-inputs-row">
        <div class="input-cell time-cell">
          <span class="cell-label">시간</span>
          <input type="text" class="cell-box-input today-time-input" value="${item.time || ''}">
        </div>
        <div class="input-cell text-cell">
          <span class="cell-label">내용</span>
          <input type="text" class="cell-box-input today-text-input" value="${item.text || ''}">
        </div>
      </div>
      <div class="item-actions-row">
        <div class="ox-btn-group">
          <button type="button" class="ox-tag-btn ox-o${item.status === 'O' ? ' active-o' : ''}">⭕️ 완료</button>
          <button type="button" class="ox-tag-btn ox-x${item.status === 'X' ? ' active-x' : ''}">❌ 미완료</button>
        </div>
        <button type="button" class="item-del-btn">✕ 삭제</button>
      </div>
    `;

    const timeInput = card.querySelector('.today-time-input');
    const textInput = card.querySelector('.today-text-input');
    const btnO = card.querySelector('.ox-o');
    const btnX = card.querySelector('.ox-x');
    const delBtn = card.querySelector('.item-del-btn');

    timeInput.addEventListener('input', saveDraft);
    textInput.addEventListener('input', saveDraft);

    btnO.addEventListener('click', () => {
      if (card.dataset.status === 'O') {
        card.dataset.status = '';
        btnO.classList.remove('active-o');
      } else {
        card.dataset.status = 'O';
        btnO.classList.add('active-o');
        btnX.classList.remove('active-x');
      }
      saveDraft();
    });

    btnX.addEventListener('click', () => {
      if (card.dataset.status === 'X') {
        card.dataset.status = '';
        btnX.classList.remove('active-x');
      } else {
        card.dataset.status = 'X';
        btnX.classList.add('active-x');
        btnO.classList.remove('active-o');
      }
      saveDraft();
    });

    delBtn.addEventListener('click', () => {
      card.remove();
      if (todayList.children.length === 0) {
        todayList.appendChild(createTodayCard({ time: '', text: '', status: '' }));
      }
      saveDraft();
    });

    return card;
  }

  // --- 3. 내일 일정 카드 아이템 생성 ---
  function createTomorrowCard(item = { start: '', end: '', text: '' }) {
    const card = document.createElement('div');
    card.className = 'schedule-card-item';

    card.innerHTML = `
      <div class="item-inputs-row">
        <div class="input-cell time-range-cell">
          <span class="cell-label">시간</span>
          <div class="time-range-wrap">
            <input type="text" class="cell-box-input tomorrow-start-input" value="${item.start || ''}">
            <span class="range-tilde">~</span>
            <input type="text" class="cell-box-input tomorrow-end-input" value="${item.end || ''}">
          </div>
        </div>
        <div class="input-cell text-cell">
          <span class="cell-label">내용</span>
          <input type="text" class="cell-box-input tomorrow-text-input" value="${item.text || ''}">
        </div>
      </div>
      <div class="item-actions-row right-only">
        <button type="button" class="item-del-btn">✕ 삭제</button>
      </div>
    `;

    const startInput = card.querySelector('.tomorrow-start-input');
    const endInput = card.querySelector('.tomorrow-end-input');
    const textInput = card.querySelector('.tomorrow-text-input');
    const delBtn = card.querySelector('.item-del-btn');

    startInput.addEventListener('input', saveDraft);
    endInput.addEventListener('input', saveDraft);
    textInput.addEventListener('input', saveDraft);

    delBtn.addEventListener('click', () => {
      card.remove();
      if (tomorrowList.children.length === 0) {
        tomorrowList.appendChild(createTomorrowCard({ start: '', end: '', text: '' }));
      }
      saveDraft();
    });

    return card;
  }

  addTodayBtn.addEventListener('click', () => {
    todayList.appendChild(createTodayCard({ time: '', text: '', status: '' }));
  });

  addTomorrowBtn.addEventListener('click', () => {
    tomorrowList.appendChild(createTomorrowCard({ start: '', end: '', text: '' }));
  });

  function getTodayScheduleData() {
    const cards = todayList.querySelectorAll('.schedule-card-item');
    const list = [];
    cards.forEach(card => {
      const time = card.querySelector('.today-time-input')?.value.trim() || '';
      const text = card.querySelector('.today-text-input')?.value.trim() || '';
      const status = card.dataset.status || '';
      if (time || text || status) {
        list.push({ time, text, status });
      }
    });
    return list;
  }

  function getTomorrowScheduleData() {
    const cards = tomorrowList.querySelectorAll('.schedule-card-item');
    const list = [];
    cards.forEach(card => {
      const start = card.querySelector('.tomorrow-start-input')?.value.trim() || '';
      const end = card.querySelector('.tomorrow-end-input')?.value.trim() || '';
      const text = card.querySelector('.tomorrow-text-input')?.value.trim() || '';
      if (start || end || text) {
        list.push({ start, end, text });
      }
    });
    return list;
  }

  // --- 4. 날짜별 로드 & 전날 계획 연동 ---
  function loadScheduleForDateKey(targetDateKey) {
    todayList.innerHTML = '';
    tomorrowList.innerHTML = '';

    const savedToday = localStorage.getItem('block_today_' + targetDateKey);
    const savedTomorrow = localStorage.getItem('block_tomorrow_' + targetDateKey);

    if (savedToday) {
      try {
        const list = JSON.parse(savedToday);
        if (Array.isArray(list) && list.length > 0) {
          list.forEach(it => todayList.appendChild(createTodayCard(it)));
        } else {
          todayList.appendChild(createTodayCard());
        }
      } catch (e) {
        todayList.appendChild(createTodayCard());
      }
    } else {
      // 전날 '내일 일정' 확인 후 오늘 일정으로 자동 로드
      const yesterdayKey = getYesterdayDateKey(targetDateKey);
      const prevTomorrow = localStorage.getItem('block_tomorrow_' + yesterdayKey);
      let loadedFromYesterday = false;

      if (prevTomorrow) {
        try {
          const list = JSON.parse(prevTomorrow);
          if (Array.isArray(list) && list.length > 0) {
            list.forEach(it => {
              const timeCombined = (it.start && it.end) ? `${it.start}~${it.end}` : (it.start || it.end || '');
              todayList.appendChild(createTodayCard({
                time: timeCombined,
                text: it.text || '',
                status: ''
              }));
            });
            loadedFromYesterday = true;
            showToast('전날 계획했던 일정을 오늘 일정으로 불러왔습니다 ✨');
          }
        } catch (e) {}
      }

      if (!loadedFromYesterday) {
        todayList.appendChild(createTodayCard());
      }
    }

    if (savedTomorrow) {
      try {
        const list = JSON.parse(savedTomorrow);
        if (Array.isArray(list) && list.length > 0) {
          list.forEach(it => tomorrowList.appendChild(createTomorrowCard(it)));
        } else {
          tomorrowList.appendChild(createTomorrowCard());
        }
      } catch (e) {
        tomorrowList.appendChild(createTomorrowCard());
      }
    } else {
      tomorrowList.appendChild(createTomorrowCard());
    }
  }

  // --- 5. 자동 임시 저장 & 복원 ---
  function saveDraft() {
    const draftData = {};

    generalFieldIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) draftData[id] = el.value;
    });

    const todayItems = getTodayScheduleData();
    const tomorrowItems = getTomorrowScheduleData();

    draftData['blockToday'] = todayItems;
    draftData['blockTomorrow'] = tomorrowItems;
    draftData['dateKey'] = activeDateKey;

    localStorage.setItem('diary_draft', JSON.stringify(draftData));
    localStorage.setItem('block_today_' + activeDateKey, JSON.stringify(todayItems));
    localStorage.setItem('block_tomorrow_' + activeDateKey, JSON.stringify(tomorrowItems));

    const timeStr = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    saveStatusText.textContent = `저장됨 (${timeStr})`;
  }

  function loadDraft() {
    const saved = localStorage.getItem('diary_draft');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        generalFieldIds.forEach(id => {
          const el = document.getElementById(id);
          if (el && data[id] !== undefined) {
            el.value = data[id];
          }
        });
      } catch (e) {
        console.error('Draft load error:', e);
      }
    }
    if (!dateInput.value) {
      dateInput.value = formatDateBadge(now);
    }

    activeDateKey = parseDateKey(dateInput.value, calCurrentYear);
    loadScheduleForDateKey(activeDateKey);
  }

  // --- 6. Habit Tracker 달력 ---
  const calTitle = document.getElementById('calendar-title');
  const calDaysContainer = document.getElementById('calendar-days');
  const statDone = document.getElementById('stat-done');
  const statMissed = document.getElementById('stat-missed');
  const prevMonthBtn = document.getElementById('prev-month-btn');
  const nextMonthBtn = document.getElementById('next-month-btn');

  function getCompletedDates() {
    const raw = localStorage.getItem('completed_dates');
    return raw ? JSON.parse(raw) : [];
  }

  function renderCalendar(year, month) {
    calTitle.textContent = `${year}.${String(month + 1).padStart(2, '0')}`;
    calDaysContainer.innerHTML = '';

    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const completedList = getCompletedDates();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    let monthDoneCount = 0;
    let monthMissedCount = 0;

    for (let i = 0; i < firstDayIndex; i++) {
      const emptyDiv = document.createElement('div');
      calDaysContainer.appendChild(emptyDiv);
    }

    for (let day = 1; day <= lastDate; day++) {
      const dayDiv = document.createElement('div');
      dayDiv.textContent = day;

      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = (dateKey === todayStr);
      const isPast = (dateKey < todayStr);
      const isDone = completedList.includes(dateKey);

      if (isToday) dayDiv.classList.add('today');
      if (isDone) {
        dayDiv.classList.add('completed');
        monthDoneCount++;
      } else if (isPast) {
        dayDiv.classList.add('missed');
        monthMissedCount++;
      }

      dayDiv.addEventListener('click', () => {
        saveDraft();
        const targetDate = new Date(year, month, day);
        dateInput.value = formatDateBadge(targetDate);
        activeDateKey = dateKey;
        loadScheduleForDateKey(activeDateKey);
        showToast(`${month + 1}월 ${day}일(${dayNames[targetDate.getDay()]})로 변경되었습니다.`);
      });

      calDaysContainer.appendChild(dayDiv);
    }

    statDone.textContent = `작성: ${monthDoneCount}일`;
    statMissed.textContent = `미작성: ${monthMissedCount}일`;
  }

  prevMonthBtn.addEventListener('click', () => {
    calCurrentMonth--;
    if (calCurrentMonth < 0) {
      calCurrentMonth = 11;
      calCurrentYear--;
    }
    renderCalendar(calCurrentYear, calCurrentMonth);
  });

  nextMonthBtn.addEventListener('click', () => {
    calCurrentMonth++;
    if (calCurrentMonth > 11) {
      calCurrentMonth = 0;
      calCurrentYear++;
    }
    renderCalendar(calCurrentYear, calCurrentMonth);
  });

  dateInput.addEventListener('change', () => {
    saveDraft();
    activeDateKey = parseDateKey(dateInput.value, calCurrentYear);
    loadScheduleForDateKey(activeDateKey);
  });

  generalFieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', saveDraft);
  });

  loadDraft();
  renderCalendar(calCurrentYear, calCurrentMonth);
  setInterval(saveDraft, 5000);

  // --- 7. 작성 완료 및 복사 (원래 텍스트 템플릿 완벽 유지) ---
  const copyBtn = document.getElementById('copy-btn');
  const resetBtn = document.getElementById('reset-btn');

  copyBtn.addEventListener('click', async () => {
    saveDraft();

    const name = userNameInput.value.trim() || '준영';
    const date = dateInput.value.trim() || formatDateBadge(now);
    const v = (id) => document.getElementById(id)?.value || '';

    const todayItems = getTodayScheduleData();
    const todayLines = todayItems.map(it => {
      let line = `${it.time} ${it.text}`.trim();
      if (it.status === 'O') line += ' ⭕️';
      else if (it.status === 'X') line += ' ❌';
      return line;
    }).filter(l => l.length > 0).join('\n');

    const tomorrowItems = getTomorrowScheduleData();
    const tomorrowLines = tomorrowItems.map(it => {
      const timeCombined = (it.start && it.end) ? `${it.start}~${it.end}` : (it.start || it.end || '');
      return `${timeCombined} ${it.text}`.trim();
    }).filter(l => l.length > 0).join('\n');

    // 요청하신 기존 양식 포맷 100% 동일 결합
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
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(formattedText);
      } else {
        const temp = document.createElement('textarea');
        temp.value = formattedText;
        temp.style.position = 'fixed';
        temp.style.left = '-9999px';
        document.body.appendChild(temp);
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }

      const targetDateKey = activeDateKey;
      const completedList = getCompletedDates();
      if (!completedList.includes(targetDateKey)) {
        completedList.push(targetDateKey);
        localStorage.setItem('completed_dates', JSON.stringify(completedList));
      }
      renderCalendar(calCurrentYear, calCurrentMonth);

      showToast('일기가 복사되고 완료(✅) 처리되었습니다.');
    } catch (err) {
      console.error(err);
      showToast('복사 권한 오류가 발생했습니다.');
    }
  });

  resetBtn.addEventListener('click', () => {
    if (confirm('현재 작성 중인 내용을 모두 초기화하시겠습니까?')) {
      generalFieldIds.forEach(id => {
        if (id !== 'user-name') {
          const el = document.getElementById(id);
          if (el) el.value = '';
        }
      });
      dateInput.value = formatDateBadge(now);
      activeDateKey = parseDateKey(dateInput.value, calCurrentYear);
      
      localStorage.removeItem('diary_draft');
      localStorage.removeItem('block_today_' + activeDateKey);
      localStorage.removeItem('block_tomorrow_' + activeDateKey);

      todayList.innerHTML = '';
      tomorrowList.innerHTML = '';
      todayList.appendChild(createTodayCard());
      tomorrowList.appendChild(createTomorrowCard());

      saveStatusText.textContent = '초기화됨';
      showToast('내용이 초기화되었습니다.');
    }
  });

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }
});
