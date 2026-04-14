import { WebClient } from '@slack/web-api';

const client = new WebClient('xoxb-8352115066386-10893371549574-XRu8jVt4EfFGBiDjohfh4fDP');

// Confirm identity
const auth = await client.auth.test();
console.log('\n🤖 Slack Bot Identity');
console.log(`   Bot:       @${auth.user}`);
console.log(`   Team:      ${auth.team}`);
console.log(`   Workspace: ${auth.url}`);

// Send test message to #production
try {
  const msg = await client.chat.postMessage({
    channel: '#zoomies-production',
    mrkdwn: true,
    text: '🎬 *Zoomies pipeline connected.*\nSlack notifications are live — Drive + Claude + ElevenLabs ready.',
  });
  console.log(`\n✅ Message sent to #production (ts: ${msg.ts})\n`);
} catch (err) {
  if (err.data?.error === 'channel_not_found') {
    console.log('\n⚠️  Bot is not in #production yet.');
    console.log('   In Slack: go to #production and type /invite @zoomies\n');
  } else {
    throw err;
  }
}
