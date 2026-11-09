const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

const DEFAULT_STORE = {
  users: [],
  messages: [],
};

function ensureDataStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(DEFAULT_STORE, null, 2));
  }
}

function readStore() {
  ensureDataStore();
  const file = fs.readFileSync(STORE_PATH, 'utf8');
  try {
    return JSON.parse(file) || structuredClone(DEFAULT_STORE);
  } catch (error) {
    return structuredClone(DEFAULT_STORE);
  }
}

function writeStore(store) {
  ensureDataStore();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

function sanitizeUser(user) {
  return {
    username: user.username,
    displayName: user.displayName,
    bio: user.bio || '',
    status: user.status || 'Available',
    avatarColor: user.avatarColor || '#4f46e5',
  };
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ message: 'Please log in to continue.' });
  }
  next();
}

app.use(
  session({
    secret: 'messaging-app-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    },
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'Messaging app API is running.' });
});

app.get('/api/session', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post('/api/register', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '').trim();
  const displayName = String(req.body.displayName || '').trim() || username;

  if (!username || !password || password.length < 4) {
    return res.status(400).json({
      message: 'Choose a username and a password with at least 4 characters.',
    });
  }

  const store = readStore();
  const existingUser = store.users.find((user) => user.username === username);

  if (existingUser) {
    return res.status(409).json({ message: 'That username is already taken.' });
  }

  const newUser = {
    username,
    password,
    displayName,
    bio: 'Hey there! I just joined.',
    status: 'Available',
    avatarColor: '#4f46e5',
    createdAt: new Date().toISOString(),
  };

  store.users.push(newUser);
  writeStore(store);

  req.session.user = sanitizeUser(newUser);
  res.status(201).json({ message: 'Account created.', user: req.session.user });
});

app.post('/api/login', (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '').trim();

  const store = readStore();
  const user = store.users.find(
    (entry) => entry.username === username && entry.password === password
  );

  if (!user) {
    return res.status(401).json({ message: 'Incorrect username or password.' });
  }

  req.session.user = sanitizeUser(user);
  res.json({ message: 'Logged in.', user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out.' });
  });
});

app.get('/api/users', requireAuth, (req, res) => {
  const store = readStore();
  const users = store.users
    .filter((user) => user.username !== req.session.user.username)
    .map(sanitizeUser);

  res.json({ users });
});

app.get('/api/profile', requireAuth, (req, res) => {
  const store = readStore();
  const user = store.users.find((entry) => entry.username === req.session.user.username);

  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  const safeUser = sanitizeUser(user);
  req.session.user = safeUser;
  res.json({ user: safeUser });
});

app.put('/api/profile', requireAuth, (req, res) => {
  const store = readStore();
  const userIndex = store.users.findIndex(
    (entry) => entry.username === req.session.user.username
  );

  if (userIndex === -1) {
    return res.status(404).json({ message: 'User not found.' });
  }

  const user = store.users[userIndex];
  const nextDisplayName = String(req.body.displayName || '').trim();
  const nextBio = String(req.body.bio || '').trim();
  const nextStatus = String(req.body.status || '').trim();
  const nextColor = String(req.body.avatarColor || '').trim();

  user.displayName = nextDisplayName || user.displayName;
  user.bio = nextBio || user.bio;
  user.status = nextStatus || user.status;
  user.avatarColor = nextColor || user.avatarColor;

  writeStore(store);

  const safeUser = sanitizeUser(user);
  req.session.user = safeUser;
  res.json({ message: 'Profile updated.', user: safeUser });
});

app.get('/api/messages', requireAuth, (req, res) => {
  const partner = String(req.query.withUser || '').trim().toLowerCase();
  if (!partner) {
    return res.status(400).json({ message: 'Choose a user to chat with.' });
  }

  const store = readStore();
  const currentUser = req.session.user.username;

  const messages = store.messages
    .filter(
      (message) =>
        (message.from === currentUser && message.to === partner) ||
        (message.from === partner && message.to === currentUser)
    )
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  res.json({ messages });
});

app.post('/api/messages', requireAuth, (req, res) => {
  const recipient = String(req.body.recipient || '').trim().toLowerCase();
  const text = String(req.body.text || '').trim();

  if (!recipient || !text) {
    return res.status(400).json({ message: 'Recipient and message are required.' });
  }

  const store = readStore();
  const sender = req.session.user.username;

  if (sender === recipient) {
    return res.status(400).json({ message: 'Choose another user to message.' });
  }

  const recipientExists = store.users.some((user) => user.username === recipient);
  if (!recipientExists) {
    return res.status(404).json({ message: 'That user does not exist.' });
  }

  const message = {
    id: makeId('msg'),
    from: sender,
    to: recipient,
    text,
    createdAt: new Date().toISOString(),
  };

  store.messages.push(message);
  writeStore(store);

  res.status(201).json({ message });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Messaging app running at http://localhost:${PORT}`);
});
