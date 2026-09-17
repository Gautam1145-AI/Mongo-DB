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

const FEEDBACK_TAGS = [
  'too spicy',
  'cold',
  'loved it',
  'bland',
  'perfect portion',
  'undercooked',
  'too oily'
];

const SAMPLE_COMMENTS = {
  'loved it': ['Really delicious today!', 'Perfect seasoning and taste.', 'Best meal of the week.'],
  'too spicy': ['A bit too much chili for breakfast/dinner.', 'Very spicy today, couldn’t finish.', 'Excessive red chili.'],
  'cold': ['The food was barely warm when served.', 'Please serve food hot.', 'Roti and dal were cold.'],
  'bland': ['Needs more salt and spices.', 'Very mild, felt tasteless.', 'Quite bland today.'],
  'perfect portion': ['Ideal quantity served, felt satisfied.', 'Right portion size.', 'Great serving balance.'],
  'undercooked': ['Vegetables felt raw/hard.', 'Rice was somewhat hard.', 'Dal needed more cooking.'],
  'too oily': ['Too much oil floating on curry.', 'Greasy texture.', 'Heavy on oil today.']
};

function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seed() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
  const dbName = process.env.DB_NAME || 'mess_tracker';

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log(`Connected to MongoDB at ${uri}, Database: ${dbName}`);
    const db = client.db(dbName);

    // 1. Ensure mealLogs time series collection exists
    const existingCollections = await db.listCollections().toArray();
    const collectionNames = existingCollections.map(c => c.name);

    if (collectionNames.includes('mealLogs')) {
      console.log("Found existing 'mealLogs' collection. Dropping to seed fresh data...");
      await db.collection('mealLogs').drop();
    }
    if (collectionNames.includes('feedback')) {
      await db.collection('feedback').drop();
    }
    if (collectionNames.includes('menuItems')) {
      await db.collection('menuItems').drop();
    }

    // Create mealLogs as a time series collection
    console.log("Creating time series collection 'mealLogs'...");
    await db.createCollection('mealLogs', {
      timeseries: {
        timeField: 'timestamp',
        metaField: 'mealType',
        granularity: 'hours'
      }
    });

    // Seed menuItems catalog
    await db.collection('menuItems').insertMany(FIXED_DISHES);
    console.log(`Inserted ${FIXED_DISHES.length} master menu items into 'menuItems'.`);

    // 2. Generate 75 days × 4 meal types = 300 mealLogs
    const TOTAL_DAYS = 75;
    const now = new Date();
    // Anchor to today 23:59:59 so history goes back 74 days + today = 75 days
    const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const mealLogsToInsert = [];
    const feedbackToInsert = [];

    for (let dayOffset = TOTAL_DAYS - 1; dayOffset >= 0; dayOffset--) {
      const daysAgo = dayOffset; // 0 = today, 74 = 74 days ago
      const currentDay = new Date(baseDate);
      currentDay.setDate(baseDate.getDate() - dayOffset);

      for (const meal of MEAL_TYPES) {
        const mealTime = new Date(currentDay);
        mealTime.setHours(meal.hour, meal.minute, 0, 0);

        // itemsServed drawn from fixed dish list, each with ~70% probability
        let itemsServed = FIXED_DISHES.filter(() => Math.random() < 0.7).map(dish => ({
          name: dish.name,
          qtyServedKg: Number(getRandomArbitrary(5, 25).toFixed(1))
        }));

        // Guarantee at least one item served
        if (itemsServed.length === 0) {
          const fallbackDish = FIXED_DISHES[Math.floor(Math.random() * FIXED_DISHES.length)];
          itemsServed = [{
            name: fallbackDish.name,
            qtyServedKg: Number(getRandomArbitrary(5, 25).toFixed(1))
          }];
        }

        // wastageKg random between 3-12
        let wastage = getRandomArbitrary(3, 12);

        // PLUS deliberate +2 to +6 boost for most recent 21 days (daysAgo <= 21)
        if (daysAgo <= 21) {
          wastage += getRandomArbitrary(2, 6);
        }
        const wastageKg = Number(wastage.toFixed(2));

        const mealLogId = new ObjectId();
        const mealLogDoc = {
          _id: mealLogId,
          timestamp: mealTime,
          mealType: meal.type,
          wastageKg: wastageKg,
          itemsServed: itemsServed
        };

        mealLogsToInsert.push(mealLogDoc);

        // Generate 2-10 feedback docs for each mealLog
        const feedbackCount = getRandomInt(2, 10);
        for (let f = 0; f < feedbackCount; f++) {
          const tag = FEEDBACK_TAGS[Math.floor(Math.random() * FEEDBACK_TAGS.length)];
          let rating;
          if (tag === 'loved it' || tag === 'perfect portion') {
            rating = getRandomInt(4, 5);
          } else if (tag === 'cold' || tag === 'undercooked') {
            rating = getRandomInt(1, 3);
          } else {
            rating = getRandomInt(1, 5);
          }

          const commentsPool = SAMPLE_COMMENTS[tag];
          const comment = commentsPool[Math.floor(Math.random() * commentsPool.length)];

          // Submitted 15 to 90 minutes after meal
          const submittedAt = new Date(mealTime.getTime() + getRandomInt(15, 90) * 60 * 1000);

          feedbackToInsert.push({
            mealLogId: mealLogId,
            rating: rating,
            tags: [tag],
            comment: comment,
            submittedAt: submittedAt
          });
        }
      }
    }

    console.log(`Prepared ${mealLogsToInsert.length} mealLogs documents.`);
    console.log(`Prepared ${feedbackToInsert.length} feedback documents.`);

    // Insert mealLogs
    const mealLogsResult = await db.collection('mealLogs').insertMany(mealLogsToInsert);
    console.log(`Successfully inserted ${mealLogsResult.insertedCount} mealLogs.`);

    // Insert feedback
    const feedbackResult = await db.collection('feedback').insertMany(feedbackToInsert);
    console.log(`Successfully inserted ${feedbackResult.insertedCount} feedback documents.`);

    // Create Indexes
    console.log("Creating required indexes...");
    await db.collection('mealLogs').createIndex({ mealType: 1 });
    await db.collection('feedback').createIndex({ mealLogId: 1 });
    await db.collection('feedback').createIndex({ submittedAt: -1 });
    console.log("Indexes created successfully.");

    console.log("\n================ SEED COMPLETE ================");
    console.log(`menuItems count : ${FIXED_DISHES.length}`);
    console.log(`mealLogs count  : ${mealLogsResult.insertedCount} (75 days × 4 meals)`);
    console.log(`feedback count  : ${feedbackResult.insertedCount}`);
    console.log("================================================");

  } catch (error) {
    console.error("Error during seeding:", error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  seed();
}

module.exports = { seed };
