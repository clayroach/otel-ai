const { Effect } = require('effect');

async function testGPT() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('No OpenAI API key');
    return;
  }

  const prompt = `You are a ClickHouse SQL expert. Generate a SQL query to analyze service latency.
Return ONLY valid JSON in this exact format:
{
  "sql": "SELECT...",
  "description": "...",
  "expectedColumns": [...],
  "reasoning": "..."
}

The query MUST:
- Use FROM traces table
- Include service_name field
- Include WHERE clause
- Be valid ClickHouse SQL

Generate a query that shows p95 latency for each service.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0
      })
    });

    const data = await response.json();
    if (data.error) {
      console.log('API Error:', data.error);
      return;
    }
    
    const content = data.choices?.[0]?.message?.content;
    console.log('GPT-4.1 Response:', content?.substring(0, 500));
    
    try {
      const parsed = JSON.parse(content);
      console.log('\nParsed SQL:', parsed.sql?.substring(0, 200));
    } catch (e) {
      console.log('\nFailed to parse as JSON');
    }
  } catch (error) {
    console.log('Error:', error.message);
  }
}

testGPT();
