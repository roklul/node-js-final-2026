require('dotenv').config();
const app = require('../app');
const { initDB } = require('../db');

const PORT = process.env.PORT || 8080;

async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start().catch((e) => {
  console.error('Failed to start:', e.message);
  process.exit(1);
});
