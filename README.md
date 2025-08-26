# JSON Encrypt CLI

A command-line tool to encrypt JSON files using various encryption algorithms with customizable secret keys.

## Features

- 🔐 **Multiple AES Algorithms**: Support for AES-128, AES-192, and AES-256 with CBC and GCM modes
- 🎯 **Dual Usage Modes**: Command-line for automation, interactive for ease of use
- 🔑 **Secure Key Derivation**: Uses scrypt for robust key generation from passwords
- 🎲 **Random IV Generation**: Each encryption uses a unique initialization vector
- 📁 **Structured Output**: Creates `.enc` files with organized encrypted data
- 📦 **Batch Processing**: Encrypt/decrypt entire directories of JSON files at once
- 📝 **Auto-generated Examples**: Provides TypeScript decryption code examples
- 🛡️ **Data Integrity**: GCM mode includes authentication tags for tamper detection
- 🔒 **Algorithm Concealment**: Encrypted files don't expose the algorithm used for maximum security
- ⚙️ **Environment Configuration**: Set default algorithm and secret key via `.env` file for convenience

## Installation

```bash
npm install
```

## Configuration

### Environment Variables (.env)

You can set default values for algorithm and secret key by creating a `.env` file in your project root:

```bash
# Copy .env.example to .env and customize
cp .env.example .env
```

Example `.env` file:
```bash
# Default encryption algorithm
ENC_ALGORITHM=aes-256-gcm

# Default secret key
ENC_SECRET=your-default-secret-key-here
```

**Benefits of using .env:**
- 🚀 **Faster workflow**: No need to type algorithm and secret every time
- 🔒 **Consistent settings**: Same algorithm and key across all operations
- 💼 **Team collaboration**: Share `.env.example` with your team (never commit actual `.env`!)
- 🎯 **Selective override**: Command line arguments still override .env defaults

**Security Note:** Never commit your `.env` file to version control! Add `.env` to your `.gitignore`.

## Usage

### Encryption

#### Interactive Mode (Recommended)

Simply run the command with a JSON file path:

```bash
npx enc path/to/your/file.json
# or
node bin/enc.js path/to/your/file.json
```

The tool will prompt you to:
- Choose an encryption algorithm
- Enter a secret key
- Decide whether to generate a decryption example

#### Command Line Mode

For automated scripts or when you know exactly what you want:

```bash
# With explicit parameters
npx enc path/to/your/file.json --alg aes-256-cbc --secret your-secret-key
# or
node bin/enc.js path/to/your/file.json --alg aes-256-cbc --secret your-secret-key

# Using .env defaults (if configured)
npx enc path/to/your/file.json
# or
node bin/enc.js path/to/your/file.json

# Mix: override algorithm but use .env secret
npx enc path/to/your/file.json --alg aes-128-cbc
```

### Decryption

#### Interactive Mode (Recommended)

```bash
npx dec path/to/your/file.enc
# or
node bin/dec.js path/to/your/file.enc
```

The tool will prompt you to:
- Enter the algorithm used for encryption
- Enter the secret key used for encryption
- Choose whether to overwrite existing files

#### Command Line Mode

```bash
# With explicit parameters
npx dec path/to/your/file.enc --algorithm aes-256-cbc --secret your-secret-key
# or
node bin/dec.js path/to/your/file.enc --algorithm aes-256-cbc --secret your-secret-key --overwrite

# Using .env defaults (if configured)
npx dec path/to/your/file.enc --overwrite
# or
node bin/dec.js path/to/your/file.enc --overwrite

# Mix: override algorithm but use .env secret
npx dec path/to/your/file.enc --algorithm aes-128-cbc --overwrite
```

#### Encryption Options

- `--alg <algorithm>`: Encryption algorithm (default: aes-256-cbc)
- `--secret <key>`: Secret key for encryption
- `--no-example`: Skip generating the decryption example file

#### Decryption Options

