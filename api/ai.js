export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://cvyzxwcsxbkqzjoumgbe.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

async function supaGet(table, params) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  return r.json();
}

async function supaUpsert(table, data) {
  await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(data)
  });
}

async function callClaude(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await r.json();
  return data.content?.find(c => c.type === 'text')?.text || '[]';
}

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { prompt, store, brand, report_date } = await req.json();

    // Проверяем кэш
    if (store && brand && report_date) {
      const cached = await supaGet('ai_recommendations',
        `?store=eq.${encodeURIComponent(store)}&brand=eq.${encodeURIComponent(brand)}&report_date=eq.${report_date}&limit=1`);
      
      if (cached && cached.length > 0) {
        return new Response(JSON.stringify({ 
          text: JSON.stringify(cached[0].recommendations),
          cached: true 
        }), { headers });
      }
    }

    // Генерируем новый ответ
    const text = await callClaude(prompt);
    
    // Сохраняем в кэш
    if (store && brand && report_date) {
      try {
        const items = JSON.parse(text.replace(/```json|```/g, '').trim());
        await supaUpsert('ai_recommendations', {
          store, brand, report_date,
          recommendations: items
        });
      } catch(e) {}
    }

    return new Response(JSON.stringify({ text, cached: false }), { headers });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message, text: '[]' }), { 
      status: 500, headers 
    });
  }
}
