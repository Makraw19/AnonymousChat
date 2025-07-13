import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, collection, addDoc, onSnapshot, query, serverTimestamp, deleteDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- App State and Config ---
const appState = {
    app: null, auth: null, db: null, userId: null, roomId: null,
    listeners: {
        messages: null,
        users: null,
        typing: null,
    },
    typingTimeout: null,
};

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-chat-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- DOM Element References ---
const roomSelectionView = document.getElementById('room-selection');
const chatView = document.getElementById('chat-view');
const joinRoomBtn = document.getElementById('join-room-btn');
const joinGeneralBtn = document.getElementById('join-general-btn');
const roomIdInput = document.getElementById('room-id-input');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const shareRoomBtn = document.getElementById('share-room-btn');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const messagesContainer = document.getElementById('messages');
const roomNameDisplay = document.getElementById('room-name');
const userIdDisplay = document.getElementById('user-id-display');
const userIdContainer = document.getElementById('user-id-container');
const copyFeedback = document.getElementById('copy-feedback');
const loadingAuth = document.getElementById('loading-auth');
const userListContainer = document.getElementById('user-list');
const typingIndicator = document.getElementById('typing-indicator');

// --- Firestore Path Helpers ---
const getRoomPath = (roomId) => `/artifacts/${appId}/public/data/chat_rooms/${roomId}`;
const getMessagesPath = (roomId) => `${getRoomPath(roomId)}/messages`;
const getUsersPath = (roomId) => `${getRoomPath(roomId)}/users`;
const getTypingPath = (roomId) => `${getRoomPath(roomId)}/typing`;

// --- Core Functions ---

