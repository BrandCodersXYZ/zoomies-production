import Anthropic from '@anthropic-ai/sdk';
import { EpisodeData } from './types';

const MODEL = 'claude-sonnet-4-20250514';

const EXTRACTION_SYSTEM_PROMPT = `You are a professional script analyst for an AI animation studio called Zoomies.
Your job is to parse animation scripts and extract structured production data.

You must return ONLY valid JSON with no additional commentary, markdown, or explanation.
Follow the exact schema provided in the user prompt.

Be thorough: extract every distinct scene and every distinct shot.
If dialogue is present in a scene, break it into shots where each shot covers one beat of dialogue or action.
Infer camera angles based on dramatic context — favor mobile-first vertical composition (9:16).`;

const EXTRACTION_USER_PROMPT = (scriptText: string) => `
Parse the following script and extract structured production data.

Return ONLY this JSON structure, fully populated:

{
  "show": "catwives" | "bloodhound",
  "season": number,
  "episode": number,
  "title": string,
  "logline": string (1-2 sentences),
  "characters": array of character names (only from: kitty, countess, bambi, dominique, purrlita, chase, vicki, kibble, vanderpump),
  "notes": string (any production notes, casting notes, or special instructions),
  "scenes": [
    {
      "id": "SC01" (zero-padded, sequential),
      "location": string (specific location name),
      "time": "morning" | "afternoon" | "evening" | "night",
      "beat": string (one sentence: what happens in this scene dramatically),
      "function": "setup" | "confrontation" | "revelation" | "cliffhanger" | "resolution" | "comedy",
      "dialogue": string (all dialogue in this scene as a block)
    }
  ],
  "shots": [
    {
      "id": "SC01-SH01" (format: {scene_id}-SH{zero-padded number}),
      "scene_id": "SC01",
      "action": string (what is physically happening in this shot),
      "angle": "wide" | "medium-two" | "medium-single" | "close-up" | "extreme-close-up" | "over-shoulder" | "reaction" | "insert",
      "characters": array of character names in this specific shot,
      "emotion": string (primary emotion or expression for the dominant character),
      "dialogue_line": string (the specific line of dialogue for this shot, or empty string),
      "duration_seconds": number (estimated shot duration 2-8 seconds)
    }
  ]
}

Rules:
- Infer show from content/characters if not explicitly stated
- infer season/episode from filename hints or context; default to 1 if unknown
- Every scene must have at least 2 shots
- Dialogue shots should have dialogue_line populated
- Action shots may have empty dialogue_line
- characters array in shots should only include who is VISIBLE in that specific shot

SCRIPT:
${scriptText}
`;

export async function extractEpisodeData(scriptText: string): Promise<EpisodeData> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set in .env');

  const client = new Anthropic({ apiKey });

  console.log('🤖 Sending script to Claude for extraction...');

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: EXTRACTION_USER_PROMPT(scriptText),
      },
    ],
  });

  const content = message.content[0];
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude');
  }

  let jsonText = content.text.trim();

  // Strip markdown code fences if Claude wraps in them
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  let parsed: EpisodeData;
  try {
    parsed = JSON.parse(jsonText) as EpisodeData;
  } catch (err) {
    console.error('Raw Claude response:', jsonText.slice(0, 500));
    throw new Error(`Claude returned invalid JSON: ${(err as Error).message}`);
  }

  // Set default approval status on all shots
  parsed.shots = parsed.shots.map((shot) => ({
    ...shot,
    approval_status: 'PENDING' as const,
  }));

  console.log(
    `✅ Extracted: ${parsed.scenes.length} scenes, ${parsed.shots.length} shots — "${parsed.title}"`
  );

  return parsed;
}
