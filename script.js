// ------------------------------------------
// 本地存儲管理 (LocalStorage Manager)
// ------------------------------------------
const Storage = {
    keyPrefix: 'vocab_app_',
    get(key, defaultVal) {
        const val = localStorage.getItem(this.keyPrefix + key);
        return val ? JSON.parse(val) : defaultVal;
    },
    set(key, val) {
        localStorage.setItem(this.keyPrefix + key, JSON.stringify(val));
    }
};

// ------------------------------------------
// 應用程式邏輯
// ------------------------------------------
const app = {
    // 狀態變數
    data: [], // 原始資料
    currentDeck: [], // 當前要複習的卡片索引列表
    currentIndex: 0,
    
    // 持久化狀態
    masteredIds: [], // 已答對的卡片 ID (使用 index 當 ID)
    savedIds: [],    // 收藏的卡片 ID
    history: [],     // 答題記錄 { word, correct: bool }
    currentLevel: 'ALL',
    mode: 'all',     // 'all' 或 'saved'

    init() {
        // 1. 載入資料
        if (typeof wordData === 'undefined') {
            document.getElementById('cardZh').innerText = "找不到 word.js";
            return;
        }
        // 為每個單字加上原始索引 ID，確保資料流轉時能對應
        this.data = wordData.map((item, index) => ({ ...item, id: index }));

        // 2. 讀取存檔
        this.masteredIds = Storage.get('mastered', []);
        this.savedIds = Storage.get('saved', []);
        this.history = Storage.get('history', []);
        this.currentLevel = Storage.get('level', 'ALL');

        // 3. 還原 UI 狀態
        document.getElementById('levelSelect').value = this.currentLevel;
        this.renderHistory();

        // 4. 建立牌組
        this.buildDeck();
        this.renderCard();

        // 5. 綁定輸入事件
        document.getElementById('answerInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.checkAnswer();
        });
    },

    // 建立當前練習的牌組
    buildDeck() {
        // 根據難度篩選
        let filtered = this.data;
        if (this.currentLevel !== 'ALL') {
            filtered = filtered.filter(w => w.level === this.currentLevel);
        }

        // 根據模式篩選
        if (this.mode === 'saved') {
            // 收藏模式：只看已收藏的
            // 注意：收藏模式下，通常我們希望無限複習，或者只過濾掉本次 Session 已對的
            // 這裡採用簡單邏輯：列出所有收藏的卡片 (不管是否 mastered，因為是刻意要複習)
            filtered = filtered.filter(w => this.savedIds.includes(w.id));
        } else {
            // 一般模式：排除已掌握的 (Mastered)
            filtered = filtered.filter(w => !this.masteredIds.includes(w.id));
        }

        this.currentDeck = this.shuffle(filtered);
        this.currentIndex = 0;
        this.updateProgress();
    },

    // 切換模式 (全部 / 收藏)
    setMode(mode) {
        this.mode = mode;
        // UI 更新
        document.getElementById('btnModeAll').classList.toggle('active', mode === 'all');
        document.getElementById('btnModeSaved').classList.toggle('active', mode === 'saved');
        
        this.buildDeck();
        this.renderCard();
    },

    // 篩選難度
    filterLevel(level) {
        this.currentLevel = level;
        Storage.set('level', level);
        // 切換難度時，建議回到一般模式，以免收藏夾為空造成困惑，或保持現狀
        this.buildDeck();
        this.renderCard();
    },

    // 重置進度 (只重置 mastered，不重置 saved)
    resetProgress() {
        if(!confirm("確定要重置學習進度嗎？(已收藏的卡片會保留)")) return;
        this.masteredIds = [];
        Storage.set('mastered', []);
        this.buildDeck();
        this.renderCard();
    },

    // 渲染當前卡片
    renderCard() {
        const quizView = document.getElementById('quizView');
        const completeView = document.getElementById('completeView');
        
        if (this.currentDeck.length === 0) {
            quizView.style.display = 'none';
            completeView.style.display = 'block';
            return;
        }

        quizView.style.display = 'block';
        completeView.style.display = 'none';

        const card = this.currentDeck[this.currentIndex];
        
        // 填充內容
        document.getElementById('cardPos').innerText = card.pos;
        document.getElementById('cardZh').innerText = card.ch;
        
        // 重置輸入與回饋區
        const input = document.getElementById('answerInput');
        input.value = '';
        input.disabled = false;
        input.focus();
        
        const feedback = document.getElementById('feedbackArea');
        feedback.style.display = 'none';
        feedback.className = 'feedback'; // reset classes
        document.getElementById('nextBtn').style.display = 'none';

        // 更新收藏按鈕狀態
        this.updateSaveIconState(card.id);
        this.updateProgress();
    },

    checkAnswer() {
        const input = document.getElementById('answerInput');
        if (input.disabled) return; // 防止重複提交

        const userVal = input.value.trim().toLowerCase();
        const card = this.currentDeck[this.currentIndex];
        const correctVal = card.word.toLowerCase();

        if (!userVal) return; // 空白不送出

        input.disabled = true;
        const feedback = document.getElementById('feedbackArea');
        feedback.style.display = 'flex';
        document.getElementById('nextBtn').style.display = 'block';

        // 填充詳解
        document.getElementById('feedbackAnswer').innerText = card.word;
        document.getElementById('feedbackExEn').innerText = card.example_en;
        document.getElementById('feedbackExZh').innerText = card.example_ch;

        const isCorrect = (userVal === correctVal);

        if (isCorrect) {
            // 答對
            feedback.classList.add('correct');
            document.getElementById('feedbackIcon').innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'; // Check icon
            document.getElementById('feedbackText').innerText = "Correct";
            
            // 只有在一般模式下，答對才視為 Mastered
            if (this.mode === 'all') {
                this.masteredIds.push(card.id);
                Storage.set('mastered', this.masteredIds);
            }
        } else {
            // 答錯
            input.classList.add('shake');
            setTimeout(() => input.classList.remove('shake'), 500);
            
            feedback.classList.add('wrong');
            document.getElementById('feedbackIcon').innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'; // X icon
            document.getElementById('feedbackText').innerText = "Incorrect";
            
            // 答錯自動加入收藏? 這裡依需求，題目說「使用者可於答題後儲存」，所以不強制自動加，
            // 但為了體驗，通常錯題會希望之後復習。這裡我們只記錄 History，讓使用者自己決定按星星。
        }

        // 添加到歷史記錄
        this.addToHistory(card, isCorrect);
    },

    nextCard() {
        // 如果在一般模式下答對了，該卡片已被記錄為 Mastered，從當前 Deck 移除
        // 但為了簡單邏輯，我們直接 index++。
        // 若 index 超出，則重新 buildDeck (這會自動過濾掉剛剛 mastered 的)
        
        this.currentIndex++;
        
        if (this.currentIndex >= this.currentDeck.length) {
            // 一輪結束，重新整理牌組
            this.buildDeck();
            this.renderCard();
        } else {
            this.renderCard();
        }
    },

    // 收藏功能
    toggleSaveCurrent() {
        if (this.currentDeck.length === 0) return;
        const cardId = this.currentDeck[this.currentIndex].id;
        
        const idx = this.savedIds.indexOf(cardId);
        if (idx === -1) {
            this.savedIds.push(cardId);
        } else {
            this.savedIds.splice(idx, 1);
        }
        Storage.set('saved', this.savedIds);
        this.updateSaveIconState(cardId);
    },

    updateSaveIconState(id) {
        const btn = document.getElementById('btnSaveCard');
        const isSaved = this.savedIds.includes(id);
        if (isSaved) {
            btn.classList.add('saved');
            btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z" fill="#ffd700"/></svg>'; // Filled Bookmark
        } else {
            btn.classList.remove('saved');
            btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z" fill="#fff"/></svg>'; // Outline Bookmark
        }
    },

    // 歷史記錄
    addToHistory(card, isCorrect) {
        const record = {
            word: card.word,
            ch: card.ch,
            correct: isCorrect,
            time: new Date().toLocaleTimeString()
        };
        // 加到開頭
        this.history.unshift(record);
        // 限制長度
        if (this.history.length > 50) this.history.pop();
        
        Storage.set('history', this.history);
        this.renderHistory();
    },

    renderHistory() {
        const list = document.getElementById('historyList');
        list.innerHTML = this.history.map(Rec => `
            <div class="history-item">
                <span class="h-word">${Rec.word} (${Rec.ch})</span>
                <span class="h-res ${Rec.correct ? 'ok' : 'ng'}">
                    ${Rec.correct ? '✔' : '✘'}
                </span>
            </div>
        `).join('');
    },

    // 工具：洗牌
    shuffle(array) {
        let currentIndex = array.length, randomIndex;
        while (currentIndex != 0) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }
        return array;
    },

    updateProgress() {
        const total = this.currentDeck.length;
        const current = Math.min(this.currentIndex + 1, total);
        const text = total === 0 ? "0 / 0" : `${current} / ${total}`;
        
        // 這裡的進度條顯示的是「當前佇列」的進度
        const percent = total === 0 ? 0 : ((this.currentIndex) / total) * 100;
        
        document.getElementById('progressText').innerText = text;
        document.getElementById('progressBar').style.width = percent + '%';
    }
};

// 啟動
window.onload = () => app.init();