async function initializeAndAuthenticate() {
    if (Object.keys(firebaseConfig).length === 0) {
        loadingAuth.textContent = "Error: App configuration is missing.";
        return;
    }
    try {
        appState.app = initializeApp(firebaseConfig);
        appState.auth = getAuth(appState.app);
        appState.db = getFirestore(appState.app);

        onAuthStateChanged(appState.auth, async (user) => {
            if (user) {
                appState.userId = user.uid;
                userIdDisplay.textContent = appState.userId;
                loadingAuth.style.display = 'none';
                joinRoomBtn.disabled = false;
                joinGeneralBtn.disabled = false;
                checkUrlForRoom(); // Check for a room in the URL after auth
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

function setupListeners(roomId) {
    // Messages Listener
    const messagesQuery = query(collection(appState.db, getMessagesPath(roomId)));
    appState.listeners.messages = onSnapshot(messagesQuery, snap => {
        const messages = [];
        snap.forEach(doc => messages.push({ id: doc.id, ...doc.data() }));
        messages.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
        renderMessages(messages);
    });

    // Online Users Listener
    const usersQuery = query(collection(appState.db, getUsersPath(roomId)));
    appState.listeners.users = onSnapshot(usersQuery, snap => {
        const users = [];
        snap.forEach(doc => users.push(doc.id));
        renderUsers(users);
    });

    // Typing Indicator Listener
    const typingQuery = query(collection(appState.db, getTypingPath(roomId)));
    appState.listeners.typing = onSnapshot(typingQuery, snap => {
        const typingUsers = [];
        snap.forEach(doc => {
            if (doc.id !== appState.userId) typingUsers.push(doc.id);
        });
        renderTypingIndicator(typingUsers);
    });
}

function cleanupListeners() {
    Object.values(appState.listeners).forEach(unsubscribe => unsubscribe && unsubscribe());
}

/**
 * Copies text to the clipboard using a fallback method for security restrictions.
 * @param {string} text The text to copy.
 * @returns {boolean} True if successful, false otherwise.
 */
function copyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    
    // Style to be invisible
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    let success = false;
    try {
        success = document.execCommand('copy');
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
    }

    document.body.removeChild(textArea);
    return success;
}

// --- Rendering Functions ---

function renderMessages(messages) {
    messagesContainer.innerHTML = '';
    messages.forEach(msg => {
        const isCurrentUser = msg.senderId === appState.userId;
        const messageWrapper = document.createElement('div');
        messageWrapper.classList.add('flex', 'flex-col');
        
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', 'p-3', 'rounded-xl', 'shadow-md');
        messageElement.classList.add(isCurrentUser ? 'message-user' : 'message-other');

        const senderIdDisplay = document.createElement('p');
        senderIdDisplay.classList.add('text-xs', 'font-bold', 'opacity-70', 'mb-1');
        senderIdDisplay.textContent = isCurrentUser ? 'You' : `User ${msg.senderId.substring(0, 6)}...`;
        
        const messageText = document.createElement('p');
        messageText.textContent = msg.text;

        const timestamp = document.createElement('p');
        timestamp.classList.add('text-xs', 'opacity-50', 'mt-2', 'text-right');
        timestamp.textContent = msg.timestamp ? new Date(msg.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

        messageElement.appendChild(senderIdDisplay);
        messageElement.appendChild(messageText);
        messageElement.appendChild(timestamp);
        messageWrapper.appendChild(messageElement);
        messagesContainer.appendChild(messageWrapper);
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function renderUsers(users) {
    userListContainer.innerHTML = '';
    users.forEach(uid => {
        const userElement = document.createElement('div');
        userElement.classList.add('flex', 'items-center', 'p-2', 'rounded-md', 'bg-white');
        const isCurrentUser = uid === appState.userId;
        userElement.innerHTML = `
            <span class="w-3 h-3 bg-green-400 rounded-full mr-2"></span>
            <span class="text-sm font-medium ${isCurrentUser ? 'text-blue-600' : 'text-gray-700'}">
                ${isCurrentUser ? 'You' : `User ${uid.substring(0, 6)}...`}
            </span>
        `;
        userListContainer.appendChild(userElement);
    });
}

function renderTypingIndicator(typingUsers) {
    if (typingUsers.length === 0) {
        typingIndicator.textContent = '';
    } else if (typingUsers.length === 1) {
        typingIndicator.textContent = `User ${typingUsers[0].substring(0,6)}... is typing...`;
    } else {
        typingIndicator.textContent = 'Several people are typing...';
    }
}

// --- User Actions & URL Management ---

async function joinRoom(roomId) {
    appState.roomId = roomId;
    roomNameDisplay.textContent = roomId;
    
    // Update URL hash
    window.history.pushState(null, '', '#room=' + roomId);

    await setDoc(doc(appState.db, getUsersPath(roomId), appState.userId), {});
    
    setupListeners(roomId);
    
    roomSelectionView.style.display = 'none';
    chatView.classList.remove('hidden');
    chatView.classList.add('flex');
}

async function leaveRoom() {
    if (!appState.roomId || !appState.userId) return;
    
    await deleteDoc(doc(appState.db, getUsersPath(appState.roomId), appState.userId));
    await deleteDoc(doc(appState.db, getTypingPath(appState.roomId), appState.userId));

    cleanupListeners();
    appState.roomId = null;
    
    // Clear URL hash
    window.history.pushState(null, '', window.location.pathname);

    chatView.classList.add('hidden');
    chatView.classList.remove('flex');
    roomSelectionView.style.display = 'flex';
    roomIdInput.value = '';
    messagesContainer.innerHTML = '';
    userListContainer.innerHTML = '';
    typingIndicator.textContent = '';
}

function checkUrlForRoom() {
    const hash = window.location.hash;
    if (hash.startsWith('#room=')) {
        const roomIdFromUrl = hash.substring(6);
        if (roomIdFromUrl) {
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
            timestamp: serverTimestamp()
        });
        await deleteDoc(doc(appState.db, getTypingPath(appState.roomId), appState.userId));
    } catch (error) {
        console.error("Error sending message: ", error);
    }
}

async function updateTypingStatus() {
    if (!appState.userId || !appState.roomId) return;
    
    if (appState.typingTimeout) clearTimeout(appState.typingTimeout);
    
    await setDoc(doc(appState.db, getTypingPath(appState.roomId), appState.userId), {});

    appState.typingTimeout = setTimeout(async () => {
        await deleteDoc(doc(appState.db, getTypingPath(appState.roomId), appState.userId));
    }, 3000); // User is considered "not typing" after 3 seconds
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
    if (copyTextToClipboard(shareLink)) {
        const originalText = shareRoomBtn.innerHTML;
        shareRoomBtn.textContent = 'Copied!';
        setTimeout(() => {
            shareRoomBtn.innerHTML = originalText;
        }, 2000);
    }
});

messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sendMessage(messageInput.value);
    messageInput.value = '';
});

messageInput.addEventListener('input', updateTypingStatus);

userIdContainer.addEventListener('click', () => {
    if (copyTextToClipboard(appState.userId)) {
        copyFeedback.classList.remove('hidden');
        setTimeout(() => copyFeedback.classList.add('hidden'), 2000);
    }
});

// Best-effort cleanup on tab close
window.addEventListener('beforeunload', (e) => {
    if (appState.roomId && appState.userId) {
        // This is not guaranteed to run, but it's the best we can do
        deleteDoc(doc(appState.db, getUsersPath(appState.roomId), appState.userId));
        deleteDoc(doc(appState.db, getTypingPath(appState.roomId), appState.userId));
    }
});

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    joinRoomBtn.disabled = true;
    joinGeneralBtn.disabled = true;
    initializeAndAuthenticate();
});
