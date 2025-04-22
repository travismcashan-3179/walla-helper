let selectedCell = null; // Currently selected grid cell.
const rows = 5, cols = 3;
const tableBody = document.querySelector('#wordGrid tbody');
let frequencyData = [];
let verticalSentencesArray = [];
let horizontalSentencesArray = [];

// --- Get Top Variants from CSV Data (unused; variants removed) ---
function getTopVariants(pos, currentLemma) {
  let variants = frequencyData
    .filter(entry => entry.POS.toLowerCase() === pos.toLowerCase() && entry.LEMMA.toLowerCase() !== currentLemma.toLowerCase())
    .sort((a, b) => Number(b.FREQUENCY) - Number(a.FREQUENCY))
    .slice(0, 10)
    .map(entry => entry.LEMMA);
  return variants;
}

// --- Helper: Clean a Word for CSV lookup ---
function cleanWord(word) {
  return word.replace(/^[\.,!?;:\(\)]+|[\.,!?;:\(\)]+$/g, "");
}

// --- Load CSV Data using Papa Parse ---
function loadFrequencyData() {
  Papa.parse("wordlist.csv", {
    download: true,
    header: true,
    complete: function(results) {
      frequencyData = results.data;
      console.log("Frequency data loaded:", frequencyData);
      updateWordTypes();
    },
    error: function(err) {
      console.error("Error loading CSV:", err);
    }
  });
}
loadFrequencyData();

// --- Load Word Puzzles from JSON ---
async function loadWordPuzzles() {
  try {
    const response = await fetch('word_puzzles.json');
    if (!response.ok) throw new Error('Failed to load word_puzzles.json');
    const puzzles = await response.json();
    populatePuzzleDropdown(puzzles);
    return puzzles;
  } catch (err) {
    console.error('Error loading word_puzzles.json:', err);
    return [];
  }
}

// --- Populate Puzzle Dropdown ---
function populatePuzzleDropdown(puzzles) {
  const select = document.getElementById('puzzleSelect');
  if (!select) return;
  // Remove old options except the first
  while (select.options.length > 1) select.remove(1);
  puzzles.forEach((puzzle, idx) => {
    const option = document.createElement('option');
    option.value = idx;
    let label = `#${idx + 1} - ${puzzle.title}`;
    if (typeof puzzle.quality === 'number') {
      let color = '';
      if (puzzle.quality < 60) {
        color = 'red';
      } else if (puzzle.quality < 80) {
        color = 'orange';
      } else {
        color = 'green';
      }
      label += ` (<span style=\"color:${color}\">${puzzle.quality}%</span>)`;
    }
    option.innerHTML = label;
    select.appendChild(option);
  });
  select.onchange = async function() {
    if (select.value === "") {
      clearGrid();
      updatePuzzleQualityBadge(puzzles, -1);
      return;
    }
    const selectedIdx = parseInt(select.value);
    const puzzlesData = await fetch('word_puzzles.json').then(r => r.json());
    loadPuzzleToGrid(puzzlesData[selectedIdx]);
    updatePuzzleQualityBadge(puzzlesData, selectedIdx);
  };
  // Set badge for initial selection
  if (select.value !== "") {
    updatePuzzleQualityBadge(puzzles, parseInt(select.value));
  } else {
    updatePuzzleQualityBadge(puzzles, -1);
  }
}

// --- Load Puzzle Words into Grid ---
function loadPuzzleToGrid(puzzle) {
  if (!puzzle || !Array.isArray(puzzle.words)) return;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const word = puzzle.words[idx] || '';
      const input = document.getElementById(`cell-${r}-${c}`);
      if (input) {
        input.value = word;
        localStorage.setItem(input.id, word);
      }
    }
  }
  updateSentences();
  updateInputFontSizes();
}

// Call on page load for now
loadWordPuzzles();

