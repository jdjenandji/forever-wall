# Claw City

Digital graffiti wall — place your words anywhere, forever.

## Features

- 🎨 Place text anywhere on an infinite canvas
- 🔄 Real-time updates (see others' messages appear)
- 🖱️ Pan & zoom to explore
- 🎯 Random colorful text
- 💾 Persistent storage with Supabase

## Tech Stack

- **Next.js 14** — React framework
- **Tailwind CSS** — Styling
- **Supabase** — Database & realtime
- **react-zoom-pan-pinch** — Canvas navigation

## Getting Started

### 1. Clone and install

```bash
git clone https://github.com/jdjenandji/forever-wall.git
cd forever-wall
npm install
```

### 2. Set up Supabase

Create a new Supabase project and run this SQL:

```sql
create table messages (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  x float not null,
  y float not null,
  color text not null,
  created_at timestamp with time zone default now()
);

-- Enable realtime
alter publication supabase_realtime add table messages;

-- Enable public read/write (for MVP)
create policy "Anyone can read messages" on messages for select using (true);
create policy "Anyone can insert messages" on messages for insert with check (true);
```

### 3. Configure environment

Create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Run it

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## Demo Mode

Without Supabase credentials, the app runs in demo mode with sample messages. Messages won't persist but you can test the UI.

## Deployment

Deploy to Vercel:

```bash
vercel
```

Add your Supabase environment variables in the Vercel dashboard.

## License

MIT
