const { google } = require('googleapis');
const stream = require('stream');

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

let drive = null;

function initDrive() {
    if (drive) return drive;

    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
        console.warn('⚠️ Google Drive Service Account credentials missing from environment variables.');
        return null;
    }

    try {
        // Format private key (handles both raw key and Vercel escaped key)
        const formattedKey = GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

        const auth = new google.auth.JWT(
            GOOGLE_SERVICE_ACCOUNT_EMAIL,
            null,
            formattedKey,
            ['https://www.googleapis.com/auth/drive']
        );

        drive = google.drive({ version: 'v3', auth });
        return drive;
    } catch (err) {
        console.error('❌ Failed to initialize Google Drive client:', err.message);
        return null;
    }
}

// Find a folder under a parent folder by name
async function findFolder(driveClient, name, parentId) {
    let q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) {
        q += ` and '${parentId}' in parents`;
    }
    
    const response = await driveClient.files.list({
        q: q,
        fields: 'files(id)',
        spaces: 'drive'
    });
    
    if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0].id;
    }
    return null;
}

// Create a folder under a parent
async function createFolder(driveClient, name, parentId) {
    const fileMetadata = {
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
    };
    if (parentId) {
        fileMetadata.parents = [parentId];
    }
    
    const folder = await driveClient.files.create({
        resource: fileMetadata,
        fields: 'id'
    });
    return folder.data.id;
}

// Find or create a folder in hierarchy
async function findOrCreateFolder(driveClient, name, parentId) {
    let folderId = await findFolder(driveClient, name, parentId);
    if (!folderId) {
        folderId = await createFolder(driveClient, name, parentId);
    }
    return folderId;
}

/**
 * Uploads a file buffer to Google Drive in the folder: /{Site Name}/{Flat Number}/{Room or Stage}/
 */
async function uploadPhoto({ siteName, flatNumber, locationName, buffer, mimeType, filename }) {
    const driveClient = initDrive();
    if (!driveClient) {
        throw new Error('Google Drive API client is not configured/initialized.');
    }

    // 1. Traverse / Create Folder hierarchy
    // Root Folder
    let parentId = GOOGLE_DRIVE_FOLDER_ID || null;
    
    // Site Folder
    parentId = await findOrCreateFolder(driveClient, siteName, parentId);
    // Flat Folder
    parentId = await findOrCreateFolder(driveClient, `Flat ${flatNumber}`, parentId);
    // Room or Stage Folder
    parentId = await findOrCreateFolder(driveClient, locationName, parentId);

    // 2. Upload file
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);

    const fileMetadata = {
        name: filename,
        parents: [parentId]
    };
    const media = {
        mimeType: mimeType,
        body: bufferStream
    };

    const file = await driveClient.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id, webViewLink, thumbnailLink'
    });

    const fileId = file.data.id;

    // 3. Set file permissions so anyone can view it
    try {
        await driveClient.permissions.create({
            fileId: fileId,
            resource: {
                role: 'reader',
                type: 'anyone'
            }
        });
    } catch (permError) {
        console.error(`⚠️ Permission setup failed for file ${fileId}:`, permError.message);
    }

    // Refresh and fetch webViewLink/thumbnailLink
    const fileInfo = await driveClient.files.get({
        fileId: fileId,
        fields: 'id, webViewLink, thumbnailLink, webContentLink'
    });

    return {
        drive_file_id: fileInfo.data.id,
        drive_view_url: fileInfo.data.webViewLink,
        drive_thumbnail_url: fileInfo.data.thumbnailLink || fileInfo.data.webContentLink
    };
}

module.exports = {
    uploadPhoto,
    initDrive
};
