import { useEffect, useRef, useState } from "react";
import { Search, ShieldCheck, ExternalLink, Loader2, X } from "lucide-react";
import { useSeo } from "@/lib/useSeo";
import { trackEvent } from "@/lib/analytics";

interface RelatedTopic {
  Text?: string;
  FirstURL?: string;
  Icon?: { URL?: string };
  Topics?: RelatedTopic[];
}

interface DdgInstantAnswer {
  Heading?: string;
  AbstractText?: string;
  AbstractSource?: string;
  AbstractURL?: string;
  Image?: string;
  Answer?: string;
  AnswerType?: string;
  Definition?: string;
  DefinitionSource?: string;
  DefinitionURL?: string;
  RelatedTopics?: RelatedTopic[];
}

function buildDdgSearchUrl(query: string) {
  const params = new URLSearchParams({ q: query, kp: "1", kl: "au-en" });
  return `https://duckduckgo.com/?${params.toString()}`;
}

function flattenTopics(topics: RelatedTopic[] | undefined): RelatedTopic[] {
  if (!topics) return [];
  const out: RelatedTopic[] = [];
  for (const t of topics) {
    if (t.Topics && t.Topics.length) {
      out.push(...t.Topics);
    } else if (t.FirstURL && t.Text) {
      out.push(t);
    }
  }
  return out;
}

