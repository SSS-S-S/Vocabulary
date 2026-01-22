const DB = {
    prefix: 'vocab_v4_',
    VERSION: 'v1.1',

    get(k, d) {
        try {
            const raw = localStorage.getItem(this.prefix + k);
            if (raw === null || raw === undefined) return d;
            const parsed = JSON.parse(raw);
            return parsed ?? d;
        } catch (e) {
            console.warn('DB.get parse error for', k, e);
            return d;
        }
    },

    set(k, v) {
        try {
            localStorage.setItem(this.prefix + k, JSON.stringify(v));
        } catch (e) {
            console.warn('DB.set error', k, e);
        }
    },

    remove(k) {
        try {
            localStorage.removeItem(this.prefix + k);
        } catch (e) {
            console.warn('DB.remove error', k, e);
        }
    },

    clearOldData() {
        try {
            const savedVersion = localStorage.getItem(this.prefix + 'app_version');
            if (savedVersion !== this.VERSION) {
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith(this.prefix)) {
                        localStorage.removeItem(key);
                    }
                });
                localStorage.setItem(this.prefix + 'app_version', this.VERSION);
                console.log('偵測到新版本，已自動清理舊資料。');
            }
        } catch (e) {
            console.warn('clearOldData error', e);
        }
    }
};

