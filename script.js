let puzzleData = null;
const STORAGE_KEY = 'magazine_crossword_save';

async function init() {
    const res = await fetch('puzzle.json');
    puzzleData = await res.json();

    document.getElementById('puz-title').innerText = puzzleData.title;
    document.getElementById('puz-subtitle').innerText = puzzleData.subtitle;

    buildGrid();
    buildClues();
    loadProgress();
}

function buildGrid() {
    const { rows, cols } = puzzleData.gridSize;
    const wrapper = document.getElementById('grid-wrapper');
    const table = document.createElement('table');
    table.className = 'cw-grid';

    // 1. Create blank virtual matrix
    let matrix = Array(rows).fill(null).map(() => Array(cols).fill(null));

    // 2. Plot words onto matrix
    puzzleData.words.forEach(w => {
        let r = w.row, c = w.col;
        for (let i = 0; i < w.length; i++) {
            if (!matrix[r][c]) matrix[r][c] = { isWriteable: true, number: null };
            if (i === 0) matrix[r][c].number = w.number; // Assign clue number to first cell

            if (w.direction === 'across') c++;
            else r++;
        }
    });

    // 3. Render HTML Table
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
                    handleInput(e, r, c, rows, cols);
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
        li.innerHTML = `<strong>${w.number}.</strong> ${w.clue}`;
        if (w.direction === 'across') acrossUl.appendChild(li);
        else downUl.appendChild(li);
    });
}

function handleInput(e, r, c) {
    const val = e.target.value.toUpperCase();
    e.target.value = val;
}

function saveProgress() {
    const inputs = document.querySelectorAll('input[data-coord]');
    const state = { info: {}, grid: {} };

    // Save user details
    ['emp-name', 'emp-id', 'emp-email', 'emp-mobile'].forEach(id => {
        state.info[id] = document.getElementById(id).value;
    });

    // Save letters
    inputs.forEach(inp => {
        if(inp.value) state.grid[inp.getAttribute('data-coord')] = inp.value;
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

    if (saved.grid) {
        Object.keys(saved.grid).forEach(coord => {
            const inp = document.querySelector(`input[data-coord="${coord}"]`);
            if(inp) inp.value = saved.grid[coord];
        });
    }
}

function resetPuzzle() {
    if(confirm("Are you sure you want to clear your puzzle?")) {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
    }
}

function downloadPDF() {
    // CRITICAL BUG FIX: Force DOM to recognize JS-typed input values before canvas snapshot
    document.querySelectorAll('input').forEach(i => i.setAttribute('value', i.value));

    const element = document.getElementById('printable-area');
    const empId = document.getElementById('emp-id').value || 'Employee';

    const opt = {
      margin:       0.3,
      filename:     `Crossword_Solved_${empId}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
}

window.onload = init;