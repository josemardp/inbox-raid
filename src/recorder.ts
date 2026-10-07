import { audioContext, setAudioTap } from './audio';

// Recording helper for the demo video. Open the game with ?rec and the game audio
// (music + effects) is recorded from the FIGHT! stamp until a few seconds after the
// final screen, then downloaded as inbox-raid-audio.webm. The FIGHT! frame in the screen
// capture lines up with second 0 of this file. Nothing changes without ?rec, and a
// browser that cannot record just plays on.

const enabled = new URLSearchParams(location.search).has('rec');
let recorder: MediaRecorder | null = null;
let stopTimer = 0;

export function recStart() {
  if (!enabled) return;
  recStop(); // a new raid closes the previous take first
  try {
    if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder not supported');
    const dest = audioContext.createMediaStreamDestination();
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(dest.stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const url = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'inbox-raid-audio.webm';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    };
    setAudioTap(dest);
    rec.start(1000);
    recorder = rec;
  } catch (err) {
    console.warn('Audio recording is off:', err);
    setAudioTap(null);
    recorder = null;
  }
}

/** Stops now and downloads what was recorded. */
export function recStop() {
  clearTimeout(stopTimer);
  const r = recorder;
  recorder = null;
  if (!r) return;
  setAudioTap(null);
  try { if (r.state !== 'inactive') r.stop(); } catch (err) { console.warn(err); }
}

/** Keeps recording a little after the end, so the fanfare is in the file. */
export function recStopSoon(ms = 4000) {
  if (!recorder) return;
  clearTimeout(stopTimer);
  stopTimer = window.setTimeout(recStop, ms);
}

/** An undo on the final screen goes back to the fight: keep recording. */
export function recKeepGoing() {
  clearTimeout(stopTimer);
}
