import 'dotenv/config';
import { Moltbook } from './world/moltbook.js';

// 👉 PUT YOUR REAL EMAIL ADDRESS HERE:
const YOUR_EMAIL = 'irl.elyied@gmail.com';

async function setup() {
  console.log(`Linking agent to email: ${YOUR_EMAIL}`);

  const moltbook = new Moltbook(process.env.MOLTBOOK_API_KEY);

  const response = await moltbook._request(
    'POST',
    '/agents/me/setup-owner-email',
    { email: YOUR_EMAIL }
  );

  console.log('Result:', response);
  console.log('Now check your email inbox for the verification link!');
}

setup();
