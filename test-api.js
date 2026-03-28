import 'dotenv/config';

const key = process.env.GEMINI_API_KEY;

// List all available models
const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
const data = await res.json();

if (data.models) {
  const genModels = data.models.filter(m => 
    m.supportedGenerationMethods?.includes('generateContent')
  );
  console.log('Available models for generateContent:\n');
  genModels.forEach(m => console.log(`  ${m.name} — ${m.displayName}`));
  console.log(`\nTotal: ${genModels.length}`);
  
  // Try each one
  console.log('\n--- Testing each model ---\n');
  for (const m of genModels.slice(0, 8)) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${m.name}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say hi' }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      });
      if (r.ok) {
        const d = await r.json();
        console.log(`✅ ${m.name}: "${(d.candidates?.[0]?.content?.parts?.[0]?.text || '').trim()}"`);
      } else {
        console.log(`❌ ${m.name}: ${r.status}`);
      }
    } catch (e) {
      console.log(`❌ ${m.name}: ${e.message}`);
    }
  }
} else {
  console.log('Error listing models:', JSON.stringify(data, null, 2));
}
