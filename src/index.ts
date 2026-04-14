#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Load .env from cwd
dotenv.config({ path: path.join(process.cwd(), '.env'), override: true });

const program = new Command();

program
  .name('zoomies')
  .description('Zoomies AI Animation Studio — Production Pipeline CLI')
  .version('1.0.0');

// ── zoomies intake <script> ────────────────────────────────────────────────────
program
  .command('intake <script>')
  .description('Run full intake pipeline: extract → Drive folders → prompts → voices → approval UI')
  .option('--no-server', 'Skip opening the approval server after intake')
  .action(async (scriptArg: string, options: { server: boolean }) => {
    try {
      const { runIntake } = await import('./intake');
      const { startApprovalServer } = await import('./server');

      const isFilePath =
        !scriptArg.includes('\n') && (fs.existsSync(scriptArg) || scriptArg.endsWith('.txt') || scriptArg.endsWith('.pdf') || scriptArg.endsWith('.md') || scriptArg.endsWith('.fountain'));

      const state = await runIntake(scriptArg, isFilePath);

      if (options.server !== false) {
        await startApprovalServer();
      }
    } catch (err) {
      console.error(`\n❌ Intake failed: ${(err as Error).message}`);
      if (process.env.DEBUG) console.error((err as Error).stack);
      process.exit(1);
    }
  });

// ── zoomies approve ────────────────────────────────────────────────────────────
program
  .command('approve')
  .description('Open the approval UI for the last intake run')
  .action(async () => {
    try {
      const { startApprovalServer } = await import('./server');
      await startApprovalServer();
    } catch (err) {
      console.error(`\n❌ Could not start approval server: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── zoomies voices ─────────────────────────────────────────────────────────────
program
  .command('voices')
  .description('Generate / re-generate voice VO for all dialogue shots in the current episode')
  .action(async () => {
    try {
      const { loadState, saveState } = await import('./intake');
      const state = loadState();
      if (!state) {
        console.error('\n❌ No pipeline state found. Run `zoomies intake <script>` first.');
        process.exit(1);
      }

      const { generateAndUploadVoices } = await import('./voices');
      const { getDriveClient } = await import('./drive');
      const { updateJsonFile } = await import('./drive');

      const { results: voiceResults } = await generateAndUploadVoices(
        state.episode,
        state.sceneFolderMap,
        state.workingFolderDriveId
      );

      // Attach VO file IDs to shots
      state.episode.shots = state.episode.shots.map((shot) => {
        const shotVOs = voiceResults.filter((r) => r.shotId === shot.id);
        if (shotVOs.length === 0) return shot;
        return {
          ...shot,
          vo_files: shotVOs.map((r) => ({
            character: r.character,
            drive_file_id: r.driveFileId,
            filename: r.filename,
          })),
        };
      });

      // Update Drive JSON and local state
      const driveClient = await getDriveClient();
      await updateJsonFile(driveClient, state.shotListJsonFileId, state.episode);
      state.lastUpdated = new Date().toISOString();
      saveState(state);

      const voiceCount = state.episode.shots.filter((s) => s.vo_files && s.vo_files.length > 0).length;
      console.log(`\n✅ Voice generation complete — ${voiceCount} shots with VO files\n`);
    } catch (err) {
      console.error(`\n❌ Voice generation failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── zoomies deliver [drive_folder_id] ─────────────────────────────────────────
program
  .command('deliver [drive_folder_id]')
  .description('Assemble final delivery folder from approved shots')
  .action(async (driveFolderId?: string) => {
    try {
      const { runDelivery } = await import('./delivery');
      await runDelivery(driveFolderId);
    } catch (err) {
      console.error(`\n❌ Delivery failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── zoomies serve ─────────────────────────────────────────────────────────────
program
  .command('serve')
  .description('Start the hosted approval server (for Railway / custom domain deployment)')
  .action(async () => {
    try {
      const { startHostedServer } = await import('./server');
      await startHostedServer();
    } catch (err) {
      console.error(`\n❌ Server failed: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── zoomies status ─────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show the current pipeline state')
  .action(() => {
    const stateFile = path.join(os.homedir(), '.zoomies', 'state.json');

    if (!fs.existsSync(stateFile)) {
      console.log('\n📭 No pipeline state found. Run `zoomies intake <script>` to start.\n');
      return;
    }

    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      const ep = state.episode;

      const approved = ep.shots.filter((s: { approval_status?: string }) => s.approval_status === 'APPROVED').length;
      const rejected = ep.shots.filter((s: { approval_status?: string }) => s.approval_status === 'REJECTED').length;
      const pending = ep.shots.filter((s: { approval_status?: string }) => s.approval_status === 'PENDING').length;

      const voicesDone = ep.shots.filter(
        (s: { vo_files?: unknown[] }) => s.vo_files && (s.vo_files as unknown[]).length > 0
      ).length;

      console.log(`\n🎬 Zoomies Pipeline Status`);
      console.log(`${'─'.repeat(50)}`);
      console.log(`Show:     ${ep.show === 'catwives' ? 'The Real Catwives of Beverly Hills' : 'CSI: Bloodhound Bureau'}`);
      console.log(`Episode:  S${ep.season}E${ep.episode} — ${ep.title}`);
      console.log(`Scenes:   ${ep.scenes.length}`);
      console.log(`Shots:    ${ep.shots.length} total`);
      console.log(`          ✅ ${approved} approved`);
      console.log(`          ❌ ${rejected} rejected`);
      console.log(`          ⏳ ${pending} pending`);
      console.log(`Voices:   ${voicesDone} shots with VO`);
      console.log(`Updated:  ${state.lastUpdated}`);
      console.log(`Drive:    https://drive.google.com/drive/folders/${state.episodeFolderDriveId}`);
      console.log(`${'─'.repeat(50)}\n`);
    } catch {
      console.error('Could not read state file. It may be corrupted.');
    }
  });

program.parse(process.argv);
