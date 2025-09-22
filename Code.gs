/**
 * @fileoverview Apps Script for a Google Shared Drive creation workflow.
 *
 * This script is designed to be called from an AppSheet automation.
 * It securely creates a Google Shared Drive by:
 * 1. Running as the AppSheet App Owner (a developer/admin).
 * 2. Using the App Owner's permissions to fetch a Service Account (SA) key from Google Cloud Secret Manager.
 * 3. Using that key to perform Domain-Wide Delegation (DwD) to impersonate a "bot" user.
 * 4. Calling the Drive API v3 as the "bot" user to create the Shared Drive.
 *
 * @version 1.0
 */

// Global variable to cache credentials for the script's execution
let SERVICE_ACCOUNT_CREDENTIALS;

/**
 * Main function called by AppSheet.
 * @param {string} driveName The desired name for the new Shared Drive.
 * @returns {string} The new Drive ID on success, or an error message on failure.
 */
function createSharedDrive(driveName) {
  
  if (!driveName || driveName.trim() === "") {
    Logger.log("Error: Drive name was empty or not provided.");
    return String("ERROR: Drive name was empty or not provided.");
  }

  try {
    const service = getDriveService();
    if (!service.hasAccess()) {
      const authError = service.getLastError();
      Logger.log(`Authorization failed: ${authError}`);
      return String(`ERROR: Auth Error: ${authError}`);
    }
    
    Logger.log("Service authorized. Attempting to create Shared Drive...");
    
    const driveApiEndpoint = 'https://www.googleapis.com/drive/v3/drives';
    const requestId = Utilities.getUuid();
    const payload = {
      name: driveName
    };
    
    const options = {
      method: 'POST',
      contentType: 'application/json',
      headers: {
        // Use the impersonated bot's token for the API call
        'Authorization': 'Bearer ' + service.getAccessToken() 
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    // Call the Drive API manually using UrlFetchApp
    const response = UrlFetchApp.fetch(`${driveApiEndpoint}?requestId=${requestId}`, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode !== 200) {
      Logger.log(`Error creating drive: ${responseBody}`);
      return String(`ERROR: ${responseBody}`);
    }
    
    const newDrive = JSON.parse(responseBody);
    Logger.log(`Success! Shared Drive created with ID: ${newDrive.id}`);
    return String(newDrive.id);
    
  } catch (e) {
    Logger.log(`Error in createSharedDrive: ${e.message}`);
    return String(`ERROR: ${e.message}`);
  }
}

/**
 * Fetches/parses the SA key from Secret Manager via REST API.
 * Caches the result in a global variable for this execution.
 */
function getServiceAccountCredentials() {
  // Check cache first
  if (SERVICE_ACCOUNT_CREDENTIALS) {
    return SERVICE_ACCOUNT_CREDENTIALS;
  }
  
  const scriptProperties = PropertiesService.getScriptProperties();
  const secretResourceName = scriptProperties.getProperty('SECRET_RESOURCE_NAME');
  if (!secretResourceName) {
    throw new Error("Secret Manager Error: 'SECRET_RESOURCE_NAME' not set in Script Properties.");
  }
  
  // Use the REST API endpoint for :access
  const restApiEndpoint = `https://secretmanager.googleapis.com/v1/${secretResourceName}:access`;
  
  try {
    // Get the OAuth token of the user running the script
    // This is the AppSheet App Owner, who must have the 'Secret Manager Secret Accessor' IAM role.
    const token = ScriptApp.getOAuthToken();
    
    const options = {
      "method": "GET",
      "headers": { "Authorization": "Bearer " + token },
      "muteHttpExceptions": true
    };
    
    const response = UrlFetchApp.fetch(restApiEndpoint, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();
    
    if (responseCode !== 200) {
      throw new Error(`Secret Manager Error: ${responseCode} ${responseBody}. Ensure the App Owner account has 'Secret Manager Secret Accessor' role.`);
    }
    
    // Data is Base64-encoded, decode it
    const keyString = JSON.parse(responseBody).payload.data;
    const decodedKey = Utilities.newBlob(Utilities.base64Decode(keyString)).getDataAsString();
    
    // Parse and cache in the global variable
    SERVICE_ACCOUNT_CREDENTIALS = JSON.parse(decodedKey);
    return SERVICE_ACCOUNT_CREDENTIALS;
    
  } catch (e) {
    Logger.log(`Failed to access secret: ${e.message}`);
    throw new Error(e.message);
  }
}

/**
 * Configures and returns an OAuth2-authenticated service for the Google Drive API.
 */
function getDriveService() {
  const userToImpersonate = PropertiesService.getScriptProperties().getProperty('IMPERSONATED_USER');
  if (!userToImpersonate) {
    throw new Error("Script property 'IMPERSONATED_USER' not set.");
  }
  
  // Get the credentials (fetches from Secret Manager on first run)
  const credentials = getServiceAccountCredentials();

  // Build the OAuth2 service to impersonate the bot user
  return OAuth2.createService('Drive:' + userToImpersonate)
      .setTokenUrl('https://oauth2.googleapis.com/token')
      .setPrivateKey(credentials.private_key)
      .setIssuer(credentials.client_email)
      .setSubject(userToImpersonate)
      .setParam('scope', 'https://www.googleapis.com/auth/drive')
      .setPropertyStore(PropertiesService.getScriptProperties())
      .setCache(CacheService.getScriptCache());
}
