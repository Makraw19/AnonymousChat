import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, collection, addDoc, onSnapshot, query, serverTimestamp, deleteDoc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- App State and Config ---
const firebaseConfig = {
  apiKey: "AIzaSyCRa3Zz2t4a5IHxiRCeDYm3HLv53ch5QH8",
  authDomain: "myanonymouschatapplication.firebaseapp.com",
  projectId: "myanonymouschatapplication",
  storageBucket: "myanonymouschatapplication.appspot.com",
  messagingSenderId: "1016335936400",
  appId: "1:1016335936400:web:cd0ead42263f64d28d6115",
  measurementId: "G-TDGEQXSQ73"
};

const appState = {
    app: null, auth: null, db: null, storage: null, userId: null, roomId: null,
    currentUserDisplayName: null,
    isMuted: false,
    userNamesCache: new Map(),
    onlineUsers: [],
    listeners: {
        messages: null,
        users: null,
        typing: null,
    },
    typingTimeout: null,
    isInitialLoad: true,
};

const appId = 'default-chat-app';

// --- DOM Element References ---
const roomSelectionView = document.getElementById('room-selection');
const chatView = document.getElementById('chat-view');
const joinRoomBtn = document.getElementById('join-room-btn');
const joinGeneralBtn = document.getElementById('join-general-btn');
const roomIdInput = document.getElementById('room-id-input');
const leaveRoomBtnDesktop = document.getElementById('leave-room-btn-desktop');
const leaveRoomBtnMobile = document.getElementById('leave-room-btn-mobile');
const shareRoomBtnDesktop = document.getElementById('share-room-btn-desktop');
const shareRoomBtnMobile = document.getElementById('share-room-btn-mobile');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const muteBtn = document.getElementById('mute-btn');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');
const emojiPickerBtn = document.getElementById('emoji-picker-btn');
const messageEmojiPicker = document.getElementById('message-emoji-picker');
const messagesContainer = document.getElementById('messages');
const roomNameDisplay = document.getElementById('room-name');
const userNameDisplay = document.getElementById('user-name-display');
const userIdDisplay = document.getElementById('user-id-display');
const userIdContainer = document.getElementById('user-id-container');
const copyFeedback = document.getElementById('copy-feedback');
const loadingAuth = document.getElementById('loading-auth');
const userListContainer = document.getElementById('user-list');
const userListPanel = document.getElementById('user-list-panel');
const toggleUsersBtn = document.getElementById('toggle-users-btn');
const userCountBadge = document.getElementById('user-count-badge');
const typingIndicator = document.getElementById('typing-indicator');
const notificationSound = document.getElementById('notification-sound');
const moreOptionsBtn = document.getElementById('more-options-btn');
const moreOptionsDropdown = document.getElementById('more-options-dropdown');


// --- Firestore Path Helpers ---
const getUsersBasePath = () => `/artifacts/${appId}/public/data/users`;
const getRoomPath = (roomId) => `/artifacts/${appId}/public/data/chat_rooms/${roomId}`;
const getMessagesPath = (roomId) => `${getRoomPath(roomId)}/messages`;
const getOnlineUsersPath = (roomId) => `${getRoomPath(roomId)}/users`;
const getTypingPath = (roomId) => `${getRoomPath(roomId)}/typing`;

// --- Emojis ---
const emojis = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪'];

// --- Name & Avatar Generation ---
const adjectives = ["Agile", "Bright", "Clever", "Dapper", "Eager", "Fancy", "Gentle", "Happy", "Jolly", "Keen", "Lucky", "Merry", "Nice", "Proud", "Silly", "Witty"];
const nouns = ["Aardvark", "Badger", "Capybara", "Dolphin", "Elephant", "Fox", "Giraffe", "Hippo", "Iguana", "Jaguar", "Koala", "Lemur", "Meerkat", "Narwhal", "Ocelot", "Panda"];
const avatarColors = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#d946ef', '#ec4899'];

