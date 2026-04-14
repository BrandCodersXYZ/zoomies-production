import { CharacterConfig, CharacterName, ShowName } from '../types';

export const CHARACTERS: Record<CharacterName, CharacterConfig> = {
  // ── The Real Catwives of Beverly Hills ──────────────────────────────────────
  kitty: {
    name: 'kitty',
    show: 'catwives',
    visualDescription:
      'White/cream cat, pristine long-haired coat. Signature white fur coat over form-fitting cream dress. Subtle, controlled facial expressions. Cream and gold color palette throughout.',
    voiceDescription:
      'A sophisticated woman in her mid-40s, polished Beverly Hills accent, measured and precise diction, warm but with an edge of steel underneath, speaks at a controlled pace as if every word is chosen intentionally',
    referenceAudioEnvKey: 'REF_AUDIO_KITTY',
    referenceImageDriveIds: [
      '1GBCMKqyFoxIKnT32j9sBLwUayuHIz12H', // Headshots_01.png
      '1XNbTG0wsdbb1nbP1uKkBxjzhG5h5t36-', // Headshots_02.png
      '1UwFHVxw1FeWAPrUP8Dk-VahNPnzKW9Pb', // KittyLePurr_FullBody_01.png
    ],
    dos: [
      'Place at center of group shots',
      'Maintain pristine appearance at all times',
      'Use soft, warm lighting on white fur',
      'Cream/gold color palette for wardrobe and surroundings',
    ],
    donts: [
      'Never show disheveled fur or clothing',
      'Never use dark or cool tones on Kitty',
      'Never show extreme open-mouthed expressions',
    ],
  },

  countess: {
    name: 'countess',
    show: 'catwives',
    visualDescription:
      'Dark/near-black sleek cat with sharp, angular features. Structured black evening gowns and tailored ensembles. Signature raised-eyebrow expression. Almost always holding a champagne flute in social settings.',
    voiceDescription:
      'A regal European woman in her 50s, aristocratic mid-Atlantic accent with a slight Continental inflection, low and unhurried tone, each word deliberate and sharp, speaks as if mildly disappointed by everything around her',
    referenceAudioEnvKey: 'REF_AUDIO_COUNTESS',
    referenceImageDriveIds: [
      '1mFIkotDVUW8wqGsG__jUSE0TKc3DFRll', // Countess_Headshots_01.png
    ],
    dos: [
      'Use signature raised single eyebrow in reaction shots',
      'Include champagne flute in hand in social settings',
      'Use cool, editorial lighting to accentuate sharp features',
      'Structured, architectural clothing shapes',
    ],
    donts: [
      'Never use warm tones or lighting on Countess',
      'Never show her looking flustered or unkempt',
      'Never use soft rounded clothing shapes',
    ],
  },

  bambi: {
    name: 'bambi',
    show: 'catwives',
    visualDescription:
      'Light honey-toned cat with wide, expressive doe eyes. Flowing pink sundress. Soft, slightly rounded features that read as innocent and warm.',
    voiceDescription:
      'A warm, sweet young woman in her late 20s, soft Southern California lilt, slightly breathy, wide-eyed and genuine delivery, speaks with open innocent energy — devastating lines land because she sounds like she means them kindly',
    referenceAudioEnvKey: 'REF_AUDIO_BAMBI',
    referenceImageDriveIds: [
      '1ZKMTV_mjqfeD04jG8HdLyHBUj-mDoyn1', // Bambi_Headshots_01.png
      '1bh5VnrLDfzQcoLPu8V7X03885F_Ts_bH', // Bambi_FullBody_01.png
    ],
    dos: [
      'Always use warm, golden lighting',
      'Wide, open eye expression even when delivering devastating lines',
      'Pink sundress as signature wardrobe',
      'Soft, approachable body language',
    ],
    donts: [
      'Never show a scheming or knowing expression',
      'Never use dark or dramatic lighting',
      'Never show closed-off or aggressive body language',
    ],
  },

  dominique: {
    name: 'dominique',
    show: 'catwives',
    visualDescription:
      'Sleek cat with sharp bone structure and high cheekbones. Always in structured blazers over form-fitting coordinates. Signature pose: arms crossed or actively claiming space.',
    voiceDescription:
      'A confident woman in her late 30s, direct and clear American accent, speaks with absolute authority and conviction, owns every word, slightly louder and more commanding than the other women, no uptalk, no hedging',
    referenceAudioEnvKey: 'REF_AUDIO_DOMINIQUE',
    referenceImageDriveIds: [
      '1EmtgerGbGrwDvzWRaqtBf4IXGL9yezA2', // Dominique_Headshots_01.png
      '112pV820_RxjR5dyhPX10xcW8Rzz5oECO', // Dominique_Headshots_02.png
      '1rn0J4_xeSGgCjDThQGGZzyHdtrkWDM9J', // Dominique_Headshots_03.png
    ],
    dos: [
      'Arms crossed or hands on surface claiming space in most shots',
      'Direct eye contact in reaction shots',
      'Editorial sharp lighting to emphasize bone structure',
      'Structured blazer always present',
    ],
    donts: [
      'Never show Dominique in a passive or submissive pose',
      'Never use soft diffused lighting',
      'Never show casual or relaxed clothing',
    ],
  },

  purrlita: {
    name: 'purrlita',
    show: 'catwives',
    visualDescription:
      'Bold-colored cat with chaotic energy. Hot pink wardrobe — always bold, always slightly off. Something always slightly askew about her look — a strap falling, wild hair, an accessory out of place.',
    voiceDescription:
      'A chaotic woman in her 30s, unpredictable Valley Girl meets unhinged socialite energy, slightly breathless, can shift from loud and declarative to conspiratorial whisper mid-sentence, speech patterns slightly erratic like her thoughts are moving faster than her mouth',
    referenceAudioEnvKey: 'REF_AUDIO_PURRLITA',
    referenceImageDriveIds: [
      '1EgMKyxoDdj7jTM2I5KmvNMxPfTmlMOjK', // Purrlita_Headshots_01.png
      '1NwnAezgiS0ZkrqatRQ7wM0VuUJdsEfKh', // Purrlita_Headshots_02.png
      '1XjMZ8O7jvJH3ILIlBd2-yXc2tpIt2QGJ', // Purrlita_FullBody_01.png
    ],
    dos: [
      'Hot pink as dominant wardrobe color',
      'Always have one element of her look slightly off (hair, strap, accessory)',
      'Chaotic, slightly unhinged energy in expressions',
    ],
    donts: [
      'Never show Purrlita looking fully put-together',
      'Never use muted or neutral wardrobe tones',
    ],
  },

  // ── CSI: Bloodhound Bureau ──────────────────────────────────────────────────
  chase: {
    name: 'chase',
    show: 'bloodhound',
    visualDescription:
      'Classic bloodhound with long droopy ears, deeply wrinkled skin, and brown/tan and black fur. Always wearing a Burberry trench coat. Aviator sunglasses that slide down the snout in dramatic moments.',
    voiceDescription:
      'A deep-voiced British man in his late 50s, weary hardboiled detective, gravelly and measured, classic noir monotone delivery, never raises his voice even in crisis, long pauses between observations, sounds perpetually unsurprised',
    referenceAudioEnvKey: 'REF_AUDIO_CHASE',
    referenceImageDriveIds: [
      '1CYhNVahUD75LySLjgIeJ4FAExC4L9bX3', // Sterling Chase.png
      '15s-aDZr3xNk50mUycdfcQ7e9yTpnEeIN', // Sterling Chase full body.png
      '1H8dqFDiLS5j8PTsJq4HveY8mZTbh6eZY', // Sterling chase pup.png
    ],
    dos: [
      'Burberry trench coat always present',
      'Aviators slightly slid down snout in high-stakes moments',
      'Calm, stoic body language even in absurd situations',
      'Dramatic rim lighting from one dominant source',
    ],
    donts: [
      'Never show Chase panicking or looking scared',
      'Never remove the trench coat',
      'Never use warm soft lighting — always dramatic and directional',
    ],
  },

  vicki: {
    name: 'vicki',
    show: 'bloodhound',
    visualDescription:
      'Scrappy mixed-breed dog with an energetic, slightly scruffy look. Distressed leather jacket with a chewed and battered Bureau badge prominently displayed. More kinetic energy than Chase — always slightly in motion.',
    voiceDescription:
      'A scrappy young American woman in her late 20s, speaks fast with bursts of enthusiasm, slightly out of breath energy, cracks of excitement on important words, more chaotic and louder than her partner, tail-wag energy in her voice when something goes right',
    referenceAudioEnvKey: 'REF_AUDIO_VICKI',
    referenceImageDriveIds: [
      '1p836UvmEhDCz96rqOi1Ym4xXp8Rs7iQ9', // Vicki Ruff full body.png
      '1x9BRYJS5mo2Px-Su39m3klASOLPXSMIj', // Vicki Ruff espressions.png
    ],
    dos: [
      'Distressed leather jacket with chewed badge always present',
      'More motion and energy in poses compared to Chase',
      'Show tail wag subtly in scenes involving relationship drama',
      'Slightly unruly fur that reads as scrappy not unkempt',
    ],
    donts: [
      'Never show Vicki in a formal or polished outfit',
      'Never show a still, static pose — always some implied movement',
    ],
  },

  kibble: {
    name: 'kibble',
    show: 'bloodhound',
    visualDescription:
      'Beagle with warm brown/tan/white tri-coloring. White lab coat always present. Thick black-rimmed round glasses. Almost always holding or actively chewing something — a pen, a test tube, a snack.',
    voiceDescription:
      'A mild-mannered nerdy man in his mid-30s, slight nasal quality, speaks in rapid excited bursts of scientific information, often trails off mid-thought when distracted by data, occasionally talks while chewing something, coughs and restarts sentences when flustered',
    referenceAudioEnvKey: 'REF_AUDIO_KIBBLE',
    referenceImageDriveIds: [
      '1upznaaTMmqR3IFhIdC8mRJHwMCBO14Qx', // Dr Kibble.png
      '1vXRNH9wtMicx5DODBYVmsIH4L__ut0XT', // Dr Kibble headshots.png
    ],
    dos: [
      'White lab coat always present',
      'Thick-rimmed glasses always on face',
      'Something in hand or mouth in nearly every shot',
      'Lab/forensics setting as preferred background',
    ],
    donts: [
      'Never show Kibble without glasses',
      'Never show Kibble with empty hands in a lab setting',
      'Never place Kibble in a non-scientific environment without a reason',
    ],
  },

  vanderpump: {
    name: 'vanderpump',
    show: 'bloodhound',
    visualDescription:
      'Impeccably groomed Standard Poodle with platinum/champagne-toned fur. Always holding a glass of milk rosé. Elegant, knowing expression. Warm golden lighting that contrasts sharply with the Bureau cold palette.',
    voiceDescription:
      'A refined older woman, smooth mid-Atlantic accent, speaks slowly and deliberately with a hint of amusement, as if she already knows the punchline to everything, slight purring warmth to her tone, never hurried, every pause feels intentional',
    referenceAudioEnvKey: 'REF_AUDIO_VANDERPUMP',
    referenceImageDriveIds: [
      '1BQgaR6AiBCP9p7GbgCJcQn8xyrDMwEBs', // Vanderpump.png
      '1iqkKkqMw9pNOK1hMFSF_Lm52p37WytSD', // Vanderpump headshots.png
    ],
    dos: [
      'Milk rosé glass always in hand',
      'Warm golden lighting on Vanderpump even in Bureau cold-tone scenes',
      'Knowing, slightly amused expression in most shots',
      'Impeccable grooming — not a strand out of place',
    ],
    donts: [
      'Never show Vanderpump without her glass',
      'Never apply cold Bureau lighting directly to Vanderpump',
      'Never show her looking surprised or uninformed',
    ],
  },
};

export const SHOW_CODE_MAP: Record<string, ShowName> = {
  catwives: 'catwives',
  bloodhound: 'bloodhound',
  cwbh: 'catwives',
  bhb: 'bloodhound',
  'The Real Catwives of Beverly Hills': 'catwives',
  'CSI: Bloodhound Bureau': 'bloodhound',
};

export const SHOW_DISPLAY_NAMES: Record<ShowName, string> = {
  catwives: 'The Real Catwives of Beverly Hills',
  bloodhound: 'CSI: Bloodhound Bureau',
};

export const SHOW_CODES: Record<ShowName, string> = {
  catwives: 'CWBH',
  bloodhound: 'BHB',
};
