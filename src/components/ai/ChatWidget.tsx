"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { MessageCircle, X, Send, Loader2, AlertCircle, Sparkles } from 'lucide-react';

function getMessageText(m: any): string {
  if (typeof m.content === 'string') return m.content;
  if (Array.isArray(m.parts)) return m.parts.map((p: any) => p.text || '').join('\n');
  return '';
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({
    onError: (err) => {
      const msg = err?.message || String(err);
      if (msg.includes('503') || msg.includes('API key') || msg.includes('Gemini')) {
        setApiError('Gemini API key not set. Add GOOGLE_GENERATIVE_AI_API_KEY to system/.env.local to enable AI.');
      }
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    setApiError(null);
    // @ts-ignore
    sendMessage({ content: input, role: 'user' });
    setInput('');
  };

  const SUGGESTIONS = [
    "How many trips ran this month?",
    "What's the total revenue today?",
    "Show top 5 customers by bookings",
    "What's the average occupancy rate?",
  ];

  return (
    <>
      {/* Floating Action Button */}
      <button
        id="coral-ai-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close AI assistant' : 'Open AI assistant'}
        className="fixed bottom-6 right-6 p-4 bg-gradient-to-br from-ocean-500 to-ocean-700 text-white rounded-full shadow-xl hover:shadow-ocean-500/30 hover:scale-105 transition-all z-50 flex items-center gap-2"
      >
        {isOpen ? <X size={22} /> : <Sparkles size={22} />}
        {!isOpen && <span className="text-sm font-semibold pr-1">Coral AI</span>}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[420px] h-[540px] bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-ocean-600 to-ocean-700 text-white px-4 py-3 shrink-0 flex items-center gap-3">
            <div className="bg-white/20 rounded-full p-1.5">
              <Sparkles size={16} />
            </div>
            <div>
              <div className="font-semibold text-sm">Coral AI — Chief of Staff</div>
              <div className="text-xs text-ocean-100 opacity-80">Powered by Gemini 2.5 Flash</div>
            </div>
          </div>

          {/* API Error Banner */}
          {apiError && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 px-4 py-2.5 flex gap-2 items-start shrink-0">
              <AlertCircle size={14} className="text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300">{apiError}</p>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="space-y-4">
                <p className="text-gray-500 dark:text-gray-400 text-sm text-center mt-2">
                  👋 Hello! I'm your AI Chief of Staff.<br />Ask me anything about your operations.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); }}
                      className="text-left text-xs text-ocean-700 dark:text-ocean-300 bg-ocean-50 dark:bg-ocean-900/30 border border-ocean-200 dark:border-ocean-800 rounded-lg px-3 py-2 hover:bg-ocean-100 dark:hover:bg-ocean-900/60 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    m.role === 'user'
                      ? 'bg-ocean-600 text-white rounded-br-sm'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-bl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">{getMessageText(m)}</p>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-ocean-500" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">Coral AI is thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-3 border-t border-gray-200 dark:border-gray-800 shrink-0 flex gap-2">
            <input
              id="coral-ai-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about trips, revenue, customers..."
              disabled={isLoading}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-ocean-500 bg-transparent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="p-2 bg-ocean-600 text-white rounded-xl hover:bg-ocean-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
