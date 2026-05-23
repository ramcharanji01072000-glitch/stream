const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('./config/database');
const { User, Photo } = require('./models');

const samplePhotos = [
  { imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800', title: 'Mountain Lake', description: 'Serene mountain lake at dawn', tags: ['nature', 'landscape', 'mountains'], width: 800, height: 1200, photographer: 'Bailey Zindel', color: '#2d5a27' },
  { imageUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800', title: 'Starry Mountains', description: 'Night sky over snow-capped peaks', tags: ['nature', 'night', 'mountains'], width: 800, height: 533, photographer: 'Benjamin Voros', color: '#1a1a2e' },
  { imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800', title: 'Tropical Beach', description: 'Crystal clear waters and white sand', tags: ['beach', 'tropical', 'ocean'], width: 800, height: 533, photographer: 'Sean Oulashin', color: '#87ceeb' },
  { imageUrl: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800', title: 'Japanese Temple', description: 'Ancient temple surrounded by cherry blossoms', tags: ['architecture', 'japan', 'culture'], width: 800, height: 1067, photographer: 'Su San Lee', color: '#ff69b4' },
  { imageUrl: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800', title: 'Sunset Valley', description: 'Golden hour over rolling hills', tags: ['nature', 'sunset', 'landscape'], width: 800, height: 533, photographer: 'Luca Bravo', color: '#ff6b35' },
  { imageUrl: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800', title: 'Foggy Forest', description: 'Mystical forest covered in morning fog', tags: ['nature', 'forest', 'fog'], width: 800, height: 1200, photographer: 'Lukasz Szmigiel', color: '#2e8b57' },
  { imageUrl: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800', title: 'Ocean Waves', description: 'Powerful waves crashing on shore', tags: ['ocean', 'waves', 'nature'], width: 800, height: 533, photographer: 'Matt Hardy', color: '#006994' },
  { imageUrl: 'https://images.unsplash.com/photo-1504198453319-5ce911bafcde?w=800', title: 'Northern Lights', description: 'Aurora borealis dancing across the sky', tags: ['aurora', 'night', 'sky'], width: 800, height: 1200, photographer: 'Jonatan Pie', color: '#00ff88' },
  { imageUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800', title: 'Portrait Study', description: 'Natural light portrait photography', tags: ['portrait', 'people', 'photography'], width: 800, height: 800, photographer: 'Christopher Campbell', color: '#deb887' },
  { imageUrl: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=800', title: 'Workspace', description: 'Modern minimalist workspace setup', tags: ['workspace', 'minimal', 'tech'], width: 800, height: 533, photographer: 'Glenn Carstens', color: '#f5f5f5' },
  { imageUrl: 'https://images.unsplash.com/photo-1523712999610-f77fbcfc3843?w=800', title: 'Sunlit Forest', description: 'Rays of light through tall trees', tags: ['nature', 'forest', 'sunlight'], width: 800, height: 1200, photographer: 'Robert Lukeman', color: '#228b22' },
  { imageUrl: 'https://images.unsplash.com/photo-1542281286-9e0a16bb7366?w=800', title: 'Desert Dunes', description: 'Golden sand dunes at sunset', tags: ['desert', 'sand', 'sunset'], width: 800, height: 533, photographer: 'Keith Hardy', color: '#d2691e' },
  { imageUrl: 'https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=800', title: 'Abstract Art', description: 'Colorful fluid art composition', tags: ['abstract', 'art', 'colors'], width: 800, height: 1000, photographer: 'Paweł Czerwiński', color: '#9370db' },
  { imageUrl: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=800', title: 'Autumn Path', description: 'Tree-lined path in autumn colors', tags: ['autumn', 'nature', 'path'], width: 800, height: 1200, photographer: 'Lukasz Szmigiel', color: '#b8860b' },
  { imageUrl: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=800', title: 'City Skyline', description: 'Panoramic view of modern city', tags: ['city', 'architecture', 'skyline'], width: 800, height: 533, photographer: 'Andre Benz', color: '#4169e1' },
  { imageUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800', title: 'Tech Office', description: 'Modern open office space', tags: ['office', 'tech', 'workspace'], width: 800, height: 533, photographer: 'Israel Andrade', color: '#708090' },
  { imageUrl: 'https://images.unsplash.com/photo-1543362906-acfc16c67564?w=800', title: 'Waterfall', description: 'Majestic waterfall in tropical forest', tags: ['waterfall', 'nature', 'tropical'], width: 800, height: 1200, photographer: 'Olga Nayda', color: '#20b2aa' },
  { imageUrl: 'https://images.unsplash.com/photo-1429277005502-eed8e872fe52?w=800', title: 'Lavender Field', description: 'Endless rows of purple lavender', tags: ['flowers', 'nature', 'purple'], width: 800, height: 533, photographer: 'Léonard Cotte', color: '#9370db' },
  { imageUrl: 'https://images.unsplash.com/photo-1516616370751-86d6bd8b0651?w=800', title: 'Electronic Circuit', description: 'Macro shot of circuit board', tags: ['technology', 'macro', 'circuit'], width: 800, height: 800, photographer: 'Alexandre Debiève', color: '#006400' },
  { imageUrl: 'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=800', title: 'Golden Gate', description: 'Iconic bridge in morning fog', tags: ['bridge', 'architecture', 'fog'], width: 800, height: 1067, photographer: 'Maarten van den Heuvel', color: '#b22222' },
];

async function seed() {
  try {
    await connectDB();
    console.log('🌱 Seeding database...');

    // Clear existing data
    await User.deleteMany({});
    await Photo.deleteMany({});

    // Create admin user
    const admin = new User({
      name: 'Admin',
      email: 'admin@streamview.com',
      passwordHash: 'admin123',
      role: 'ADMIN',
    });
    await admin.save();
    console.log('✅ Admin created: admin@streamview.com / admin123');

    // Create test user
    const user = new User({
      name: 'Test User',
      email: 'user@streamview.com',
      passwordHash: 'user123',
      role: 'USER',
    });
    await user.save();
    console.log('✅ User created: user@streamview.com / user123');

    // Create photos
    await Photo.insertMany(samplePhotos);
    console.log(`✅ ${samplePhotos.length} photos seeded`);

    console.log('\n🎉 Seed completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed error:', error.message);
    process.exit(1);
  }
}

seed();
