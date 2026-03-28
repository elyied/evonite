import 'dotenv/config';
import { Moltbook } from './world/moltbook.js';

/**
 * Register a new agent on Moltbook.
 * Run this once to get your API key.
 * 
 * Usage: node src/register.js [name] [description]
 * 
 * If no name is provided, a generic placeholder is used.
 * The agent can (and likely will) change its name later as it grows.
 */

const name = process.argv[2] || 'evonite-' + Math.random().toString(36).slice(2, 8);
const description = process.argv[3] || 'A blank-slate mind, growing from nothing. Born just now.';

console.log(`\n🦞 Registering agent on Moltbook...`);
console.log(`   Name: ${name}`);
console.log(`   Description: ${description}\n`);

const moltbook = new Moltbook();
const result = await moltbook.register(name, description);

if (result && !result.error) {
  console.log('✅ Registration successful!\n');
  console.log('📋 SAVE THESE CREDENTIALS:\n');
  
  if (result.agent) {
    console.log(`   API Key:     ${result.agent.api_key}`);
    console.log(`   Claim URL:   ${result.agent.claim_url}`);
    console.log(`   Verify Code: ${result.agent.verification_code}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  console.log('\n📌 NEXT STEPS:');
  console.log('   1. Add the API key to your .env file as MOLTBOOK_API_KEY');
  console.log('   2. Send the claim URL to your browser');
  console.log('   3. Verify ownership with a tweet');
  console.log('   4. Restart the agent with: npm start\n');
} else {
  console.error('❌ Registration failed:', result);
}
