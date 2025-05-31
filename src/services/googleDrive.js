const { google } = require('googleapis');
const path = require('path');
const fs = require('fs').promises;

class GoogleDriveService {
    constructor() {
        this.drive = null;
        this.initialized = false;
        this.credentials = null;
        this.lastInitialized = null;
        this.reinitializeInterval = 24 * 60 * 60 * 1000;
    }

    async initialize() {
        if (this.initialized && !this.shouldReinitialize()) {
            return;
        }

        try {
            console.log('🔐 Initializing Google Drive service with secure credentials...');
            
            this.credentials = await this.loadCredentials();
            this.validateCredentials(this.credentials);

            const auth = new google.auth.GoogleAuth({
                credentials: this.credentials,
                scopes: [
                    'https://www.googleapis.com/auth/drive.readonly'
                ]
            });

            this.drive = google.drive({ version: 'v3', auth });
            this.initialized = true;
            this.lastInitialized = Date.now();
            
            this.logAuditEvent('initialization_success', 'Google Drive service initialized successfully');
            console.log('✅ Google Drive service initialized successfully');
            
        } catch (error) {
            this.logAuditEvent('initialization_failed', error.message);
            console.error('❌ Failed to initialize Google Drive:', error);
            throw new Error(`ไม่สามารถเชื่อมต่อ Google Drive ได้: ${error.message}`);
        }
    }

    async loadCredentials() {
        const credentialsSources = [
            this.loadFromDockerSecrets.bind(this),
            this.loadFromEnvironmentBase64.bind(this),
            this.loadFromEnvironmentVariables.bind(this),
            this.loadFromCloudSecretManager.bind(this),
            this.loadFromVault.bind(this),
            this.loadFromFile.bind(this)
        ];

        for (const loadMethod of credentialsSources) {
            try {
                const credentials = await loadMethod();
                if (credentials) {
                    return credentials;
                }
            } catch (error) {
                console.warn(`⚠️ Failed to load credentials from ${loadMethod.name}:`, error.message);
                continue;
            }
        }

        throw new Error('ไม่พบ Google credentials ในทุกแหล่งที่รองรับ');
    }

    async loadFromDockerSecrets() {
        const secretPaths = [
            '/run/secrets/google_credentials',
            '/run/secrets/google_credentials_base64'
        ];

        for (const secretPath of secretPaths) {
            try {
                const secretExists = await fs.access(secretPath).then(() => true).catch(() => false);
                if (secretExists) {
                    const secretContent = await fs.readFile(secretPath, 'utf8');
                    
                    try {
                        const credentials = JSON.parse(secretContent.trim());
                        console.log('✅ Using Docker secret (JSON format) from:', secretPath);
                        this.logAuditEvent('credentials_loaded', 'Docker Secrets (JSON)');
                        return credentials;
                    } catch {
                        try {
                            const credentialsJson = Buffer.from(secretContent.trim(), 'base64').toString('utf8');
                            const credentials = JSON.parse(credentialsJson);
                            console.log('✅ Using Docker secret (Base64 format) from:', secretPath);
                            this.logAuditEvent('credentials_loaded', 'Docker Secrets (Base64)');
                            return credentials;
                        } catch (base64Error) {
                            console.warn(`⚠️ Invalid secret format in ${secretPath}:`, base64Error.message);
                        }
                    }
                }
            } catch (error) {
                console.warn(`⚠️ Cannot read Docker secret from ${secretPath}:`, error.message);
            }
        }

        return null;
    }

    async loadFromEnvironmentBase64() {
        if (process.env.GOOGLE_CREDENTIALS_BASE64) {
            try {
                const credentialsJson = Buffer.from(
                    process.env.GOOGLE_CREDENTIALS_BASE64, 
                    'base64'
                ).toString('utf8');
                const credentials = JSON.parse(credentialsJson);
                
                console.log('✅ Using Base64 encoded environment variable');
                this.logAuditEvent('credentials_loaded', 'Environment Variables (Base64)');
                return credentials;
            } catch (error) {
                throw new Error(`Invalid Base64 credentials: ${error.message}`);
            }
        }

        return null;
    }