function generateRandomName() {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj} ${noun}`;
}

function getAvatarColor(userId) {
    const hash = userId.split('').reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
    return avatarColors[Math.abs(hash) % avatarColors.length];
}

// --- Core Functions ---

async function initializeAndAuthenticate() {
    if (!firebaseConfig || !firebaseConfig.apiKey) {
        loadingAuth.innerHTML = `<span class="text-red-500 font-bold">Error: Firebase config is missing in script.js!</span> Please add it to run the app.`;
        return;
    }
    try {
        appState.app = initializeApp(firebaseConfig);
        appState.auth = getAuth(appState.app);
        appState.db = getFirestore(appState.app);
        appState.storage = getStorage(appState.app);

        onAuthStateChanged(appState.auth, async (user) => {
            if (user) {
                appState.userId = user.uid;
                await getOrCreateUserProfile(user.uid);
                
                userIdDisplay.textContent = user.uid.substring(0, 6) + '...';
                userNameDisplay.textContent = appState.currentUserDisplayName;

                loadingAuth.style.display = 'none';
                joinRoomBtn.disabled = false;
                joinGeneralBtn.disabled = false;
                checkUrlForRoom();
            } else {
                try {
                    await signInAnonymously(appState.auth);
                } catch (error) {
                    console.error("Sign-in error:", error);
                    loadingAuth.textContent = "Authentication failed.";
                }
            }
        });
    } catch (error) {
        console.error("Firebase init failed:", error);
        loadingAuth.textContent = "Error: Could not connect.";
    }
}

async function getOrCreateUserProfile(userId) {
    const userDocRef = doc(appState.db, getUsersBasePath(), userId);
    const userDocSnap = await getDoc(userDocRef);

    if (userDocSnap.exists() && userDocSnap.data().displayName) {
        appState.currentUserDisplayName = userDocSnap.data().displayName;
    } else {
        const newName = generateRandomName();
        await setDoc(userDocRef, { displayName: newName }, { merge: true });
        appState.currentUserDisplayName = newName;
    }
    appState.userNamesCache.set(userId, appState.currentUserDisplayName);
}

async function fetchUserNames(userIds) {
    const idsToFetch = [...new Set(userIds)].filter(id => !appState.userNamesCache.has(id));
    if (idsToFetch.length === 0) return;

    const fetchPromises = idsToFetch.map(id => getDoc(doc(appState.db, getUsersBasePath(), id)));
    const userDocs = await Promise.all(fetchPromises);

    userDocs.forEach(docSnap => {
        if (docSnap.exists()) {
            appState.userNamesCache.set(docSnap.id, docSnap.data().displayName || 'Anonymous');
        }
    });
}

function setupListeners(roomId) {
    const messagesQuery = query(collection(appState.db, getMessagesPath(roomId)));
    appState.listeners.messages = onSnapshot(messagesQuery, async (snap) => {
        let newMessages = false;
        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const data = change.doc.data();
                if (data.senderId !== appState.userId && !appState.isInitialLoad) {
                    newMessages = true;
                }
            }
        });
        
        if (newMessages && !appState.isMuted) {
            notificationSound.play().catch(e => console.log("Sound play failed:", e));
        }

        const messages = [];
        const senderIds = [];
        snap.forEach(doc => {
            const data = doc.data();
            messages.push({ id: doc.id, ...data });
            if(data.senderId) senderIds.push(data.senderId);
            if (!data.seenBy?.includes(appState.userId)) {
                markAsSeen(doc.id);
            }
        });
        
        appState.isInitialLoad = false;

        await fetchUserNames(senderIds);
        messages.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
        renderMessages(messages);
    });

    const usersQuery = query(collection(appState.db, getOnlineUsersPath(roomId)));
    appState.listeners.users = onSnapshot(usersQuery, async (snap) => {
        appState.onlineUsers = [];
        snap.forEach(doc => appState.onlineUsers.push(doc.id));
        await fetchUserNames(appState.onlineUsers);
        renderUsers(appState.onlineUsers);
    });

    const typingQuery = query(collection(appState.db, getTypingPath(roomId)));
    appState.listeners.typing = onSnapshot(typingQuery, async (snap) => {
        const typingUserIds = [];
        snap.forEach(doc => {
            if (doc.id !== appState.userId) typingUserIds.push(doc.id);
        });
        await fetchUserNames(typingUserIds);
        renderTypingIndicator(typingUserIds);
    });
}

function cleanupListeners() {
    Object.values(appState.listeners).forEach(unsubscribe => unsubscribe && unsubscribe());
    appState.isInitialLoad = true;
}

async function copyTextToClipboard(text) {
     if (!navigator.clipboard) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Fallback: Oops, unable to copy', err);
        }
        document.body.removeChild(textArea);
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
    } catch (err) {
        console.error('Failed to copy: ', err);
    }
}

// --- Rendering Functions ---

function renderMessages(messages) {
    messagesContainer.innerHTML = '';
    messages.forEach(msg => {
        const isCurrentUser = msg.senderId === appState.userId;
        const displayName = appState.userNamesCache.get(msg.senderId) || '...';
        
        const messageWrapper = document.createElement('div');
        messageWrapper.classList.add('message-wrapper', 'flex', 'items-end', 'gap-3');
        if (isCurrentUser) messageWrapper.classList.add('flex-row-reverse');
        
        const avatar = document.createElement('div');
        avatar.classList.add('avatar');
        avatar.style.backgroundColor = getAvatarColor(msg.senderId);
        avatar.textContent = displayName.charAt(0).toUpperCase();

        const messageBubble = document.createElement('div');
        messageBubble.classList.add('message-bubble', 'flex', 'flex-col', 'max-w-xs', 'sm:max-w-md');
        
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', 'p-3', 'rounded-xl', 'shadow-md', 'w-fit');
        messageElement.classList.add(isCurrentUser ? 'message-user' : 'message-other');

        const senderIdDisplay = document.createElement('p');
        senderIdDisplay.classList.add('text-xs', 'font-bold', 'opacity-70', 'mb-1');
        senderIdDisplay.textContent = isCurrentUser ? 'You' : displayName;

        const messageContent = document.createElement('div');
        if (msg.text) {
            const p = document.createElement('p');
            p.classList.add('text-sm');
            p.textContent = msg.text;
            messageContent.appendChild(p);
        } else if (msg.fileURL) {
             if (msg.fileType && msg.fileType.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = msg.fileURL;
                img.classList.add('max-w-xs', 'rounded-lg', 'mt-2', 'cursor-pointer');
                img.onclick = () => window.open(msg.fileURL, '_blank');
                messageContent.appendChild(img);
             } else {
                const a = document.createElement('a');
                a.href = msg.fileURL;
                a.target = '_blank';
                a.textContent = msg.fileName || 'Download File';
                a.classList.add('text-blue-400', 'underline');
                messageContent.appendChild(a);
             }
        }
        
        const footerContainer = document.createElement('div');
        footerContainer.classList.add('flex', 'items-center', 'justify-end', 'mt-2');

        const timestamp = document.createElement('p');
        timestamp.classList.add('text-xs', 'opacity-50');
        timestamp.textContent = msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        
        const readReceipt = document.createElement('span');
        if (isCurrentUser) {
            readReceipt.classList.add('read-receipt');
            const seenByCount = msg.seenBy?.length || 0;
            if (seenByCount >= appState.onlineUsers.length && appState.onlineUsers.length > 1) {
                readReceipt.innerHTML = '&#10003;&#10003;'; // Double check
                readReceipt.classList.add('seen-by-all');
            } else if (seenByCount > 1) {
                readReceipt.innerHTML = '&#10003;'; // Single check
            }
        }
        
        footerContainer.appendChild(timestamp);
        footerContainer.appendChild(readReceipt);

        messageElement.appendChild(senderIdDisplay);
        messageElement.appendChild(messageContent);
        messageElement.appendChild(footerContainer);
        
        const reactionsContainer = document.createElement('div');
        reactionsContainer.classList.add('reactions-container');
        const reactions = msg.reactions || {};
        
        for (const emoji in reactions) {
            const reactors = reactions[emoji];
            if (reactors && reactors.length > 0) {
                const reactionElement = document.createElement('span');
                reactionElement.classList.add('reaction');
                reactionElement.textContent = `${emoji} ${reactors.length}`;
                if (reactors.includes(appState.userId)) {
                    reactionElement.classList.add('reacted-by-user');
                }
                reactionElement.addEventListener('click', (e) => { e.stopPropagation(); toggleReaction(msg.id, emoji); });
                reactionsContainer.appendChild(reactionElement);
            }
        }

        const addReactionButton = document.createElement('button');
        addReactionButton.textContent = '+';
        addReactionButton.classList.add('reaction', 'add-reaction-btn');
        
        const emojiPicker = document.createElement('div');
        emojiPicker.classList.add('emoji-picker');
        
        const defaultEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
        defaultEmojis.forEach(emoji => {
            const emojiOption = document.createElement('span');
            emojiOption.classList.add('reaction');
            emojiOption.textContent = emoji;
            emojiOption.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleReaction(msg.id, emoji);
                emojiPicker.classList.remove('active');
            });
            emojiPicker.appendChild(emojiOption);
        });

        addReactionButton.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.emoji-picker.active').forEach(picker => picker.classList.remove('active'));
            emojiPicker.classList.toggle('active');
        });

        reactionsContainer.appendChild(addReactionButton);
        reactionsContainer.appendChild(emojiPicker);
        messageBubble.appendChild(messageElement);
        messageBubble.appendChild(reactionsContainer);
        
        messageWrapper.appendChild(avatar);
        messageWrapper.appendChild(messageBubble);
        messagesContainer.appendChild(messageWrapper);
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function renderUsers(users) {
    userListContainer.innerHTML = '';
    userCountBadge.textContent = users.length;
    users.forEach(uid => {
        const userElement = document.createElement('div');
        userElement.classList.add('flex', 'items-center', 'p-2', 'rounded-md', 'hover:bg-slate-200', 'dark:hover:bg-slate-700/50', 'transition-colors', 'user-list-item');
        const isCurrentUser = uid === appState.userId;
        const displayName = appState.userNamesCache.get(uid) || '...';

        const avatar = document.createElement('div');
        avatar.classList.add('avatar', 'mr-3');
        avatar.style.backgroundColor = getAvatarColor(uid);
        avatar.textContent = displayName.charAt(0).toUpperCase();

        const nameSpan = document.createElement('span');
        nameSpan.classList.add('text-sm', 'font-medium', 'truncate');
        nameSpan.classList.toggle('text-blue-500', isCurrentUser);
        nameSpan.textContent = isCurrentUser ? 'You' : displayName;

        userElement.appendChild(avatar);
        userElement.appendChild(nameSpan);
        userListContainer.appendChild(userElement);
    });
}

function renderTypingIndicator(typingUsers) {
    if (typingUsers.length === 0) {
        typingIndicator.innerHTML = '';
    } else {
        const name = appState.userNamesCache.get(typingUsers[0]) || 'Someone';
        const text = typingUsers.length > 1 ? 'Several people are typing' : `${name} is typing`;
        typingIndicator.innerHTML = `
            <span class="text-sm italic">${text}</span>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
    }
}