const app = {
    allData: [],
    deckIds: [],
    displayTotal: 0,
    currentIndex: 0,
    currentCardId: null,
    savedIds: [],
    selectedLevels: [],
    mode: 'all',

    getSessionKey() {
        const levelKey = [...this.selectedLevels].sort().join('_');
        return `session_all_${levelKey}`;
    },

    init() {
        DB.clearOldData();

        this.savedIds = DB.get('saved', []);
        this.selectedLevels = DB.get('levels', ['A1', 'A2', 'B1']);
        this.mode = DB.get('mode', 'all');

        if (typeof wordData === 'undefined') {
            const el = document.getElementById('cardZh');
            if (el) el.innerText = '找不到 word.js';
            return;
        }

        this.allData = wordData.map((d, i) => ({ ...d, id: i }));

        this.renderFilters();
        this.loadSession();

        const answerInput = document.getElementById('answerInput');
        if (answerInput) {
            answerInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    answerInput.disabled ? this.next() : this.check();
                }
            };
        }
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
            if (this.selectedLevels.length > 1) {
                this.selectedLevels = this.selectedLevels.filter(x => x !== l);
            }
        } else {
            this.selectedLevels.push(l);
        }
        DB.set('levels', this.selectedLevels);
        this.renderFilters();
        this.buildDeck();
    },

    loadSession() {
        if (this.mode === 'saved') {
            this.buildDeck();
            return;
        }

        const session = DB.get(this.getSessionKey(), null);

        if (session && Array.isArray(session.deckIds) && session.deckIds.length > 0) {
            this.deckIds = session.deckIds.slice();
            const maxIndex = Math.max(0, this.deckIds.length - 1);
            this.currentIndex = Math.min(Math.max(session.index || 0, 0), maxIndex);
            this.displayTotal = typeof session.displayTotal === 'number' ? session.displayTotal : this.deckIds.length;
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

        if (!pool.length) {
            this.deckIds = [];
            this.displayTotal = 0;
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
        if (!this.deckIds.length) {
            this.renderEmpty();
            return;
        }

        if (this.currentIndex < 0) this.currentIndex = 0;
        if (this.currentIndex >= this.deckIds.length) {
            this.currentIndex = Math.max(0, this.deckIds.length - 1);
        }

        const quiz = document.getElementById('quizView');
        const complete = document.getElementById('completeView');

        const cardId = this.deckIds[this.currentIndex];
        const card = this.allData[cardId];

        if (!card) {
            this.renderEmpty();
            return;
        }

        this.currentCardId = cardId;

        if (quiz) quiz.style.display = 'block';
        if (complete) complete.style.display = 'none';

        const posEl = document.getElementById('cardPos');
        const zhEl = document.getElementById('cardZh');
        if (posEl) posEl.innerText = `${card.level} | ${card.pos}`;
        if (zhEl) zhEl.innerText = card.ch;

        const input = document.getElementById('answerInput');
        if (input) {
            input.value = '';
            input.disabled = false;
            input.focus();
            input.classList.remove('shake');
        }

        const fb = document.getElementById('feedbackArea');
        if (fb) fb.style.display = 'none';
        const btnNext = document.getElementById('btnNext');
        if (btnNext) btnNext.style.display = 'none';
        const btnSkip = document.getElementById('btnSkip');
        if (btnSkip) btnSkip.style.display = 'block';

        this.updateSaveIcon();
        this.updateProgress();
    },

    renderEmpty() {
        const zhEl = document.getElementById('cardZh');
        const posEl = document.getElementById('cardPos');
        if (zhEl) zhEl.innerText = this.mode === 'saved' ? '收藏清單是空的' : '沒有對應單字';
        if (posEl) posEl.innerText = '-';
        const input = document.getElementById('answerInput');
        if (input) input.disabled = true;
        const progressText = document.getElementById('progressText');
        if (progressText) progressText.innerText = '0 / 0';
        const progressBar = document.getElementById('progressBar');
        if (progressBar) progressBar.style.width = '0%';
        this.updateSaveIcon();
    },

    check() {
        const input = document.getElementById('answerInput');
        if (!input) return;
        const val = input.value.trim().toLowerCase();

        if (!this.deckIds.length) return;

        const currentId = this.deckIds[this.currentIndex];
        const card = this.allData[currentId];
        if (!card) return;

        const isCorrect = val !== '' && val === (card.word || '').toLowerCase();

        input.disabled = true;
        const btnSkip = document.getElementById('btnSkip');
        if (btnSkip) btnSkip.style.display = 'none';
        const btnNext = document.getElementById('btnNext');
        if (btnNext) btnNext.style.display = 'block';

        const fb = document.getElementById('feedbackArea');
        if (fb) {
            fb.style.display = 'block';
            fb.style.borderColor = isCorrect ? 'var(--correct-color)' : 'var(--wrong-color)';
        }

        const fbWord = document.getElementById('fbWord');
        const fbExEn = document.getElementById('fbExEn');
        const fbExZh = document.getElementById('fbExZh');
        if (fbWord) fbWord.innerText = card.word || '';
        if (fbExEn) fbExEn.innerText = card.example_en || '';
        if (fbExZh) fbExZh.innerText = card.example_ch || '';

        this.speak();

        if (!isCorrect) {
            if (input) {
                input.classList.add('shake');
                setTimeout(() => input.classList.remove('shake'), 400);
            }

            this.deckIds.splice(this.currentIndex, 1);
            const remainingCount = Math.max(0, this.deckIds.length - this.currentIndex);
            const insertOffset = Math.floor(Math.random() * (remainingCount + 1));
            this.deckIds.splice(this.currentIndex + insertOffset, 0, currentId);

            if (this.currentIndex >= this.deckIds.length) {
                this.currentIndex = Math.max(0, this.deckIds.length - 1);
            }
        }

        this.saveSession();
    },

    skip() {
        if (!this.deckIds.length) return;
        const id = this.deckIds.splice(this.currentIndex, 1)[0];
        const remainingCount = Math.max(0, this.deckIds.length - this.currentIndex);
        const insertOffset = Math.floor(Math.random() * (remainingCount + 1));
        this.deckIds.splice(this.currentIndex + insertOffset, 0, id);

        if (this.currentIndex >= this.deckIds.length) {
            this.currentIndex = Math.max(0, this.deckIds.length - 1);
        }

        this.saveSession();
        this.renderCard();
    },

    next() {
        if (!this.deckIds.length) {
            this.renderEmpty();
            return;
        }
        this.currentIndex++;
        if (this.currentIndex >= this.deckIds.length) {
            this.currentIndex = 0;
        }
        this.saveSession();
        this.renderCard();
    },

    updateProgress() {
        const total = this.displayTotal || 0;
        const current = total ? Math.min(this.currentIndex + 1, total) : 0;
        const percent = total ? (current / total) * 100 : 0;

        const textEl = document.getElementById('progressText');
        if (textEl) textEl.innerText = `${current} / ${total}`;
        const bar = document.getElementById('progressBar');
        if (bar) bar.style.width = `${percent}%`;
    },

    setMode(m) {
        if (this.mode === m) return;
        this.mode = m;
        DB.set('mode', m);

        const modeAll = document.getElementById('modeAll');
        const modeSaved = document.getElementById('modeSaved');
        if (modeAll) modeAll.classList.toggle('active', m === 'all');
        if (modeSaved) modeSaved.classList.toggle('active', m === 'saved');

        this.loadSession();
    },

    toggleSave() {
        if (!this.deckIds.length) return;

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
            if (this.currentIndex >= this.deckIds.length) {
                this.currentIndex = Math.max(0, this.deckIds.length - 1);
            }
            this.deckIds.length ? this.renderCard() : this.renderEmpty();
            return;
        }
        this.saveSession();
    },

    updateSaveIcon() {
        const icon = document.getElementById('saveIcon');
        if (!icon) return;

        if (!this.deckIds.length) {
            icon.style.fill = 'none';
            icon.style.stroke = 'currentColor';
            return;
        }

        const id = this.deckIds[this.currentIndex];
        const isSaved = this.savedIds.includes(id);

        icon.style.fill = isSaved ? '#ffd700' : 'none';
        icon.style.stroke = isSaved ? '#ffd700' : 'currentColor';
    },

    speak() {
        if (this.currentCardId == null) return;
        if (!('speechSynthesis' in window)) return;
        try {
            window.speechSynthesis.cancel();
            const msg = new SpeechSynthesisUtterance(this.allData[this.currentCardId].word || '');
            msg.lang = 'en-US';
            window.speechSynthesis.speak(msg);
        } catch (e) {
            console.warn('speak error', e);
        }
    },

    shuffle(arr) {
        return [...arr].sort(() => Math.random() - 0.5);
    },

    saveSession() {
        if (this.mode !== 'all') return;
        try {
            DB.set(this.getSessionKey(), {
                deckIds: this.deckIds,
                index: this.currentIndex,
                displayTotal: this.displayTotal
            });
        } catch (e) {
            console.warn('saveSession error', e);
        }
    },

    reset() {
        if (confirm('確定要重置目前進度嗎？')) {
            DB.remove(this.getSessionKey());
            this.buildDeck();
        }
    }
};


window.addEventListener('DOMContentLoaded', () => app.init());
