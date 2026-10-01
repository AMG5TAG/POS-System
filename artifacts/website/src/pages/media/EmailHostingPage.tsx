import MediaLayout from "@/components/MediaLayout";
import { useSeo } from "@/lib/useSeo";
import { CheckCircle2, ShoppingCart } from "lucide-react";

/* Email hosting is sold from the "Email Hosting" category of the online shop
   (koastal.com.au/shop) — the same id in dev and production. It links to the
   category rather than a product because none has been added to it yet. The
   shop is a separate app, so these links are plain <a>s (a full page load). */
const EMAIL_HOSTING_CATEGORY_ID = 1000073;
const emailHostingShopUrl = `/shop/products?category=${EMAIL_HOSTING_CATEGORY_ID}`;

const googlePlans = [
  {
    name: "Starter",
    price: "$140 / user / year",
    items: [
      "30 GB secure cloud storage per user",
      "Custom business email (@your-domain.com.au)",
      "Google Meet video conferencing (up to 100 participants, 24-hour meetings)",
      "Google Docs, Sheets, Slides and Forms",
      "Shared calendars and scheduling",
      "Basic security and admin controls",
      "Gmail spam and malware protection",
      "Web-based access on any device",
      "Mobile apps for iOS and Android",
    ],
  },
  {
    name: "Standard",
    price: "$300 / user / year",
    items: [
      "2 TB secure cloud storage per user",
      "Custom business email (@your-domain.com.au)",
      "Google Meet (up to 150 participants) with recording",
      "Google Docs, Sheets, Slides and Forms",
      "Shared drives for team file storage",
      "Enhanced security and admin controls",
      "Group-based policy management",
      "Google Vault for eDiscovery",
      "Advanced Gmail security features",
    ],
    featured: true,
  },
  {
    name: "Plus",
    price: "$450 / user / year",
    items: [
      "5 TB secure cloud storage per user",
      "Custom business email (@your-domain.com.au)",
      "Google Meet (up to 500 participants) with recording",
      "eDiscovery and data retention with Google Vault",
      "Advanced endpoint management",
      "Enhanced security and compliance tools",
      "S/MIME encryption for emails",
      "AppSheet for building custom apps",
      "Priority support and 99.9% uptime SLA",
    ],
  },
];

const microsoftPlans = [
  {
    name: "Basic",
    price: "$160 / user / year",
    items: [
      "50 GB mailbox + custom business email",
      "1 TB OneDrive cloud storage per user",
      "Web and mobile versions of Word, Excel, PowerPoint and Outlook",
      "Microsoft Teams chat, calls and meetings",
      "10+ Microsoft apps (Loop, Clipchamp, Bookings, Planner, Forms)",
      "Outlook calendar and task management",
      "Basic security and compliance features",
      "Web-based access on any device",
      "Mobile apps for iOS and Android",
    ],
  },
  {
    name: "Standard",
    price: "$310 / user / year",
    items: [
      "50 GB mailbox + custom business email",
      "1 TB OneDrive cloud storage per user",
      "Desktop versions of Word, Excel, PowerPoint and Outlook",
      "Microsoft Teams chat, calls and meetings",
      "Host webinars for up to 1,000 attendees",
      "Access management for up to 300 users",
      "Shared calendars and resource booking",
      "Advanced file sharing and collaboration",
      "Standard security and compliance tools",
    ],
    featured: true,
  },
  {
    name: "Premium",
    price: "$490 / user / year",
    items: [
      "50 GB mailbox + custom business email",
      "1 TB OneDrive cloud storage per user",
      "Desktop versions of Word, Excel, PowerPoint and Outlook",
      "Microsoft Teams chat, calls and meetings",
      "Advanced identity and access management",
      "Enterprise device and endpoint protection",
      "Cyberthreat protection with Microsoft Defender",
      "Data loss prevention and encryption",
      "Advanced compliance and audit tools",
    ],
  },
];

