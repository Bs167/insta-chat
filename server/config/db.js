const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Drop the old unused 'handle_1' index if it exists in the database
    try {
      await mongoose.connection.collection('users').dropIndex('handle_1');
      console.log('Successfully dropped stale handle_1 index');
    } catch (indexErr) {
      // Ignore if index is already gone
    }
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;