export default function SearchPage() {
  useSeo({
    title: "Koastal Search | Private Web Search",
    description:
      "A safe, private web search page from Koastal Kollective — powered by DuckDuckGo with strict safe search and no tracking. Search the web without the clutter.",
    // A thin proxy over someone else's index — nothing here should compete
    // with the service pages in search results.
    noindex: true,
  });

  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [answer, setAnswer] = useState<DdgInstantAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runSearch = (q: string, openWeb: boolean) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    // GA4 recommended `search` event — fired here so both the form submit and
    // the "search the web" button are covered by the single search funnel.
    trackEvent("search", { search_term: trimmed });
    setSubmitted(trimmed);
    setLoading(true);
    setError(null);
    setAnswer(null);

    if (openWeb) {
      window.location.href = buildDdgSearchUrl(trimmed);
    }

    const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(trimmed)}&format=json&no_html=1&skip_disambig=1&t=koastalkomputers`;
    fetch(apiUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`Search failed (${res.status})`);
        return res.json();
      })
      .then((data: DdgInstantAnswer) => {
        setAnswer(data);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Search failed.");
      })
      .finally(() => setLoading(false));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(query, true);
  };

  const clear = () => {
    setQuery("");
    setSubmitted("");
    setAnswer(null);
    setError(null);
    inputRef.current?.focus();
  };

  const hasResult =
    !!answer &&
    (!!answer.AbstractText ||
      !!answer.Answer ||
      !!answer.Definition ||
      (answer.RelatedTopics && answer.RelatedTopics.length > 0));

  const flatTopics = flattenTopics(answer?.RelatedTopics).slice(0, 8);

  return (
    <div className="h-screen w-screen overflow-y-auto flex flex-col bg-gradient-to-b from-white via-[#f5f9fa] to-white">
      {/* Top utility bar */}
      <div className="flex justify-end items-center gap-4 px-6 py-3 text-sm text-gray-600 flex-shrink-0">
        <a
          href="https://duckduckgo.com/settings#safe_search"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline-flex items-center gap-1.5 hover:text-[#007b7d] transition-colors"
          title="Open DuckDuckGo settings to change safe search"
        >
          <ShieldCheck className="h-4 w-4 text-[#007b7d]" />
          Safe search on
        </a>
        <a
          href="https://duckduckgo.com/about"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[#007b7d] transition-colors"
        >
          About
        </a>
      </div>

      {/* Main hero */}
      <main
        className={`flex-1 flex flex-col items-center px-4 transition-all ${
          submitted ? "justify-start pt-8 pb-8" : "justify-center"
        }`}
      >
        {/* Logo */}
        <a href="/" className="mb-6 select-none" aria-label="Koastal Kollective home">
          <div className="flex items-baseline gap-1">
            <span className="text-5xl md:text-6xl font-extrabold text-[#007b7d] tracking-tight">
              Koastal
            </span>
            <span className="text-5xl md:text-6xl font-extrabold text-gray-900 tracking-tight">
              Search
            </span>
          </div>
          <p className="text-center text-xs text-gray-500 mt-1 tracking-wide">
            powered by DuckDuckGo · private &amp; ad-light
          </p>
        </a>

        {/* Search form */}
        <form onSubmit={onSubmit} className="w-full max-w-2xl" role="search">
          <div className="group relative flex items-center bg-white border border-gray-300 rounded-full shadow-sm hover:shadow-md focus-within:shadow-md focus-within:border-[#007b7d] transition-all">
            <Search className="h-5 w-5 text-gray-400 ml-5 flex-shrink-0" aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the web…"
              aria-label="Search the web"
              className="flex-1 py-3.5 px-4 bg-transparent outline-none text-gray-900 placeholder:text-gray-400"
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
            />
            {query && (
              <button
                type="button"
                onClick={clear}
                aria-label="Clear search"
                className="p-2 mr-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <button
              type="submit"
              className="bg-[#007b7d] hover:bg-[#005f61] text-white font-semibold text-sm px-6 py-2.5 rounded-full shadow-sm transition-colors"
            >
              Search the web
            </button>
            <button
              type="button"
              onClick={() => runSearch(query, false)}
              className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 font-semibold text-sm px-6 py-2.5 rounded-full shadow-sm transition-colors"
            >
              Quick answer
            </button>
          </div>
        </form>

        {/* Quick answer results */}
        {submitted && (
          <section className="w-full max-w-2xl mt-10 mb-8" aria-live="polite">
            {loading && (
              <div className="flex items-center gap-2 text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching for "{submitted}"…
              </div>
            )}

            {!loading && error && (
              <div className="border border-red-200 bg-red-50 text-red-800 rounded-lg p-4 text-sm">
                {error}
              </div>
            )}

            {!loading && !error && answer && (
              <div className="space-y-6">
                {(answer.Answer || answer.AbstractText || answer.Definition) && (
                  <article className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                    {answer.Heading && (
                      <h2 className="text-lg font-bold text-gray-900 mb-2">{answer.Heading}</h2>
                    )}
                    {answer.Answer && (
                      <p className="text-gray-900 text-base mb-3">{answer.Answer}</p>
                    )}
                    {answer.AbstractText && (
                      <p className="text-gray-700 text-sm leading-relaxed mb-3">
                        {answer.AbstractText}
                      </p>
                    )}
                    {answer.Definition && !answer.AbstractText && (
                      <p className="text-gray-700 text-sm leading-relaxed mb-3">
                        {answer.Definition}
                      </p>
                    )}
                    {(answer.AbstractURL || answer.DefinitionURL) && (
                      <a
                        href={answer.AbstractURL || answer.DefinitionURL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#007b7d] hover:text-[#005f61]"
                      >
                        Source: {answer.AbstractSource || answer.DefinitionSource || "more"}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </article>
                )}

                {flatTopics.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold tracking-[0.18em] text-gray-500 uppercase mb-3">
                      Related results
                    </h3>
                    <ul className="space-y-3">
                      {flatTopics.map((t, i) => (
                        <li
                          key={`${t.FirstURL}-${i}`}
                          className="bg-white border border-gray-200 rounded-xl p-4 hover:border-[#007b7d] transition-colors"
                        >
                          <a
                            href={t.FirstURL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block"
                          >
                            <p className="text-sm text-gray-700 leading-snug">{t.Text}</p>
                            <p className="text-xs text-[#007b7d] mt-1 truncate flex items-center gap-1">
                              {t.FirstURL}
                              <ExternalLink className="h-3 w-3" />
                            </p>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="border-t border-gray-200 pt-6 text-center">
                  <p className="text-sm text-gray-600 mb-3">
                    {hasResult
                      ? "Want more results?"
                      : "No instant answer available — see the full web search."}
                  </p>
                  <a
                    href={buildDdgSearchUrl(submitted)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-[#007b7d] hover:bg-[#005f61] text-white font-semibold text-sm px-5 py-2.5 rounded-full transition-colors"
                  >
                    Open full results on DuckDuckGo
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white flex-shrink-0 mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-gray-500">
          <p>
            Search results powered by{" "}
            <a
              href="https://duckduckgo.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#007b7d] hover:underline font-semibold"
            >
              DuckDuckGo
            </a>{" "}
            — we never see what you search for.
          </p>
          <a href="/" className="hover:text-[#007b7d] transition-colors font-semibold">
            ← Back to Koastal Kollective
          </a>
        </div>
      </footer>
    </div>
  );
}
