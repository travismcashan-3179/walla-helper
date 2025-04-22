import fs from 'fs/promises';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const updatedPuzzle = req.body;
  if (!updatedPuzzle.title || !Array.isArray(updatedPuzzle.words)) {
    return res.status(400).json({ error: 'Missing title or words' });
  }
  const puzzlesPath = path.join(process.cwd(), 'public', 'word_puzzles.json');
  try {
    const data = await fs.readFile(puzzlesPath, 'utf8');
    const puzzles = JSON.parse(data);
    const idx = puzzles.findIndex(p => p.title === updatedPuzzle.title);
    if (idx === -1) return res.status(404).json({ error: 'Puzzle not found' });
    puzzles[idx] = { ...puzzles[idx], ...updatedPuzzle };
    await fs.writeFile(puzzlesPath, JSON.stringify(puzzles, null, 2), 'utf8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save puzzle' });
  }
} 