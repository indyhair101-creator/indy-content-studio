"use client";

type AudioContextConstructor = typeof AudioContext;

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Constructor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext);
  if (!Constructor) return null;
  context ??= new Constructor();
  return context;
}

/** Browsers only allow sound after the user has interacted; call this from any click or key press. */
export function unlockChime(): void {
  const audio = audioContext();
  if (audio?.state === "suspended") void audio.resume().catch(() => undefined);
}

function bell(audio: AudioContext, frequency: number, start: number, length: number) {
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.32, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  gain.connect(audio.destination);
  // A sine fundamental plus a quiet octave gives a soft bell rather than a beep.
  for (const [ratio, level] of [[1, 1], [2, 0.18], [3.01, 0.06]] as const) {
    const oscillator = audio.createOscillator();
    const partial = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency * ratio, start);
    partial.gain.value = level;
    oscillator.connect(partial).connect(gain);
    oscillator.start(start);
    oscillator.stop(start + length + 0.05);
  }
}

/** "ติ๊ด-ดึง": a high note then a lower one, about 0.9 seconds in total. */
export function playChime(): boolean {
  const audio = audioContext();
  if (!audio) return false;
  if (audio.state === "suspended") void audio.resume().catch(() => undefined);
  const now = audio.currentTime + 0.02;
  bell(audio, 1318.5, now, 0.35); // E6 — "ติ๊ด"
  bell(audio, 987.8, now + 0.2, 0.7); // B5 — "ดึง"
  return true;
}
