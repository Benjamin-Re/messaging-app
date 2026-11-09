const state = {
  user: null,
  users: [],
  activeChat: null,
  messages: [],
};

const authView = document.getElementById('authView');
const appView = document.getElementById('appView');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const profileForm = document.getElementById('profileForm');
const messageForm = document.getElementById('messageForm');
const userListEl = document.getElementById('userList');
const chatMessagesEl = document.getElementById('chatMessages');
const profileAvatar = document.getElementById('profileAvatar');
const profileName = document.getElementById('profileName');
const profileStatus = document.getElementById('profileStatus');
const displayNameInput = document.getElementById('displayNameInput');
const statusInput = document.getElementById('statusInput');
const bioInput = document.getElementById('bioInput');
const colorInput = document.getElementById('colorInput');
const messageInput = document.getElementById('messageInput');
const logoutBtn = document.getElementById('logoutBtn');

const authTabs = document.querySelectorAll('[data-auth-tab]');

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'Request failed.');
  }

  return payload;
}

function showAuthTab(tabName) {
  const isLogin = tabName === 'login';
  loginForm.classList.toggle('hidden', !isLogin);
  registerForm.classList.toggle('hidden', isLogin);
  authTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.authTab === tabName);
  });
}

function renderAuthenticatedView() {
  if (!state.user) {
    authView.classList.remove('hidden');
    appView.classList.add('hidden');
    return;
  }

  authView.classList.add('hidden');
  appView.classList.remove('hidden');

  profileAvatar.textContent = state.user.displayName.charAt(0).toUpperCase();
  profileAvatar.style.background = state.user.avatarColor || '#4f46e5';
  profileName.textContent = state.user.displayName;
  profileStatus.textContent = state.user.status || 'Available';

  displayNameInput.value = state.user.displayName || '';
  statusInput.value = state.user.status || '';
  bioInput.value = state.user.bio || '';
  colorInput.value = state.user.avatarColor || '#4f46e5';
}

function renderUserList() {
  userListEl.innerHTML = '';

  if (!state.users.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No one else has joined the app yet.';
    userListEl.appendChild(empty);
    return;
  }

  state.users.forEach((user) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `user-pill ${state.activeChat === user.username ? 'active' : ''}`;
    button.innerHTML = `<span class="dot"></span><span>${user.displayName}</span>`;
    button.addEventListener('click', () => selectChat(user.username));
    userListEl.appendChild(button);
  });
}

function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderMessages() {
  chatMessagesEl.innerHTML = '';

  if (!state.messages.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No messages yet. Say hello!';
    chatMessagesEl.appendChild(empty);
    return;
  }

  state.messages.forEach((message) => {
    const wrapper = document.createElement('div');
    const isOutgoing = message.from === state.user.username;
    wrapper.className = `message-row ${isOutgoing ? 'outgoing' : 'incoming'}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = message.text;

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = `${isOutgoing ? 'You' : message.from} • ${formatTime(message.createdAt)}`;

    wrapper.appendChild(bubble);
    wrapper.appendChild(meta);
    chatMessagesEl.appendChild(wrapper);
  });

  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

async function loadUsers() {
  const data = await api('/api/users');
  state.users = data.users || [];
  if (!state.activeChat && state.users.length) {
    state.activeChat = state.users[0].username;
  }
  renderUserList();
}

async function loadMessages() {
  if (!state.activeChat) {
    state.messages = [];
    renderMessages();
    return;
  }

  const data = await api(`/api/messages?withUser=${encodeURIComponent(state.activeChat)}`);
  state.messages = data.messages || [];
  renderMessages();
}

async function selectChat(username) {
  state.activeChat = username;
  renderUserList();
  await loadMessages();
}

async function checkSession() {
  try {
    const data = await api('/api/session');
    state.user = data.user;
    renderAuthenticatedView();

    if (state.user) {
      await loadUsers();
      await loadMessages();
    }
  } catch (error) {
    console.error(error);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const payload = {
    username: formData.get('username'),
    password: formData.get('password'),
  };

  try {
    const result = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    state.user = result.user;
    renderAuthenticatedView();
    await loadUsers();
    await loadMessages();
  } catch (error) {
    window.alert(error.message);
  }
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(registerForm);
  const payload = {
    username: formData.get('username'),
    password: formData.get('password'),
    displayName: formData.get('displayName'),
  };

  try {
    const result = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    state.user = result.user;
    renderAuthenticatedView();
    await loadUsers();
    await loadMessages();
  } catch (error) {
    window.alert(error.message);
  }
});

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    const result = await api('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({
        displayName: displayNameInput.value,
        status: statusInput.value,
        bio: bioInput.value,
        avatarColor: colorInput.value,
      }),
    });

    state.user = result.user;
    renderAuthenticatedView();
  } catch (error) {
    window.alert(error.message);
  }
});

messageForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.activeChat) {
    return;
  }

  const text = messageInput.value.trim();
  if (!text) {
    return;
  }

  try {
    await api('/api/messages', {
      method: 'POST',
      body: JSON.stringify({
        recipient: state.activeChat,
        text,
      }),
    });

    messageInput.value = '';
    await loadMessages();
  } catch (error) {
    window.alert(error.message);
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await api('/api/logout', {
      method: 'POST',
    });

    state.user = null;
    state.activeChat = null;
    state.users = [];
    state.messages = [];
    renderAuthenticatedView();
  } catch (error) {
    console.error(error);
  }
});

authTabs.forEach((tab) => {
  tab.addEventListener('click', () => showAuthTab(tab.dataset.authTab));
});

checkSession();
showAuthTab('login');