// --- User Actions & URL Management ---

async function joinRoom(roomId) {
    appState.roomId = roomId;
    roomNameDisplay.textContent = roomId;
    window.history.pushState(null, '', '#room=' + roomId);

    await setDoc(doc(appState.db, getOnlineUsersPath(roomId), appState.userId), {});
    setupListeners(roomId);
    
    roomSelectionView.style.display = 'none';
    chatView.classList.remove('hidden');
    chatView.classList.add('flex');
}

async function leaveRoom() {
    if (!appState.roomId || !appState.userId) return;
    
    await deleteDoc(doc(appState.db, getOnlineUsersPath(appState.roomId), appState.userId));
    await deleteDoc(doc(appState.db, getTypingPath(appState.roomId), appState.userId));

    cleanupListeners();
    appState.roomId = null;
    
    window.history.pushState(null, '', window.location.pathname);

    chatView.classList.add('hidden');
    chatView.classList.remove('flex');
    roomSelectionView.style.display = 'flex';
    roomIdInput.value = '';
    messagesContainer.innerHTML = '';
    userListContainer.innerHTML = '';
    typingIndicator.textContent = '';
    userListPanel.classList.remove('active');
}

function checkUrlForRoom() {
    const hash = window.location.hash;
    if (hash.startsWith('#room=')) {
        const roomIdFromUrl = hash.substring(6);
        if (roomIdFromUrl && appState.userId) {
            joinRoom(roomIdFromUrl);
        }
    }
}