- `--algorithm <alg>`: Encryption algorithm used (required for command line mode)
  - Supported: `aes-128-cbc`, `aes-192-cbc`, `aes-256-cbc`, `aes-128-gcm`, `aes-192-gcm`, `aes-256-gcm`
- `--secret <key>`: Secret key used for encryption (required for command line mode)
- `--overwrite`: Overwrite output file if it exists

### Supported Algorithms

- `aes-256-cbc` (default)
- `aes-192-cbc`
- `aes-128-cbc`
- `aes-256-gcm`
- `aes-192-gcm`
- `aes-128-gcm`

## Output

The tool will:
1. Create an encrypted file with `.enc` extension (e.g., `data.json` → `data.enc`)
2. Generate a TypeScript example file (`decryption.example.ts`) showing how to decrypt the file

The encrypted `.enc` file contains:
- Initialization Vector (IV)
- Encrypted data
- Authentication tag (for GCM modes)
- **Note**: The algorithm is intentionally hidden for security - only you know which algorithm was used

## Examples

### Encryption Example

```bash
# Encrypt accounts.json with AES-256-CBC
node bin/enc.js accounts.json --alg aes-256-cbc --secret mySecretKey123

# Output:
# ✅ Encryption completed successfully!
# 📁 Encrypted file: accounts.enc
# 📄 Decryption example: decryption.example.ts
```

### Decryption Example

```bash
# Decrypt accounts.enc back to JSON
node bin/dec.js accounts.enc --algorithm aes-256-cbc --secret mySecretKey123 --overwrite

# Output:
# ✅ Decryption completed successfully!
# 📁 Decrypted file: accounts.json
# 🔐 Algorithm used: aes-256-cbc
```

### Round-trip Example

```bash
# 1. Encrypt a JSON file
node bin/enc.js data.json --alg aes-256-gcm --secret mySecret123

# 2. Decrypt it back
node bin/dec.js data.enc --algorithm aes-256-gcm --secret mySecret123

# 3. Verify the content matches the original
```

## Security Notes

- Use strong, unique secret keys
- Keep your secret keys secure and never commit them to version control
- The same secret key is required for decryption
- GCM algorithms provide authenticated encryption for additional security

## Decryption Methods

### 1. CLI Tool (Recommended)

Use the `dec` command to decrypt files directly:

```bash
node bin/dec.js file.enc --algorithm aes-256-cbc --secret yourSecretKey
```

### 2. Programmatic Decryption

Use the generated `decryption.example.ts` file as a reference to decrypt your files programmatically in your own code.

### 3. Batch Processing

**Encrypt entire directories:**
```bash
# Using npx (recommended)
npx json-batch-encrypt /path/to/directory
npx json-batch-encrypt /path/to/directory --recursive

# Using node directly
node bin/batch-enc.js /path/to/directory
node bin/batch-enc.js /path/to/directory --recursive

# Use specific algorithm and secret
npx json-batch-encrypt /path/to/directory --alg aes-256-gcm --secret mySecret

# Use .env defaults (recommended)
npx json-batch-encrypt /path/to/directory --recursive
```

**Decrypt entire directories:**
```bash
# Using npx (recommended)
npx json-batch-decrypt /path/to/directory --overwrite
npx json-batch-decrypt /path/to/directory --recursive --overwrite

# Using node directly
node bin/batch-dec.js /path/to/directory --overwrite
node bin/batch-dec.js /path/to/directory --recursive --overwrite

# Use specific algorithm and secret
npx json-batch-decrypt /path/to/directory --algorithm aes-256-gcm --secret mySecret --overwrite
```

### 4. npm Scripts

```bash
# Test the tools
npm test

# Demo encryption (explicit parameters)
npm run demo

# Demo decryption (explicit parameters)
npm run demo-decrypt

# Demo encryption using .env defaults
npm run demo-env

# Demo decryption using .env defaults
npm run demo-env-decrypt

# Batch processing demos
npm run demo-batch          # Batch encrypt test directory
npm run demo-batch-decrypt  # Batch decrypt test directory
```