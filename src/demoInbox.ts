import type { Mail } from './types';
import type { Lang } from './i18n';

// A fake but painfully familiar inbox. All senders are fictional (.example domains).

interface BossSeed {
  name: string;
  email: string;
  count: number;
  subjects: string[];
}

const BOSSES: BossSeed[] = [
  {
    name: 'MegaMart Deals', email: 'deals@megamart.example', count: 142,
    subjects: [
      'FLASH SALE: 70% off things you do not need',
      'Your cart misses you',
      'Last chance! (again)',
      'An exclusive deal just for you (and 4 million others)',
      'We noticed you looked at a toaster',
      'Weekend MEGA BLOWOUT!!!',
    ],
  },
  {
    name: 'LinkedOut', email: 'notifications@linkedout.example', count: 96,
    subjects: [
      'You appeared in 3 searches this week',
      'A stranger endorsed you for Microsoft Word',
      'Congratulate Brad on his 7th work anniversary',
      '5 people viewed your profile (pay to see who)',
      'Brad posted: "I cried in a board meeting. Here is what it taught me about B2B sales"',
    ],
  },
  {
    name: 'The Daily Hustle', email: 'hello@dailyhustle.example', count: 61,
    subjects: [
      'Wake up at 4am: 17 habits of billionaires',
      'This one morning routine changed everything',
      'Issue #412: Grind mindset',
      'Are you hustling hard enough?',
    ],
  },
  {
    name: 'CloudBox', email: 'no-reply@cloudbox.example', count: 38,
    subjects: [
      'Your storage is 99% full',
      'Your storage is 99.5% full',
      'Your storage is 99.9% full',
      'Upgrade now or lose your memories forever',
    ],
  },
  {
    name: 'Pizza Palace', email: 'yum@pizzapalace.example', count: 27,
    subjects: [
      '2-for-1 Tuesday (it is Thursday)',
      'Hungry? We can tell.',
      'Your pizza misses you',
    ],
  },
  {
    name: 'Moonshot Crypto Weekly', email: 'alpha@moonshot.example', count: 19,
    subjects: [
      'This coin will 100x (not financial advice)',
      'WAGMI: our top 3 picks',
      'Why the dip is actually good news',
    ],
  },
];

const BOSS_TAUNTS: Record<string, Record<Lang, string>> = {
  'deals@megamart.example': {
    en: 'You looked at a toaster six months ago. BUY IT NOW.',
    pt: 'Você olhou uma torradeira há seis meses. COMPRE AGORA.',
  },
  'notifications@linkedout.example': {
    en: 'Brad cried in a board meeting. React to boost his reach.',
    pt: 'Brad chorou numa reunião. Reaja para aumentar o alcance.',
  },
  'hello@dailyhustle.example': {
    en: 'Sleep is for people without a personal brand.',
    pt: 'Dormir é para quem não tem marca pessoal.',
  },
  'no-reply@cloudbox.example': {
    en: 'Your storage is 99.9% full. Your panic is 100% free.',
    pt: 'Seu espaço está 99,9% cheio. O pânico é 100% grátis.',
  },
  'yum@pizzapalace.example': {
    en: 'Your pizza misses you. Your arteries asked for space.',
    pt: 'Sua pizza sente saudade. Suas artérias pediram espaço.',
  },
  'alpha@moonshot.example': {
    en: 'This coin will 100x. Source: trust me, inbox pilot.',
    pt: 'Esta moeda vai subir 100x. Fonte: confia, piloto.',
  },
};

/** Authored comedy only for fictional demo senders; real Gmail never invents a quote. */
export function demoBossTaunt(email: string, language: Lang): string {
  return BOSS_TAUNTS[email.toLowerCase()]?.[language] ?? '';
}