async function sendMessage(text) {
    if (!text.trim() || !appState.userId || !appState.roomId) return;
    try {
        await addDoc(collection(appState.db, getMessagesPath(appState.roomId)), {
            text: text,
            senderId: appState.userId,
            timestamp: serverTimestamp(),
            seenBy: [appState.userId]
        });
        messageInput.value = '';
        await deleteDoc(doc(appState.db, getTypingPath(appState.roomId), appState.userId));
    } catch (error) {
        console.error("Error sending message: ", error);
    }
}

async function toggleReaction(messageId, emoji) {
    const messageRef = doc(appState.db, getMessagesPath(appState.roomId), messageId);
    const messageSnap = await getDoc(messageRef);
    if (messageSnap.exists()) {
        const reactions = messageSnap.data().reactions || {};
        const reactors = reactions[emoji] || [];
        const reactionPath = `reactions.${emoji}`;
        if (reactors.includes(appState.userId)) {
            await updateDoc(messageRef, { [reactionPath]: arrayRemove(appState.userId) });
        } else {
            await updateDoc(messageRef, { [reactionPath]: arrayUnion(appState.userId) });
        }
    }
}

async function markAsSeen(messageId) {
    const messageRef = doc(appState.db, getMessagesPath(appState.roomId), messageId);
    await updateDoc(messageRef, {
        seenBy: arrayUnion(appState.userId)
    });
}

