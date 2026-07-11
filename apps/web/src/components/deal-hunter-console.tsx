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

interface Chat {
  id: string;
  title: string;
  messages: Message[];
}

export function DealHunterConsole() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  
  const [inputValue, setInputValue] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUserPanelOpen, setIsUserPanelOpen] = useState(false);
  const [isPlusPopoverOpen, setIsPlusPopoverOpen] = useState(false);
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

  const handleNewChat = () => {
    setCurrentChatId(null);
  };

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
          messages: [{ text: userText, sender: "user" }]
        };
        setChats(prev => [newChat, ...prev]);
        setCurrentChatId(newId);
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
    }
    setIsPlusPopoverOpen(!isPlusPopoverOpen);
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
              onClick={() => {
                setActiveSidebarTab('chat');
                handleNewChat();
              }}
              title="New Chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              New Chat
            </button>
            <button 
              className={`sidebar-nav-btn ${activeSidebarTab === 'purchases' ? 'active' : ''}`}
              onClick={() => setActiveSidebarTab('purchases')}
              title="Purchases"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
              </svg>
              Purchases
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
            <div className="user-popover">
              <button className="popover-btn">My Profile</button>
              <button className="popover-btn">Settings</button>
              <div className="popover-divider"></div>
              <button className="popover-btn text-red">Log out</button>
            </div>
          )}
          <div 
            className="user-panel" 
            onClick={() => setIsUserPanelOpen(!isUserPanelOpen)}
          >
            <div className="user-avatar">AC</div>
            <div className="user-info">
              <span className="user-name">Alex Carter</span>
              <span className="user-email">alex.carter@example.com</span>
            </div>
            <svg className={`chevron ${isUserPanelOpen ? 'open' : ''}`} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          </div>
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
              <div className="plus-popover">
                <button className="popover-btn">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="popover-icon"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                  Budget
                </button>
                <button className="popover-btn">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="popover-icon"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  Time
                </button>
              </div>
            )}
            <form className="chat-input-wrapper" onSubmit={handleSend}>
              <button 
                type="button" 
                className="plus-btn has-tooltip" 
                onClick={togglePlusPopover}
                aria-label="Add options"
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
