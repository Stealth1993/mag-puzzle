#!/usr/bin/env node
/*
 * Validate puzzle.json before publishing.
 *
 *   node tools/validate-puzzle.js [puzzle.json] [--answers Miscc/<Month>/answers.json]
 *
 * Checks: required fields, every word inside the grid, clue numbers consistent
 * with start cells, no duplicate number+direction. With --answers (a private,
 * git-ignored file such as {"5A": "BACKHAUL", "1D": "WHITEFIELD"}) it also
 * verifies answer lengths and that every crossing letter agrees.
 * Exit code 1 on any error.
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const ansIdx = args.indexOf('--answers');
const answersPath = ansIdx !== -1 ? args[ansIdx + 1] : null;
const puzzlePath = args.find((a, i) => !a.startsWith('--') && i !== ansIdx + 1) || 'puzzle.json';

const errors = [];
const warn = [];
const p = JSON.parse(fs.readFileSync(puzzlePath, 'utf8'));

for (const k of ['id', 'title', 'edition', 'submitEmail', 'gridSize', 'words']) {
  if (p[k] === undefined) errors.push(`Missing top-level field "${k}"`);
}
const { rows, cols } = p.gridSize || {};
const starts = {};   // "r-c" -> number
const seen = new Set();
const cells = {};    // "r-c" -> [{key, i}]

(p.words || []).forEach((w, idx) => {
  const key = `${w.number}${w.direction === 'across' ? 'A' : 'D'}`;
  const where = `word #${idx} (${key})`;
  if (!['across', 'down'].includes(w.direction)) errors.push(`${where}: bad direction "${w.direction}"`);
  for (const f of ['number', 'row', 'col', 'length']) {
    if (!Number.isInteger(w[f])) errors.push(`${where}: "${f}" must be an integer`);
  }
  if (!w.clue || !w.clue.trim()) errors.push(`${where}: empty clue`);
  if (seen.has(key)) errors.push(`${where}: duplicate ${key}`);
  seen.add(key);

  const endR = w.direction === 'down' ? w.row + w.length - 1 : w.row;
  const endC = w.direction === 'across' ? w.col + w.length - 1 : w.col;
  if (w.row < 0 || w.col < 0 || endR >= rows || endC >= cols) {
    errors.push(`${where}: runs outside the ${rows}x${cols} grid (ends at row ${endR}, col ${endC})`);
  }

  const s = `${w.row}-${w.col}`;
  if (starts[s] !== undefined && starts[s] !== w.number) {
    errors.push(`${where}: start cell ${s} already numbered ${starts[s]}`);
  }
  starts[s] = w.number;

  for (let i = 0; i < w.length; i++) {
    const r = w.direction === 'down' ? w.row + i : w.row;
    const c = w.direction === 'across' ? w.col + i : w.col;
    (cells[`${r}-${c}`] ||= []).push({ key, i });
  }
});

const numByValue = {};
for (const [cell, n] of Object.entries(starts)) {
  if (numByValue[n] && numByValue[n] !== cell) errors.push(`Number ${n} used for two different start cells (${numByValue[n]}, ${cell})`);
  numByValue[n] = cell;
}

if (answersPath) {
  const answers = JSON.parse(fs.readFileSync(answersPath, 'utf8'));
  for (const w of p.words) {
    const key = `${w.number}${w.direction === 'across' ? 'A' : 'D'}`;
    const a = (answers[key] || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!a) { warn.push(`No answer for ${key}`); continue; }
    if (a.length !== w.length) errors.push(`${key}: answer "${a}" is ${a.length} letters, puzzle says ${w.length}`);
    answers[key] = a;
  }
  for (const [cell, uses] of Object.entries(cells)) {
    if (uses.length < 2) continue;
    const letters = uses.map(u => (answers[u.key] || '')[u.i]).filter(Boolean);
    if (new Set(letters).size > 1) {
      errors.push(`Crossing at ${cell} disagrees: ` + uses.map(u => `${u.key}[${u.i}]=${(answers[u.key] || '?')[u.i]}`).join(', '));
    }
  }
}

const crossings = Object.values(cells).filter(u => u.length > 1).length;
console.log(`${path.basename(puzzlePath)}: "${p.title}" (${p.edition}), ${rows}x${cols}, ` +
  `${p.words.filter(w => w.direction === 'across').length} across / ${p.words.filter(w => w.direction === 'down').length} down, ` +
  `${Object.keys(cells).length} cells, ${crossings} crossings`);
warn.forEach(m => console.warn('WARN  ' + m));
errors.forEach(m => console.error('ERROR ' + m));
if (errors.length) process.exit(1);
console.log('OK');