function PlanCard({
  plan,
  accent,
}: {
  plan: (typeof googlePlans)[0];
  accent: string;
}) {
  const featured = plan.featured;
  return (
    <div
      className={`rounded-xl p-6 flex flex-col h-full ${
        featured
          ? `bg-[${accent}] text-white shadow-xl ring-4 ring-[${accent}]/20`
          : "bg-white border border-gray-200 text-gray-900"
      }`}
      style={featured ? { backgroundColor: accent } : {}}
    >
      <p
        className={`text-xs font-bold tracking-[0.18em] uppercase mb-2 ${
          featured ? "text-white/70" : "text-[#007b7d]"
        }`}
      >
        {featured ? "Most Popular" : "Plan"}
      </p>
      <h3 className="font-bold text-lg mb-1">{plan.name}</h3>
      <p
        className={`text-2xl font-extrabold mb-4 ${
          featured ? "text-white" : "text-[#007b7d]"
        }`}
      >
        {plan.price}
      </p>
      <ul className="space-y-2 mt-auto">
        {plan.items.map((i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <CheckCircle2
              className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
                featured ? "text-white/80" : "text-[#007b7d]"
              }`}
            />
            <span className={featured ? "text-white/90" : "text-gray-700"}>
              {i}
            </span>
          </li>
        ))}
      </ul>
      <a
        href={emailHostingShopUrl}
        className={`mt-6 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold uppercase tracking-wider transition-colors ${
          featured
            ? "bg-white text-[#007b7d] hover:bg-[#e8f4f5]"
            : "bg-[#007b7d] text-white hover:bg-[#004f51]"
        }`}
        aria-label={`Shop email hosting for the ${plan.name} plan in our online shop`}
      >
        <ShoppingCart className="h-4 w-4" />
        Shop email hosting
      </a>
    </div>
  );
}

export default function EmailHostingPage() {
  useSeo({
    title: "Business Email Hosting | Microsoft 365 & Google",
    description:
      "Set up Microsoft 365 or Google Workspace for your business with Koastal Kollective. Custom domain email, cloud storage, meetings and ongoing Australian-based support.",
  });

  return (
    <MediaLayout
      eyebrow="Business Email"
      title={<>Professional email on your own domain</>}
      intro="We set up Microsoft 365 and Google Workspace for Australian businesses — and then we actually look after it."
      shopLink={{
        href: emailHostingShopUrl,
        label: "Shop email hosting",
        ariaLabel: "Shop email hosting in our online shop",
      }}
    >
      <section className="py-14 bg-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3">
            Why use us
          </p>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Setup, migration and ongoing support included
          </h2>
          <p className="text-gray-600 leading-relaxed">
            Buying a Microsoft 365 or Google Workspace licence is the easy
            part. We handle the migration from your existing provider, configure
            DNS and DKIM/SPF/DMARC for deliverability, set up shared mailboxes
            and calendars, and stay on call if anything goes wrong.
          </p>
        </div>
      </section>

      {/* Google Workspace */}
      <section className="py-14 bg-gray-50 border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            Google Workspace
          </p>
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-10">
            Custom business email powered by Google
          </h2>
          <div className="grid md:grid-cols-3 gap-5">
            {googlePlans.map((p) => (
              <PlanCard key={p.name} plan={p} accent="#007b7d" />
            ))}
          </div>
        </div>
      </section>

      {/* Microsoft 365 */}
      <section className="py-14 bg-white border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4">
          <p className="text-[#007b7d] font-bold tracking-[0.2em] text-xs uppercase mb-3 text-center">
            Microsoft 365
          </p>
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-10">
            Office apps, Teams and enterprise-grade security
          </h2>
          <div className="grid md:grid-cols-3 gap-5">
            {microsoftPlans.map((p) => (
              <PlanCard key={p.name} plan={p} accent="#007b7d" />
            ))}
          </div>
        </div>
      </section>
    </MediaLayout>
  );
}
