# Google-Shared-Drive-Creation-using-AppSheet-x-Apps-Script
## Phase 1: Google Workspace Setup (The "Bot" User & Policy)
Goal: Create a licensed "bot" user and give it permission to create Shared Drives using the correct, granular service policy.

### Create the Dedicated "Bot" User
1.  In the Admin Console (`admin.google.com`), navigate to **Directory > Users > Add a new user**.
2.  Create the user (e.g., `poc-sd-automator@domain.com`).
3.  **Assign a License:** Ensure this user has a Google Workspace license that includes Shared Drives (e.g., Enterprise Plus).
4.  **Assign to OU:** Place this user in the intended Target OU (e.g., OU1).

### Enable "Shared Drive Creation" Policy
1.  In the Admin Console, go to **Apps > Google Workspace > Drive and Docs**.
2.  Click on "Sharing settings".
3.  Find the "Shared Drive creation" card.
4.  **Apply the Policy:**
    * **Method A (OU-based):** Select the Target OU and check the box to "Allow users in [Target OU] to create new shared drives".
    * **Method B (Group-based):** For a more granular approach, apply this "Allow" policy to a specific Configuration Group that contains the bot user, as this will take precedence over the OU.
5.  Click **Save**.

### Create the Monitoring Group
💡: _If you did Method B, you can either reuse that group for auditing purpuses or using this Monitoring Group for the Shared Drive creation policy_
1.  Go to **Directory > Groups > Create group**.
2.  Name it `(POC) Automator Monitoring`.
3.  Add `poc-sd-automator@domain.com` as a member (this group is for auditing purposes only).

## Phase 2: GCP Setup (The "Robot" Identity & Secret)
Goal: Create the Service Account (SA) for DwD, securely store its key in Secret Manager, and grant the developer access to read that secret.

### Create the DwD Service Account
1.  In the GCP Console (`console.cloud.google.com`), go to **IAM & Admin > Service Accounts**.
2.  Click **+ Create Service Account**, name it `(poc) appsheet-drive-creator`, and click **Create and Continue**, then **Done**.

### Create, Secure, and Delete the Key
1.  Click on the new SA, go to the **Keys** tab.
2.  Click **Add Key > Create new key > JSON**.
3.  A JSON file will download. Open this file in a text editor.
4.  In the GCP Console, go to **Security > Secret Manager**.
5.  Click **+ Create Secret**. Name it `poc-dwd-key`.
6.  In the **Secret value** box, paste the entire contents of the JSON file.
7.  Click **Create Secret**.
8.  **CRITICAL STEP:** Permanently delete the JSON file you downloaded from your computer.

### Authorize DwD for the SA
1.  Go back to **IAM & Admin > Service Accounts** and click the `(poc) appsheet-drive-creator` SA.
2.  Go to the **Details** tab and copy the **Unique ID (Client ID)**.
3.  In the Workspace Admin Console, go to **Security > API controls > Manage Domain-Wide Delegation**.
4.  Click **Add new**.
5.  Paste the **Client ID**.
6.  Add the one scope: `https://www.googleapis.com/auth/drive`
7.  Click **Authorize**.

### Grant the Developer (App Owner) Access to the Secret
1.  In the GCP Console > **IAM & Admin > IAM**.
2.  Find the developer's user account in the "Principal" list (the user who will own the AppSheet app).
3.  Click the pencil icon ✏️ to edit its roles.
4.  Click **+ ADD ANOTHER ROLE** and select **Secret Manager Secret Accessor**.
5.  Click **Save**.

## Phase 3: Apps Script Setup (The "Brain")
Goal: Link the script to GCP and write the code to fetch the secret (as the developer) and then create the drive (as the bot).

### Create & Link the Script to GCP
1.  At `script.google.com`, create a **New project**.
2.  Name it `(POC) Secure Drive Creator Script`.
3.  Click **Project Settings ⚙️**.
4.  Scroll down and click **Change project**.
5.  Paste your **GCP Project Number**.
6.  Click **Set project**.

### Configure the OAuth Consent Screen
1.  In the GCP Console, go to **APIs & Services > OAuth consent screen**.
2.  Select **Internal** and click **Create**.
3.  **App name:** `(POC) Shared Drive Automator`
4.  **User support email:** The developer's email.
5.  **Developer contact information:** The developer's email.
6.  Click **Save and Continue** (skip Scopes), then **Back to Dashboard**.

