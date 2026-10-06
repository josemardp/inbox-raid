import { audioContext, setAudioTap } from './audio';

// Recording helper for the demo video. Open the game with ?rec and the game audio
// (music + effects) is recorded from the FIGHT! stamp until a few seconds after the
// final screen, then downloaded as inbox-raid-audio.webm. The FIGHT! frame in the screen
// capture lines up with second 0 of this file. Nothing changes without ?rec.

const enabled = new URLSearchParams(location.search).has('rec');
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

export function recStart() {
  if (!enabled || recorder) return;
  const dest = audioContext.createMediaStreamDestination();
  setAudioTap(dest);
  chunks = [];
  recorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm;codecs=opus' });
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    setAudioTap(null);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(chunks, { type: 'audio/webm' }));
    a.download = 'inbox-raid-audio.webm';
    a.click();
    recorder = null;
  };
  recorder.start(1000);
}

/** Keeps recording a little after the end, so the fanfare is in the file. */
export function recStopSoon(ms = 4000) {
  if (!recorder) return;
  const r = recorder;
  setTimeout(() => { if (r.state === 'recording') r.stop(); }, ms);
}
