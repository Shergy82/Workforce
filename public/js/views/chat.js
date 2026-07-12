import { getCurrentUser, isManager } from '../auth.js';
import { getChats, createChat, getMessages, sendMessage, getUsers, deleteChat, markChatNotificationsRead } from '../db.js';
import { formatTime, getLoadingSpinner } from '../utils.js';
import { showToast } from '../components/toast.js';
import { showModal, hideModal } from '../components/modal.js';


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

    // Filter chats user is in OR general channels
    const myChats = chats.filter(c => c.members.includes(user.id) || c.type === 'general');
    
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
              <div class="chat-sidebar-row" style="display:flex; align-items:center; gap:4px; padding:0 4px;">
                <button class="chat-channel-item" data-chat-id="${c.id}" data-type="channel" style="flex:1; min-width:0;">
                  <i class="fa-solid fa-hashtag" style="color:hsl(var(--primary));"></i>
                  <span style="font-weight: 600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${c.name}</span>
                </button>
                ${isManager() ? `
                  <button class="btn-delete-chat" data-chat-id="${c.id}" data-chat-name="${c.name}" title="Delete channel"
                    style="background:none; border:none; color:hsl(var(--danger)); cursor:pointer; padding:6px; border-radius:4px; flex-shrink:0; display:flex; align-items:center; opacity:0.6;"
                    onmouseover="this.style.opacity='1';this.style.backgroundColor='rgba(239,68,68,0.1)'"
                    onmouseout="this.style.opacity='0.6';this.style.backgroundColor='transparent'">
                    <i class="fa-solid fa-trash-can" style="font-size:0.75rem;"></i>
                  </button>
                ` : ''}
              </div>
            `).join('')}

            <!-- Direct Messages Group -->
            <p style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:hsl(var(--text-muted)); padding:14px 12px 4px 12px; letter-spacing:0.05em;">Direct Messages</p>
            ${directUsers.map(u => `
              <div class="chat-sidebar-row" style="display:flex; align-items:center; gap:4px; padding:0 4px;">
                <button class="chat-channel-item" data-target-user-id="${u.id}" data-type="direct" style="flex:1; min-width:0;">
                  <i class="fa-solid fa-circle-user" style="color:hsl(var(--text-muted));"></i>
                  <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${u.name}</span>
                </button>
              </div>
            `).join('')}

          </div>

        </div>

        <!-- Chat messages view -->
        <div class="chat-area">
          <div id="chat-header" style="padding:10px 14px; border-bottom:1px solid hsl(var(--border)); font-weight:600; display:flex; align-items:center; gap:8px; min-height:48px; box-sizing: border-box;">
            <button id="btn-back-chat" style="padding: 6px 10px; font-size: 0.85rem; display: none; align-items: center; gap: 4px; border: none; background: transparent; cursor: pointer; color: hsl(var(--primary)); font-weight: 700; flex-shrink: 0;"><i class="fa-solid fa-chevron-left"></i> Back</button>
            <div id="chat-header-title" style="display:flex; align-items:center; gap:8px; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.95rem;">
              Select a channel or worker to start messaging
            </div>
            <button id="btn-mute-chat" style="padding: 6px 10px; font-size: 0.85rem; border: none; background: transparent; cursor: pointer; display: none; align-items: center; justify-content: center; flex-shrink: 0;" title="Toggle Mute">
              <i class="fa-solid fa-bell"></i>
            </button>
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

      // Update mute button state for this active chat
      const muteBtn = document.getElementById('btn-mute-chat');
      if (muteBtn) {
        muteBtn.style.display = 'flex';
        const isMuted = (user.mutedChats || []).includes(chatId);
        muteBtn.innerHTML = `<i class="fa-solid ${isMuted ? 'fa-bell-slash' : 'fa-bell'}"></i>`;
        muteBtn.style.color = isMuted ? 'hsl(var(--danger))' : 'hsl(var(--text-muted))';
        muteBtn.title = isMuted ? 'Unmute notifications' : 'Mute notifications';
      }

      activeChatId = chatId;
      // Mark chat notifications as read so badge clears
      markChatNotificationsRead(user.id, chatId).catch(() => {});
      await startChatListening(chatId, user);
    });
  });

  // Delete chat button handlers (managers only)
  document.querySelectorAll('.btn-delete-chat').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const chatId = btn.getAttribute('data-chat-id');
      const chatName = btn.getAttribute('data-chat-name');
      showModal({
        title: `Delete "${chatName}"?`,
        bodyHTML: `
          <div style="text-align:center; padding:8px 0;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size:2.5rem; color:hsl(var(--danger)); display:block; margin-bottom:12px;"></i>
            <p style="font-weight:700;">This cannot be undone.</p>
            <p style="color:hsl(var(--text-muted)); font-size:0.9rem; margin-top:8px;">All messages in this channel will be permanently deleted.</p>
          </div>
        `,
        confirmText: 'Yes, Delete',
        cancelText: 'Cancel',
        onConfirm: async () => {
          try {
            await deleteChat(chatId);
            showToast(`"${chatName}" deleted.`, 'success');
            hideModal();
            // Reload chat view
            const container = document.getElementById('view-mount');
            if (container) { const { init } = await import('./chat.js'); init(container); }
          } catch (err) { showToast(err.message, 'error'); }
        }
      });
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
      
      const muteBtn = document.getElementById('btn-mute-chat');
      if (muteBtn) muteBtn.style.display = 'none';
    });
  }

  // Mute button handler
  const muteBtn = document.getElementById('btn-mute-chat');
  if (muteBtn) {
    muteBtn.addEventListener('click', async () => {
      if (!activeChatId) return;
      const { updateUser } = await import('../db.js');
      const mutedChats = user.mutedChats || [];
      
      let updatedMuted;
      if (mutedChats.includes(activeChatId)) {
        updatedMuted = mutedChats.filter(id => id !== activeChatId);
        showToast("Chat unmuted. You will receive notifications.", "success");
      } else {
        updatedMuted = [...mutedChats, activeChatId];
        showToast("Chat muted. You will only be notified when mentioned.", "warning");
      }
      
      user.mutedChats = updatedMuted;
      const isMuted = updatedMuted.includes(activeChatId);
      muteBtn.innerHTML = `<i class="fa-solid ${isMuted ? 'fa-bell-slash' : 'fa-bell'}"></i>`;
      muteBtn.style.color = isMuted ? 'hsl(var(--danger))' : 'hsl(var(--text-muted))';
      muteBtn.title = isMuted ? 'Unmute notifications' : 'Mute notifications';

      await updateUser(user.id, { mutedChats: updatedMuted });
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
          ${!isMe ? `<span style="font-size:0.75rem; font-weight:700; margin-bottom:2px; color:hsl(var(--primary));">${m.senderName}</span>` : ''}
          <p style="margin:0; word-break: break-word; line-height: 1.4;">${m.content}</p>
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
    // Realtime Firestore listener (sorted client-side in memory to avoid index requirements)
    const { collection, query, where, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
    const q = query(collection(db, 'messages'), where('chatId', '==', chatId));
    
    firestoreUnsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => {
        const data = doc.data();
        let ts = 0;
        if (data.timestamp) {
          ts = new Date(data.timestamp).getTime();
        }
        return { id: doc.id, ...data, ts };
      });
      // Sort in memory ascending
      messages.sort((a, b) => a.ts - b.ts);
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