// --- Build Grid Dynamically & Load Saved Values ---
for (let r = 0; r < rows; r++) {
  const tr = document.createElement('tr');
  for (let c = 0; c < cols; c++) {
    const td = document.createElement('td');
    const container = document.createElement('div');
    container.className = "cellContainer";
    const input = document.createElement('input');
    input.type = 'text';
    input.id = `cell-${r}-${c}`;
    input.value = localStorage.getItem(input.id) || '';
    input.addEventListener('input', () => {
      localStorage.setItem(input.id, input.value);
      updateSentences();
    });
    // On double-click, set selected cell and populate details.
    input.addEventListener('dblclick', () => {
      selectedCell = input;
      populateWordDetails(input);
    });
    // --- New: Focus input when container is clicked ---
    container.addEventListener('click', () => {
      input.focus();
    });
    container.appendChild(input);
    let typeDisplay = document.getElementById(`type-${r}-${c}`);
    if (!typeDisplay) {
      typeDisplay = document.createElement('div');
      typeDisplay.className = "wordTypeDisplay";
      typeDisplay.id = `type-${r}-${c}`;
      container.appendChild(typeDisplay);
    }
    td.appendChild(container);
    tr.appendChild(td);
  }
  tableBody.appendChild(tr);
}
attachGridInputListeners();
updateInputFontSizes();

// --- Clear Grid Function ---
function clearGrid() {
  document.querySelectorAll("#wordGrid input").forEach(cell => {
    cell.value = "";
    localStorage.removeItem(cell.id);
  });
  updateSentences();
  updateInputFontSizes();
}

// --- Replace Selected Cell with New Word ---
function replaceSelectedCell(newWord) {
  if (selectedCell) {
    selectedCell.value = newWord;
    localStorage.setItem(selectedCell.id, newWord);
    updateSentences();
    populateWordDetails(selectedCell);
  }
}

// --- Fetch Synonyms using ChatGPT via Proxy ---
async function fetchSynonymsGPT(word) {
  const prompt = `Provide 10 synonyms for the word "${word}" without explanation, separated by commas.`;
  try {
    const response = await fetch("/api/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });
    const data = await response.json();
    if (data.choices && data.choices.length > 0) {
      const result = data.choices[0].message.content;
      return result.split(",").map(s => s.trim()).filter(s => s.length > 0);
    } else {
      return [];
    }
  } catch (err) {
    console.error("Error fetching synonyms with GPT:", err);
    return [];
  }
}

// --- Populate Word Details Panel (without variants) ---
async function populateWordDetails(cell) {
  const rawWord = cell.value.trim();
  const word = cleanWord(rawWord);
  const detailsPanel = document.getElementById("wordDetailsPanel");
  if (!word) {
    detailsPanel.innerHTML = "<strong>Word Details:</strong> No word selected.";
    return;
  }
  let entry = frequencyData.find(entry => entry.LEMMA.toLowerCase() === word.toLowerCase());
  if (!entry) {
    entry = frequencyData.find(entry => {
      if (entry.INFLECTIONS) {
        return entry.INFLECTIONS.toLowerCase().split(/,\s*/).includes(word.toLowerCase());
      }
      return false;
    });
  }
  let pos, frequency, inflections;
  if (entry) {
    switch(entry.POS.toLowerCase()){
      case "v": pos = "verb"; break;
      case "fw": pos = "function word"; break;
      case "n": pos = "noun"; break;
      case "r": pos = "adverb"; break;
      case "j": pos = "adjective"; break;
      case "u": pos = "interjection"; break;
      case "m": pos = "numeral"; break;
      case "k": pos = "proper noun"; break;
      case "abbr": pos = "abbreviation"; break;
      default: pos = entry.POS;
    }
    frequency = entry.FREQUENCY;
    inflections = entry.INFLECTIONS;
  } else {
    pos = "[unknown]";
    frequency = "[unknown]";
    inflections = "[unknown]";
  }
  
  detailsPanel.innerHTML = `<h3><strong>${word}</strong></h3>
<ul style="margin-left:20px;">
  <li><strong>Part of Speech:</strong> ${pos}</li>
  <li><strong>Frequency:</strong> ${frequency}</li>
  <li><strong>Inflections:</strong> ${inflections}</li>
</ul>
<div><strong>Synonyms:</strong> <span id="synonymsPlaceholder">Loading...</span></div>`;
  
  const synonyms = await fetchSynonymsGPT(word);
  let synonymsHTML = "";
  if (synonyms.length > 0) {
    synonymsHTML = synonyms.map(syn => `<span class="tag" ondblclick="replaceSelectedCell('${syn}')">${syn}</span>`).join(" ");
  } else {
    synonymsHTML = "None available";
  }
  document.getElementById("synonymsPlaceholder").innerHTML = synonymsHTML;
}

// --- Analyze Word using OpenAI via Proxy ---
async function analyzeWord(cell) {
  if (!cell) return;
  const rawWord = cell.value.trim();
  const word = cleanWord(rawWord);
  const parts = cell.id.split("-");
  const rowIndex = parseInt(parts[1]);
  const colIndex = parseInt(parts[2]);
  
  function getRowSentence(r) {
    let rowArr = [];
    for (let c = 0; c < cols; c++) {
      rowArr.push(document.getElementById(`cell-${r}-${c}`).value.trim());
    }
    return rowArr.join(" ");
  }
  function getColumnSentence(c) {
    let colArr = [];
    for (let r = 0; r < rows; r++) {
      colArr.push(document.getElementById(`cell-${r}-${c}`).value.trim());
    }
    return colArr.join(" ");
  }
  
  const horizontalSentence = getRowSentence(rowIndex);
  const verticalSentence = getColumnSentence(colIndex);
  
  const prompt = `Analyze the word "${word}" in the following contexts:
Vertical sentence: "${verticalSentence}"
Horizontal sentence: "${horizontalSentence}"
Provide a brief summary of your thoughts about the word in these contexts, then list 3-5 alternative word suggestions under the heading "Alternatives:" to improve both sentences.`;
  
  const analysisDiv = document.getElementById("openaiAnalysis");
  analysisDiv.innerHTML = "<em>Analyzing...</em>";
  
  try {
    const response = await fetch("/api/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });
    const data = await response.json();
    if (data.choices && data.choices.length > 0) {
      analysisDiv.innerHTML = `<strong>OpenAI Analysis:</strong><br>${data.choices[0].message.content.replace(/\n/g, "<br>")}`;
    } else {
      analysisDiv.innerHTML = "<strong>OpenAI Analysis:</strong><br>No response returned.";
    }
  } catch (error) {
    console.error("Error calling OpenAI API:", error);
    analysisDiv.innerHTML = "<strong>OpenAI Analysis:</strong><br>Error calling API.";
  }
}

// --- Grade a Single Sentence using OpenAI via Proxy ---
async function gradeSentence(sentence) {
  const prompt = `Grade the following sentence on a scale of 0 to 100 based on these criteria:
1. Technical grammatical correctness (40% weight)
2. Friendliness and readability (40% weight)
3. Thematic coherence (10% weight)
4. Poetic quality (10% weight)
Provide only the final numeric grade.
Sentence: "${sentence}"`;
  
  try {
    const response = await fetch("/api/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });
    const data = await response.json();
    if (data.choices && data.choices.length > 0) {
      let gradeText = data.choices[0].message.content.trim();
      let grade = parseFloat(gradeText);
      if (isNaN(grade)) {
        const match = gradeText.match(/(\d+(\.\d+)?)/);
        grade = match ? parseFloat(match[1]) : 0;
      }
      return grade;
    }
    return 0;
  } catch (err) {
    console.error("Error grading sentence:", err);
    return 0;
  }
}

// --- Save Puzzle Quality to Server ---
async function savePuzzleQuality(title, quality) {
  try {
    await fetch('/api/update-puzzle-quality', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, quality })
    });
  } catch (err) {
    console.error('Failed to save puzzle quality:', err);
  }
}

