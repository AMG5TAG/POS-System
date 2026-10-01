export default function RepairsPromo() {
  return (
    <section className="bg-[#004f50] py-14 border-b border-[#006a6c] overflow-hidden relative">
      <div className="absolute top-0 left-0 w-24 h-24 bg-white/5 rotate-45 -translate-x-12 -translate-y-12" />
      <div className="absolute bottom-0 right-0 w-24 h-24 bg-white/5 rotate-45 translate-x-12 translate-y-12" />
      <div className="max-w-6xl mx-auto px-4 relative">
        <div className="flex flex-col md:flex-row items-center gap-10">
          <div className="flex-shrink-0">
            <img
              src="/images/logo.png"
              alt="Koastal Kollective – Computer, Mac & Game Console Repairs"
              className="w-40 h-40 object-contain"
            />
          </div>
          <div className="flex-1">
            <p className="text-[#7bb8bd] font-bold tracking-[0.2em] text-xs uppercase mb-3">
              Repairs & IT Support
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight">
              Need IT repairs or support?<br />
              <em className="text-[#7bb8bd] not-italic">We do that too.</em>
            </h2>
            <p className="text-white/80 leading-relaxed mb-6 max-w-2xl">
              Koastal Kollective has been the trusted local IT repair shop on the Central Coast &amp; Lake Macquarie since 2011 — the same family-run team that builds the websites and apps. PC, Mac, laptop, game console repairs, data recovery, virus removal, and on-site support. Free diagnostics, no-fix no-fee.
            </p>
            <div className="grid sm:grid-cols-2 gap-3 mb-8">
              {[
                { label: "Computer & Laptop Repairs", href: "/computer-repairs" },
                { label: "MacBook & iMac Servicing", href: "/macbook-repair" },
                { label: "Game Console Repairs", href: "/computer-repairs" },
                { label: "Virus Removal & Data Recovery", href: "/virus-removal" },
              ].map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  className="flex items-center gap-2 text-sm text-[#e0f4f5] hover:text-white transition-colors group"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#007b7d] group-hover:bg-[#7bb8bd] transition-colors flex-shrink-0" />
                  {label}
                </a>
              ))}
            </div>
            <a
              href="/"
              className="inline-flex items-center gap-2 bg-[#007b7d] hover:bg-[#005f61] text-white font-bold px-6 py-3 rounded-full text-sm transition-colors"
            >
              Explore Repairs & IT Support
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
