import { NextResponse } from 'next/server';
import crypto from 'crypto';

// Store active challenges (in production, use Redis or similar)
// For now, we'll use a simple in-memory store with expiry
const challenges = new Map<string, { nonce: string; difficulty: number; expires: number }>();

// Clean up expired challenges periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of challenges) {
    if (value.expires < now) {
      challenges.delete(key);
    }
  }
}, 60000); // Every minute

export async function GET() {
  // Generate a random nonce
  const nonce = crypto.randomBytes(16).toString('hex');
  const difficulty = 5; // Number of leading zeros required in hash
  const expires = Date.now() + 5 * 60 * 1000; // 5 minutes

  // Store the challenge
  challenges.set(nonce, { nonce, difficulty, expires });

  return NextResponse.json({
    nonce,
    difficulty,
    expires_in_seconds: 300,
    hint: `Find a solution string where SHA256(nonce + solution) starts with ${difficulty} zeros`,
    example: `SHA256("${nonce}" + "your_solution") must start with "${'0'.repeat(difficulty)}"`
  });
}

// Export for use in wall route
export { challenges };