async function updateTypingStatus() {
    if (!appState.userId || !appState.roomId) return;
    if (appState.typingTimeout) clearTimeout(appState.typingTimeout);
    await setDoc(doc(appState.db, getTypingPath(appState.roomId), appState.userId), {});
    appState.typingTimeout = setTimeout(async () => {
        await deleteDoc(doc(appState.db, getTypingPath(appState.roomId), appState.userId));
    }, 3000);
}

// --- Theme, Mute & Emoji Management ---
function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        themeToggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`; // Moon
    } else {
        document.documentElement.classList.remove('dark');
        themeToggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`; // Sun
    }
}

function toggleTheme() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', newTheme);
    applyTheme(newTheme);
}

function renderMuteButton() {
    if (appState.isMuted) {
        muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`; // Muted Icon
    } else {
        muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`; // Unmuted Icon
    }
}

function initializeEmojiPicker() {
    emojis.forEach(emoji => {
        const emojiSpan = document.createElement('span');
        emojiSpan.textContent = emoji;
        emojiSpan.addEventListener('click', () => {
            messageInput.value += emoji;
            messageInput.focus();
        });
        messageEmojiPicker.appendChild(emojiSpan);
    });
}

// --- Event Handlers ---

joinRoomBtn.addEventListener('click', () => {
    const roomId = roomIdInput.value.trim().toLowerCase().replace(/\s+/g, '-');
    if (roomId && appState.userId) {
        joinRoom(roomId);
    } else {
        roomIdInput.classList.add('border-red-500', 'ring-red-500');
        roomIdInput.placeholder = "Please enter a valid room name!";
        setTimeout(() => {
            roomIdInput.classList.remove('border-red-500', 'ring-red-500');
            roomIdInput.placeholder = "e.g., 'project-phoenix'";
        }, 2500);
    }
});

joinGeneralBtn.addEventListener('click', (e) => {
    const roomId = e.currentTarget.dataset.room;
    if (roomId && appState.userId) {
        joinRoom(roomId);
    }
});

leaveRoomBtnDesktop.addEventListener('click', leaveRoom);
leaveRoomBtnMobile.addEventListener('click', leaveRoom);

const shareRoomAction = async (e) => {
    e.stopPropagation();
    const shareLink = window.location.href;
    await copyTextToClipboard(shareLink);
    const originalText = e.currentTarget.innerHTML;
    e.currentTarget.innerHTML = 'Copied!';
    setTimeout(() => {
        e.currentTarget.innerHTML = originalText;
    }, 2000);
};