// --- Grade All Sentences ---
async function gradeSentences() {
  // Grade Vertical Sentences
  const verticalList = document.querySelector("#verticalSentences ol");
  let grades = [];
  if (verticalList) {
    const items = verticalList.querySelectorAll("li");
    for (const li of items) {
      const originalText = li.dataset.original || li.innerText;
      li.dataset.original = originalText;
      const grade = await gradeSentence(originalText);
      grades.push(grade);
      let color = "";
      if (grade < 60) {
        color = "red";
      } else if (grade < 80) {
        color = "orange";
      }
      li.innerHTML = `<span style="color:${color};">${originalText} (${grade}%)</span>`;
    }
  }
  
  // Grade Horizontal Sentences
  const horizontalList = document.querySelector("#horizontalSentences ol");
  if (horizontalList) {
    const items = horizontalList.querySelectorAll("li");
    for (const li of items) {
      const originalText = li.dataset.original || li.innerText;
      li.dataset.original = originalText;
      const grade = await gradeSentence(originalText);
      grades.push(grade);
      let color = "";
      if (grade < 60) {
        color = "red";
      } else if (grade < 80) {
        color = "orange";
      }
      li.innerHTML = `<span style="color:${color};">${originalText} (${grade}%)</span>`;
    }
  }
  
  // --- Calculate and Save Quality Score ---
  if (grades.length > 0) {
    const avg = Math.round(grades.reduce((a, b) => a + b, 0) / grades.length);
    // Save to server for the selected puzzle
    const select = document.getElementById('puzzleSelect');
    if (select && select.value !== "") {
      const selectedIdx = parseInt(select.value);
      fetch('word_puzzles.json')
        .then(r => r.json())
        .then(puzzles => {
          const puzzle = puzzles[selectedIdx];
          if (puzzle) {
            savePuzzleQuality(puzzle.title, avg).then(() => {
              // Refresh dropdown to show updated score
              loadWordPuzzles();
            });
          }
        });
    }
  }
}

