import { ClipboardList, Package, Wrench, Truck, ArrowRight } from "lucide-react";

/**
 * Mail-in repairs section, shared by the suburb pages and the service /
 * promotional pages.
 *
 * The service itself lives in the online shop at /shop/mail-in (packing guide,
 * form, tracking). The shop is a separate app, so these are plain <a> links —
 * a wouter <Link> would try to route /shop/... inside the website and 404.
 */

const MAIL_IN_HREF = "/shop/mail-in";

const steps = [
  {
    icon: ClipboardList,
    title: "Fill in the form",
    body: "Tell us about your device and what's wrong using our online mail-in form.",
  },
  {
    icon: Package,
    title: "Pack & post it",
    body: "Follow our packing guide, post it to our Mannering Park workshop with a tracked service, and send us the tracking number.",
  },
  {
    icon: Wrench,
    title: "We repair it",
    body: "When it arrives we diagnose it and send you a quote — nothing is repaired without your OK — and keep you updated along the way.",
  },
  {
    icon: Truck,
    title: "We post it back",
    body: "Once it's fixed, your device is packed up and posted back to the return address you gave us.",
  },
];

export default function MailInRepairs({ area }: { area?: string }) {
  return (
    <section id="mail-in-repairs" className="bg-[#e8f4f5] py-14 border-b border-[#c8e0e2]">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-10">
          <p className="text-[#007b7d] font-bold tracking-[0.18em] text-xs uppercase mb-2">
            Mail-In Repairs
          </p>
          <h2 className="text-2xl md:text-4xl font-bold text-gray-900 leading-tight">
            {area ? (
              <>
                From {area}? <em className="not-italic text-[#007b7d]">Post it in</em> for repair
              </>
            ) : (
              <>
                Can't get to us? <em className="not-italic text-[#007b7d]">Post it in</em> for repair
              </>
            )}
          </h2>
          <p className="mt-4 text-sm md:text-base text-gray-600 max-w-3xl mx-auto leading-relaxed">
            {area
              ? `If getting to our Mannering Park store from ${area} isn't easy, you can post your laptop, computer or other device to us instead. `
              : "If you can't make it to our Mannering Park store, you can post your laptop, computer or other device to us instead. "}
            Fill in the mail-in form, send it to our workshop, and we'll repair it and post it back to you.
          </p>
        </div>

        <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li
              key={title}
              className="bg-white border border-[#c8e0e2] rounded-xl p-6 text-center shadow-sm"
            >
              <div className="w-14 h-14 rounded-full bg-[#007b7d] text-white flex items-center justify-center mx-auto mb-4 shadow-md">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </div>
              <p className="text-[#007b7d] font-bold text-xs tracking-[0.18em] uppercase mb-1">
                Step {i + 1}
              </p>
              <h3 className="font-bold text-gray-900 mb-2">{title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href={MAIL_IN_HREF}
            className="inline-flex items-center gap-2 bg-[#007b7d] text-white font-bold rounded-full px-8 py-3 hover:bg-[#005f61] transition-colors"
          >
            Start a mail-in repair <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
          <a
            href={MAIL_IN_HREF}
            className="text-sm font-bold text-[#007b7d] hover:underline"
          >
            Read the packing guide
          </a>
        </div>
      </div>
    </section>
  );
}
