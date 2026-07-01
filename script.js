let puzzleData = null;
const STORAGE_KEY = 'magazine_crossword_save';

let undoStack = [];
let redoStack = [];
let currentGridSnapshot = {};

let wordMappings = {};
let currentDir = 'across';
let currentWordCoords = [];
let activeCoord = null;

async function init() {
    const res = await fetch('puzzle.json');
    puzzleData = await res.json();

    document.getElementById('puz-title').innerText = puzzleData.title;
    document.getElementById('puz-subtitle').innerText = puzzleData.subtitle;

    buildGrid();
    buildClues();
    loadProgress();
    
    currentGridSnapshot = takeGridSnapshot();
    checkCompletedClues();
}

function buildGrid() {
    const { rows, cols } = puzzleData.gridSize;
    const wrapper = document.getElementById('grid-wrapper');
    const table = document.createElement('table');
    table.className = 'cw-grid';

    let matrix = Array(rows).fill(null).map(() => Array(cols).fill(null));
    wordMappings = {};

    puzzleData.words.forEach(w => {
        let r = w.row, c = w.col;
        let coords = [];
        
        for (let i = 0; i < w.length; i++) {
            coords.push(`${r}-${c}`);
            
            if (!matrix[r][c]) matrix[r][c] = { number: null };
            if (i === 0) matrix[r][c].number = w.number;

            if (w.direction === 'across') c++;
            else r++;
        }

        coords.forEach(coordStr => {
            if (!wordMappings[coordStr]) wordMappings[coordStr] = {};
            wordMappings[coordStr][w.direction] = coords;
        });
    });

    for (let r = 0; r < rows; r++) {
        const tr = document.createElement('tr');
        for (let c = 0; c < cols; c++) {
            const td = document.createElement('td');
            const cell = matrix[r][c];

            if (cell) {
                td.className = 'active-cell';
                if (cell.number) {
                    const numSpan = document.createElement('span');
                    numSpan.className = 'cell-num';
                    numSpan.innerText = cell.number;
                    td.appendChild(numSpan);
                }

                const input = document.createElement('input');
                input.setAttribute('maxlength', '1');
                input.setAttribute('data-coord', `${r}-${c}`);
                
                input.addEventListener('focus', handleCellFocus);
                input.addEventListener('click', handleCellClick);
                input.addEventListener('keydown', handleCellKeydown);
                input.addEventListener('input', handleCellInput);

                td.appendChild(input);
            }
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }
    wrapper.appendChild(table);
}

function handleCellFocus(e) {
    const coord = e.target.getAttribute('data-coord');
    const maps = wordMappings[coord];
    if (!maps) return;

    if (!maps[currentDir]) {
        currentDir = maps.across ? 'across' : 'down';
    }
    
    currentWordCoords = maps[currentDir];
    activeCoord = coord;
    applyHighlight();
}

function handleCellClick(e) {
    const coord = e.target.getAttribute('data-coord');
    const maps = wordMappings[coord];
    if (!maps) return;

    if (activeCoord === coord && maps.across && maps.down) {
        currentDir = currentDir === 'across' ? 'down' : 'across';
        currentWordCoords = maps[currentDir];
        applyHighlight();
    }
}

function handleCellInput(e) {
    e.target.value = e.target.value.toUpperCase();
    
    undoStack.push(currentGridSnapshot);
    redoStack = []; 
    currentGridSnapshot = takeGridSnapshot();
    saveProgress();
    checkCompletedClues();
    
    // Auto-hop to next cell
    if (e.target.value) {
        let idx = currentWordCoords.indexOf(activeCoord);
        if (idx !== -1 && idx < currentWordCoords.length - 1) {
            let nextCoord = currentWordCoords[idx + 1];
            let nextInput = document.querySelector(`input[data-coord="${nextCoord}"]`);
            if (nextInput) nextInput.focus();
        }
    }
}

function handleCellKeydown(e) {
    // Backspace delete and reverse-hop
    if (e.key === 'Backspace' && e.target.value === '') {
        e.preventDefault();
        let idx = currentWordCoords.indexOf(activeCoord);
        if (idx > 0) {
            let prevCoord = currentWordCoords[idx - 1];
            let prevInput = document.querySelector(`input[data-coord="${prevCoord}"]`);
            if (prevInput) {
                prevInput.focus();
                prevInput.value = ''; 
                
                undoStack.push(currentGridSnapshot);
                redoStack = [];
                currentGridSnapshot = takeGridSnapshot();
                saveProgress();
                checkCompletedClues();
            }
        }
    }
}

function applyHighlight() {
    document.querySelectorAll('.active-cell').forEach(td => td.classList.remove('highlighted'));
    currentWordCoords.forEach(c => {
        const td = document.querySelector(`input[data-coord="${c}"]`)?.parentElement;
        if (td) td.classList.add('highlighted');
    });
}

function buildClues() {
    const acrossUl = document.getElementById('clues-across');
    const downUl = document.getElementById('clues-down');

    puzzleData.words.forEach(w => {
        const li = document.createElement('li');
        li.id = `clue-${w.number}-${w.direction}`;
        li.innerHTML = `<strong>${w.number}</strong> &nbsp;${w.clue}`;
        if (w.direction === 'across') acrossUl.appendChild(li);
        else downUl.appendChild(li);
    });
}

function checkCompletedClues() {
    puzzleData.words.forEach(w => {
        let r = w.row, c = w.col;
        let isFilled = true;
        
        for (let i = 0; i < w.length; i++) {
            let inp = document.querySelector(`input[data-coord="${r}-${c}"]`);
            if (!inp || !inp.value) {
                isFilled = false;
                break;
            }
            if (w.direction === 'across') c++;
            else r++;
        }
        
        const clueEl = document.getElementById(`clue-${w.number}-${w.direction}`);
        if (clueEl) {
            if (isFilled) clueEl.classList.add('clue-filled');
            else clueEl.classList.remove('clue-filled');
        }
    });
}

function takeGridSnapshot() {
    const snap = {};
    document.querySelectorAll('input[data-coord]').forEach(inp => {
        if(inp.value) snap[inp.getAttribute('data-coord')] = inp.value;
    });
    return snap;
}

function restoreGridSnapshot(snap) {
    document.querySelectorAll('input[data-coord]').forEach(inp => {
        const coord = inp.getAttribute('data-coord');
        inp.value = snap[coord] || '';
    });
    currentGridSnapshot = takeGridSnapshot();
    saveProgress();
    checkCompletedClues();
}

function triggerUndo() {
    if (undoStack.length === 0) return;
    redoStack.push(currentGridSnapshot);
    restoreGridSnapshot(undoStack.pop());
}

function triggerRedo() {
    if (redoStack.length === 0) return;
    undoStack.push(currentGridSnapshot);
    restoreGridSnapshot(redoStack.pop());
}

function saveProgress() {
    const state = { info: {}, grid: currentGridSnapshot };
    ['emp-name', 'emp-id', 'emp-email', 'emp-mobile'].forEach(id => {
        state.info[id] = document.getElementById(id).value;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadProgress() {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved) return;

    if (saved.info) {
        Object.keys(saved.info).forEach(id => {
            const el = document.getElementById(id);
            if(el) el.value = saved.info[id];
        });
    }
    if (saved.grid) restoreGridSnapshot(saved.grid);
}

function resetPuzzle() {
    if(confirm("Are you sure you want to clear the entire puzzle grid?")) {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
    }
}

function validateAndSubmit() {
    const name = document.getElementById('emp-name').value.trim();
    const id = document.getElementById('emp-id').value.trim();
    const email = document.getElementById('emp-email').value.trim();

    if (!name || !id || !email) {
        alert("⚠️ MANDATORY FIELDS MISSING:\n\nPlease fill out your Name, Employee ID, and Email Address before submitting.");
        return;
    }

    const timestampStr = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' });
    document.getElementById('pdf-timestamp').innerText = `Completed & Verified on: ${timestampStr}`;

    executePDFGeneration(id);
}

function executePDFGeneration(empId) {
    document.querySelectorAll('.active-cell').forEach(td => td.classList.remove('highlighted')); // Clear highlights for clean PDF
    document.querySelectorAll('input').forEach(i => i.setAttribute('value', i.value));
    
    const element = document.getElementById('printable-area');
    
    element.classList.add('pdf-mode');

    const opt = {
      margin:       0.3,
      filename:     `Crossword_Submission_${empId}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' },
      pagebreak:    { mode: ['css', 'legacy'] } 
    };

    html2pdf().set(opt).from(element).save().then(() => {
        applyHighlight(); 
        element.classList.remove('pdf-mode'); 
        
        setTimeout(() => {
            alert("✔️ PUZZLE SAVED AS PDF!\n\nPlease attach your downloaded PDF file to an email and send it to:\n\n👉  beyondbandwidth@lmjinnovations.com");
        }, 800);
    });
}

window.onload = init;
