import MediaLayout from "@/components/MediaLayout";
import { useSeo } from "@/lib/useSeo";
import { serviceGraph, useStructuredData } from "@/lib/structuredData";
import { Apple, Smartphone, Layers, Cloud, Lock, Zap, CheckCircle2, ShoppingCart } from "lucide-react";

const features = [
  { icon: Apple, title: "Native iOS", body: "Swift and SwiftUI builds optimised for iPhone and iPad, ready for the App Store." },
  { icon: Smartphone, title: "Native Android", body: "Kotlin and Jetpack Compose apps tuned for the Google Play Store." },
  { icon: Layers, title: "Cross-platform", body: "React Native and Flutter — one codebase, both stores, faster to launch." },
  { icon: Cloud, title: "Cloud backends", body: "Secure APIs, realtime sync, push notifications and scalable storage." },
  { icon: Lock, title: "Privacy first", body: "Built to meet Apple, Google and Australian Privacy Principles requirements." },
  { icon: Zap, title: "Lightning fast", body: "Performance-tuned UI, offline support and snappy launch times." },
];

/* App Development in the online shop (koastal.com.au/shop) — the same id in
   dev and production, so Buy Now opens that product's page. The shop is a
   separate app, so these links are plain <a>s (a full page load). */
const APP_DEVELOPMENT_PRODUCT_ID = 1000083;
const appDevelopmentShopUrl = `/shop/product/${APP_DEVELOPMENT_PRODUCT_ID}`;

const steps = [
  { n: "01", t: "Discovery", d: "We map your idea, users and goals into a clear scope and timeline." },
  { n: "02", t: "Design", d: "Polished UI/UX prototypes you can tap through before we write any code." },
  { n: "03", t: "Build", d: "Agile sprints with weekly demos so you see progress every week." },
  { n: "04", t: "Launch", d: "App Store and Google Play submission, plus ongoing support and updates." },
];

export default function AppsPage() {
  useSeo({
    title: "iOS & Android Apps — Australian Made | Koastal Kollective",
    description:
      "Native iOS, Android and cross-platform app development from Koastal Kollective. Australian team, fixed-price quotes within 24 hours.",
  });

  useStructuredData(
    serviceGraph({
      path: "/media/apps",
      serviceType: "Mobile App Development",
      name: "iOS & Android App Development",
      description: "Custom web apps and native iPhone, iPad and Android apps, with App Store and Google Play submission.",
      breadcrumbName: "Apps",
      parent: { name: "Media", path: "/media" },
    }),
    "media-apps",
  );

  return (
    <MediaLayout
      eyebrow="iOS & Android"
      title={<>Apps that people love to use</>}
      intro="We design and build fast, beautiful, secure mobile apps for iPhone, iPad and Android — published to the App Store and Google Play."
      shopLink={{
        href: appDevelopmentShopUrl,
        label: "Buy Now",
        ariaLabel: "Buy App Development now in our online shop",
      }}
    >
      <section className="py-14 bg-white">
        <div className="max-w-6xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            What we build
          </p>
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-10">
            From simple utilities to enterprise platforms
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((f) => (
              <div key={f.title} className="bg-gray-50 border border-gray-100 rounded-lg p-5">
                <f.icon className="h-7 w-7 text-[#007b7d] mb-3" />
                <h3 className="font-bold text-gray-900 mb-1">{f.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 bg-gray-50 border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            How it works
          </p>
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-10">
            From idea to App Store launch
          </h2>
          <div className="grid md:grid-cols-4 gap-5">
            {steps.map((s) => (
              <div key={s.n} className="bg-white border border-gray-200 rounded-lg p-5 text-center">
                <p className="text-[#007b7d] font-extrabold text-2xl mb-2">{s.n}</p>
                <h3 className="font-bold text-gray-900 mb-1">{s.t}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 bg-gray-50 border-t border-gray-100">
        <div className="max-w-5xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            Pricing
          </p>
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-10">
            App Creation
          </h2>
          <div className="max-w-md mx-auto">
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
              <p className="text-xs font-bold tracking-[0.18em] uppercase text-[#007b7d] mb-2">
                Plan
              </p>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                App Development
              </h3>
              <p className="text-4xl font-extrabold text-[#007b7d] mb-6">
                From $750
              </p>
              <ul className="space-y-2 text-left">
                {[
                  "Custom built web apps (React, Vue, full-stack)",
                  "Native iOS apps (Swift / SwiftUI for iPhone & iPad)",
                  "Native Android apps (Kotlin / Jetpack Compose)",
                  "Cross-platform builds (React Native & Flutter)",
                  "App Store & Google Play submission handled",
                  "Secure cloud APIs, realtime sync & push notifications",
                  "Offline support and snappy launch times",
                  "Privacy-first design (Apple, Google & Australian compliance)",
                  "Fixed-price quotes — no scope creep, no surprise invoices",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                    <CheckCircle2 className="h-4 w-4 text-[#007b7d] mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <a
                href={appDevelopmentShopUrl}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#007b7d] px-4 py-3 text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#004f51]"
                aria-label="Buy the App Development plan now"
              >
                <ShoppingCart className="h-4 w-4" />
                Buy Now
              </a>
            </div>
          </div>
          <p className="text-center text-gray-500 text-sm mt-6">
            Need something custom? Get in touch and we&apos;ll quote a tailored project in 24 hours.
          </p>
        </div>
      </section>
    </MediaLayout>
  );
}
