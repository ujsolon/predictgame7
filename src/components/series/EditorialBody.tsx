import Markdown, { type Components } from 'react-markdown';
import { editorialImageUrl, isEditorialImageSrc, isHttpUrl } from '@/lib/series-content';
import { LABEL } from '@/pages/series/series-styles';

/** The host the site itself is served from: a link there is not "external". */
const SITE_HOST = 'ujsolon.github.io';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

function isExternal(href: string): boolean {
  try {
    return new URL(href).host !== SITE_HOST;
  } catch {
    return true;
  }
}

/**
 * Only `http(s)` hrefs and `editorial/` image paths survive; everything else
 * becomes an empty URL, which the `a` / `img` renderers below drop.
 */
function urlTransform(value: string, key: string): string {
  if (key === 'src') return isEditorialImageSrc(value) ? editorialImageUrl(value, import.meta.env.BASE_URL) : '';
  return isHttpUrl(value) ? value : '';
}

const components: Components = {
  // The page owns its <h1>; markdown headings sit below it.
  h1: ({ children }) => <h2 className="mt-10 text-2xl font-medium leading-tight tracking-[-0.01em] text-foreground">{children}</h2>,
  h2: ({ children }) => <h2 className="mt-10 text-2xl font-medium leading-tight tracking-[-0.01em] text-foreground">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-8 text-xl font-medium text-foreground">{children}</h3>,
  h4: ({ children }) => <h3 className="mt-8 text-xl font-medium text-foreground">{children}</h3>,
  h5: ({ children }) => <h3 className="mt-8 text-xl font-medium text-foreground">{children}</h3>,
  h6: ({ children }) => <h3 className="mt-8 text-xl font-medium text-foreground">{children}</h3>,
  p: ({ children }) => <p className="mt-5 first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="mt-5 list-disc space-y-2 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="mt-5 list-decimal space-y-2 pl-6">{children}</ol>,
  blockquote: ({ children }) => <blockquote className="mt-5 border-l-2 border-border pl-4 text-on-muted">{children}</blockquote>,
  a: ({ href, children }) => {
    if (!href) return <span>{children}</span>;
    return (
      <a
        href={href}
        rel={isExternal(href) ? 'noopener noreferrer' : undefined}
        className={`font-medium text-foreground underline underline-offset-4 ${FOCUS}`}
      >
        {children}
      </a>
    );
  },
  // Spans, not <figure>: markdown puts an image inside a <p>, where a block
  // element is invalid HTML and would break hydration.
  img: ({ src, alt, title }) => {
    if (typeof src !== 'string' || !src || !alt?.trim()) return null;
    return (
      <span className="my-8 block">
        <img src={src} alt={alt} loading="lazy" className="block w-full rounded-xl" />
        {title && <span className={`${LABEL} mt-2 block`}>{title}</span>}
      </span>
    );
  },
};

/**
 * A series write-up (Story 4.5): CommonMark through `react-markdown`, raw HTML
 * never rendered as elements (it arrives as text), inside the 65ch longform
 * column. Pure and SSR-safe. Content is validated upstream
 * (`parseSeriesContent`); the URL rules are enforced here again regardless.
 */
export default function EditorialBody({ markdown }: { markdown: string }) {
  return (
    <div className="max-w-[65ch] text-base leading-[1.6] text-foreground" data-editorial-body="">
      <Markdown urlTransform={urlTransform} components={components}>
        {markdown}
      </Markdown>
    </div>
  );
}
