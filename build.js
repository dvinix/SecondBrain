#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Installing dependencies...');
execSync('npm install', { cwd: 'frontend', stdio: 'inherit' });

console.log('Building application...');
execSync('npm run build', { cwd: 'frontend', stdio: 'inherit' });

console.log('Copying output to root...');
const sourcePath = path.join('frontend', '.vercel', 'output');
const targetPath = path.join('.vercel', 'output');

// Create target directory
if (!fs.existsSync('.vercel')) {
  fs.mkdirSync('.vercel', { recursive: true });
}

// Copy recursively
function copyRecursive(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      copyRecursive(
        path.join(src, entry.name),
        path.join(dest, entry.name)
      );
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

copyRecursive(sourcePath, targetPath);

console.log('Build completed successfully!');
