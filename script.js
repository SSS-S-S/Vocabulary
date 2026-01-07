const DB = {
    prefix: 'vocab_v4_',
    get: (k, d) => { try { return JSON.parse(localStorage.getItem(DB.prefix+k)) || d } catch(e) { return d }},
    set: (k, v) => localStorage.setItem(DB.prefix+k, JSON.stringify(v))
};

const app = {
    allData: [],
    deckIds: [],
    displayTotal: 0, 
    currentIndex: 0,
    
    masteredIds: DB.get('mastered', []),
    savedIds: DB.get('saved', []),
    selectedLevels: DB.get('levels', ['A1', 'A2', 'B1']),
    mode: DB.get('mode', 'all'),

    init() {
        if (typeof wordData === 'undefined') {
            document.getElementById('cardZh').innerText = "找不到 word.js 檔案";
            return;
        }
        this.allData = wordData.map((d, i) => ({ ...d, id: i }));
        
        // 1. 初始化篩選標籤 (這解決了之前的 innerHTML null 錯誤)
        this.renderFilters();
        
        // 2. 恢復 Session (防止重整消失)
        const session = DB.get('session', null);
        if (session && session.deckIds.length > 0) {
            this.deckIds = session.deckIds;
            this.currentIndex = session.index;
            this.displayTotal = session.displayTotal || this.deckIds.length;
            this.renderCard();
        } else {
            this.buildDeck();
        }

        // 3. 綁定 Enter 鍵
        document.getElementById('answerInput').onkeydown = (e) => {
            if (e.key === 'Enter') {
                if (document.getElementById('answerInput').disabled) {
                    this.next();
                } else {
                    this.check();
                }
            }
        };
    },

    renderFilters() {
        const levels = [...new Set(this.allData.map(d => d.level))].sort();
        const container = document.getElementById('levelFilters');
        if (!container) return;
        container.innerHTML = levels.map(l => `
            <div class="filter-chip ${this.selectedLevels.includes(l)?'active':''}" onclick="app.toggleLevel('${l}')">${l}</div>
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

    buildDeck() {
        let pool = this.allData.filter(d => this.selectedLevels.includes(d.level));
        if (this.mode === 'saved') {
            pool = pool.filter(d => this.savedIds.includes(d.id));
        } else {
            pool = pool.filter(d => !this.masteredIds.includes(d.id));
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

        if (this.currentIndex >= this.deckIds.length) {
            quiz.style.display = 'none';
            complete.style.display = 'block';
            this.updateProgress();
            return;
        }

        quiz.style.display = 'block';
        complete.style.display = 'none';

        const card = this.allData[this.deckIds[this.currentIndex]];
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

    check() {
        const input = document.getElementById('answerInput');
        const val = input.value.trim().toLowerCase();
        if (!val) return;

        const card = this.allData[this.deckIds[this.currentIndex]];
        const isCorrect = val === card.word.toLowerCase();

        input.disabled = true;
        document.getElementById('btnSkip').style.display = 'none';
        document.getElementById('btnNext').style.display = 'block';

        const fb = document.getElementById('feedbackArea');
        fb.style.display = 'block';
        fb.style.borderColor = isCorrect ? 'var(--correct-color)' : 'var(--wrong-color)';
        document.getElementById('fbWord').innerText = card.word;
        document.getElementById('fbExEn').innerText = card.example_en;
        document.getElementById('fbExZh').innerText = card.example_ch;

        if (isCorrect) {
            this.speak();
            if (this.mode === 'all' && !this.masteredIds.includes(card.id)) {
                this.masteredIds.push(card.id);
                DB.set('mastered', this.masteredIds);
            }
        } else {
            input.classList.add('shake');
            setTimeout(() => input.classList.remove('shake'), 400);
            this.deckIds.push(card.id); // 答錯移到最後
        }
        this.saveSession();
    },

    skip() {
        const id = this.deckIds[this.currentIndex];
        this.deckIds.push(id); 
        this.currentIndex++;
        this.saveSession();
        this.renderCard();
    },

    next() {
        this.currentIndex++;
        this.saveSession();
        this.renderCard();
    },

    updateProgress() {
        const total = this.displayTotal;
        const current = total === 0 ? 0 : Math.min(this.currentIndex + 1, total);
        const percent = total === 0 ? 0 : (this.currentIndex / total) * 100;
        
        document.getElementById('progressText').innerText = `${current} / ${total}`;
        document.getElementById('progressBar').style.width = `${Math.min(percent, 100)}%`;
    },

    setMode(m) {
        this.mode = m;
        DB.set('mode', m);
        document.getElementById('modeAll').classList.toggle('active', m==='all');
        document.getElementById('modeSaved').classList.toggle('active', m==='saved');
        this.buildDeck();
    },

    toggleSave() {
        const id = this.deckIds[this.currentIndex];
        if (this.savedIds.includes(id)) this.savedIds = this.savedIds.filter(x => x!==id);
        else this.savedIds.push(id);
        DB.set('saved', this.savedIds);
        this.updateSaveIcon();
    },

    updateSaveIcon() {
        const id = this.deckIds[this.currentIndex];
        const icon = document.getElementById('saveIcon');
        if (this.savedIds.includes(id)) {
            icon.style.fill = '#ffd700';
            icon.style.stroke = '#ffd700';
        } else {
            icon.style.fill = 'none';
            icon.style.stroke = 'currentColor';
        }
    },

    speak() {
        const id = this.deckIds[this.currentIndex];
        if (id === undefined) return;
        const word = this.allData[id].word;
        const msg = new SpeechSynthesisUtterance(word);
        msg.lang = 'en-US';
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(msg);
    },

    shuffle: (arr) => arr.sort(() => Math.random() - 0.5),
    saveSession() { DB.set('session', { deckIds: this.deckIds, index: this.currentIndex, displayTotal: this.displayTotal }); },
    
    // 修正：這對應 HTML 的 app.reset()
    reset() {
        if (confirm("確定要重置進度嗎？這會清除所有『已學會』的標記。")) {
            this.masteredIds = [];
            DB.set('mastered', []);
            localStorage.removeItem(DB.prefix + 'session');
            this.buildDeck();
        }
    }
};

window.onload = () => app.init();