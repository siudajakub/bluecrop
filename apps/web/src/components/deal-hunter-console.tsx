"use client";
import React, { useState, useRef, useEffect } from 'react';
import '../app/globals.css';
import { ChevronUpIcon, type ChevronUpIconHandle } from './chevron-up-icon';
import { CirclePlusIcon, type CirclePlusIconHandle } from './circle-plus-icon';
import { Trash2Icon } from './trash2-icon';
import { AudioLinesIcon, type AudioLinesIconHandle } from './audio-lines-icon';
import BlurText from './blur-text';
import MetaBalls from './meta-balls';
import { motion, AnimatePresence } from 'motion/react';

interface Message {
  text: string;
  sender: 'user' | 'bot';
}

interface ShoppingContext {
  budget?: string;
  timing?: string;
}

interface Chat {
  id: string;
  title: string;
  messages: Message[];
  context: ShoppingContext;
}

function dateAfterDays(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function DealHunterConsole() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [draftContext, setDraftContext] = useState<ShoppingContext>({});
  
  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUserPanelOpen, setIsUserPanelOpen] = useState(false);
  const [isPlusPopoverOpen, setIsPlusPopoverOpen] = useState(false);
  const [plusPopoverView, setPlusPopoverView] = useState<'menu' | 'budget' | 'time'>('menu');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState('EUR');
  const [timeChoice, setTimeChoice] = useState<'now' | 'later'>('now');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'chat' | 'purchases'>('chat');

  // Welcome message animation states
  const [phraseIndex, setPhraseIndex] = useState(0);

  const welcomePhrases = [
    "How can I help you, Alex?",
    "What are we shopping today?",
    "Looking for any deals, Alex?",
    "What's on your mind?"
  ];

  useEffect(() => {
    const currentChatIdStr = currentChatId || "";
    const msgs = chats.find(c => c.id === currentChatIdStr)?.messages || [];
    if (msgs.length > 0) return;

    const interval = setInterval(() => {
      setPhraseIndex(prev => (prev + 1) % welcomePhrases.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [chats, currentChatId]);

  const sendIconRef = useRef<ChevronUpIconHandle>(null);
  const plusIconRef = useRef<CirclePlusIconHandle>(null);
  const micIconRef = useRef<AudioLinesIconHandle>(null);

  useEffect(() => {
    if (isRecording) {
      micIconRef.current?.startAnimation();
    } else {
      micIconRef.current?.stopAnimation();
    }
  }, [isRecording]);

  const currentChat = chats.find(c => c.id === currentChatId);
  const messages = currentChat ? currentChat.messages : [];
  const activeContext = currentChat?.context ?? draftContext;
  const todayIso = new Date().toISOString().slice(0, 10);
  const quickDateOptions = [
    { label: '7 days', value: dateAfterDays(7) },
    { label: '2 weeks', value: dateAfterDays(14) },
    { label: '1 month', value: dateAfterDays(30) }
  ];

  const handleDeleteHistory = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChats(prev => prev.filter(c => c.id !== id));
    if (currentChatId === id) {
      setCurrentChatId(null);
    }
  };

  const handleSelectChat = (id: string) => {
    setCurrentChatId(id);
  };

  const [isThinking, setIsThinking] = useState(false);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isSending) return;
    
    setIsSending(true);
    sendIconRef.current?.startAnimation();
    const userText = inputValue.trim();
    
    setTimeout(() => {
      let activeId = currentChatId;
      
      if (!activeId) {
        const newId = Date.now().toString();
        const newChat: Chat = {
          id: newId,
          title: userText.length > 20 ? userText.substring(0, 20) + "..." : userText,
          messages: [{ text: userText, sender: "user" }],
          context: draftContext
        };
        setChats(prev => [newChat, ...prev]);
        setCurrentChatId(newId);
        setDraftContext({});
        activeId = newId;
      } else {
        setChats(prev => prev.map(chat => 
          chat.id === activeId 
            ? { ...chat, messages: [...chat.messages, { text: userText, sender: "user" }] } 
            : chat
        ));
      }
      
      setInputValue("");
      setIsSending(false);
      setIsThinking(true);
      
      setTimeout(() => {
        setIsThinking(false);
        setChats(prev => prev.map(chat => 
          chat.id === activeId 
            ? { ...chat, messages: [...chat.messages, { text: "Got it, checking that for you...", sender: "bot" }] } 
            : chat
        ));
      }, 2500);
    }, 400); 
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const togglePlusPopover = () => {
    if (!isPlusPopoverOpen) {
      plusIconRef.current?.startAnimation();
      setPlusPopoverView('menu');
    }
    setIsPlusPopoverOpen(!isPlusPopoverOpen);
  };

  const setContextValue = (key: keyof ShoppingContext, value: string) => {
    if (currentChatId) {
      setChats(prev => prev.map(chat =>
        chat.id === currentChatId
          ? { ...chat, context: { ...chat.context, [key]: value } }
          : chat
      ));
    } else {
      setDraftContext(prev => ({ ...prev, [key]: value }));
    }

    setIsPlusPopoverOpen(false);
    setPlusPopoverView('menu');
  };

  const removeContextValue = (key: keyof ShoppingContext) => {
    if (currentChatId) {
      setChats(prev => prev.map(chat => {
        if (chat.id !== currentChatId) return chat;
        const nextContext = { ...chat.context };
        delete nextContext[key];
        return { ...chat, context: nextContext };
      }));
    } else {
      setDraftContext(prev => {
        const nextContext = { ...prev };
        delete nextContext[key];
        return nextContext;
      });
    }
  };

  const handleBudgetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number.parseFloat(budgetAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) return;

    const formattedAmount = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: budgetCurrency,
      maximumFractionDigits: 2
    }).format(amount);

    setContextValue('budget', formattedAmount);
    setBudgetAmount('');
  };

  const handleTimeSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (timeChoice === 'now') {
      setContextValue('timing', 'Buy now');
      return;
    }

    if (!purchaseDate) return;
    const formattedDate = new Intl.DateTimeFormat('en', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(new Date(`${purchaseDate}T12:00:00`));

    setContextValue('timing', `Buy by ${formattedDate}`);
  };

  return (
    <div className="app-container">
      {/* Sidebar: Brand, History & User Panel */}
      <aside className={`sidebar ${isSidebarOpen ? '' : 'collapsed'}`}>
        <div className="sidebar-header">
          <h1 className="brand-name">bluecrop</h1>
          <button className="toggle-sidebar-btn" onClick={toggleSidebar} aria-label="Collapse sidebar">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
          </button>
        </div>
        
        <div className="sidebar-content">
          <div className="sidebar-nav">
            <button 
              className={`sidebar-nav-btn ${activeSidebarTab === 'chat' ? 'active' : ''}`}
              onClick={() => setActiveSidebarTab('chat')}
              aria-current={activeSidebarTab === 'chat' ? 'page' : undefined}
            >
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>
              </svg>
              <span>Chat</span>
            </button>
            <button 
              className={`sidebar-nav-btn ${activeSidebarTab === 'purchases' ? 'active' : ''}`}
              onClick={() => setActiveSidebarTab('purchases')}
              aria-current={activeSidebarTab === 'purchases' ? 'page' : undefined}
            >
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8h12l1 13H5L6 8Z"></path>
                <path d="M9 8V6a3 3 0 0 1 6 0v2"></path>
              </svg>
              <span>Purchases</span>
            </button>
          </div>
        
          {activeSidebarTab === 'chat' && (
            <>
              {chats.length > 0 && <h2 className="sidebar-title">Recent</h2>}
              <div className="history-list">
                {chats.map(chat => (
                  <div 
                    key={chat.id} 
                    className={`history-card ${currentChatId === chat.id ? 'active' : ''}`}
                    onClick={() => handleSelectChat(chat.id)}
                  >
                    <span className="history-name">{chat.title}</span>
                    <button 
                      className="delete-history-btn" 
                      onClick={(e) => handleDeleteHistory(chat.id, e)}
                      aria-label="Delete"
                    >
                      <Trash2Icon size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* User Panel in Bottom Left */}
        <div className="user-panel-wrapper">
          {isUserPanelOpen && (
            <div className="user-popover" role="menu" aria-label="Account menu">
              <div className="user-popover-header">
                <div className="user-avatar large">AC</div>
                <div className="user-info">
                  <span className="user-name">Alex Carter</span>
                  <span className="user-email">alex.carter@example.com</span>
                </div>
              </div>
              <div className="popover-divider"></div>
              <button className="popover-btn" role="menuitem">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
                My profile
              </button>
              <button className="popover-btn" role="menuitem">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.15.37.37.7.66.96.3.27.68.42 1.08.43H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>
                Settings
              </button>
              <div className="popover-divider"></div>
              <button className="popover-btn text-red" role="menuitem">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/></svg>
                Log out
              </button>
            </div>
          )}
          <button
            type="button"
            className="user-panel" 
            onClick={() => setIsUserPanelOpen(!isUserPanelOpen)}
            aria-label="User menu"
            aria-expanded={isUserPanelOpen}
          >
            <div className="user-avatar">AC</div>
            <div className="user-info">
              <span className="user-name">Alex Carter</span>
              <span className="user-email">Personal account</span>
            </div>
            <svg className={`chevron ${isUserPanelOpen ? 'open' : ''}`} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          </button>
        </div>
      </aside>

      <main className="chat-area">
        {activeSidebarTab === 'purchases' ? (
          <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', width: '100%', flex: 1, overflowY: 'auto' }}>
            <h1 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '8px' }}>Your Purchases</h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>Review your past shopping orders.</p>
            <div style={{ padding: '32px', textAlign: 'center', border: '1px dashed var(--border-color)', borderRadius: '12px', color: 'var(--text-muted)' }}>
              No purchases found.
            </div>
          </div>
        ) : (
          <>
            {!isSidebarOpen && (
              <button className="floating-toggle-btn" onClick={toggleSidebar} aria-label="Expand sidebar">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="9" y1="3" x2="9" y2="21"></line>
                </svg>
              </button>
            )}
            <div className="chat-messages">
              {messages.length === 0 ? (
            <div className="empty-chat-welcome">
              <AnimatePresence mode="wait">
                <motion.div
                  key={phraseIndex}
                  initial={{ opacity: 1, filter: 'blur(0px)' }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, filter: 'blur(10px)' }}
                  transition={{ duration: 0.6 }}
                >
                  <BlurText
                    text={welcomePhrases[phraseIndex]}
                    className="welcome-text-anim"
                    delay={50}
                    animateBy="words"
                    direction="top"
                  />
                </motion.div>
              </AnimatePresence>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div key={i} className={`chat-bubble ${msg.sender}`}>
                  {msg.text}
                </div>
              ))}
              <AnimatePresence>
                {isThinking && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.3 }}
                    className="chat-bubble bot" 
                    style={{ padding: '0 16px', display: 'flex', alignItems: 'center', height: '44px' }}
                  >
                    <div style={{ width: '36px', height: '36px', position: 'relative' }}>
                      <MetaBalls
                        color="#7C3AED"
                        cursorBallColor="#7C3AED"
                        cursorBallSize={1}
                        ballCount={8}
                        animationSize={90}
                        enableMouseInteraction={false}
                        enableTransparency={true}
                        hoverSmoothness={0.112}
                        clumpFactor={0.6}
                        speed={0.7}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

        <div className="input-container">
          <div className="input-wrapper-container">
            {isPlusPopoverOpen && (
              <div className={`plus-popover ${plusPopoverView !== 'menu' ? 'editor' : ''}`}>
                {plusPopoverView === 'menu' && (
                  <>
                    <div className="plus-popover-heading">
                      <span>Add context</span>
                      <small>Help bluecrop narrow the search</small>
                    </div>
                    <button className="context-option" type="button" onClick={() => setPlusPopoverView('budget')}>
                      <span className="context-option-icon">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M4 7h16v12H4z"/><path d="M4 10h16"/><circle cx="16" cy="15" r="1"/></svg>
                      </span>
                      <span><strong>Budget</strong><small>Set your maximum spend</small></span>
                      <svg className="context-option-arrow" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="m9 18 6-6-6-6"/></svg>
                    </button>
                    <button className="context-option" type="button" onClick={() => setPlusPopoverView('time')}>
                      <span className="context-option-icon">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                      </span>
                      <span><strong>Time</strong><small>Choose when you want to buy</small></span>
                      <svg className="context-option-arrow" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="m9 18 6-6-6-6"/></svg>
                    </button>
                  </>
                )}

                {plusPopoverView === 'budget' && (
                  <form className="context-form" onSubmit={handleBudgetSubmit}>
                    <div className="context-form-header">
                      <button type="button" className="context-back-btn" onClick={() => setPlusPopoverView('menu')} aria-label="Back to context options">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="m15 18-6-6 6-6"/></svg>
                      </button>
                      <div><strong>Set a budget</strong><small>What is the most you want to spend?</small></div>
                    </div>
                    <label className="context-field-label" htmlFor="budget-amount">Maximum amount</label>
                    <div className="money-input">
                      <select value={budgetCurrency} onChange={(e) => setBudgetCurrency(e.target.value)} aria-label="Currency">
                        <option value="EUR">EUR</option>
                        <option value="USD">USD</option>
                        <option value="GBP">GBP</option>
                        <option value="PLN">PLN</option>
                      </select>
                      <input id="budget-amount" inputMode="decimal" placeholder="0.00" value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} autoFocus />
                    </div>
                    <button className="context-submit-btn" type="submit" disabled={!budgetAmount.trim()}>Apply budget</button>
                  </form>
                )}

                {plusPopoverView === 'time' && (
                  <form className="context-form" onSubmit={handleTimeSubmit}>
                    <div className="context-form-header">
                      <button type="button" className="context-back-btn" onClick={() => setPlusPopoverView('menu')} aria-label="Back to context options">
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="m15 18-6-6 6-6"/></svg>
                      </button>
                      <div><strong>Choose timing</strong><small>How soon do you want to buy?</small></div>
                    </div>
                    <div className="time-choice" role="group" aria-label="Purchase timing">
                      <button type="button" className={timeChoice === 'now' ? 'active' : ''} onClick={() => setTimeChoice('now')}>Buy now</button>
                      <button type="button" className={timeChoice === 'later' ? 'active' : ''} onClick={() => setTimeChoice('later')}>Choose date</button>
                    </div>
                    {timeChoice === 'later' && (
                      <div className="date-field">
                        <label className="context-field-label" htmlFor="purchase-date">Purchase by</label>
                        <div className="date-input-wrap">
                          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>
                          <input id="purchase-date" type="date" min={todayIso} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
                        </div>
                        <div className="date-presets" aria-label="Quick date choices">
                          {quickDateOptions.map(option => (
                            <button
                              key={option.label}
                              type="button"
                              className={purchaseDate === option.value ? 'active' : ''}
                              onClick={() => setPurchaseDate(option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <button className="context-submit-btn" type="submit" disabled={timeChoice === 'later' && !purchaseDate}>Apply timing</button>
                  </form>
                )}
              </div>
            )}
            {(activeContext.budget || activeContext.timing) && (
              <div className="context-chips" aria-label="Active shopping context">
                {activeContext.budget && (
                  <div className="context-chip">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="M4 7h16v12H4z"/><path d="M4 10h16"/></svg>
                    <span><small>Budget</small>{activeContext.budget}</span>
                    <button type="button" onClick={() => removeContextValue('budget')} aria-label="Remove budget context">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="m7 7 10 10M17 7 7 17"/></svg>
                    </button>
                  </div>
                )}
                {activeContext.timing && (
                  <div className="context-chip">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
                    <span><small>Timing</small>{activeContext.timing}</span>
                    <button type="button" onClick={() => removeContextValue('timing')} aria-label="Remove timing context">
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><path d="m7 7 10 10M17 7 7 17"/></svg>
                    </button>
                  </div>
                )}
              </div>
            )}
            <form className="chat-input-wrapper" onSubmit={handleSend}>
              <button 
                type="button" 
                className="plus-btn has-tooltip" 
                onClick={togglePlusPopover}
                aria-label="Add options"
                aria-expanded={isPlusPopoverOpen}
                data-tooltip="Add info"
              >
                <CirclePlusIcon ref={plusIconRef} size={20} />
              </button>

              <input 
                type="text" 
                className="chat-input"
                placeholder="Type a message..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
              />
              
              <button 
                type="button" 
                className={`voice-btn has-tooltip ${isRecording ? 'recording' : ''}`}
                onClick={toggleRecording}
                aria-label="Voice input"
                data-tooltip="Dictate"
              >
                {isRecording ? (
                  <AudioLinesIcon ref={micIconRef} size={18} color="currentColor" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="22"></line>
                  </svg>
                )}
              </button>
              
              <button 
                type="submit" 
                className="send-btn has-tooltip" 
                aria-label="Send message"
                data-tooltip="Send"
                disabled={!inputValue.trim()}
              >
                <ChevronUpIcon ref={sendIconRef} size={20} />
              </button>
            </form>
          </div>
        </div>
        </>
        )}
      </main>
    </div>
  );
}
