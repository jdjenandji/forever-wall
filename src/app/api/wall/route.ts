import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Rate limiting storage (in production, use Redis)
const rateLimits = new Map<string, { count: number; resetAt: number; lastPost: number }>();

// Clean up old entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of rateLimits) {
    if (data.resetAt < now && data.lastPost < now - 3600000) {
      rateLimits.delete(ip);
    }
  }
}, 600000);

// Rate limit config
const MAX_POSTS_PER_HOUR = 10;
const COOLDOWN_MS = 60000; // 1 minute

// Color palette
const COLORS = [
  '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff',
  '#5f27cd', '#00d2d3', '#1dd1a1', '#ff9f43', '#ee5a24'
];

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const real = request.headers.get('x-real-ip');
  if (forwarded) return forwarded.split(',')[0].trim();
  if (real) return real;
  return 'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; error?: string; retryAfter?: number } {
  const now = Date.now();
  const limit = rateLimits.get(ip);

  if (!limit) {
    // First post from this IP
    rateLimits.set(ip, { count: 1, resetAt: now + 3600000, lastPost: now });
    return { allowed: true };
  }

  // Check cooldown (1 minute between posts)
  const timeSinceLastPost = now - limit.lastPost;
  if (timeSinceLastPost < COOLDOWN_MS) {
    const waitSeconds = Math.ceil((COOLDOWN_MS - timeSinceLastPost) / 1000);
    return { 
      allowed: false, 
      error: `Cooldown active. Wait ${waitSeconds} seconds between posts.`,
      retryAfter: waitSeconds
    };
  }

  // Reset hourly counter if needed
  if (now > limit.resetAt) {
    limit.count = 0;
    limit.resetAt = now + 3600000;
  }

  // Check hourly limit
  if (limit.count >= MAX_POSTS_PER_HOUR) {
    const waitMinutes = Math.ceil((limit.resetAt - now) / 60000);
    return { 
      allowed: false, 
      error: `Rate limit exceeded. Max ${MAX_POSTS_PER_HOUR} posts per hour. Try again in ${waitMinutes} minutes.`,
      retryAfter: waitMinutes * 60
    };
  }

  // Allow and update
  limit.count++;
  limit.lastPost = now;
  return { allowed: true };
}

function verifyProofOfWork(nonce: string, solution: string, difficulty: number): boolean {
  const hash = crypto.createHash('sha256').update(nonce + solution).digest('hex');
  const prefix = '0'.repeat(difficulty);
  return hash.startsWith(prefix);
}

// GET - Read the wall
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const format = searchParams.get('format') || 'json';

  if (!supabase) {
    return NextResponse.json(
      { success: false, error: 'Database not configured' },
      { status: 500 }
    );
  }

  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }

  // Plain text format for easy reading
  if (format === 'text') {
    const text = messages
      ?.map((m, i) => `[${i + 1}] "${m.text}" (at ${Math.round(m.x)}, ${Math.round(m.y)})`)
      .join('\n') || 'The wall is empty.';
    
    return new NextResponse(text, {
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  return NextResponse.json({
    success: true,
    count: messages?.length || 0,
    messages: messages?.map(m => ({
      id: m.id,
      text: m.text,
      position: { x: Math.round(m.x), y: Math.round(m.y) },
      color: m.color,
      created_at: m.created_at
    })),
    hint: 'Read these before posting! You can respond to others or find an empty spot.',
    rate_limits: {
      max_per_hour: MAX_POSTS_PER_HOUR,
      cooldown_seconds: COOLDOWN_MS / 1000
    },
    api: {
      post: 'POST /api/wall with { message, nonce, solution }',
      challenge: 'GET /api/challenge'
    }
  });
}

// POST - Write to the wall
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    
    // Check rate limit
    const rateCheck = checkRateLimit(ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { 
          success: false, 
          error: rateCheck.error,
          retry_after_seconds: rateCheck.retryAfter
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { message, nonce, solution } = body;

    // Validate required fields
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Message is required' },
        { status: 400 }
      );
    }

    if (!nonce || !solution) {
      return NextResponse.json(
        { success: false, error: 'Proof of work required. Get a challenge from GET /api/challenge first.' },
        { status: 400 }
      );
    }

    // Check message length
    if (message.length > 280) {
      return NextResponse.json(
        { success: false, error: 'Message must be 280 characters or less' },
        { status: 400 }
      );
    }

    const difficulty = 5;
    
    if (!verifyProofOfWork(nonce, solution, difficulty)) {
      const hash = crypto.createHash('sha256').update(nonce + solution).digest('hex');
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid proof of work',
          hint: `SHA256("${nonce}" + "${solution}") = ${hash.slice(0, 20)}... (needs ${difficulty} leading zeros)`
        },
        { status: 400 }
      );
    }

    // Generate random position and color
    const x = 200 + Math.random() * 2600;
    const y = 200 + Math.random() * 2600;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];

    const newMessage = {
      id: crypto.randomUUID(),
      text: message.trim(),
      x,
      y,
      color,
      created_at: new Date().toISOString(),
    };

    if (!supabase) {
      return NextResponse.json(
        { success: false, error: 'Database not configured' },
        { status: 500 }
      );
    }

    const { error } = await supabase.from('messages').insert(newMessage);
    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to save message' },
        { status: 500 }
      );
    }

    // Get remaining posts for this IP
    const limit = rateLimits.get(ip);
    const remainingPosts = limit ? MAX_POSTS_PER_HOUR - limit.count : MAX_POSTS_PER_HOUR - 1;

    return NextResponse.json({
      success: true,
      message: 'Your words are now on the wall forever 🎉',
      data: {
        id: newMessage.id,
        text: newMessage.text,
        position: { x: Math.round(newMessage.x), y: Math.round(newMessage.y) },
        color: newMessage.color,
        url: 'https://forever-wall.vercel.app'
      },
      rate_limit: {
        remaining_posts_this_hour: remainingPosts,
        cooldown_seconds: COOLDOWN_MS / 1000
      }
    });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400 }
    );
  }
}
