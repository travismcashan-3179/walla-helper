import fs from 'fs/promises';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const newPuzzle = req.body;
  if (!newPuzzle.title || !Array.isArray(newPuzzle.words)) {
    return res.status(400).json({ error: 'Missing title or words' });
  }
  const puzzlesPath = path.join(process.cwd(), 'public', 'word_puzzles.json');
  try {
    const data = await fs.readFile(puzzlesPath, 'utf8');
    const puzzles = JSON.parse(data);
    if (puzzles.find(p => p.title === newPuzzle.title)) {
      return res.status(400).json({ error: 'Puzzle with this title already exists' });
    }
    puzzles.push(newPuzzle);
    await fs.writeFile(puzzlesPath, JSON.stringify(puzzles, null, 2), 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create puzzle' });
  }
} 