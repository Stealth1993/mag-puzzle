/* =========================================================
   Beyond Bandwidth · Monthly Crossword
   All puzzle content comes from puzzle.json (see agent.md).
   ========================================================= */
(() => {
    'use strict';

    const PLAYER_KEY = 'bb-crossword:player';
    const LEGACY_KEY = 'magazine_crossword_save';   // pre-Nov-2026 storage
    const PLAYER_FIELDS = { name: 'emp-name', id: 'emp-id', email: 'emp-email', mobile: 'emp-mobile' };
    const $ = (id) => document.getElementById(id);
    const wideQuery = window.matchMedia('(min-width: 1100px)');

    let puzzle = null;
    let gridKey = '';
    let words = [];          // [{ number, direction, clue, length, coords: ['r-c'], key, el }]
    let order = [];          // navigation order: across then down
    let cells = {};          // 'r-c' -> { across, down, input, el, print }
    let grid = {};           // 'r-c' -> 'A'
    let undoStack = [];
    let redoStack = [];
    let dir = 'across';
    let activeCoord = null;
    let pointerCoord = null;

    // ---------------------------------------------------------------- boot
    async function init() {
        try {
            const res = await fetch('puzzle.json', { cache: 'no-cache' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            puzzle = await res.json();
        } catch (err) {
            $('puz-title').textContent = 'Puzzle could not be loaded';
            $('puz-subtitle').textContent = 'Please refresh the page. If this keeps happening, contact the organisers.';
            console.error('Failed to load puzzle.json', err);
            return;
        }

        gridKey = `bb-crossword:grid:${puzzle.id || puzzle.edition || puzzle.title}`;
        renderMeta();
        indexWords();
        buildGrid();
        buildClues();
        loadState();
        bindUI();
        refreshStatus();

        const first = order[0];
        if (first) setActive(first.coords[0], first.direction, { scroll: false });
    }

    function renderMeta() {
        const series = puzzle.series || 'Beyond Bandwidth';
        const edition = puzzle.edition || '';
        $('puz-title').textContent = puzzle.title || 'Crossword';
        $('puz-subtitle').textContent = puzzle.subtitle || '';
        $('series-label').textContent = series;
        $('appbar-series').textContent = series;
        $('edition-label').textContent = edition || 'Monthly';
        document.title = `${puzzle.title} · ${series}${edition ? ' · ' + edition : ''}`;

        if (puzzle.submitEmail) {
            const a = $('submit-email');
            a.textContent = puzzle.submitEmail;
            a.href = `mailto:${puzzle.submitEmail}?subject=${encodeURIComponent(`${series} crossword entry – ${edition}`)}`;
            $('footer-email').textContent = `Questions? ${puzzle.submitEmail}`;
        }
    }

    function indexWords() {
        const { rows, cols } = puzzle.gridSize;
        words = [];
        cells = {};
        puzzle.words.forEach((w) => {
            const coords = [];
            for (let i = 0; i < w.length; i++) {
                const r = w.direction === 'down' ? w.row + i : w.row;
                const c = w.direction === 'across' ? w.col + i : w.col;
                if (r < 0 || c < 0 || r >= rows || c >= cols) {
                    console.error(`Clue ${w.number} ${w.direction} runs outside the grid – check puzzle.json`);
                    return;
                }
                coords.push(`${r}-${c}`);
            }
            const word = { ...w, coords, key: `${w.number}-${w.direction}` };
            words.push(word);
            coords.forEach((k, i) => {
                cells[k] ||= {};
                cells[k][w.direction] = word;
                if (i === 0) cells[k].number = w.number;
            });
        });
        const byNum = (a, b) => a.number - b.number;
        order = [
            ...words.filter(w => w.direction === 'across').sort(byNum),
            ...words.filter(w => w.direction === 'down').sort(byNum),
        ];
    }

    // ---------------------------------------------------------------- grid
    function buildGrid() {
        const { rows, cols } = puzzle.gridSize;
        const board = $('grid-wrapper');
        board.style.setProperty('--cols', cols);
        board.style.setProperty('--rows', rows);
        board.innerHTML = '';
        const frag = document.createDocumentFragment();

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const k = `${r}-${c}`;
                const div = document.createElement('div');
                const info = cells[k];
                if (!info) {
                    div.className = 'cell block';
                    frag.appendChild(div);
                    continue;
                }
                div.className = 'cell tile';
                div.setAttribute('role', 'gridcell');

                if (info.number) {
                    const n = document.createElement('span');
                    n.className = 'cell-num';
                    n.textContent = info.number;
                    div.appendChild(n);
                }
                const print = document.createElement('span');
                print.className = 'cell-print';
                print.setAttribute('aria-hidden', 'true');

                const input = document.createElement('input');
                input.type = 'text';
                input.dataset.coord = k;
                input.setAttribute('aria-label', cellLabel(info, r, c));
                input.setAttribute('autocomplete', 'off');
                input.setAttribute('autocorrect', 'off');
                input.setAttribute('autocapitalize', 'characters');
                input.setAttribute('spellcheck', 'false');
                input.setAttribute('enterkeyhint', 'next');
                input.addEventListener('pointerdown', () => { pointerCoord = activeCoord; });
                input.addEventListener('focus', onCellFocus);
                input.addEventListener('click', onCellClick);
                input.addEventListener('keydown', onCellKeydown);
                input.addEventListener('input', onCellInput);

                div.append(print, input);
                info.el = div;
                info.input = input;
                info.print = print;
                frag.appendChild(div);
            }
        }
        board.appendChild(frag);
    }

    function cellLabel(info, r, c) {
        const parts = [];
        if (info.across) parts.push(`${info.across.number} across`);
        if (info.down) parts.push(`${info.down.number} down`);
        return `Row ${r + 1}, column ${c + 1}: ${parts.join(', ')}`;
    }

    function onCellFocus(e) {
        const k = e.target.dataset.coord;
        if (k !== activeCoord) setActive(k);
        requestAnimationFrame(() => e.target.select());
    }

    function onCellClick(e) {
        const k = e.target.dataset.coord;
        if (pointerCoord === k) toggleDir();
        pointerCoord = null;
    }

    function onCellKeydown(e) {
        const k = e.target.dataset.coord;
        const mod = e.ctrlKey || e.metaKey;

        if (mod && !e.altKey) {
            const key = e.key.toLowerCase();
            if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
            else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
            return;
        }
        if (e.altKey) return;

        switch (e.key) {
            case 'ArrowRight': e.preventDefault(); move(k, 0, 1); return;
            case 'ArrowLeft':  e.preventDefault(); move(k, 0, -1); return;
            case 'ArrowDown':  e.preventDefault(); move(k, 1, 0); return;
            case 'ArrowUp':    e.preventDefault(); move(k, -1, 0); return;
            case ' ':          e.preventDefault(); toggleDir(); return;
            case 'Tab':        e.preventDefault(); jumpClue(e.shiftKey ? -1 : 1); return;
            case 'Enter':      e.preventDefault(); jumpClue(e.shiftKey ? -1 : 1); return;
            case 'Delete':     e.preventDefault(); setLetters({ [k]: '' }); return;
            case 'Backspace':  e.preventDefault(); backspace(k); return;
        }
        if (/^[a-z0-9]$/i.test(e.key)) {
            e.preventDefault();
            typeLetter(e.key);
        }
    }

    // Mobile keyboards often report key "Unidentified"; fall back to the input event.
    function onCellInput(e) {
        const input = e.target;
        const k = input.dataset.coord;
        const prev = grid[k] || '';
        const v = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!v) { input.value = prev; if (e.inputType && e.inputType.startsWith('delete')) setLetters({ [k]: '' }); return; }
        let ch = v.slice(-1);
        if (v.length > 1 && prev) ch = v.startsWith(prev) ? v.slice(prev.length).slice(-1) || prev : v[0];
        typeLetter(ch);
    }

    function typeLetter(ch) {
        if (!activeCoord) return;
        setLetters({ [activeCoord]: ch.toUpperCase() });
        const w = currentWord();
        const i = w.coords.indexOf(activeCoord);
        if (i < w.coords.length - 1) focusCell(w.coords[i + 1]);
        else cells[activeCoord].input.select();
    }

    function backspace(k) {
        if (grid[k]) { setLetters({ [k]: '' }); return; }
        const w = currentWord();
        const i = w.coords.indexOf(k);
        if (i > 0) {
            const prev = w.coords[i - 1];
            focusCell(prev);
            setLetters({ [prev]: '' });
        }
    }

    function move(k, dr, dc) {
        const want = dc ? 'across' : 'down';
        if (dir !== want && cells[k][want]) { setActive(k, want); return; }
        const { rows, cols } = puzzle.gridSize;
        let [r, c] = k.split('-').map(Number);
        while (true) {
            r += dr; c += dc;
            if (r < 0 || c < 0 || r >= rows || c >= cols) return;
            const n = `${r}-${c}`;
            if (cells[n]) {
                if (cells[n][want]) dir = want;
                focusCell(n);
                return;
            }
        }
    }

    function focusCell(k) {
        setActive(k);
        const input = cells[k].input;
        if (document.activeElement !== input) input.focus({ preventScroll: wideQuery.matches });
        // Desktop: bring the square into view (respects scroll-padding for the sticky bars)
        if (wideQuery.matches) cells[k].el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    function toggleDir() {
        if (!activeCoord) return;
        const other = dir === 'across' ? 'down' : 'across';
        if (cells[activeCoord][other]) setActive(activeCoord, other);
    }

    function jumpClue(step) {
        const w = currentWord();
        const i = w ? order.indexOf(w) : -1;
        const next = order[(i + step + order.length) % order.length];
        startWord(next);
    }

    function startWord(w) {
        const target = w.coords.find(k => !grid[k]) || w.coords[0];
        dir = w.direction;
        focusCell(target);
    }

    // ---------------------------------------------------------------- highlight
    function currentWord() {
        return activeCoord ? cells[activeCoord][dir] : null;
    }

    function setActive(k, wantDir, { scroll = true } = {}) {
        const info = cells[k];
        if (!info) return;
        if (wantDir && info[wantDir]) dir = wantDir;
        else if (!info[dir]) dir = info.across ? 'across' : 'down';
        activeCoord = k;

        const word = info[dir];
        const cross = info[dir === 'across' ? 'down' : 'across'];

        document.querySelectorAll('.cell.tile').forEach(el => el.classList.remove('word', 'cross', 'active'));
        if (cross) cross.coords.forEach(c => cells[c].el.classList.add('cross'));
        word.coords.forEach(c => { cells[c].el.classList.remove('cross'); cells[c].el.classList.add('word'); });
        info.el.classList.add('active');

        words.forEach(w => w.el.classList.toggle('active', w === word));
        words.forEach(w => w.el.classList.toggle('cross', w === cross));

        $('clue-bar-tag').textContent = `${word.number} ${word.direction === 'across' ? 'ACROSS' : 'DOWN'}`;
        $('clue-bar-text').textContent = `${word.clue} (${word.length})`;

        if (scroll) {
            keepCellInView(info.el);
            if (wideQuery.matches) keepClueInView(word.el);
        }
    }

    // Scroll only the side clue panel (not the page) so the active clue stays visible.
    function keepClueInView(el) {
        const panel = el.closest('.clues-column');
        if (!panel || panel.scrollHeight <= panel.clientHeight) return;
        const p = panel.getBoundingClientRect(), r = el.getBoundingClientRect();
        if (r.top < p.top + 8) panel.scrollTop += r.top - p.top - 8;
        else if (r.bottom > p.bottom - 8) panel.scrollTop += r.bottom - p.bottom + 8;
    }

    function keepCellInView(el) {
        const sc = $('board-scroller');
        if (sc.scrollWidth <= sc.clientWidth + 1) return;
        const pad = 24;
        const l = el.offsetLeft, r = l + el.offsetWidth;
        if (l - pad < sc.scrollLeft) sc.scrollLeft = l - pad;
        else if (r + pad > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = r + pad - sc.clientWidth;
    }

    // ---------------------------------------------------------------- clues
    function buildClues() {
        const lists = { across: $('clues-across'), down: $('clues-down') };
        Object.values(lists).forEach(ul => { ul.innerHTML = ''; });
        order.forEach(w => {
            const li = document.createElement('li');
            li.className = 'clue';
            li.tabIndex = 0;
            li.id = `clue-${w.key}`;
            const num = document.createElement('span');
            num.className = 'clue-num';
            num.textContent = w.number;
            const text = document.createElement('span');
            text.className = 'clue-text';
            text.textContent = w.clue + ' ';
            const len = document.createElement('span');
            len.className = 'clue-len';
            len.textContent = `(${w.length})`;
            text.appendChild(len);
            li.append(num, text);
            // Don't let a mouse press focus the <li>: focusing it scrolls the clue panel, which can
            // shift the list under the pointer so the click lands on the wrong clue.
            li.addEventListener('mousedown', e => e.preventDefault());
            li.addEventListener('click', () => startWord(w));
            li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startWord(w); } });
            w.el = li;
            lists[w.direction].appendChild(li);
        });
    }

    // ---------------------------------------------------------------- state
    function setLetters(changes, { record = true } = {}) {
        const changed = Object.entries(changes).some(([k, v]) => (grid[k] || '') !== v);
        if (!changed) return;
        if (record) { undoStack.push({ ...grid }); redoStack = []; if (undoStack.length > 300) undoStack.shift(); }
        Object.entries(changes).forEach(([k, v]) => { if (v) grid[k] = v; else delete grid[k]; });
        paint();
        saveGrid();
        refreshStatus();
    }

    function replaceGrid(next) {
        grid = { ...next };
        paint();
        saveGrid();
        refreshStatus();
    }

    function paint() {
        Object.entries(cells).forEach(([k, info]) => {
            const v = grid[k] || '';
            if (info.input.value !== v) info.input.value = v;
            info.print.textContent = v;
        });
    }

    function undo() {
        if (!undoStack.length) return;
        redoStack.push({ ...grid });
        replaceGrid(undoStack.pop());
    }

    function redo() {
        if (!redoStack.length) return;
        undoStack.push({ ...grid });
        replaceGrid(redoStack.pop());
    }

    function refreshStatus() {
        let done = 0;
        const count = { across: [0, 0], down: [0, 0] };
        words.forEach(w => {
            const filled = w.coords.every(k => grid[k]);
            w.el.classList.toggle('filled', filled);
            count[w.direction][1]++;
            if (filled) { done++; count[w.direction][0]++; }
        });
        $('progress-text').textContent = `${done} / ${words.length}`;
        $('progress-ring').style.setProperty('--p', words.length ? Math.round(done / words.length * 100) : 0);
        $('across-count').textContent = `${count.across[0]}/${count.across[1]}`;
        $('down-count').textContent = `${count.down[0]}/${count.down[1]}`;
        $('undo-btn').disabled = !undoStack.length;
        $('redo-btn').disabled = !redoStack.length;
    }

    function store(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); flashSaved(); }
        catch (err) { console.warn('Could not save progress', err); }
    }

    function read(key) {
        try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
    }

    function saveGrid() { store(gridKey, { grid, savedAt: new Date().toISOString() }); }

    function savePlayer() {
        const info = {};
        Object.entries(PLAYER_FIELDS).forEach(([name, id]) => { info[name] = $(id).value; });
        store(PLAYER_KEY, info);
    }

    function loadState() {
        let player = read(PLAYER_KEY);
        if (!player) {
            // Carry details over from the old single-key storage, but never its grid
            // (it belongs to a previous month's layout).
            const legacy = read(LEGACY_KEY);
            if (legacy && legacy.info) {
                player = {};
                Object.entries(PLAYER_FIELDS).forEach(([name, id]) => { player[name] = legacy.info[id] || ''; });
            }
        }
        if (player) Object.entries(PLAYER_FIELDS).forEach(([name, id]) => { $(id).value = player[name] || ''; });

        const saved = read(gridKey);
        if (saved && saved.grid) {
            // Ignore anything that doesn't fit this month's grid.
            Object.entries(saved.grid).forEach(([k, v]) => { if (cells[k] && /^[A-Z0-9]$/.test(v)) grid[k] = v; });
        }
        paint();
    }

    let saveTimer;
    function flashSaved() {
        const b = $('save-badge');
        b.textContent = 'Saved';
        b.classList.add('flash');
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => b.classList.remove('flash'), 900);
    }

    // ---------------------------------------------------------------- UI
    function bindUI() {
        // Keep the on-screen keyboard open when tapping grid helpers.
        ['prev-clue', 'next-clue', 'clue-bar-body', 'undo-btn', 'redo-btn', 'dir-btn', 'clear-word-btn'].forEach(id => {
            $(id).addEventListener('pointerdown', e => { if (activeCoord && document.activeElement?.dataset.coord) e.preventDefault(); });
        });
        $('prev-clue').addEventListener('click', () => jumpClue(-1));
        $('next-clue').addEventListener('click', () => jumpClue(1));
        $('clue-bar-body').addEventListener('click', () => { toggleDir(); refocus(); });
        $('dir-btn').addEventListener('click', () => { toggleDir(); refocus(); });
        $('undo-btn').addEventListener('click', undo);
        $('redo-btn').addEventListener('click', redo);
        $('clear-word-btn').addEventListener('click', () => {
            const w = currentWord();
            if (!w) return;
            setLetters(Object.fromEntries(w.coords.map(k => [k, ''])));
            focusCell(w.coords[0]);
        });
        $('reset-btn').addEventListener('click', () => {
            if (!Object.keys(grid).length) return;
            if (!confirm('Clear every letter in the grid? Your details are kept, and you can still Undo.')) return;
            undoStack.push({ ...grid }); redoStack = [];
            replaceGrid({});
            toast('Grid cleared. Use Undo to bring it back.');
        });
        $('zoom-btn').addEventListener('click', () => {
            const on = $('grid-wrapper').classList.toggle('zoomed');
            $('zoom-btn').setAttribute('aria-pressed', String(on));
            if (activeCoord) keepCellInView(cells[activeCoord].el);
        });
        Object.values(PLAYER_FIELDS).forEach(id => {
            $(id).addEventListener('input', () => { $(id).classList.remove('invalid'); savePlayer(); });
        });
        $('submit-btn').addEventListener('click', submit);
    }

    function refocus() {
        if (activeCoord) cells[activeCoord].input.focus({ preventScroll: true });
    }

    let toastTimer;
    function toast(msg, type = '', ms = 3500) {
        const t = $('toast');
        t.textContent = msg;
        t.className = `toast ${type}`;
        t.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { t.hidden = true; }, ms);
    }

    // ---------------------------------------------------------------- submit
    function submit() {
        const missing = [];
        ['emp-name', 'emp-id', 'emp-email'].forEach(id => {
            const el = $(id);
            el.value = el.value.trim();
            const bad = !el.value || (id === 'emp-email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value));
            el.classList.toggle('invalid', bad);
            if (bad) missing.push(el);
        });
        if (missing.length) {
            missing[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
            missing[0].focus({ preventScroll: true });
            toast('Please enter your name, employee ID and a valid email before submitting.', 'error', 5000);
            return;
        }

        const done = words.filter(w => w.coords.every(k => grid[k])).length;
        if (done < words.length &&
            !confirm(`You've filled ${done} of ${words.length} clues. Submit anyway?`)) return;

        if (typeof window.html2pdf !== 'function') {
            toast('The PDF tool is still loading. Please try again in a moment.', 'error');
            return;
        }
        exportPdf($('emp-id').value);
    }

    // Draw the grid ourselves (white squares, dark letters) so the PDF never depends on
    // how html2canvas renders inputs, highlights or container-query units.
    function renderGridImage(widthPx = 560, ratio = 3) {
        const { rows, cols } = puzzle.gridSize;
        const size = widthPx / cols;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(widthPx * ratio);
        canvas.height = Math.round(size * rows * ratio);
        const ctx = canvas.getContext('2d');
        ctx.scale(ratio, ratio);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, widthPx, size * rows);
        const font = '"Segoe UI", Roboto, Arial, sans-serif';
        const pad = Math.max(1, size * 0.06);

        Object.entries(cells).forEach(([k, info]) => {
            const [r, c] = k.split('-').map(Number);
            const x = c * size + pad, y = r * size + pad, s = size - pad * 2;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x, y, s, s, s * 0.16); else ctx.rect(x, y, s, s);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.lineWidth = Math.max(1, size * 0.05);
            ctx.strokeStyle = '#2a1b6b';
            ctx.stroke();
            if (info.number) {
                ctx.fillStyle = '#c2185b';
                ctx.font = `700 ${Math.round(size * 0.27)}px ${font}`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.fillText(String(info.number), x + s * 0.08, y + s * 0.05);
            }
            const letter = grid[k];
            if (letter) {
                ctx.fillStyle = '#111111';
                ctx.font = `800 ${Math.round(size * 0.56)}px ${font}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(letter, x + s / 2, y + s * 0.58);
            }
        });
        return canvas.toDataURL('image/png');
    }

    // Build a detached, static copy of the page for the PDF. The live page is never
    // modified, so nothing jumps or widens on screen (important on phones).
    async function buildPrintSheet() {
        const sheet = $('printable-area').cloneNode(true);
        sheet.classList.add('pdf-mode');
        sheet.querySelectorAll('.no-pdf, .no-print').forEach(n => n.remove());

        sheet.querySelectorAll('.field input').forEach(inp => {
            const div = document.createElement('div');
            div.className = 'field-value';
            div.textContent = $(inp.id).value.trim() || '—';
            inp.replaceWith(div);
        });

        const img = new Image();
        img.alt = 'Crossword grid';
        img.src = renderGridImage();
        await img.decode().catch(() => {});
        const board = document.createElement('div');
        board.className = 'pdf-board';
        board.appendChild(img);
        sheet.querySelector('.board-scroller').replaceWith(board);

        const stamp = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' });
        sheet.querySelector('.pdf-stamp').textContent = `Submitted on ${stamp}`;
        return sheet;
    }

    async function exportPdf(empId) {
        const overlay = $('pdf-overlay');
        overlay.hidden = false;
        const safe = (s) => String(s).replace(/[^\w-]+/g, '_');
        const opt = {
            margin: [0.3, 0.3, 0.3, 0.3],
            filename: `Crossword_${safe(puzzle.edition || puzzle.id || '')}_${safe(empId)}.pdf`,
            image: { type: 'jpeg', quality: 0.96 },
            html2canvas: { scale: 2, useCORS: true, scrollX: 0, scrollY: 0 },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'], avoid: '.clue' },
        };
        try {
            const sheet = await buildPrintSheet();
            await window.html2pdf().set(opt).from(sheet).save();
            toast(`PDF downloaded. Please email it to ${puzzle.submitEmail || 'the organisers'}.`, 'success', 9000);
        } catch (err) {
            console.error(err);
            toast('Sorry, the PDF could not be created. Please try again.', 'error', 6000);
        } finally {
            overlay.hidden = true;
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
