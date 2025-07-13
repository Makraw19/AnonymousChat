import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, collection, addDoc, onSnapshot, query, serverTimestamp, deleteDoc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- App State and Config ---
const firebaseConfig = {
  apiKey: "AIzaSyCRa3Zz2t4a5IHxiRCeDYm3HLv53ch5QH8",
  authDomain: "myanonymouschatapplication.firebaseapp.com",
  projectId: "myanonymouschatapplication",
  storageBucket: "myanonymouschatapplication.firebasestorage.app",
  messagingSenderId: "1016335936400",
  appId: "1:1016335936400:web:cd0ead42263f64d28d6115",
  measurementId: "G-TDGEQXSQ73"
};

const appState = {
    app: null, auth: null, db: null, userId: null, roomId: null,
    currentUserDisplayName: null,
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

const initialAuthToken = null;
const appId = 'default-chat-app';

// --- DOM Element References ---
const roomSelectionView = document.getElementById('room-selection');
const chatView = document.getElementById('chat-view');
const joinRoomBtn = document.getElementById('join-room-btn');
const joinGeneralBtn = document.getElementById('join-general-btn');
const roomIdInput = document.getElementById('room-id-input');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const shareRoomBtn = document.getElementById('share-room-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
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

// --- Firestore Path Helpers ---
const getUsersBasePath = () => `/artifacts/${appId}/public/data/users`;
const getRoomPath = (roomId) => `/artifacts/${appId}/public/data/chat_rooms/${roomId}`;
const getMessagesPath = (roomId) => `${getRoomPath(roomId)}/messages`;
const getOnlineUsersPath = (roomId) => `${getRoomPath(roomId)}/users`;
const getTypingPath = (roomId) => `${getRoomPath(roomId)}/typing`;

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
                    if (initialAuthToken) await signInWithCustomToken(appState.auth, initialAuthToken);
                    else await signInAnonymously(appState.auth);
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

    if (userDocSnap.exists()) {
        appState.currentUserDisplayName = userDocSnap.data().displayName;
    } else {
        const newName = generateRandomName();
        await setDoc(userDocRef, { displayName: newName });
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
            appState.userNamesCache.set(docSnap.id, docSnap.data().displayName);
        }
    });
}

function setupListeners(roomId) {
    const messagesQuery = query(collection(appState.db, getMessagesPath(roomId)));
    appState.listeners.messages = onSnapshot(messagesQuery, async (snap) => {
        const messages = [];
        const senderIds = [];
        let newMessages = false;
        snap.docChanges().forEach(change => {
            if (change.type === "added") {
                const data = change.doc.data();
                if (data.senderId !== appState.userId && !appState.isInitialLoad) {
                    newMessages = true;
                }
            }
        });

        snap.forEach(doc => {
            const data = doc.data();
            messages.push({ id: doc.id, ...data });
            senderIds.push(data.senderId);
            if (!data.seenBy?.includes(appState.userId)) {
                markAsSeen(doc.id);
            }
        });
        
        if (newMessages) {
            notificationSound.play().catch(e => console.log("Sound play failed:", e));
        }
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

function copyTextToClipboard(text) {
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
}

// --- Rendering Functions ---

function renderMessages(messages) {
    messagesContainer.innerHTML = '';
    messages.forEach(msg => {
        const isCurrentUser = msg.senderId === appState.userId;
        const displayName = appState.userNamesCache.get(msg.senderId) || '...';
        
        const messageWrapper = document.createElement('div');
        messageWrapper.classList.add('flex', 'items-start', 'gap-3');
        if (isCurrentUser) messageWrapper.classList.add('flex-row-reverse');
        
        const avatar = document.createElement('div');
        avatar.classList.add('avatar');
        avatar.style.backgroundColor = getAvatarColor(msg.senderId);
        avatar.textContent = displayName.charAt(0).toUpperCase();

        const messageBubble = document.createElement('div');
        messageBubble.classList.add('flex', 'flex-col');
        
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', 'p-3', 'rounded-xl', 'shadow-md', 'w-fit');
        messageElement.classList.add(isCurrentUser ? 'message-user' : 'message-other');

        const senderIdDisplay = document.createElement('p');
        senderIdDisplay.classList.add('text-xs', 'font-bold', 'opacity-70', 'mb-1');
        senderIdDisplay.textContent = isCurrentUser ? 'You' : displayName;
        
        const messageText = document.createElement('p');
        messageText.textContent = msg.text;
        
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
                readReceipt.textContent = '✓✓';
                readReceipt.classList.add('seen-by-all');
            } else if (seenByCount > 1) {
                readReceipt.textContent = '✓';
            }
        }
        
        footerContainer.appendChild(timestamp);
        footerContainer.appendChild(readReceipt);

        messageElement.appendChild(senderIdDisplay);
        messageElement.appendChild(messageText);
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
        messageElement.appendChild(reactionsContainer);
        
        messageBubble.appendChild(messageElement);
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
        userElement.classList.add('flex', 'items-center', 'p-2', 'rounded-md', 'hover:bg-slate-200', 'dark:hover:bg-slate-700');
        const isCurrentUser = uid === appState.userId;
        const displayName = appState.userNamesCache.get(uid) || '...';

        const avatar = document.createElement('div');
        avatar.classList.add('avatar', 'mr-2');
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
        typingIndicator.textContent = '';
    } else if (typingUsers.length === 1) {
        const name = appState.userNamesCache.get(typingUsers[0]) || 'Someone';
        typingIndicator.textContent = `${name} is typing...`;
    } else {
        typingIndicator.textContent = 'Several people are typing...';
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
        if (reactors.includes(appState.userId)) {
            await updateDoc(messageRef, {
                [`reactions.${emoji}`]: arrayRemove(appState.userId)
            });
        } else {
            await updateDoc(messageRef, {
                [`reactions.${emoji}`]: arrayUnion(appState.userId)
            });
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

// --- Theme Management ---
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

leaveRoomBtn.addEventListener('click', leaveRoom);

shareRoomBtn.addEventListener('click', () => {
    const shareLink = window.location.href;
    copyTextToClipboard(shareLink);
    const originalText = shareRoomBtn.innerHTML;
    shareRoomBtn.innerHTML = 'Copied!';
    setTimeout(() => {
        shareRoomBtn.innerHTML = originalText;
    }, 2000);
});

toggleUsersBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    userListPanel.classList.toggle('active');
});

themeToggleBtn.addEventListener('click', toggleTheme);

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(messageInput.value);
    messageInput.value = '';
});

messageInput.addEventListener('input', updateTypingStatus);

userIdContainer.addEventListener('click', () => {
    copyTextToClipboard(appState.userId);
    copyFeedback.classList.remove('hidden');
    setTimeout(() => copyFeedback.classList.add('hidden'), 2000);
});

document.body.addEventListener('click', (e) => {
    if (!e.target.closest('.reactions-container')) {
        document.querySelectorAll('.emoji-picker.active').forEach(picker => picker.classList.remove('active'));
    }
    if (!e.target.closest('#user-list-panel') && !e.target.closest('#toggle-users-btn')) {
        userListPanel.classList.remove('active');
    }
});

window.addEventListener('beforeunload', (e) => {
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
    initializeAndAuthenticate();
});


