const DB = {
    prefix: 'vocab_v4_',
    VERSION: 'v1.1',
    get: (k, d) => { try { return JSON.parse(localStorage.getItem(DB.prefix + k)) || d } catch (e) { return d } },
    set: (k, v) => localStorage.setItem(DB.prefix + k, JSON.stringify(v)),
    remove: (k) => localStorage.removeItem(DB.prefix + k),
    
    clearOldData() {
        const savedVersion = localStorage.getItem(this.prefix + 'app_version');
        if (savedVersion !== this.VERSION) {
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith(this.prefix)) {
                    localStorage.removeItem(key);
                }
            });
            localStorage.setItem(this.prefix + 'app_version', this.VERSION);
            console.log("偵測到新版本，已自動清理舊資料。");
        }
    }
};

const app = {
    allData: [],
    deckIds: [],
    displayTotal: 0,
    currentIndex: 0,
    savedIds: [],
    selectedLevels: [], 
    mode: 'all',

    getSessionKey() {
        const levelKey = [...this.selectedLevels].sort().join('_');
        return `session_${this.mode}_${levelKey}`;
    },

    init() {
        // 第一步：執行清理機制
        DB.clearOldData();

        // 第二步：載入設定
        this.savedIds = DB.get('saved', []);
        this.selectedLevels = DB.get('levels', ['A1', 'A2', 'B1']);
        this.mode = DB.get('mode', 'all');

        if (typeof wordData === 'undefined') {
            document.getElementById('cardZh').innerText = "找不到 word.js 檔案";
            return;
        }

        this.allData = wordData.map((d, i) => ({ ...d, id: i }));
        this.renderFilters();
        this.loadSession();

        document.getElementById('answerInput').onkeydown = (e) => {
            if (e.key === 'Enter') {
                document.getElementById('answerInput').disabled ? this.next() : this.check();
            }
        };
    },

    renderFilters() {
        const levels = ['A1', 'A2', 'B1']; 
        const container = document.getElementById('levelFilters');
        if (!container) return;
        container.innerHTML = levels.map(l => `
            <div class="filter-chip ${this.selectedLevels.includes(l) ? 'active' : ''}" onclick="app.toggleLevel('${l}')">${l}</div>
        `).join('');
    },

    toggleLevel(l) {
        if (this.selectedLevels.includes(l)) {
            if (this.selectedLevels.length > 1) this.selectedLevels = this.selectedLevels.filter(x => x !== l);
        } else {
            this.selectedLevels.push(l);
        }
        DB.set('levels', this.selectedLevels);
        this.renderFilters();
        this.loadSession(); 
    },

    loadSession() {
        const key = this.getSessionKey();
        const session = DB.get(key, null);
        
        if (this.mode === 'saved') {
            this.buildDeck();
        } else if (session && session.deckIds.length > 0) {
            this.deckIds = session.deckIds;
            this.currentIndex = session.index;
            this.displayTotal = session.displayTotal;
            this.renderCard();
        } else {
            this.buildDeck();
        }
    },

    buildDeck() {
        let pool = this.allData.filter(d => this.selectedLevels.includes(d.level));
        
        if (this.mode === 'saved') {
            pool = pool.filter(d => this.savedIds.includes(d.id));
        }

        if (pool.length === 0) {
            this.deckIds = [];
            this.renderEmpty();
            return;
        }

        this.deckIds = this.shuffle(pool.map(d => d.id));
        this.currentIndex = 0;
        this.displayTotal = this.deckIds.length;
        this.saveSession();
        this.renderCard();
    },

    renderCard() {
        const quiz = document.getElementById('quizView');
        const complete = document.getElementById('completeView');
        
        const cardId = this.deckIds[this.currentIndex];
        const card = this.allData[cardId];

        if (!this.deckIds.length || !card) { 
            return this.renderEmpty(); 
        }

        quiz.style.display = 'block';
        complete.style.display = 'none';
        
        document.getElementById('cardPos').innerText = `${card.level} | ${card.pos}`;
        document.getElementById('cardZh').innerText = card.ch;

        const input = document.getElementById('answerInput');
        input.value = ''; 
        input.disabled = false; 
        input.focus();

        document.getElementById('feedbackArea').style.display = 'none';
        document.getElementById('btnNext').style.display = 'none';
        document.getElementById('btnSkip').style.display = 'block';

        this.updateSaveIcon();
        this.updateProgress();
    },

    renderEmpty() {
        document.getElementById('cardZh').innerText = this.mode === 'saved' ? "收藏清單是空的" : "沒有對應單字";
        document.getElementById('cardPos').innerText = "-";
        document.getElementById('answerInput').disabled = true;
        document.getElementById('progressText').innerText = "0 / 0";
        document.getElementById('progressBar').style.width = `0%`;
        this.updateSaveIcon();
    },
    
    check() {
        const input = document.getElementById('answerInput');
        const val = input.value.trim().toLowerCase();
        
        // 移除 if (!val) return; 這一行，改為允許空值進入判斷

        const card = this.allData[this.deckIds[this.currentIndex]];
        
        // 如果 val 為空，isCorrect 自然會是 false
        const isCorrect = val !== "" && val === card.word.toLowerCase();

        input.disabled = true;
        document.getElementById('btnSkip').style.display = 'none';
        document.getElementById('btnNext').style.display = 'block';

        const fb = document.getElementById('feedbackArea');
        fb.style.display = 'block';
        
        // 根據是否正確顯示顏色
        fb.style.borderColor = isCorrect ? 'var(--correct-color)' : 'var(--wrong-color)';
        document.getElementById('fbWord').innerText = card.word;
        document.getElementById('fbExEn').innerText = card.example_en;
        document.getElementById('fbExZh').innerText = card.example_ch;

        if (isCorrect) {
            this.speak();
        } else {
            // 如果是空的或錯的，都會觸發震動動畫並將單字排回隊伍後方
            input.classList.add('shake');
            setTimeout(() => input.classList.remove('shake'), 400);
            
            const wrongId = this.deckIds.splice(this.currentIndex, 1)[0];
            const remainingCount = this.deckIds.length - this.currentIndex;
            const insertOffset = Math.floor(Math.random() * (remainingCount + 1));
            this.deckIds.splice(this.currentIndex + insertOffset, 0, wrongId);
            this.currentIndex--; 
        }
        this.saveSession();
    },

    skip() {
        const currentId = this.deckIds.splice(this.currentIndex, 1)[0];
        const remainingCount = this.deckIds.length - this.currentIndex;
        const insertOffset = Math.floor(Math.random() * (remainingCount + 1));
        this.deckIds.splice(this.currentIndex + insertOffset, 0, currentId);
        this.saveSession();
        this.renderCard();
    },

    next() {
        this.currentIndex++;
        if (this.currentIndex >= this.deckIds.length) {
            this.currentIndex = 0; // 循環播放
        }
        this.saveSession();
        this.renderCard();
    },

    updateProgress() {
        const total = this.displayTotal;
        const current = total === 0 ? 0 : Math.min(this.currentIndex + 1, total);
        const percent = total === 0 ? 0 : (this.currentIndex / total) * 100;
        document.getElementById('progressText').innerText = `${current} / ${total}`;
        document.getElementById('progressBar').style.width = `${percent}%`;
    },

    setMode(m) {
        if (this.mode === m) return;
        this.mode = m;
        DB.set('mode', m);
        document.getElementById('modeAll').classList.toggle('active', m === 'all');
        document.getElementById('modeSaved').classList.toggle('active', m === 'saved');
        this.loadSession();
    },

    toggleSave() {
        const id = this.deckIds[this.currentIndex];
        if (id === undefined) return;

        if (this.savedIds.includes(id)) {
            this.savedIds = this.savedIds.filter(x => x !== id);
        } else {
            this.savedIds.push(id);
        }
        DB.set('saved', this.savedIds);
        this.updateSaveIcon();

        if (this.mode === 'saved' && !this.savedIds.includes(id)) {
            this.deckIds.splice(this.currentIndex, 1);
            this.displayTotal = this.deckIds.length;
            this.deckIds.length === 0 ? this.renderEmpty() : this.renderCard();
            this.saveSession();
        }
    },

    updateSaveIcon() {
        const icon = document.getElementById('saveIcon');
        const id = this.deckIds[this.currentIndex];
        
        // 如果 id 是 undefined，直接回傳不執行後續邏輯
        if (id === undefined) {
            icon.style.fill = 'none';
            icon.style.stroke = 'currentColor';
            return;
        }

        const isSaved = this.savedIds.includes(id);
        icon.style.fill = isSaved ? '#ffd700' : 'none';
        icon.style.stroke = isSaved ? '#ffd700' : 'currentColor';
    },

    speak() {
        const id = this.deckIds[this.currentIndex];
        if (id === undefined) return;
        const msg = new SpeechSynthesisUtterance(this.allData[id].word);
        msg.lang = 'en-US';
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(msg);
    },

    shuffle: (arr) => [...arr].sort(() => Math.random() - 0.5),

    saveSession() {
        DB.set(this.getSessionKey(), { 
            deckIds: this.deckIds, 
            index: this.currentIndex, 
            displayTotal: this.displayTotal 
        });
    },

    reset() {
        if (confirm(`確定要重置目前進度嗎？`)) {
            DB.remove(this.getSessionKey());
            this.buildDeck();
        }
    }
};

app.init();

window.onload = () => app.init();