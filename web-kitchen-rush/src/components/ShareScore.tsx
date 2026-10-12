import { useEffect, useRef, useState } from 'react';
import { Download, ImagePlus, LoaderCircle, RefreshCw, Share2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { canShareScorecard, createScorecard, scorecardDetails } from '@/game/scorecard';
import type { Results } from '@/game/types';

type CardState = { kind: 'generating' } | { kind: 'error' } | { kind: 'ready'; file: File; url: string; canShare: boolean };

/** Results-only entry point. Each opening owns a fresh, disposable image preview. */
export function ShareScore({ result }: { result: Results }) {
  const [open, setOpen] = useState<boolean>(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><button className="game-button border-gold/60 bg-teal text-paper shadow-[0_4px_0_#233D3B,0_7px_15px_#202f2930]"><Share2 className="size-5" aria-hidden="true" />Share Score</button></DialogTrigger>
    <DialogContent className="paper max-h-[92svh] w-[calc(100%-32px)] max-w-lg overflow-y-auto p-5 sm:p-6 [&>button]:flex [&>button]:size-11 [&>button]:items-center [&>button]:justify-center">
      <div className="pr-10"><DialogTitle className="font-display text-2xl">A shift worth sharing.</DialogTitle><DialogDescription className="mt-2 font-bold text-ink/65">A little proof of your rooftop hustle.</DialogDescription></div>
      {open && <ScorecardPreview result={result} />}
    </DialogContent>
  </Dialog>;
}

function ScorecardPreview({ result }: { result: Results }) {
  const [card, setCard] = useState<CardState>({ kind: 'generating' });
  const [attempt, setAttempt] = useState<number>(0);
  const [sharing, setSharing] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const alive = useRef<boolean>(false);
  const sharingNow = useRef<boolean>(false);
  const details = scorecardDetails(result);

  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    alive.current = true;
    setCard({ kind: 'generating' }); setMessage('');
    void createScorecard(result).then(file => {
      if (cancelled) return;
      url = URL.createObjectURL(file);
      setCard({ kind: 'ready', file, url, canShare: canShareScorecard(file) });
    }).catch(() => { if (!cancelled) setCard({ kind: 'error' }); });
    return () => { cancelled = true; alive.current = false; if (url) URL.revokeObjectURL(url); };
  }, [result, attempt]);

  const share = async (): Promise<void> => {
    if (card.kind !== 'ready' || sharingNow.current) return;
    sharingNow.current = true; setSharing(true); setMessage('');
    try {
      // The File is already prepared: call directly inside the click to retain user activation.
      await navigator.share({ files: [card.file], title: details.title, text: details.text });
      if (alive.current) setMessage('Scorecard shared. Nicely served!');
    } catch (error: unknown) {
      if (alive.current) setMessage(error instanceof Error && error.name === 'AbortError'
        ? 'Sharing canceled. Your scorecard is still ready.'
        : 'Sharing isn’t available here. Save the PNG and attach it in your favorite app.');
    } finally {
      sharingNow.current = false;
      if (alive.current) setSharing(false);
    }
  };

  if (card.kind === 'generating') return <div role="status" className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-xl bg-ink/5 text-center font-bold"><LoaderCircle className="size-8 animate-spin text-teal motion-reduce:animate-none" aria-hidden="true" />Plating your scorecard…</div>;
  if (card.kind === 'error') return <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-xl bg-ink/5 p-6 text-center"><ImagePlus className="size-9 text-teal" aria-hidden="true" /><p role="alert" className="font-bold">We couldn’t create the image. Your score is safe—please try again.</p><button className="game-button" onClick={() => setAttempt(value => value + 1)}><RefreshCw className="size-5" aria-hidden="true" />Try again</button></div>;
  return <>
    <figure className="flex min-w-0 flex-col items-center gap-2">
      <img src={card.url} alt={details.description} width={1080} height={1350} className="max-h-[min(49svh,480px)] w-auto max-w-full rounded-lg object-contain shadow-lg" />
      <figcaption className="text-xs font-bold text-ink/60">1080 × 1350 PNG · Created on your device</figcaption>
    </figure>
    <div className="flex flex-wrap gap-3">
      {card.canShare && <button className="game-button game-button-primary flex-1" disabled={sharing} onClick={() => void share()}>{sharing ? <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Share2 className="size-5" aria-hidden="true" />}{sharing ? 'Sharing…' : 'Share image'}</button>}
      <a className="game-button flex-1" href={card.url} download={card.file.name}><Download className="size-5" aria-hidden="true" />Save PNG</a>
    </div>
    <p role="status" className="text-center text-sm font-bold text-ink/65">{message || (card.canShare ? 'Send it to your crew or keep it for your collection.' : 'Save the image, then send it in your favorite chat or social app.')}</p>
  </>;
}
