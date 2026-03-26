require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Load config
const configPath = path.join(__dirname, 'config', 'config.json');
let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  console.error('Error loading config/config.json:', e.message);
  process.exit(1);
}

// Define Key Schema (matching app.js)
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

const Key = mongoose.model('Key', keySchema);

const TARGET_KEY = 'e9e67bbf-1655-41ed-bf67-c2db404f2928';

async function updateKey() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(config.mongodb.uri, config.mongodb.options);
    console.log('Connected!');

    console.log(`Updating key: ${TARGET_KEY}...`);
    const result = await Key.findOneAndUpdate(
      { key: TARGET_KEY },
      {
        $set: {
          permission: ['vip'],
          'limits.max_time': 500,
          'limits.concurrent': 2,
          'limits.cooldown': 0,
          status: 'active'
        }
      },
      { new: true, upsert: true } // Create if not exists
    );

    console.log('Update successful!');
    console.log(JSON.stringify(result, null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await mongoose.connection.close();
    console.log('Connection closed.');
  }
}

updateKey();
