import { getCurrentUser } from '../auth.js';
import { getChats, createChat, getMessages, sendMessage, getUsers } from '../db.js';
import { formatTime, getLoadingSpinner } from '../utils.js';
import { showToast } from '../components/toast.js';

let activeChatId = null;
let chatInterval = null;
let firestoreUnsubscribe = null;

export async function init(container) {
  const user = getCurrentUser();
  if (!user) return;

  container.innerHTML = getLoadingSpinner();
  await renderChatInterface(container, user);
}

async function renderChatInterface(container, user) {
  try {
    const [chats, users] = await Promise.all([
      getChats(),
      getUsers()
    ]);

    // Filter chats user is in
    const myChats = chats.filter(c => c.members.includes(user.id));
    
    // Direct chat list (exclude self)
    const directUsers = users.filter(u => u.id !== user.id);

    container.innerHTML = `
      <div class="chat-container">
        
        <!-- Channels Sidebar -->
        <div class="chat-sidebar">
          <div class="chat-search" style="font-weight: 700; color: hsl(var(--primary)); font-size: 0.95rem;">
            <i class="fa-regular fa-comments"></i> Channels & Contacts
          </div>
          <div class="chat-list" id="chat-channels-list">
            
            <!-- Project Channels Group -->
            <p style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:hsl(var(--text-muted)); padding:10px 12px 4px 12px; letter-spacing:0.05em;">Group Channels</p>
            ${myChats.map(c => `
              <button class="chat-channel-item" data-chat-id="${c.id}" data-type="channel">
                <i class="fa-solid fa-hashtag" style="color:hsl(var(--primary));"></i>
                <span style="font-weight: 600;">${c.name}</span>
              </button>
            `).join('')}

            <!-- Direct Messages Group -->
            <p style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:hsl(var(--text-muted)); padding:14px 12px 4px 12px; letter-spacing:0.05em;">Direct Messages</p>
            ${directUsers.map(u => `
              <button class="chat-channel-item" data-target-user-id="${u.id}" data-type="direct">
                <i class="fa-solid fa-circle-user" style="color:hsl(var(--text-muted));"></i>
                <span>${u.name}</span>
              </button>
            `).join('')}

          </div>
        </div>

        <!-- Chat messages view -->
        <div class="chat-area">
          <div id="chat-header" style="padding:10px 14px; border-bottom:1px solid hsl(var(--border)); font-weight:600; display:flex; align-items:center; gap:8px; min-height:48px;">
            <button id="btn-back-chat" style="padding: 6px 10px; font-size: 0.85rem; display: none; align-items: center; gap: 4px; border: none; background: transparent; cursor: pointer; color: hsl(var(--primary)); font-weight: 700; flex-shrink: 0;"><i class="fa-solid fa-chevron-left"></i> Back</button>
            <div id="chat-header-title" style="display:flex; align-items:center; gap:8px; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.95rem;">
              Select a channel or worker to start messaging
            </div>
          </div>
          <div class="chat-messages" id="chat-feed">
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; color:hsl(var(--text-muted));">
              <i class="fa-regular fa-comment-dots fa-3x" style="margin-bottom:12px; opacity:0.4;"></i>
              <p style="font-size:0.9rem;">No active chat window selected.</p>
            </div>
          </div>
          <div class="chat-input-area" style="display:none;" id="chat-composer-block">
            <input class="form-input" type="text" id="chat-message-input" placeholder="Type a message..." autocomplete="off">
            <button class="btn btn-primary" id="chat-send-btn" style="padding:10px 20px;"><i class="fa-solid fa-paper-plane"></i></button>
          </div>
        </div>

      </div>
    `;

    setupChatEvents(user, chats, users);

  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color:hsl(var(--danger));">Error loading chat interface.</p>`;
  }
}

