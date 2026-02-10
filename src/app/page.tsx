'use client';

import { useState, useEffect, useCallback } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { createClient } from '@supabase/supabase-js';

// Types
interface Message {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  created_at: string;
}

// Supabase client (will need env vars)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Color palette
const COLORS = [
  '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff',
  '#5f27cd', '#00d2d3', '#1dd1a1', '#ff9f43', '#ee5a24'
];

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const [placingMessage, setPlacingMessage] = useState<{ text: string; color: string } | null>(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });

  // Load messages
  useEffect(() => {
    if (!supabase) {
      // Demo mode with sample messages
      setMessages([
        { id: '1', text: 'Welcome to Forever Wall! 🎉', x: 400, y: 300, color: '#ff6b6b', created_at: new Date().toISOString() },
        { id: '2', text: 'Place your words anywhere...', x: 600, y: 450, color: '#48dbfb', created_at: new Date().toISOString() },
        { id: '3', text: 'They stay here forever ✨', x: 350, y: 550, color: '#1dd1a1', created_at: new Date().toISOString() },
      ]);
      return;
    }

    const fetchMessages = async () => {
      const { data } = await supabase.from('messages').select('*').order('created_at', { ascending: true });
      if (data) setMessages(data);
    };

    fetchMessages();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Handle placing message
  const handleCanvasClick = useCallback(async (e: React.MouseEvent) => {
    if (!placingMessage) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newMessage: Message = {
      id: crypto.randomUUID(),
      text: placingMessage.text,
      x,
      y,
      color: placingMessage.color,
      created_at: new Date().toISOString(),
    };

    // Add to local state immediately
    setMessages((prev) => [...prev, newMessage]);
    setPlacingMessage(null);

    // Save to Supabase
    if (supabase) {
      await supabase.from('messages').insert(newMessage);
    }
  }, [placingMessage]);

  // Track cursor for preview
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!placingMessage) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, [placingMessage]);

  // Start placing a message
  const handleAddMessage = () => {
    if (!newText.trim()) return;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    setPlacingMessage({ text: newText.trim(), color });
    setNewText('');
    setIsAdding(false);
  };

  return (
    <main className="h-screen w-screen overflow-hidden bg-zinc-950 relative">
      {/* Header */}
      <div className="absolute top-4 left-4 z-20">
        <h1 className="text-2xl font-bold text-white tracking-tight">Forever Wall</h1>
        <p className="text-zinc-500 text-sm">Place your words. They stay forever.</p>
      </div>

      {/* Add button */}
      <button
        onClick={() => setIsAdding(true)}
        className="absolute top-4 right-4 z-20 bg-white text-black px-4 py-2 rounded-full font-medium hover:bg-zinc-200 transition"
      >
        + Add
      </button>

      {/* Canvas */}
      <TransformWrapper
        initialScale={1}
        minScale={0.5}
        maxScale={2}
        disabled={!!placingMessage}
        limitToBounds={false}
      >
        <TransformComponent
          wrapperStyle={{ width: '100%', height: '100%' }}
          contentStyle={{ width: '3000px', height: '3000px' }}
        >
          <div
            className="w-full h-full relative cursor-crosshair"
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
            style={{
              backgroundImage: 'radial-gradient(circle, #333 1px, transparent 1px)',
              backgroundSize: '30px 30px',
            }}
          >
            {/* Existing messages */}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="absolute select-none pointer-events-none"
                style={{
                  left: msg.x,
                  top: msg.y,
                  color: msg.color,
                  textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <span className="text-lg font-medium whitespace-nowrap">{msg.text}</span>
              </div>
            ))}

            {/* Preview of placing message */}
            {placingMessage && (
              <div
                className="absolute select-none pointer-events-none opacity-70"
                style={{
                  left: cursorPos.x,
                  top: cursorPos.y,
                  color: placingMessage.color,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <span className="text-lg font-medium whitespace-nowrap">{placingMessage.text}</span>
              </div>
            )}
          </div>
        </TransformComponent>
      </TransformWrapper>

      {/* Placing mode indicator */}
      {placingMessage && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-white text-black px-4 py-2 rounded-full font-medium flex items-center gap-3">
          <span>Click anywhere to place your message</span>
          <button
            onClick={() => setPlacingMessage(null)}
            className="text-zinc-500 hover:text-black"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Add modal */}
      {isAdding && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-30">
          <div className="bg-zinc-900 p-6 rounded-2xl w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-white mb-4">Write on the wall</h2>
            <textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value.slice(0, 280))}
              placeholder="What do you want to say?"
              className="w-full bg-zinc-800 text-white p-4 rounded-xl resize-none h-32 outline-none focus:ring-2 focus:ring-white/20"
              autoFocus
            />
            <div className="text-zinc-500 text-sm mt-2 text-right">{newText.length}/280</div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setIsAdding(false)}
                className="flex-1 py-3 rounded-xl bg-zinc-800 text-white font-medium hover:bg-zinc-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMessage}
                disabled={!newText.trim()}
                className="flex-1 py-3 rounded-xl bg-white text-black font-medium hover:bg-zinc-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Place it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Instructions for empty state */}
      {messages.length === 0 && !supabase && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-zinc-600 text-lg">Click "+ Add" to write on the wall</p>
        </div>
      )}
    </main>
  );
}