const HORDE: [string, string, string, string][] = [
  ['Mom', 'mom@family.example', 'Did you eat today?', 'Call me when you can. Also, did you eat today? Real food?'],
  ['Karen (Your Boss)', 'karen@work.example', 'Quick sync?', 'Can you jump on a call in 5? It is urgent but also not really.'],
  ['Prince Adebayo', 'prince@royal-funds.example', 'URGENT BUSINESS PROPOSAL', 'I am a prince with 24 million dollars and you are my only hope.'],
  ['IT Department', 'it@work.example', 'Mandatory password change (again)', 'Your new password must not match any of your last 400 passwords.'],
  ['Calendar', 'calendar@work.example', 'Invitation: Meeting about the meeting', 'Agenda: discuss the agenda for the upcoming meeting.'],
  ['Smile Dental', 'office@smiledental.example', 'Time for your 6-month cleaning', 'It has been 14 months. We are worried.'],
  ['Gym Pro', 'team@gympro.example', 'We miss you! (It has been 214 days)', 'Your membership is still active. Your abs are not.'],
  ['Landlord', 'mgmt@building.example', 'Water off on Tuesday, 9 to 11am', 'Plan your showers accordingly.'],
  ['Bank of Somewhere', 'statements@bank.example', 'Your statement is ready', 'Your monthly statement is available. Brace yourself.'],
  ['SkyHigh Air', 'feedback@skyhigh.example', 'Rate your flight (from 2019)', 'How was your experience? We would love to hear from you.'],
  ['Grandma', 'grandma@family.example', 'FW: FW: FW: FW: FUNNY CATS!!!', 'LOOK AT THIS ONE HAHAHA'],
  ['Dave (Coworker)', 'dave@work.example', 'RE: Reply-all: Thanks!', 'Thanks!'],
  ['Sarah (Coworker)', 'sarah@work.example', 'RE: Please stop replying all', 'Please stop replying all.'],
  ['HR Team', 'hr@work.example', 'Mandatory Fun Day is mandatory', 'Attendance will be tracked. Fun is required.'],
  ['TalentBot', 'jobs@talentbot.example', 'Exciting role: Senior Junior Intern (unpaid)', '15 years of experience with a framework released last year.'],
  ['LearnFast', 'progress@learnfast.example', 'You are 2% through "Spanish in 7 Days"', 'Day 1 of 7. Started 11 months ago.'],
  ['Smart Fridge', 'firmware@fridge.example', 'Your fridge updated its terms of service', 'By keeping food cold, you agree to the new terms.'],
  ['Survey Team', 'survey@feedback.example', 'Quick 45-minute survey', 'It will only take 45 minutes of your time.'],
  ['Synergy Webinars', 'live@synergy.example', 'Starting NOW: Synergy at scale', 'Join 3 other attendees for 2 hours of synergy.'],
  ['Alex (Old Friend)', 'alex@friends.example', 'Long time no see!', 'Coffee next week? I am in town until Friday.'],
  ['ParcelGo', 'tracking@parcelgo.example', 'Your package was delivered (somewhere)', 'We left it in a safe place. We will not say where.'],
  ['City Parking', 'tickets@city.example', 'Parking ticket reminder', 'Ticket #4471 is due in 5 days.'],
  ['Maple School', 'office@maple.example', 'Parent-teacher meeting on Friday', 'Please confirm your attendance.'],
  ['Unknown Community', 'welcome@unknown.example', 'Welcome to the community!', 'Thanks for joining! (You did not join.)'],
  ['Accounts Dept', 'invoice@totally-legit.example', 'RE: RE: RE: your invoice', 'Open the attached invoice.zip.exe immediately.'],
  ['PowerCo', 'billing@powerco.example', 'Your bill is due in 3 days', 'Amount due: more than last month.'],
  ['City Clinic', 'results@clinic.example', 'Your lab results are available', 'Log in to the patient portal to view them.'],
  ['Streamly+', 'billing@streamly.example', 'Your free trial ends tomorrow', 'After that it is only $19.99/month forever.'],
  ['Auntie Rose', 'rose@family.example', 'Family reunion photos (847 attachments)', 'Sorry some are blurry. Most are blurry.'],
  ['Neighbor Tom', 'tom@street.example', 'Is this your cat?', 'It has been sitting on my car for 3 hours. It seems happy.'],
  ['Hackyard', 'hello@hackyard.example', 'Yard #4 kicks off now', 'Build solo, any AI model. Ship by Friday.'],
];