### Add Libraries & Services
1.  In the Apps Script editor, click **Libraries +** and add the [OAuth2 Library](https://github.com/googleworkspace/apps-script-oauth2):
    `1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF`

### Configure Script Properties
1.  Go to **Project Settings ⚙️ > Script Properties**.
2.  **Property 1:**
    * **Property:** `SECRET_RESOURCE_NAME`
    * **Value:** `projects/[YOUR-PROJECT-ID]/secrets/poc-dwd-key/versions/1`
3.  **Property 2:**
    * **Property:** `IMPERSONATED_USER`
    * **Value:** `poc-sd-automator@domain.com`

### Edit the Manifest File (appsscript.json)
1.  Go to **Project Settings ⚙️**.
2.  Check the box 'Show "appsscript.json" manifest file in editor'.
3.  Go back to the **Editor 📄** and click the `appsscript.json` file.
4.  Paste in the required manifest JSON. This file must include the `oauthScopes` for `https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/cloud-platform`, and `https://www.googleapis.com/auth/script.external_request`.

### Add the Final Code (Code.gs)
1.  Go to the **Editor 📄** and click `Code.gs`.
2.  Delete everything in the code editor.
3.  Paste in the complete, final `Code.gs` (the 3-function script, which uses `UrlFetchApp`, returns a `String`).

### Authorize the Script
1.  In the editor toolbar, select the `createSharedDrive` function and click **Run**.
2.  A "Authorization required" pop-up will appear.
3.  Click **Review permissions**, select the developer's admin account, and **Allow** all 3 scopes.
4.  The script will log "ERROR: Drive name was empty...". This is expected.

## Phase 4: AppSheet Setup (The "Face")
### Create the AppSheet Database
1.  Go to `appsheet.com` > **Create > Database > New database**.
2.  Name it: `(POC) Shared Drive Requests DB`.
3.  Rename the default table to `Requests`.
4.  Configure the columns:
    * `Timestamp` (Type: `DateTime`, Initial value: `NOW()`)
    * `RequesterEmail` (Type: `Email`, Initial value: `USEREMAIL()`)
    * `RequestedDriveName` (Type: `Text`, Required: `Yes`)
    * `Status` (Type: `Text`, Initial value: `"Pending"`)
    * `DriveID` (Type: `Text`)

### Create the AppSheet App
1.  Create a new app from the `(POC) Shared Drive Requests DB`.

### Configure the Data and UI
1.  Go to the **Data tab 💾**, select the `Requests` table, and **Regenerate schema (🔄)**.
2.  Verify `Status` is `Text`.

### Create the Automation
1.  Go to the **Automation tab 🤖 > Create > New bot**.
2.  Note: Use simple names for your steps (e.g., `CallScript`), as special characters can cause errors.
3.  **Event:** **Adds only** on the `Requests` table.
4.  **Process:**
    * **Step 1 (Name: `CallScript`):**
        * Select **Call a script > (POC) Secure Drive Creator Script**.
        * **Function Name:** `createSharedDrive`.
        * **Arguments:** `[RequestedDriveName]`.
        * Enable the "Return Value" toggle.
        * **"Return value type":** `String`.
    * **Step 2 (Name: `UpdateRow`):**
        * Select **Data: Set row values**.
        * **Table:** `Requests`.
        * **Status formula:** `IF(STARTSWITH([CallScript].[Output], "ERROR:"), "Failed", "Created")`
        * **DriveID formula:** `IF(STARTSWITH([CallScript].[Output], "ERROR:"), "", [CallScript].[Output])`
5.  Click **Save**.

## Phase 5: Testing & Verification
1.  **Run the App:** Open the AppSheet app and submit a new request.
2.  **Check the App:** Sync the app (🔄). The `Status` for the new row should change from "Pending" to "Created". The `DriveID` column will populate.
3.  **Verify Admin Console:**
    * **Proof of Location:** Go to **Admin Console > Apps > Drive and Docs > Manage Shared Drives**. The new drive will be in the Target OU.
    * **Proof of Creator:** The "Creator" will be the bot, `poc-sd-automator@...`.
    * **Proof of Monitoring:** Go to **Reporting > Audit and investigation** and filter by `Group: (POC) Automator Monitoring)` to see the creation log.