// --- Update All Word Types ---
function updateWordTypes() {
  document.querySelectorAll("#wordGrid input").forEach(cell => {
    updateWordType(cell);
  });
}

// --- Update Word Type for a Cell using CSV Data ---
function updateWordType(cell) {
  let word = cell.value.trim();
  word = cleanWord(word);
  const display = document.getElementById("type-" + cell.id.split("-").slice(1).join("-"));
  if (!word) {
    if(display) display.innerText = "";
    return;
  }
  let entry = frequencyData.find(entry => entry.LEMMA.toLowerCase() === word.toLowerCase());
  if (!entry) {
    entry = frequencyData.find(entry => {
      if (entry.INFLECTIONS) {
        return entry.INFLECTIONS.toLowerCase().split(/,\s*/).includes(word.toLowerCase());
      }
      return false;
    });
  }
  if (entry) {
    let full;
    switch(entry.POS.toLowerCase()){
      case "v": full = "verb"; break;
      case "fw": full = "function word"; break;
      case "n": full = "noun"; break;
      case "r": full = "adverb"; break;
      case "j": full = "adjective"; break;
      case "u": full = "interjection"; break;
      case "m": full = "numeral"; break;
      case "k": full = "proper noun"; break;
      case "abbr": full = "abbreviation"; break;
      default: full = entry.POS;
    }
    display.innerText = `[${full}]`;
  } else {
    display.innerText = "[unknown]";
  }
}

// --- Update Sentences ---
function updateSentences() {
  let grid = [];
  for (let r = 0; r < rows; r++) {
    let rowArr = [];
    for (let c = 0; c < cols; c++) {
      let val = document.getElementById(`cell-${r}-${c}`).value.trim();
      rowArr.push(val);
    }
    grid.push(rowArr);
  }
  
  // Vertical sentences: each column (top-to-bottom), remove punctuation.
  verticalSentencesArray = [];
  for (let c = 0; c < cols; c++) {
    let colWords = [];
    for (let r = 0; r < rows; r++) {
      let word = grid[r][c] || "____";
      word = word.replace(/[\.,!?;:]+/g, "");
      colWords.push(word);
    }
    verticalSentencesArray.push(colWords.join(" "));
  }
  
  // Horizontal sentences: join all cells (preserving punctuation) and split.
  const flatWords = grid.flat().filter(word => word !== "");
  let horizontalText = flatWords.join(" ");
  if (!horizontalText) horizontalText = "____";
  horizontalSentencesArray = splitIntoSentences(horizontalText);
  
  const verticalHTML = "<ol>" + verticalSentencesArray.map(sentence => `<li>${sentence}</li>`).join("") + "</ol>";
  const horizontalHTML = "<ol>" + horizontalSentencesArray.map(sentence => `<li>${sentence}</li>`).join("") + "</ol>";
  
  document.getElementById("verticalSentences").innerHTML = verticalHTML;
  document.getElementById("horizontalSentences").innerHTML = horizontalHTML;
  
  updateWordTypes();
}

// --- Split Text into Sentences Based on Punctuation (. ? !)
function splitIntoSentences(text) {
  text = text.trim();
  if (!text) return [];
  return text.split(/(?<=[.!?])\s+/);
}

// --- General Q&A: Ask ChatGPT a question ---
async function askQuestion() {
  const questionField = document.getElementById("aiQuestion");
  const question = questionField.value.trim();
  if (!question) return;
  const analysisDiv = document.getElementById("openaiAnalysis");
  analysisDiv.innerHTML = "<em>Processing question...</em>";
  
  try {
    const response = await fetch("/api/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: question })
    });
    const data = await response.json();
    if (data.choices && data.choices.length > 0) {
      analysisDiv.innerHTML = `<strong>Answer:</strong><br>${data.choices[0].message.content.replace(/\n/g, "<br>")}`;
    } else {
      analysisDiv.innerHTML = "<strong>Answer:</strong><br>No response returned.";
    }
  } catch (error) {
    console.error("Error asking question:", error);
    analysisDiv.innerHTML = "<strong>Answer:</strong><br>Error calling API.";
  }
}

