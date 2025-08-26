#!/usr/bin/env node

// Load environment variables from .env file
require('dotenv').config();

const { program } = require('commander');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { intro, outro, text, select, confirm, spinner } = require('@clack/prompts');

function decryptData(encryptedData, algorithm, secretKey) {
  const keyLength = algorithm.includes('256') ? 32 : 
                   algorithm.includes('192') ? 24 : 16;
  const key = crypto.scryptSync(secretKey, 'salt', keyLength);
  
  const iv = Buffer.from(encryptedData.iv, 'hex');
  
  let decrypted;
  
  if (algorithm.includes('gcm')) {
    // GCM mode decryption
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    if (encryptedData.authTag) {
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    }
    decipher.setAAD(Buffer.from('json-encrypt', 'utf8'));
    
    decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
  } else {
    // CBC mode decryption
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
  }
  
  return decrypted;
}

function findEncFiles(directory, recursive = false) {
  const encFiles = [];
  
  function scanDirectory(dir) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && recursive) {
        scanDirectory(fullPath);
      } else if (stat.isFile() && path.extname(item).toLowerCase() === '.enc') {
        encFiles.push(fullPath);
      }
    }
  }
  
  scanDirectory(directory);
  return encFiles;
}

async function decryptFile(filePath, algorithm, secretKey, overwrite = false) {
  try {
    // Read and validate encrypted file
    const encryptedContent = fs.readFileSync(filePath, 'utf8');
    const encryptedData = JSON.parse(encryptedContent);
    
    // Validate encrypted data structure
    if (!encryptedData.iv || !encryptedData.encrypted) {
      throw new Error('Invalid encrypted file format: missing iv or encrypted data');
    }
    
    if (algorithm.includes('gcm') && !encryptedData.authTag) {
      throw new Error('Invalid encrypted file format: missing authTag for GCM mode');
    }
    
    // Decrypt the data
    const decryptedData = decryptData(encryptedData, algorithm, secretKey);
    
    // Validate JSON format
    JSON.parse(decryptedData);
    
    // Generate output path
    const outputPath = filePath.replace(/\.enc$/i, '.json');
    
    // Check if output file exists
    if (fs.existsSync(outputPath) && !overwrite) {
      throw new Error(`Output file already exists: ${outputPath}. Use --overwrite to replace it.`);
    }
    
    // Write decrypted file
    fs.writeFileSync(outputPath, decryptedData);
    
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
  intro('🔓 Batch JSON Decryption Tool');
  
  // Get defaults from environment variables
  const defaultAlgorithm = process.env.ENC_ALGORITHM;
  const defaultSecret = process.env.ENC_SECRET;
  
  // Show current defaults if available
  if (defaultAlgorithm || defaultSecret) {
    console.log('\n📋 Current defaults from .env:');
    if (defaultAlgorithm) console.log(`   Algorithm: ${defaultAlgorithm}`);
    if (defaultSecret) console.log(`   Secret: ${'*'.repeat(defaultSecret.length)}`);
  }
  
  const algorithms = [
    'aes-256-cbc', 'aes-192-cbc', 'aes-128-cbc',
    'aes-256-gcm', 'aes-192-gcm', 'aes-128-gcm'
  ];
  
  const algorithm = await select({
    message: 'Choose decryption algorithm:',
    options: algorithms.map(alg => ({
      value: alg,
      label: alg.toUpperCase() + (alg === defaultAlgorithm ? ' (default)' : '')
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
  
  const overwrite = await confirm({
    message: 'Overwrite existing JSON files?',
    initialValue: false
  });
  
  return { algorithm, secretKey, recursive, overwrite };
}

async function batchDecrypt(directory, algorithm, secretKey, recursive = false, overwrite = false) {
  const s = spinner();
  
  try {
    s.start('🔍 Scanning for .enc files...');
    
    // Find all .enc files
    const encFiles = findEncFiles(directory, recursive);
    
    if (encFiles.length === 0) {
      s.stop('❌ No .enc files found in the specified directory');
      return;
    }
    
    s.message(`📁 Found ${encFiles.length} .enc file(s). Starting decryption...`);
    
    const results = {
      success: [],
      failed: []
    };
    
    // Process each file
    for (let i = 0; i < encFiles.length; i++) {
      const file = encFiles[i];
      s.message(`🔓 Decrypting ${path.basename(file)} (${i + 1}/${encFiles.length})...`);
      
      const result = await decryptFile(file, algorithm, secretKey, overwrite);
      
      if (result.success) {
        results.success.push(result);
      } else {
        results.failed.push(result);
      }
    }
    
    s.stop();
    
    // Display results
    console.log('\n📊 Batch Decryption Results:');
    console.log(`✅ Successfully decrypted: ${results.success.length} files`);
    
    if (results.success.length > 0) {
      console.log('\n📁 Decrypted files:');
      results.success.forEach(result => {
        console.log(`   ${path.relative(directory, result.inputFile)} → ${path.relative(directory, result.outputFile)}`);
      });
    }
    
    if (results.failed.length > 0) {
      console.log(`\n❌ Failed to decrypt: ${results.failed.length} files`);
      results.failed.forEach(result => {
        console.log(`   ${path.relative(directory, result.inputFile)}: ${result.error}`);
      });
    }
    
    outro(`🎉 Batch decryption completed! ${results.success.length}/${encFiles.length} files decrypted successfully.`);
    
  } catch (error) {
    s.stop(`❌ Error during batch decryption: ${error.message}`);
  }
}

program
  .name('batch-dec')
  .description('Batch decrypt .enc files in a directory')
  .version('1.0.0');

program
  .argument('<directory>', 'Directory containing .enc files to decrypt')
  .option('-a, --algorithm <algorithm>', 'Decryption algorithm (aes-128-cbc, aes-192-cbc, aes-256-cbc, aes-128-gcm, aes-192-gcm, aes-256-gcm)')
  .option('--secret <key>', 'Secret key used for encryption')
  .option('-r, --recursive', 'Include subdirectories')
  .option('--overwrite', 'Overwrite existing JSON files')
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
      
      let algorithm = options.algorithm;
      let secretKey = options.secret;
      let recursive = options.recursive || false;
      let overwrite = options.overwrite || false;
      
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
        overwrite = overwrite || interactive.overwrite;
      }
      
      // Validate algorithm
      const supportedAlgorithms = [
        'aes-256-cbc', 'aes-192-cbc', 'aes-128-cbc',
        'aes-256-gcm', 'aes-192-gcm', 'aes-128-gcm'
      ];
      
      if (!supportedAlgorithms.includes(algorithm)) {
        console.error(`❌ Unsupported algorithm: ${algorithm}`);
        console.error(`Supported algorithms: ${supportedAlgorithms.join(', ')}`);
        process.exit(1);
      }
      
      // Start batch decryption
      await batchDecrypt(directory, algorithm, secretKey, recursive, overwrite);
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  });

program.parse();