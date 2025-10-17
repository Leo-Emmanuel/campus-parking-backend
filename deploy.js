#!/usr/bin/env node

// Deployment helper script for Campus Parking Backend
const fs = require('fs');
const path = require('path');

console.log('🚀 Campus Parking Backend - Deployment Helper');
console.log('='.repeat(50));

// Check if required files exist
const requiredFiles = [
  'package.json',
  'server.js',
  'render.yaml',
  '.env.example'
];

console.log('\n📋 Checking required files...');
requiredFiles.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file} - Found`);
  } else {
    console.log(`❌ ${file} - Missing`);
  }
});

// Generate JWT secret
function generateJWTSecret() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let result = '';
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

console.log('\n🔑 Generated JWT Secret:');
console.log(generateJWTSecret());

console.log('\n📝 Next Steps:');
console.log('1. Create MongoDB Atlas account and get connection string');
console.log('2. Create GitHub repository and push this code');
console.log('3. Create Render.com account and deploy from GitHub');
console.log('4. Add environment variables in Render dashboard');
console.log('5. Test the deployed API');

console.log('\n🌐 Your API will be available at:');
console.log('https://campus-parking-backend.onrender.com/api');

console.log('\n📖 See DEPLOYMENT_GUIDE.md for detailed instructions');
