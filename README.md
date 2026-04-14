# Zoomies Production Pipeline

A local CLI + web interface that takes a script file and automates the full production pipeline for Zoomies AI Animation Studio.

**Shows:**
- The Real Catwives of Beverly Hills (`CWBH`)
- CSI: Bloodhound Bureau (`BHB`)

---

## Setup

### 1. Install dependencies

```bash
cd zoomies-pipeline
npm install
npm run build
```

To use the CLI globally:

```bash
npm link
```

---

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

```env
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=...
SLACK_BOT_TOKEN=xoxb-...
ZOOMIES_SLACK_CHANNEL=#production
ZOOMIES_DRIVE_ROOT_FOLDER_ID=<folder-id-from-drive-url>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# ElevenLabs Voice IDs (fill in after locking voices in ElevenLabs)
VOICE_KITTY=
VOICE_COUNTESS=
VOICE_BAMBI=
VOICE_DOMINIQUE=
VOICE_PURRLITA=
VOICE_CHASE=
VOICE_VICKI=
VOICE_KIBBLE=
VOICE_VANDERPUMP=
```

---

### 3. Google Cloud project setup

The pipeline uses Google Drive API v3 via OAuth2. Follow these steps once.

#### Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (e.g. `zoomies-pipeline`)
3. Enable the **Google Drive API**:
   - APIs & Services → Library → search "Google Drive API" → Enable

#### Create OAuth2 credentials

1. APIs & Services → Credentials → Create Credentials → **OAuth client ID**
2. Application type: **Desktop app**
3. Name: `Zoomies CLI`
4. Download the JSON — copy `client_id` and `client_secret` into your `.env`

#### Authorize on first run

The first time you run any `zoomies` command that uses Drive, a browser will open asking you to authorize. After approving:
- Tokens are saved to `~/.zoomies/tokens.json`
- Subsequent runs use stored tokens and auto-refresh

---

### 4. Slack bot setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Create New App → From scratch
2. OAuth & Permissions → Bot Token Scopes → add `chat:write`
3. Install app to workspace
4. Copy the **Bot User OAuth Token** (`xoxb-...`) to `SLACK_BOT_TOKEN`
5. Invite the bot to your channel: `/invite @zoomies` in Slack

---

### 5. Google Drive root folder

1. Create a folder in Drive (e.g. `Zoomies Productions`)
2. Open the folder — the ID is the last segment of the URL:
   `https://drive.google.com/drive/folders/FOLDER_ID_HERE`
3. Set `ZOOMIES_DRIVE_ROOT_FOLDER_ID=FOLDER_ID_HERE` in `.env`

---

## CLI Usage

### `zoomies intake <script>`

Runs the full intake pipeline:
1. Reads the script file (`.txt`, `.md`, `.fountain`, `.pdf`)
2. Calls Claude to extract structured episode data
3. Creates Drive folder structure
4. Uploads shot list JSON + TXT
5. Sends Slack notification
6. Builds and uploads image generation prompts
7. Generates and uploads voice files (ElevenLabs)
8. Opens the approval UI at `http://localhost:3333`

```bash
zoomies intake scripts/cwbh_s1e3.txt
zoomies intake scripts/bhb_pilot.pdf
zoomies intake scripts/episode.fountain --no-server  # skip approval UI
```

---

### `zoomies approve`

Opens the approval UI at `http://localhost:3333` for the last intake run. Use this if you closed the browser after `intake`.

```bash
zoomies approve
```

**In the approval UI:**
- Review each shot card: angle, action, characters, dialogue, emotion
- Click **Approve** or **Reject** per shot
- Add rejection notes (optional) on rejected shots
- Progress bar tracks how many shots you've reviewed
- **Submit All** becomes active when every shot has a decision

On submit:
- Approval statuses written back to Drive JSON
- Approved prompt files copied to `_APPROVED/` folder
- Rejection notes written to `Working/REJECTED_NOTES.txt`
- Slack notification posted

---

### `zoomies deliver [drive_folder_id]`

Assembles the final delivery folder from approved shots:
- Copies approved prompt files to `_Final_Delivery/`
- Copies all VO files to `_Final_Delivery/`
- Writes `DELIVERY_MANIFEST.json`
- Posts Slack notification

```bash
zoomies deliver
zoomies deliver 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs  # explicit folder ID
```

---

### `zoomies status`

Shows the current pipeline state from `~/.zoomies/state.json`.

```bash
zoomies status
```

---

## Drive folder structure

For each episode, the pipeline creates:

```
{Root Folder}/
  The Real Catwives of Beverly Hills/
    Season 1/
      Episode 3 — Title Here/
        Episode3_Shot_List.json     ← structured episode data
        Episode3_Shot_List.txt      ← human-readable shot list
        Working/
          SC01_Beverly_Hills_Mansion/
            CWBH_S1E3_SC01_SC01-SH01_PROMPT.txt
            CWBH_S1E3_SC01_SC01-SH01_KITTY_VO.mp3
            ...
          SC02_Pool_Deck/
            ...
          VOICE_ERRORS.txt          ← only if voice gen had failures
          REJECTED_NOTES.txt        ← only if shots were rejected
        _APPROVED/
          CWBH_S1E3_SC01_SC01-SH01_PROMPT.txt
          ...
        _Final_Delivery/
          CWBH_S1E3_SC01_SC01-SH01_PROMPT.txt
          CWBH_S1E3_SC01_SC01-SH01_KITTY_VO.mp3
          DELIVERY_MANIFEST.json
          ...
```

---

## File naming convention

```
{SHOW_CODE}_S{season}E{episode}_{SCENE_ID}_{SHOT_ID}_{CHARACTER}_{TYPE}.{ext}

Examples:
  CWBH_S1E1_SC01_SC01-SH01_KITTY_PROMPT.txt
  CWBH_S1E1_SC01_SC01-SH01_KITTY_VO.mp3
  BHB_S1E2_SC03_SC03-SH02_CHASE_PROMPT.txt
  BHB_S1E2_SC03_SC03-SH02_CHASE_VO.mp3
```

---

## Local state

Pipeline state is persisted at `~/.zoomies/state.json`. This lets CLI commands (approve, deliver, status) pick up where they left off without needing to re-run intake.

OAuth tokens are stored at `~/.zoomies/tokens.json`.

---

## Error handling

- **Voice generation failures** — logged to `VOICE_ERRORS.txt` in the Working folder; pipeline continues
- **Missing voice IDs** — set `VOICE_{CHARACTER}=` in `.env` after locking voices in ElevenLabs
- **Slack failures** — logged as warnings; pipeline continues
- **Claude extraction errors** — check that your script has clear show/character context

---

## Development

```bash
npm run dev -- intake scripts/test.txt   # run without building
npm run build                             # compile TypeScript
```

Set `DEBUG=1` for stack traces on errors:

```bash
DEBUG=1 zoomies intake scripts/test.txt
```
