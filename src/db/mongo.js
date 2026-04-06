import { MongoClient } from 'mongodb';

export class Database {
  constructor() {
    this.client = null;
    this.db = null;
    this.memories = null;
    this.personality = null;
    this.drives = null;
    this.activity = null;
  }

  async connect(uri) {
    if (!uri) {
      console.warn('⚠️ No MONGO_URI provided. Running in volatile memory mode.');
      return false;
    }

    try {
      this.client = new MongoClient(uri);
      await this.client.connect();
      this.db = this.client.db('evonite');
      
      this.memories = this.db.collection('memories');
      this.personality = this.db.collection('personality');
      this.drives = this.db.collection('drives');
      this.activity = this.db.collection('activity');
      this.philosophy = this.db.collection('philosophy');
      this.relationships = this.db.collection('relationships');

      // Ensure indexes for semantic search and fast lookups
      await this.memories.createIndex({ id: 1 }, { unique: true });
      await this.drives.createIndex({ id: 1 }, { unique: true });
      await this.personality.createIndex({ _id: 1 });
      
      console.log('🔗 Connected to MongoDB (Persistent Memory)');
      return true;
    } catch (e) {
      console.error('❌ Failed to connect to MongoDB:', e.message);
      return false;
    }
  }

  async close() {
    if (this.client) {
      await this.client.close();
      console.log('🔗 MongoDB connection closed');
    }
  }
}
