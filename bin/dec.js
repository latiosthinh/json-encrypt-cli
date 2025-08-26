#!/usr/bin/env node

// Load environment variables from .env file
require('dotenv').config();

const { program } = require('commander');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { intro, outro, text, confirm, spinner } = require('@clack/prompts');

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

async function interactiveMode(filePath) {
  intro('🔓 JSON Decryption Tool');
  
  // Get defaults from environment variables
  const defaultAlgorithm = process.env.ENC_ALGORITHM;
  const defaultSecret = process.env.ENC_SECRET;
  
  // Show current defaults if available
  if (defaultAlgorithm || defaultSecret) {
    console.log('\n📋 Current defaults from .env:');
    if (defaultAlgorithm) console.log(`   Algorithm: ${defaultAlgorithm}`);
    if (defaultSecret) console.log(`   Secret: ${'*'.repeat(Math.min(defaultSecret.length, 20))}`);
    console.log('');
  }
  
  const algorithm = await text({
    message: 'Enter the encryption algorithm used:',
    placeholder: defaultAlgorithm ? 'Press Enter to use default from .env...' : 'e.g., aes-256-cbc, aes-256-gcm, aes-192-cbc...',
    defaultValue: defaultAlgorithm || '',
    validate(value) {
      if (!value) return 'Algorithm is required!';
      const validAlgorithms = ['aes-128-cbc', 'aes-192-cbc', 'aes-256-cbc', 'aes-128-gcm', 'aes-192-gcm', 'aes-256-gcm'];
      if (!validAlgorithms.includes(value)) {
        return `Invalid algorithm. Must be one of: ${validAlgorithms.join(', ')}`;
      }
    },
  });
  
  if (algorithm === undefined) {
    outro('❌ Operation cancelled');
    process.exit(1);
  }
  
  const secretKey = await text({
    message: 'Enter the secret key used for encryption:',
    placeholder: defaultSecret ? 'Press Enter to use default from .env...' : 'Your secret key...',
    defaultValue: defaultSecret || '',
    validate(value) {
      if (!value) return 'Secret key is required!';
    },
  });
  
  if (secretKey === undefined) {
    outro('❌ Operation cancelled');
    process.exit(1);
  }
  
  const shouldOverwrite = await confirm({
    message: 'Overwrite original JSON file if it exists?',
    initialValue: false
  });
  
  return { algorithm, secretKey, shouldOverwrite };
}

async function decryptFile(filePath, algorithm, secretKey, overwrite = false) {
  const s = spinner();
  
  try {
    s.start('Reading encrypted file...');
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    if (!filePath.endsWith('.enc')) {
      throw new Error('File must have .enc extension');
    }
    
    const encryptedContent = fs.readFileSync(filePath, 'utf8');
    
    let encryptedData;
    try {
      encryptedData = JSON.parse(encryptedContent);
    } catch (error) {
      throw new Error('Invalid encrypted file format');
    }
    
    // Validate encrypted data structure
    if (!encryptedData.iv || !encryptedData.encrypted) {
      throw new Error('Invalid encrypted file structure');
    }
    
    s.message('Decrypting data...');
    
    const decryptedContent = decryptData(encryptedData, algorithm, secretKey);
    
    // Validate decrypted JSON
    try {
      JSON.parse(decryptedContent);
    } catch (error) {
      throw new Error('Decryption failed: Invalid secret key or corrupted data');
    }
    
    // Determine output path
    const outputPath = filePath.replace(/\.enc$/, '.json');
    
    // Check if output file exists
    if (fs.existsSync(outputPath) && !overwrite) {
      throw new Error(`Output file already exists: ${outputPath}. Use --overwrite flag or interactive mode to overwrite.`);
    }
    
    s.message('Writing decrypted file...');
    
    // Format the JSON nicely
    const formattedJson = JSON.stringify(JSON.parse(decryptedContent), null, 2);
    fs.writeFileSync(outputPath, formattedJson);
    
    s.stop('✅ Decryption completed successfully!');
    
    console.log(`\n📁 Decrypted file: ${outputPath}`);
    
  } catch (error) {
    s.stop('❌ Decryption failed!');
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// CLI setup
program
  .name('dec')
  .description('Decrypt .enc files back to JSON format')
  .version('1.0.0');

program
  .argument('<file>', 'Path to .enc file to decrypt')
  .option('-a, --algorithm <algorithm>', 'Encryption algorithm used (aes-128-cbc, aes-192-cbc, aes-256-cbc, aes-128-gcm, aes-192-gcm, aes-256-gcm)')
  .option('--secret <key>', 'Secret key used for encryption')
  .option('--overwrite', 'Overwrite output file if it exists')
  .action(async (file, options) => {
    const filePath = path.resolve(file);
    
    // Get defaults from environment variables
    const defaultAlgorithm = process.env.ENC_ALGORITHM;
    const defaultSecret = process.env.ENC_SECRET;
    
    // Use provided options or fall back to environment defaults
    const algorithm = options.algorithm || defaultAlgorithm;
    const secret = options.secret || defaultSecret;
    
    if (secret && algorithm) {
       // Command line mode (with env defaults if needed)
       const validAlgorithms = ['aes-128-cbc', 'aes-192-cbc', 'aes-256-cbc', 'aes-128-gcm', 'aes-192-gcm', 'aes-256-gcm'];
       if (!validAlgorithms.includes(algorithm)) {
         console.error(`❌ Invalid algorithm '${algorithm}'. Must be one of: ${validAlgorithms.join(', ')}`);
         process.exit(1);
       }
       
       // Show what defaults were used
       if (!options.algorithm && process.env.ENC_ALGORITHM) {
         console.log(`📋 Using algorithm from .env: ${algorithm}`);
       }
       if (!options.secret && process.env.ENC_SECRET) {
         console.log(`📋 Using secret from .env: ${'*'.repeat(Math.min(secret.length, 20))}`);
       }
       
       await decryptFile(filePath, algorithm, secret, options.overwrite);
       outro('🎉 Done! Your encrypted file has been decrypted.');
     } else if (options.secret || options.algorithm) {
       // Partial command line arguments
       console.error('❌ Both --algorithm and --secret are required for command line mode.');
       console.error('💡 Use interactive mode by running: npx dec <file>');
       console.error('💡 Or set defaults in .env file: ENC_ALGORITHM and ENC_SECRET');
       process.exit(1);
     } else {
       // Interactive mode
       const { algorithm, secretKey, shouldOverwrite } = await interactiveMode(filePath);
       await decryptFile(filePath, algorithm, secretKey, shouldOverwrite);
       outro('🎉 Done! Your encrypted file has been decrypted.');
     }
  });

program.parse();