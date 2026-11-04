"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic, Square } from "lucide-react";
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
const subscribe = () => () => {};
const getSupported = () => {
  const w = window as VoiceWindow;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
};
export default function VoiceInput({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled: boolean;
}) {
  const supported = useSyncExternalStore(subscribe, getSupported, () => false);
  const [listening, setListening] = useState(false),
    [notice, setNotice] = useState("");
  const recognition = useRef<Recognition | null>(null);
  useEffect(() => {
    return () => recognition.current?.abort();
  }, []);
  function start() {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const w = window as VoiceWindow,
      Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;
    const instance = new Ctor();
    recognition.current = instance;
    instance.lang = navigator.language || "en-US";
    instance.interimResults = false;
    instance.continuous = false;
    instance.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0]?.transcript || "")
        .join(" ");
      onTranscript(text);
      setNotice("Transcribed. Edit the text, then press Send. Nothing has been paid or saved.");
    };
    instance.onerror = (e) => {
      setNotice(`Voice input unavailable (${e.error}). Type the same request below.`);
      setListening(false);
    };
    instance.onend = () => setListening(false);
    try {
      instance.start();
      setListening(true);
      setNotice("Listening… transcription only. Your browser may use its speech service.");
    } catch {
      setNotice("Microphone could not start. You can type instead.");
    }
  }
  return (
    <div className="voice-input">
      <button
        type="button"
        className={`icon-button ${listening ? "is-listening" : ""}`}
        aria-label={listening ? "Stop dictation" : "Dictate message"}
        aria-pressed={listening}
        disabled={disabled || !supported}
        title={
          supported
            ? "Experimental dictation — review before sending"
            : "Dictation is unavailable in this browser; type your request"
        }
        onClick={start}
      >
        {listening ? <Square size={15} /> : <Mic size={17} />}
      </button>
      <span role="status">
        {notice ||
          (supported
            ? "Experimental voice · edit before Send"
            : "Voice unavailable · text input works")}
      </span>
    </div>
  );
}
