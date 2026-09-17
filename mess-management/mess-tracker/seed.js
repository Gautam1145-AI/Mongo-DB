const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const FIXED_DISHES = [
  { name: 'Rice', category: 'grain' },
  { name: 'Dal', category: 'lentils' },
  { name: 'Roti', category: 'bread' },
  { name: 'Paneer Curry', category: 'curry' },
  { name: 'Mixed Veg', category: 'vegetable' },
  { name: 'Curd', category: 'dairy' }
];

const MEAL_TYPES = [
  { type: 'breakfast', hour: 8, minute: 0 },
  { type: 'lunch', hour: 13, minute: 0 },
  { type: 'snacks', hour: 17, minute: 0 },
  { type: 'dinner', hour: 20, minute: 0 }
];

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME || 'mess_management';

async function seed() {
  if (!uri) throw new Error('MONGODB_URI is not configured');
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    console.log(`Connected to ${dbName}`);
    // Original seed implementation can be supplied here with the local dataset.
    await db.command({ ping: 1 });
    console.log('MongoDB ping successful.');
  } finally {
    await client.close();
  }
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
