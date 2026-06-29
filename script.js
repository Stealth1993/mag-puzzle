let puzzleData = null;
const STORAGE_KEY = 'magazine_crossword_save';

let undoStack = [];
let redoStack = [];
let currentGridSnapshot = {};

async function init() {
    const res = await fetch('puzzle.json');
    puzzleData = await res.json();

    document.getElementById('puz-title').innerText = puzzleData.title;
    document.getElementById('puz-subtitle').innerText = puzzleData.subtitle;

    buildGrid();
    buildClues();
    loadProgress();
    
    currentGridSnapshot = takeGridSnapshot();
}

function buildGrid() {
    const { rows, cols } = puzzleData.gridSize;
    const wrapper = document.getElementById('grid-wrapper');
    const table = document.createElement('table');
    table.className = 'cw-grid';

    let matrix = Array(rows).fill(null).map(() => Array(cols).fill(null));

    puzzleData.words.forEach(w => {
        let r = w.row, c = w.col;
        for (let i = 0; i < w.length; i++) {
            if (!matrix[r][c]) matrix[r][c] = { number: null };
            if (i === 0) matrix[r][c].number = w.number;

            if (w.direction === 'across') c++;
            else r++;
        }
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
                
                input.addEventListener('input', (e) => {
                    e.target.value = e.target.value.toUpperCase();
                    
                    undoStack.push(currentGridSnapshot);
                    redoStack = []; 
                    
                    currentGridSnapshot = takeGridSnapshot();
                    saveProgress();
                });

                td.appendChild(input);
            }
            tr.appendChild(td);
        }
        table.appendChild(tr);
    }
    wrapper.appendChild(table);
}

function buildClues() {
    const acrossUl = document.getElementById('clues-across');
    const downUl = document.getElementById('clues-down');

    puzzleData.words.forEach(w => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${w.number}</strong> &nbsp;${w.clue}`;
        if (w.direction === 'across') acrossUl.appendChild(li);
        else downUl.appendChild(li);
    });
}

/* UNDO / REDO ENGINE */
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
    document.querySelectorAll('input').forEach(i => i.setAttribute('value', i.value));
    const element = document.getElementById('printable-area');

    const opt = {
      margin:       0.25,
      filename:     `Crossword_Submission_${empId}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save().then(() => {
        setTimeout(() => {
            alert("✔️ PUZZLE SAVED AS PDF!\n\nPlease attach your downloaded PDF file to an email and send it to:\n\n👉  beyondbandwidth@lmjinnovations.com");
        }, 800);
    });
}

window.onload = init;