export type DemoPreset = 'blitz' | 'full';

/** The short demo reaches every distinctive mechanic before a voter can lose interest. */
const BLITZ_HORDE = [
  'invoice@totally-legit.example',
  'calendar@work.example',
  'tom@street.example',
  'billing@powerco.example',
  'hello@hackyard.example',
  'tickets@city.example',
  'welcome@unknown.example',
];

// The full text of some horde emails, for the quest briefing. The rest show their preview.
const BODIES: Record<string, string> = {
  'karen@work.example': 'Hi,\n\nCan you jump on a call in 5? It is urgent but also not really. I need the Q3 numbers before the meeting on Thursday at 10am.\n\nCould you send me the latest version of the spreadsheet?\n\nKaren',
  'alex@friends.example': 'Hey!\n\nLong time no see. I am in town until Friday. Coffee next week? Tuesday or Wednesday afternoon works for me.\n\nLet me know!\nAlex',
  'office@maple.example': 'Dear parent,\n\nThe parent-teacher meeting is on Friday at 6pm in room 12.\n\nPlease confirm your attendance by replying to this email.\n\nMaple School office',
  'billing@powerco.example': 'Your bill is due in 3 days.\n\nAmount due: $148.20 (more than last month).\nDue date: the 15th.\n\nPay online or by bank slip. Ignore this message if you have already paid.\n\nPowerCo billing',
  'calendar@work.example': 'Invitation: Meeting about the meeting\nWhen: Monday, 9:00 to 10:30\nWhere: Room B (and online)\n\nAgenda: discuss the agenda for the upcoming meeting.\n\nGoing? Yes / No / Maybe',
  'tom@street.example': 'Hi neighbor,\n\nIs this your cat? It has been sitting on my car for 3 hours. It seems happy. Grey, very fluffy, judges me through the window.\n\nTom, house 42',
  'mom@family.example': 'Call me when you can.\n\nAlso, did you eat today? Real food? Not just coffee.\n\nLove, Mom',
  'it@work.example': 'Your password expires today. Click the link below and enter your current password to keep your account.\n\nYour new password must not match any of your last 400 passwords.\n\nIT Department',
  'invoice@totally-legit.example': 'RE: RE: RE: your invoice\n\nOpen the attached invoice.zip.exe immediately or your account will be suspended. Send us your bank password to confirm.',
  'results@clinic.example': 'Your lab results are available.\n\nLog in to the patient portal to view them. If you have questions, schedule an appointment with your doctor.\n\nCity Clinic',
};

export function demoBody(m: Mail): string {
  return BODIES[m.fromEmail] ?? `${m.snippet || m.subject}\n\n${m.fromName}`;
}

// Deterministic PRNG so the demo looks the same every time (mulberry32).
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86_400_000;

export function buildDemoInbox(now = Date.now(), preset: DemoPreset = 'full'): Mail[] {
  const rand = rng(4);
  const mails: Mail[] = [];
  let n = 0;
  const bosses = preset === 'blitz' ? BOSSES.slice(0, 2) : BOSSES;
  const horde = preset === 'blitz'
    ? BLITZ_HORDE.map((email) => HORDE.find((h) => h[1] === email)!).filter(Boolean)
    : HORDE;
  for (const b of bosses) {
    for (let i = 0; i < b.count; i++) {
      mails.push({
        id: `demo-${n++}`,
        fromName: b.name,
        fromEmail: b.email,
        subject: b.subjects[i % b.subjects.length],
        snippet: '',
        date: now - Math.floor(rand() * 120 * DAY),
        listUnsubscribe: `<https://${b.email.split('@')[1]}/unsubscribe>`,
        oneClickUnsub: true,
      });
    }
  }
  horde.forEach(([name, email, subject, snippet], i) => {
    mails.push({
      id: `demo-${n++}`, fromName: name, fromEmail: email, subject, snippet,
      // Blitz order is authored: scam -> meeting -> person -> bill -> quick calls.
      date: preset === 'blitz' ? now - (i + 1) * 60_000 : now - Math.floor(rand() * 20 * DAY),
    });
  });
  return mails.sort((a, b) => b.date - a.date);
}