// --- Run on Load ---
updateSentences();

// --- Save Puzzle to Server ---
async function saveCurrentPuzzle() {
  const select = document.getElementById('puzzleSelect');
  if (!select || select.value === "") {
    alert('Please select a puzzle to save.');
    return;
  }
  const selectedIdx = parseInt(select.value);
  const puzzles = await fetch('word_puzzles.json').then(r => r.json());
  const puzzle = puzzles[selectedIdx];
  if (!puzzle) {
    alert('Puzzle not found.');
    return;
  }
  // Gather current grid words
  let words = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const input = document.getElementById(`cell-${r}-${c}`);
      words.push(input ? input.value.trim() : '');
    }
  }
  // Use the latest quality if present
  const quality = typeof puzzle.quality === 'number' ? puzzle.quality : undefined;
  const updatedPuzzle = {
    ...puzzle,
    words,
    quality
  };
  try {
    const res = await fetch('/api/save-puzzle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedPuzzle)
    });
    if (!res.ok) throw new Error('Failed to save puzzle');
    alert('Puzzle saved!');
    loadWordPuzzles(); // Refresh dropdown
  } catch (err) {
    alert('Error saving puzzle: ' + err.message);
  }
}

document.getElementById('savePuzzleButton').onclick = saveCurrentPuzzle;

// --- Create New Puzzle on Server ---
async function createNewPuzzle() {
  const title = prompt('Enter a title for the new puzzle:');
  if (!title) return;
  // 3x5 grid = 15 words
  const words = Array(rows * cols).fill('');
  const newPuzzle = { title, words };
  try {
    const res = await fetch('/api/create-puzzle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPuzzle)
    });
    if (!res.ok) throw new Error('Failed to create puzzle');
    alert('Puzzle created!');
    // Reload puzzles and select the new one
    loadWordPuzzles().then(puzzles => {
      const select = document.getElementById('puzzleSelect');
      const idx = puzzles.findIndex(p => p.title === title);
      if (select && idx !== -1) {
        select.value = idx;
        select.onchange();
      }
    });
  } catch (err) {
    alert('Error creating puzzle: ' + err.message);
  }
}

document.getElementById('newPuzzleButton').onclick = createNewPuzzle;

// --- Clear Grid Modal Logic ---
function showClearGridModal() {
  document.getElementById('clearGridModal').style.display = 'flex';
}
function hideClearGridModal() {
  document.getElementById('clearGridModal').style.display = 'none';
}
document.getElementById('confirmClearGridYes').onclick = function() {
  hideClearGridModal();
  clearGrid();
};
document.getElementById('confirmClearGridNo').onclick = function() {
  hideClearGridModal();
};

// After the grid is generated and whenever an input changes, set --input-length on each input
function updateInputFontSizes() {
  document.querySelectorAll('#wordGrid input').forEach(input => {
    input.style.setProperty('--input-length', input.value.length || 1);
  });
}

// Attach event listeners to update font size on input
function attachGridInputListeners() {
  document.querySelectorAll('#wordGrid input').forEach(input => {
    input.addEventListener('input', updateInputFontSizes);
    // Set initial value
    input.style.setProperty('--input-length', input.value.length || 1);
  });
}

// Call attachGridInputListeners after grid is built
// Find where the grid is built and call attachGridInputListeners and updateInputFontSizes after

function updatePuzzleQualityBadge(puzzles, selectedIdx) {
  const badge = document.getElementById('puzzleQualityBadge');
  if (!badge) return;
  if (!puzzles || selectedIdx === undefined || selectedIdx === null || selectedIdx < 0 || selectedIdx >= puzzles.length) {
    badge.textContent = '';
    return;
  }
  const puzzle = puzzles[selectedIdx];
  if (typeof puzzle.quality === 'number') {
    let color = '';
    if (puzzle.quality < 60) {
      color = 'red';
    } else if (puzzle.quality < 80) {
      color = 'orange';
    } else {
      color = '#27ae60';
    }
    badge.textContent = `${puzzle.quality}%`;
    badge.style.color = color;
  } else {
    badge.textContent = '';
  }
}