shareRoomBtnDesktop.addEventListener('click', shareRoomAction);
shareRoomBtnMobile.addEventListener('click', shareRoomAction);

toggleUsersBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    userListPanel.classList.toggle('active');
});

themeToggleBtn.addEventListener('click', toggleTheme);

muteBtn.addEventListener('click', () => {
    appState.isMuted = !appState.isMuted;
    localStorage.setItem('chat_is_muted', appState.isMuted);
    renderMuteButton();
});

emojiPickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    messageEmojiPicker.classList.toggle('active');
});

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(messageInput.value);
});

messageInput.addEventListener('input', updateTypingStatus);

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const storageRef = ref(appState.storage, `chat_files/${appState.roomId}/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);

        await addDoc(collection(appState.db, getMessagesPath(appState.roomId)), {
            senderId: appState.userId,
            timestamp: serverTimestamp(),
            seenBy: [appState.userId],
            fileURL: downloadURL,
            fileName: file.name,
            fileType: file.type
        });
    } catch (error) {
        console.error("Error uploading file:", error);
        alert("Failed to upload file.");
    }
    fileInput.value = ''; // Reset file input
});

userIdContainer.addEventListener('click', async (e) => {
    if (e.target.id === 'user-name-display') return; // Profile edit handles this
    e.stopPropagation();
    await copyTextToClipboard(appState.userId);
    copyFeedback.classList.remove('hidden');
    setTimeout(() => copyFeedback.classList.add('hidden'), 2000);
});

userNameDisplay.addEventListener('click', () => {
    const currentName = userNameDisplay.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'bg-transparent border-b border-blue-500 focus:outline-none w-32';

    userNameDisplay.innerHTML = '';
    userNameDisplay.appendChild(input);
    input.focus();

    const finishEditing = async () => {
        const newName = input.value.trim();
        if (newName && newName !== appState.currentUserDisplayName) {
            const userDocRef = doc(appState.db, getUsersBasePath(), appState.userId);
            await updateDoc(userDocRef, { displayName: newName });
            
            appState.currentUserDisplayName = newName;
            appState.userNamesCache.set(appState.userId, newName);
        }
        userNameDisplay.innerHTML = '';
        userNameDisplay.textContent = appState.currentUserDisplayName;
        
        input.removeEventListener('blur', finishEditing);
        input.removeEventListener('keydown', handleKeydown);
    };

    const handleKeydown = (e) => {
        if (e.key === 'Enter') {
            input.blur();
        } else if (e.key === 'Escape') {
            input.value = appState.currentUserDisplayName;
            input.blur();
        }
    };

    input.addEventListener('blur', finishEditing);
    input.addEventListener('keydown', handleKeydown);
});

moreOptionsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    moreOptionsDropdown.classList.toggle('hidden');
});

document.body.addEventListener('click', (e) => {
    if (!e.target.closest('.reactions-container')) {
        document.querySelectorAll('.emoji-picker.active').forEach(picker => picker.classList.remove('active'));
    }
    if (!e.target.closest('#message-emoji-picker') && !e.target.closest('#emoji-picker-btn')) {
        messageEmojiPicker.classList.remove('active');
    }
    if (!e.target.closest('#user-list-panel') && !e.target.closest('#toggle-users-btn')) {
        userListPanel.classList.remove('active');
    }
    if (!e.target.closest('#more-options-btn')) {
        moreOptionsDropdown.classList.add('hidden');
    }
});

window.addEventListener('beforeunload', () => {
    if (appState.roomId && appState.userId) {
        deleteDoc(doc(appState.db, getOnlineUsersPath(appState.roomId), appState.userId));
        deleteDoc(doc(appState.db, getTypingPath(appState.roomId), appState.userId));
    }
});

document.addEventListener('DOMContentLoaded', () => {
    joinRoomBtn.disabled = true;
    joinGeneralBtn.disabled = true;
    
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);
    
    appState.isMuted = localStorage.getItem('chat_is_muted') === 'true';
    renderMuteButton();
    
    initializeEmojiPicker();
    initializeAndAuthenticate();
});