function setupChatEvents(user, chats, users) {
  const channelsList = document.getElementById('chat-channels-list');
  channelsList.querySelectorAll('.chat-channel-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      // Deactivate other tabs
      channelsList.querySelectorAll('.chat-channel-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Add active state to container for mobile view
      const chatContainer = document.querySelector('.chat-container');
      if (chatContainer) chatContainer.classList.add('chat-active');

      const chatType = btn.getAttribute('data-type');
      let chatId = btn.getAttribute('data-chat-id');

      if (chatType === 'direct') {
        const targetUserId = btn.getAttribute('data-target-user-id');
        const targetUser = users.find(u => u.id === targetUserId);
        
        // Find or create direct chat between these two
        const existingChat = chats.find(c => 
          c.type === 'direct' && 
          c.members.includes(user.id) && 
          c.members.includes(targetUserId)
        );

        if (existingChat) {
          chatId = existingChat.id;
        } else {
          // Create new direct chat
          const newChat = await createChat({
            name: `${user.name} & ${targetUser.name}`,
            type: 'direct',
            members: [user.id, targetUserId]
          });
          chats.push(newChat); // Add local cache
          chatId = newChat.id;
        }
        
        document.getElementById('chat-header-title').innerHTML = `
          <i class="fa-solid fa-circle-user" style="color:hsl(var(--primary));"></i>
          <span>${targetUser.name}</span>
          <span style="font-size:0.75rem; color:hsl(var(--text-muted)); margin-left:4px; font-weight:400;">(DM)</span>
        `;
      } else {
        const chatObj = chats.find(c => c.id === chatId);
        document.getElementById('chat-header-title').innerHTML = `
          <i class="fa-solid fa-hashtag" style="color:hsl(var(--primary));"></i>
          <span>${chatObj.name}</span>
        `;
      }

      // Activate chat input composer
      document.getElementById('chat-composer-block').style.display = 'flex';
      
      activeChatId = chatId;
      await startChatListening(chatId, user);
    });
  });

  // Composer events
  const msgInput = document.getElementById('chat-message-input');
  const sendBtn = document.getElementById('chat-send-btn');

  const executeSend = async () => {
    const text = msgInput.value;
    if (!text.trim() || !activeChatId) return;

    msgInput.value = '';
    try {
      await sendMessage(activeChatId, user.id, user.name, text);
      // Trigger scroll
      const feed = document.getElementById('chat-feed');
      feed.scrollTop = feed.scrollHeight;
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  sendBtn.addEventListener('click', executeSend);
  msgInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') executeSend();
  });

  const backBtn = document.getElementById('btn-back-chat');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      const chatContainer = document.querySelector('.chat-container');
      if (chatContainer) chatContainer.classList.remove('chat-active');
      activeChatId = null;
      if (chatInterval) clearInterval(chatInterval);
      if (firestoreUnsubscribe) firestoreUnsubscribe();
    });
  }
}

async function startChatListening(chatId, user) {
  // Clear any existing listeners
  if (chatInterval) clearInterval(chatInterval);
  if (firestoreUnsubscribe) firestoreUnsubscribe();

  const feed = document.getElementById('chat-feed');
  feed.innerHTML = `<div style="display:flex; justify-content:center; padding:30px;"><i class="fa-solid fa-circle-notch fa-spin"></i></div>`;

  const { isMockMode, db } = await import('../firebase-config.js');

  const renderFeed = (messages) => {
    if (messages.length === 0) {
      feed.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; color:hsl(var(--text-muted)); height:100%;">
          <p style="font-size:0.9rem;">No messages in this chat. Say hello!</p>
        </div>
      `;
      return;
    }

    feed.innerHTML = messages.map(m => {
      const isMe = m.senderId === user.id;
      return `
        <div class="chat-message ${isMe ? 'outgoing' : 'incoming'}">
          ${!isMe ? `<span style="font-size:0.75rem; font-weight:700; margin-bottom:2px;">${m.senderName}</span>` : ''}
          <p>${m.content}</p>
          <span class="chat-meta">${formatTime(m.timestamp)}</span>
        </div>
      `;
    }).join('');

    // Scroll to bottom
    feed.scrollTop = feed.scrollHeight;
  };

  if (isMockMode) {
    // Poll mock database messages every second
    const fetchAndRender = async () => {
      const msgs = await getMessages(chatId);
      renderFeed(msgs);
    };
    await fetchAndRender();
    chatInterval = setInterval(fetchAndRender, 1000);
  } else {
    // Realtime Firestore listener
    const { collection, query, where, orderBy, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
    const q = query(collection(db, 'messages'), where('chatId', '==', chatId), orderBy('timestamp', 'desc'));
    
    firestoreUnsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      messages.reverse();
      renderFeed(messages);
    }, (err) => {
      console.error("Chat snapshot error:", err);
      feed.innerHTML = `<p style="color:hsl(var(--danger));">Failed to bind message feed.</p>`;
    });
  }
}

export function destroy() {
  if (chatInterval) clearInterval(chatInterval);
  if (firestoreUnsubscribe) firestoreUnsubscribe();
}
