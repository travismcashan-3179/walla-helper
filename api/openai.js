const fetch = require('node-fetch');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const { prompt } = req.body;
  if (!prompt) {
    res.status(400).json({ error: 'Missing prompt' });
    return;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Missing OpenAI API key' });
    return;
  }
  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 256,
      }),
    });
    const data = await openaiRes.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'OpenAI API error', details: err.message });
  }
}; 