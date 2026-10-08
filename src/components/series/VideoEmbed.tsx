import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { type SeriesVideo, youtubeEmbedUrl, youtubeThumbnail, youtubeWatchUrl } from '@/lib/series-content';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/**
 * A YouTube facade (Story 4.5; EXPERIENCE.md · Component Patterns · Video
 * embed). The prerendered markup is a 16:9 `rounded-xl` frame with a
 * decorative thumbnail, the visible video title, a labelled play button (the
 * only activation control) and the creator credit. Nothing loads from YouTube
 * but the lazy thumbnail until the tap; the tap mounts the privacy-enhanced
 * iframe (autoplay, since the tap is the consent), which takes focus.
 * No animation, so `prefers-reduced-motion` has nothing to suppress.
 */
export default function VideoEmbed({ video }: { video: SeriesVideo }) {
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const { youtube_id: id, title, credit } = video;

  useEffect(() => {
    if (playing) frameRef.current?.focus();
  }, [playing]);

  return (
    <figure className="space-y-3" data-video-embed={id}>
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-muted">
        {playing ? (
          <iframe
            ref={frameRef}
            src={youtubeEmbedUrl(id)}
            title={credit ? `${title} — via ${credit}` : title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <>
            <img src={youtubeThumbnail(id)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            <button
              type="button"
              aria-label={`Play: ${title}`}
              onClick={() => setPlaying(true)}
              className={`absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 ${FOCUS}`}
            >
              <Play className="h-6 w-6" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      <figcaption className="space-y-1">
        <span className="block font-medium text-foreground">{title}</span>
        {credit && (
          <a
            href={video.credit_url ?? youtubeWatchUrl(id)}
            rel="noopener noreferrer"
            className={`inline-flex min-h-11 items-center text-xs text-[#767676] underline underline-offset-4 ${FOCUS}`}
          >
            Highlights via {credit} <span aria-hidden="true">↗</span>
          </a>
        )}
      </figcaption>
    </figure>
  );
}