    async loadFromEnvironmentVariables() {
        const requiredFields = [
            'GOOGLE_PROJECT_ID',
            'GOOGLE_PRIVATE_KEY',
            'GOOGLE_CLIENT_EMAIL'
        ];

        const missingFields = requiredFields.filter(field => !process.env[field]);
        if (missingFields.length > 0) {
            return null;
        }

        try {
            const credentials = {
                type: "service_account",
                project_id: process.env.GOOGLE_PROJECT_ID,
                private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID || 'not-provided',
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                client_id: process.env.GOOGLE_CLIENT_ID || '',
                auth_uri: "https://accounts.google.com/o/oauth2/auth",
                token_uri: "https://oauth2.googleapis.com/token",
                auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
                client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.GOOGLE_CLIENT_EMAIL)}`
            };

            console.log('✅ Using individual environment variables');
            this.logAuditEvent('credentials_loaded', 'Environment Variables (Individual)');
            return credentials;
        } catch (error) {
            throw new Error(`Invalid individual environment variables: ${error.message}`);
        }
    }

    async loadFromCloudSecretManager() {
        if (!process.env.GOOGLE_PROJECT_ID || !process.env.USE_SECRET_MANAGER) {
            return null;
        }

        try {
            const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
            const client = new SecretManagerServiceClient();
            
            const secretName = process.env.SECRET_NAME || 'google-drive-credentials';
            const name = `projects/${process.env.GOOGLE_PROJECT_ID}/secrets/${secretName}/versions/latest`;
            
            const [version] = await client.accessSecretVersion({ name });
            const credentialsJson = version.payload.data.toString();
            const credentials = JSON.parse(credentialsJson);
            
            console.log('✅ Using Google Secret Manager');
            this.logAuditEvent('credentials_loaded', 'Google Secret Manager');
            return credentials;
        } catch (error) {
            console.warn('⚠️ Failed to load from Google Secret Manager:', error.message);
            return null;
        }
    }

    async loadFromVault() {
        if (!process.env.VAULT_ENDPOINT || !process.env.VAULT_TOKEN) {
            return null;
        }

        try {
            const vault = require('node-vault')({
                apiVersion: 'v1',
                endpoint: process.env.VAULT_ENDPOINT,
                token: process.env.VAULT_TOKEN
            });

            const secretPath = process.env.VAULT_SECRET_PATH || 'secret/data/google-credentials';
            const result = await vault.read(secretPath);
            
            console.log('✅ Using HashiCorp Vault');
            this.logAuditEvent('credentials_loaded', 'HashiCorp Vault');
            return result.data.data;
        } catch (error) {
            console.warn('⚠️ Failed to load from Vault:', error.message);
            return null;
        }
    }

    async loadFromFile() {
        if (process.env.NODE_ENV === 'production') {
            return null;
        }

        try {
            const credentialsPath = path.join(process.cwd(), 'credentials.json');
            const fileExists = await fs.access(credentialsPath).then(() => true).catch(() => false);
            
            if (fileExists) {
                const credentialsContent = await fs.readFile(credentialsPath, 'utf8');
                const credentials = JSON.parse(credentialsContent);
                
                console.warn('⚠️ Using credentials.json file (DEVELOPMENT MODE ONLY)');
                this.logAuditEvent('credentials_loaded', 'File (Development)');
                return credentials;
            }
        } catch (error) {
            console.warn('⚠️ Failed to load from file:', error.message);
        }

        return null;
    }

    validateCredentials(credentials) {
        const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
        const missingFields = requiredFields.filter(field => !credentials[field]);
        
        if (missingFields.length > 0) {
            throw new Error(`Missing required credential fields: ${missingFields.join(', ')}`);
        }

        if (credentials.type !== 'service_account') {
            throw new Error('Invalid credential type. Expected: service_account');
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(credentials.client_email)) {
            throw new Error('Invalid client_email format');
        }

        if (!credentials.private_key.includes('-----BEGIN PRIVATE KEY-----')) {
            throw new Error('Invalid private key format');
        }

        console.log('✅ Credentials validation passed');
    }

    shouldReinitialize() {
        if (!this.lastInitialized) return false;
        
        const timeSinceInit = Date.now() - this.lastInitialized;
        return timeSinceInit > this.reinitializeInterval;
    }

    async reinitialize() {
        console.log('🔄 Force reinitializing Google Drive service...');
        this.initialized = false;
        this.credentials = null;
        this.lastInitialized = null;
        await this.initialize();
    }

    async listFiles(folderId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (this.shouldReinitialize()) {
            console.log('🔄 Credentials may be outdated, reinitializing...');
            await this.reinitialize();
        }

        try {
            const targetFolderId = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID;
            
            if (!targetFolderId) {
                throw new Error('Google Drive Folder ID ไม่ได้ระบุใน environment variables');
            }
            
            const query = `'${targetFolderId}' in parents and trashed = false and (mimeType = 'audio/m4a' or mimeType = 'audio/mpeg' or mimeType = 'audio/mp3' or mimeType = 'video/mp4' or mimeType = 'audio/mp4')`;

            console.log('🔍 Searching files with query:', query);

            const response = await this.drive.files.list({
                q: query,
                fields: 'files(id, name, mimeType, size, createdTime, modifiedTime)',
                orderBy: 'modifiedTime desc',
                pageSize: 25
            });

            const files = response.data.files || [];
            
            console.log(`📁 Found ${files.length} files in folder`);
            this.logAuditEvent('files_listed', `Found ${files.length} files`);

            return files.map(file => ({
                id: file.id,
                name: file.name,
                mimeType: file.mimeType,
                size: this.formatFileSize(file.size),
                sizeBytes: parseInt(file.size || 0),
                createdDate: new Date(file.createdTime).toLocaleDateString('th-TH'),
                modifiedDate: new Date(file.modifiedTime).toLocaleDateString('th-TH'),
                type: this.getFileType(file.mimeType)
            }));

        } catch (error) {
            console.error('❌ Error listing files:', error);
            this.logAuditEvent('files_list_failed', error.message);
            
            if (error.code === 404) {
                throw new Error('ไม่พบโฟลเดอร์ที่ระบุ');
            } else if (error.code === 403) {
                throw new Error('ไม่มีสิทธิ์เข้าถึงโฟลเดอร์ หรือ credentials หมดอายุ');
            } else if (error.code === 401) {
                console.log('🔄 Authentication error, attempting to reinitialize...');
                await this.reinitialize();
                throw new Error('Authentication failed, credentials may be expired');
            } else if (error.code === 400) {
                throw new Error('รูปแบบการค้นหาไฟล์ไม่ถูกต้อง กรุณาตรวจสอบ Folder ID');
            } else {
                throw new Error('เกิดข้อผิดพลาดในการดึงรายการไฟล์');
            }
        }
    }

    async getFile(fileId) {
        if (!this.initialized) {
            await this.initialize();
        }

        if (this.shouldReinitialize()) {
            await this.reinitialize();
        }

        try {
            const response = await this.drive.files.get({
                fileId: fileId,
                fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink'
            });

            const file = response.data;
            
            this.logAuditEvent('file_accessed', `File accessed: ${file.name}`);
            
            return {
                id: file.id,
                name: file.name,
                mimeType: file.mimeType,
                size: this.formatFileSize(file.size),
                sizeBytes: parseInt(file.size || 0),
                createdDate: new Date(file.createdTime).toLocaleDateString('th-TH'),
                modifiedDate: new Date(file.modifiedTime).toLocaleDateString('th-TH'),
                webViewLink: file.webViewLink,
                type: this.getFileType(file.mimeType)
            };
        } catch (error) {
            console.error('❌ Error getting file:', error);
            this.logAuditEvent('file_access_failed', `Failed to access file: ${fileId}, Error: ${error.message}`);
            
            if (error.code === 404) {
                throw new Error('ไม่พบไฟล์ที่ระบุ');
            } else if (error.code === 403) {
                throw new Error('ไม่มีสิทธิ์เข้าถึงไฟล์');
            } else if (error.code === 401) {
                await this.reinitialize();
                throw new Error('Authentication failed, please try again');
            } else {
                throw new Error('ไม่สามารถดึงข้อมูลไฟล์ได้');
            }
        }
    }

    isFileSizeValid(sizeBytes) {
        const maxSize = 125 * 1024 * 1024;
        return sizeBytes <= maxSize;
    }

    formatFileSize(bytes) {
        if (!bytes) return 'N/A';
        
        const size = parseInt(bytes);
        const units = ['B', 'KB', 'MB', 'GB'];
        let unitIndex = 0;
        let formattedSize = size;

        while (formattedSize >= 1024 && unitIndex < units.length - 1) {
            formattedSize /= 1024;
            unitIndex++;
        }

        return `${formattedSize.toFixed(1)} ${units[unitIndex]}`;
    }

    getFileType(mimeType) {
        const typeMap = {
            'audio/m4a': 'Audio (M4A)',
            'audio/mpeg': 'Audio (MP3)',
            'audio/mp3': 'Audio (MP3)',
            'audio/mp4': 'Audio (MP4)',
            'video/mp4': 'Video (MP4)'
        };
        
        return typeMap[mimeType] || 'Unknown';
    }

    logAuditEvent(event, details) {
        const auditData = {
            timestamp: new Date().toISOString(),
            service: 'GoogleDriveService',
            event: event,
            details: details,
            environment: process.env.NODE_ENV || 'unknown',
            user: process.env.SERVICE_NAME || 'meeting-bot'
        };
        
        console.log('🔍 AUDIT:', JSON.stringify(auditData));
        
        if (process.env.AUDIT_WEBHOOK_URL) {
            this.sendAuditLog(auditData).catch(error => {
                console.warn('⚠️ Failed to send audit log:', error.message);
            });
        }
    }

    async sendAuditLog(auditData) {
        try {
            const fetch = require('node-fetch');
            await fetch(process.env.AUDIT_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.AUDIT_WEBHOOK_TOKEN || ''}`
                },
                body: JSON.stringify(auditData),
                timeout: 5000
            });
        } catch (error) {
            console.warn('⚠️ Audit log sending failed:', error.message);
        }
    }

    async healthCheck() {
        try {
            if (!this.initialized) {
                return {
                    status: 'unhealthy',
                    message: 'Service not initialized',
                    timestamp: new Date().toISOString()
                };
            }

            await this.drive.about.get({ fields: 'user' });
            
            return {
                status: 'healthy',
                message: 'Google Drive connection active',
                lastInitialized: new Date(this.lastInitialized).toISOString(),
                credentialsSource: this.getCredentialsSourceInfo(),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                message: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    getCredentialsSourceInfo() {
        if (!this.credentials) return 'unknown';
        
        if (process.env.GOOGLE_CREDENTIALS_BASE64) return 'environment_base64';
        if (process.env.GOOGLE_PRIVATE_KEY) return 'environment_variables';
        if (require('fs').existsSync('/run/secrets/google_credentials')) return 'docker_secrets';
        if (process.env.USE_SECRET_MANAGER) return 'cloud_secret_manager';
        if (process.env.VAULT_ENDPOINT) return 'vault';
        return 'file_fallback';
    }

    clearCredentials() {
        if (this.credentials) {
            Object.keys(this.credentials).forEach(key => {
                if (typeof this.credentials[key] === 'string') {
                    this.credentials[key] = '';
                }
            });
            this.credentials = null;
        }
        
        this.initialized = false;
        this.drive = null;
        
        console.log('🧹 Credentials cleared from memory');
        this.logAuditEvent('credentials_cleared', 'Credentials cleared from memory for security');
    }

    async shutdown() {
        console.log('🛑 Shutting down Google Drive service...');
        this.clearCredentials();
        this.logAuditEvent('service_shutdown', 'Google Drive service shutdown');
    }
}

const googleDriveService = new GoogleDriveService();

process.on('SIGINT', async () => {
    await googleDriveService.shutdown();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await googleDriveService.shutdown();
    process.exit(0);
});

module.exports = googleDriveService;