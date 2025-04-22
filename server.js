require('dotenv').config();

console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY);
console.log("Current working directory:", process.cwd());

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

// Use global fetch if available; otherwise, require node-fetch.
let fetchFunc;
if (typeof fetch === 'function') {
  fetchFunc = fetch;
  console.log("Using global fetch.");
} else {
  fetchFunc = require('node-fetch');
  console.log("Using node-fetch module.");
}

const app = express();
const port = process.env.PORT || 3000;

const corsOptions = {
  origin: "http://localhost:8000",
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

// Proxy endpoint for GPT-4 via OpenAI's Chat Completions API
app.post('/openai', async (req, res) => {
  const { prompt } = req.body;
  console.log("Received prompt:", prompt);
  try {
    const response = await fetchFunc('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: prompt }
        ],
        max_tokens: 300,
        temperature: 0.7
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error", response.status, errorText);
      return res.status(response.status).json({ error: errorText });
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error calling OpenAI API:", error);
    res.status(500).json({ error: "Error calling OpenAI API" });
  }
});

// Duplicate /openai handler for /api/openai for frontend compatibility
app.post('/api/openai', async (req, res) => {
  const { prompt } = req.body;
  try {
    const response = await fetchFunc('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: prompt }
        ],
        max_tokens: 300,
        temperature: 0.7
      })
    });
    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Error calling OpenAI API" });
  }
});

// Endpoint to update puzzle quality score
app.post('/api/update-puzzle-quality', (req, res) => {
  const { title, quality } = req.body;
  if (!title || typeof quality !== 'number') {
    return res.status(400).json({ error: 'Missing title or quality' });
  }
  const puzzlesPath = path.join(__dirname, 'public', 'word_puzzles.json');
  fs.readFile(puzzlesPath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read word_puzzles.json' });
    }
    let puzzles;
    try {
      puzzles = JSON.parse(data);
    } catch (e) {
      return res.status(500).json({ error: 'Invalid JSON in word_puzzles.json' });
    }
    const idx = puzzles.findIndex(p => p.title === title);
    if (idx === -1) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }
    puzzles[idx].quality = quality;
    fs.writeFile(puzzlesPath, JSON.stringify(puzzles, null, 2), 'utf8', (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to write word_puzzles.json' });
      }
      res.json({ success: true });
    });
  });
});

// Endpoint to save/update a full puzzle
app.post('/api/save-puzzle', (req, res) => {
  const updatedPuzzle = req.body;
  if (!updatedPuzzle.title || !Array.isArray(updatedPuzzle.words)) {
    return res.status(400).json({ error: 'Missing title or words' });
  }
  const puzzlesPath = path.join(__dirname, 'public', 'word_puzzles.json');
  fs.readFile(puzzlesPath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read word_puzzles.json' });
    }
    let puzzles;
    try {
      puzzles = JSON.parse(data);
    } catch (e) {
      return res.status(500).json({ error: 'Invalid JSON in word_puzzles.json' });
    }
    const idx = puzzles.findIndex(p => p.title === updatedPuzzle.title);
    if (idx === -1) {
      return res.status(404).json({ error: 'Puzzle not found' });
    }
    puzzles[idx] = { ...puzzles[idx], ...updatedPuzzle };
    fs.writeFile(puzzlesPath, JSON.stringify(puzzles, null, 2), 'utf8', (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to write word_puzzles.json' });
      }
      res.json({ success: true });
    });
  });
});

// Endpoint to create a new puzzle
app.post('/api/create-puzzle', (req, res) => {
  const newPuzzle = req.body;
  if (!newPuzzle.title || !Array.isArray(newPuzzle.words)) {
    return res.status(400).json({ error: 'Missing title or words' });
  }
  const puzzlesPath = path.join(__dirname, 'public', 'word_puzzles.json');
  fs.readFile(puzzlesPath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to read word_puzzles.json' });
    }
    let puzzles;
    try {
      puzzles = JSON.parse(data);
    } catch (e) {
      return res.status(500).json({ error: 'Invalid JSON in word_puzzles.json' });
    }
    if (puzzles.find(p => p.title === newPuzzle.title)) {
      return res.status(400).json({ error: 'Puzzle with this title already exists' });
    }
    puzzles.push(newPuzzle);
    fs.writeFile(puzzlesPath, JSON.stringify(puzzles, null, 2), 'utf8', (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to write word_puzzles.json' });
      }
      res.json({ success: true });
    });
  });
});

// Optionally serve static files from a 'public' folder.
app.use(express.static('public'));

app.listen(port, () => {
  console.log(`Proxy server running on port ${port}`);
});

