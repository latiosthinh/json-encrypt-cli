#!/usr/bin/env node

// Load environment variables from .env file
require('dotenv').config();

const { program } = require('commander');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { intro, outro, text, select, confirm, spinner } = require('@clack/prompts');

// Supported encryption algorithms
const ALGORITHMS = {
  'aes-256-cbc': 'AES-256-CBC',
  'aes-192-cbc': 'AES-192-CBC',
  'aes-128-cbc': 'AES-128-CBC',
  'aes-256-gcm': 'AES-256-GCM',
  'aes-192-gcm': 'AES-192-GCM',
  'aes-128-gcm': 'AES-128-GCM'
};

function encryptData(data, algorithm, secretKey) {
  const key = crypto.scryptSync(secretKey, 'salt', algorithm.includes('256') ? 32 : algorithm.includes('192') ? 24 : 16);
  
  if (algorithm.includes('gcm')) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    cipher.setAAD(Buffer.from('json-encrypt', 'utf8'));
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return {
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      encrypted
    };
  } else {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      iv: iv.toString('hex'),
      encrypted
    };
  }
}

function findJsonFiles(directory, recursive = false) {
  const jsonFiles = [];
  
  function scanDirectory(dir) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && recursive) {
        scanDirectory(fullPath);
      } else if (stat.isFile() && path.extname(item).toLowerCase() === '.json') {
        jsonFiles.push(fullPath);
      }
    }
  }
  
  scanDirectory(directory);
  return jsonFiles;
}

async function encryptFile(filePath, algorithm, secretKey) {
  try {
    // Read and validate JSON file
    const jsonData = fs.readFileSync(filePath, 'utf8');
    JSON.parse(jsonData); // Validate JSON format
    
    // Encrypt the data
    const encryptedData = encryptData(jsonData, algorithm, secretKey);
    
    // Generate output path
    const outputPath = filePath.replace(/\.json$/i, '.enc');
    
    // Write encrypted file
    fs.writeFileSync(outputPath, JSON.stringify(encryptedData, null, 2));
    
    return {
      success: true,
      inputFile: filePath,
      outputFile: outputPath
    };
  } catch (error) {
    return {
      success: false,
      inputFile: filePath,
      error: error.message
    };
  }
}

async function interactiveMode(directory) {
  intro('📦 Batch JSON Encryption Tool');
  
  // Get defaults from environment variables
  const defaultAlgorithm = process.env.ENC_ALGORITHM;
  const defaultSecret = process.env.ENC_SECRET;
  
  // Show current defaults if available
  if (defaultAlgorithm || defaultSecret) {
    console.log('\n📋 Current defaults from .env:');
    if (defaultAlgorithm) console.log(`   Algorithm: ${defaultAlgorithm}`);
    if (defaultSecret) console.log(`   Secret: ${'*'.repeat(defaultSecret.length)}`);
  }
  
  const algorithm = await select({
    message: 'Choose encryption algorithm:',
    options: Object.entries(ALGORITHMS).map(([key, value]) => ({
      value: key,
      label: value + (key === defaultAlgorithm ? ' (default)' : '')
    })),
    initialValue: defaultAlgorithm
  });
  
  const secretKey = await text({
    message: 'Enter secret key:',
    placeholder: defaultSecret ? 'Press Enter to use default from .env' : 'Enter your secret key',
    defaultValue: defaultSecret || ''
  });
  
  const recursive = await confirm({
    message: 'Include subdirectories?',
    initialValue: false
  });
  
  return { algorithm, secretKey, recursive };
}

async function batchEncrypt(directory, algorithm, secretKey, recursive = false) {
  const s = spinner();
  
  try {
    s.start('🔍 Scanning for JSON files...');
    
    // Find all JSON files
    const jsonFiles = findJsonFiles(directory, recursive);
    
    if (jsonFiles.length === 0) {
      s.stop('❌ No JSON files found in the specified directory');
      return;
    }
    
    s.message(`📁 Found ${jsonFiles.length} JSON file(s). Starting encryption...`);
    
    const results = {
      success: [],
      failed: []
    };
    
    // Process each file
    for (let i = 0; i < jsonFiles.length; i++) {
      const file = jsonFiles[i];
      s.message(`🔐 Encrypting ${path.basename(file)} (${i + 1}/${jsonFiles.length})...`);
      
      const result = await encryptFile(file, algorithm, secretKey);
      
      if (result.success) {
        results.success.push(result);
      } else {
        results.failed.push(result);
      }
    }
    
    s.stop();
    
    // Display results
    console.log('\n📊 Batch Encryption Results:');
    console.log(`✅ Successfully encrypted: ${results.success.length} files`);
    
    if (results.success.length > 0) {
      console.log('\n📁 Encrypted files:');
      results.success.forEach(result => {
        console.log(`   ${path.relative(directory, result.inputFile)} → ${path.relative(directory, result.outputFile)}`);
      });
    }
    
    if (results.failed.length > 0) {
      console.log(`\n❌ Failed to encrypt: ${results.failed.length} files`);
      results.failed.forEach(result => {
        console.log(`   ${path.relative(directory, result.inputFile)}: ${result.error}`);
      });
    }
    
    outro(`🎉 Batch encryption completed! ${results.success.length}/${jsonFiles.length} files encrypted successfully.`);
    
  } catch (error) {
    s.stop(`❌ Error during batch encryption: ${error.message}`);
  }
}

program
  .name('batch-enc')
  .description('Batch encrypt JSON files in a directory')
  .version('1.0.0');

program
  .argument('<directory>', 'Directory containing JSON files to encrypt')
  .option('--alg <algorithm>', 'Encryption algorithm')
  .option('--secret <key>', 'Secret key for encryption')
  .option('-r, --recursive', 'Include subdirectories')
  .action(async (directory, options) => {
    try {
      // Validate directory
      if (!fs.existsSync(directory)) {
        console.error(`❌ Directory not found: ${directory}`);
        process.exit(1);
      }
      
      if (!fs.statSync(directory).isDirectory()) {
        console.error(`❌ Path is not a directory: ${directory}`);
        process.exit(1);
      }
      
      let algorithm = options.alg;
      let secretKey = options.secret;
      let recursive = options.recursive || false;
      
      // Use environment variables as defaults if not provided
      if (!algorithm && process.env.ENC_ALGORITHM) {
        algorithm = process.env.ENC_ALGORITHM;
        console.log(`📋 Using algorithm from .env: ${algorithm}`);
      }
      
      if (!secretKey && process.env.ENC_SECRET) {
        secretKey = process.env.ENC_SECRET;
        console.log(`📋 Using secret from .env: ${'*'.repeat(secretKey.length)}`);
      }
      
      // If still missing parameters, use interactive mode
      if (!algorithm || !secretKey) {
        const interactive = await interactiveMode(directory);
        algorithm = algorithm || interactive.algorithm;
        secretKey = secretKey || interactive.secretKey;
        recursive = recursive || interactive.recursive;
      }
      
      // Validate algorithm
      if (!ALGORITHMS[algorithm]) {
        console.error(`❌ Unsupported algorithm: ${algorithm}`);
        console.error(`Supported algorithms: ${Object.keys(ALGORITHMS).join(', ')}`);
        process.exit(1);
      }
      
      // Start batch encryption
      await batchEncrypt(directory, algorithm, secretKey, recursive);
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();