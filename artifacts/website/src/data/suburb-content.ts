/**
 * Unique, hand-written copy for each suburb page.
 *
 * This is what makes a suburb page worth indexing. Without it a page still
 * renders — with the distance from the workshop, its nearest hubs and the
 * localities it covers, which are true and differ per suburb — but the body
 * copy is the shared template, and Google treats a set of pages that differ
 * only by the place name as doorway pages.
 *
 * Write from what is actually true of the place and of your work there: jobs
 * you've done, the kind of customers (retirees, tradies, holiday homes),
 * NBN conditions, how you get there, landmarks people know. Aim for
 * 150–300 words of intro plus a section or two. Never copy one suburb's text
 * into another and swap the name — that is exactly the pattern being removed.
 *
 * Every field is optional; anything left out falls back to the template.
 * Keys must match the names in suburbs.ts exactly.
 */

export interface SuburbContent {
  /** <title>, ≤ 60 characters. Default: "Computer Repairs <Suburb> | Free Diagnostic". */
  title?: string;
  /** Meta description, 120–160 characters. Default mentions the distance. */
  description?: string;
  /** Opening paragraphs, replacing the template's first section. */
  intro?: string[];
  /** Extra local sections shown after the intro. */
  sections?: Array<{ heading: string; body: string[] }>;
  /** A real review from a customer in this suburb (first name + initial). */
  review?: { quote: string; author: string };
}

// First drafts written from public geography and the services on this site —
// no invented jobs or customers. Read each before publishing and correct
// anything that doesn't match your experience; add a `review` only from a real
// customer in that suburb.
export const suburbContent: Record<string, SuburbContent> = {
  "Belmont": {
    title: "Computer Repairs Belmont NSW | Eastern Lake",
    description:
      "Computer, Mac and laptop repairs for Belmont, Marks Point, Croudace Bay, Floraville and Belmont North and South. Free diagnostic, no fix no fee.",
    intro: [
      "Belmont is the busy centre of the eastern side of Lake Macquarie, strung along the highway with Belmont North, Belmont South, Marks Point, Croudace Bay and Floraville around it.",
      "At around 17 km it's at the northern edge of where we regularly travel, so for Belmont we usually suggest our free pickup and delivery or an on-site visit. Either way, you get a free diagnostic and a fixed price before any work starts.",
    ],
    sections: [
      {
        heading: "Office IT for local businesses",
        body: [
          "Belmont has plenty of small offices, clinics and shops. We set up and support business computers, Microsoft 365 or Google Workspace email, network printers and backups, so a failed machine is an inconvenience rather than a lost week.",
        ],
      },
    ],
  },
  "Blue Haven": {
    title: "Computer Repairs Blue Haven | PC & Laptop",
    description:
      "Computer and laptop repairs for Blue Haven, about 7 km from our Mannering Park workshop. Gaming PCs, home Wi-Fi, data recovery. Free diagnostic.",
    intro: [
      "Blue Haven is one of the newer estates in the northern Wyong area, about 7 km from our Mannering Park workshop, and mostly young families.",
      "That means gaming PCs and consoles, kids' laptops and home networks that need to cope with a lot of devices at once. We repair, upgrade and build, and we'll set the network up so the console isn't fighting the work laptop for bandwidth.",
    ],
    sections: [
      {
        heading: "Parental controls and safer browsing",
        body: [
          "We can set up parental controls, ad and tracker blocking, and sensible security on family computers and phones, so the kids can use them without you having to watch over their shoulder.",
        ],
      },
    ],
  },
  "Bonnells Bay": {
    title: "Computer Repairs Bonnells Bay | Morisset Peninsula",
    description:
      "Computer and laptop repairs across the Morisset Peninsula — Bonnells Bay, Brightwaters, Silverwater and more. Free diagnostic, no fix no fee.",
    intro: [
      "Bonnells Bay is the centre of the Morisset Peninsula, and this page covers the peninsula's smaller lakeside villages too: Brightwaters, Mirrabooka, Silverwater, Sunshine, Windermere Park, Yarrawonga Park, Balcolyn and Morisset Park.",
      "Plenty of peninsula residents are retirees or people who have moved here for the lake. We're patient with questions, we explain things without jargon, and our 10% pension discount applies to every job.",
    ],
    sections: [
      {
        heading: "We'll come to you",
        body: [
          "Not everyone wants to load a desktop computer into the car. We do home visits on the peninsula for set-ups, printers, Wi-Fi, smart TVs and the like, and we offer free pickup and delivery for machines that need to come back to the workshop.",
        ],
      },
    ],
  },
  "Budgewoi": {
    title: "Computer Repairs Budgewoi | PC & Mac Repairs",
    description:
      "Computer, Mac and laptop repairs for Budgewoi, about 10 km from our Mannering Park workshop. Free diagnostic, fixed quote, no fix no fee.",
    intro: [
      "Budgewoi sits between Budgewoi Lake and the ocean, with its own shops and beach, about 10 km south of our Mannering Park workshop.",
      "We repair Windows PCs, laptops and Macs for Budgewoi households and holiday homes, recover data from failed drives, and set up new computers so everything from the old one comes across.",
    ],
    sections: [
      {
        heading: "Free pickup and delivery",
        body: [
          "If getting to Mannering Park isn't convenient, we can collect your computer, repair it at the workshop and bring it back. You'll get a fixed quote before any work starts.",
        ],
      },
    ],
  },
  "Buff Point": {
    title: "Computer Repairs Buff Point & Halekulani",
    description:
      "Computer and laptop repairs for Buff Point and Halekulani on Budgewoi Lake, about 9 km from our workshop. Free diagnostic, no fix no fee.",
    intro: [
      "Buff Point and Halekulani sit on the shores of Budgewoi Lake, a quiet residential pocket about 9 km south of our Mannering Park workshop.",
      "Retirees and young families both call this pocket home. Whether it's a laptop that won't start, a printer that's gone offline or an email account that's been hacked, we fix it and explain what happened in plain English.",
    ],
    sections: [
      {
        heading: "Help with email and accounts",
        body: [
          "Locked out of your email, or getting warnings that someone else has signed in? We help recover accounts, change passwords properly, set up two-step sign-in and check the computer itself is clean.",
        ],
      },
    ],
  },
  "Catherine Hill Bay": {
    title: "Computer Repairs Catherine Hill Bay & Moonee",
    description:
      "Computer repairs and home internet set-up for Catherine Hill Bay and Moonee, about 8 km from our Mannering Park workshop. Free diagnostic.",
    intro: [
      "Catherine Hill Bay is the old mining village on the coast east of us, with Moonee next door — small, quiet, and only a short drive from our Mannering Park workshop.",
      "Being tucked away, connectivity is often the first problem: Wi-Fi that won't reach the whole house, or a modem that needs setting up. We also handle the usual repairs on laptops, desktops and Macs.",
    ],
    sections: [
      {
        heading: "Home internet set-up",
        body: [
          "We set up NBN modems and routers and extend Wi-Fi to every room, so the connection you pay for reaches where you actually use it.",
        ],
      },
    ],
  },
  "Caves Beach": {
    title: "Computer Repairs Caves Beach | Laptops & PCs",
    description:
      "Computer and laptop repairs for Caves Beach, Murrays Beach, Cams Wharf and Pinny Beach. Free diagnostic, no fix no fee, no call-out fee.",
    intro: [
      "Caves Beach, named for the sea caves along its headland, sits on the coast just south of Swansea. This page also covers the lake side of the area — Murrays Beach, Cams Wharf and Pinny Beach.",
      "Beach suburbs are hard on technology: sand in keyboards, salt air in ports and the occasional laptop that met a drink. We clean, repair and replace parts, and if a machine isn't worth fixing we'll say so and help you choose a replacement.",
    ],
    sections: [
      {
        heading: "Refurbished computers",
        body: [
          "If replacing makes more sense than repairing, we sell refurbished desktops, laptops and Macs that we've tested ourselves — a good option for a second computer, a student or a home office on a budget.",
        ],
      },
    ],
  },
  "Chain Valley Bay": {
    title: "Computer Repairs Chain Valley Bay | PC & Mac",
    description:
      "Computer and laptop repairs for Chain Valley Bay, Kingfisher Shores and Crangan Bay, about 4 km from our workshop. Free diagnostic, no fix no fee.",
    intro: [
      "Chain Valley Bay, with Kingfisher Shores and Crangan Bay along the lake beside it, is just around the corner from our Mannering Park workshop.",
      "We repair laptops, desktops and Macs for families here, build and upgrade gaming PCs, and set up home networks so everyone's devices work in every room — from the kids' consoles to the work laptop in the spare room.",
    ],
    sections: [
      {
        heading: "Custom-built gaming PCs",
        body: [
          "We build gaming and workstation PCs to your budget, upgrade existing ones with new graphics cards, more storage or better cooling, and fix the ones that crash, overheat or won't post.",
        ],
      },
    ],
  },
  "Charmhaven": {
    title: "Computer Repairs Charmhaven | PC, Mac & Laptop",
    description:
      "PC, Mac and laptop repairs for Charmhaven, about 8 km from our Mannering Park workshop. Free diagnostic, no fix no fee, no call-out fee.",
    intro: [
      "Charmhaven sits beside Lake Haven along the highway, about 8 km south of our Mannering Park workshop.",
      "We repair laptops, desktops and Macs of every brand, including machines bought from the big retailers that are just out of warranty. As an authorised SolvUp repair partner we can also handle some repairs that come through retailers' support.",
    ],
    sections: [
      {
        heading: "Out of warranty? Talk to us first",
        body: [
          "A laptop that fails a few months after its warranty ends usually doesn't need replacing. We'll diagnose it for free and give you a fixed price, so you can compare a repair against a new machine with real numbers.",
        ],
      },
    ],
  },
  "Cooranbong": {
    title: "Computer Repairs Cooranbong | Laptops & Macs",
    description:
      "Laptop, Mac and PC repairs for Cooranbong, Martinsville and Lemon Tree. Student laptops, data recovery, home Wi-Fi. Free diagnostic, no fix no fee.",
    intro: [
      "Cooranbong runs from the older village near Avondale University out to the new estates towards the Watagans, with Martinsville and Lemon Tree in the valleys beyond.",
      "It's a university town, so student laptops are a big part of it — and they always seem to break in assignment week. If yours won't start, we can usually recover your files first and then look at the repair, so a dead laptop doesn't cost you the work on it.",
    ],
    sections: [
      {
        heading: "Internet out in the valleys",
        body: [
          "Further out towards Martinsville the internet options get thinner. We set up NBN connections and extend Wi-Fi across the property, and we can help you work out the best option for your address before you spend money on it.",
        ],
      },
    ],
  },
  "Dora Creek": {
    title: "Computer Repairs Dora Creek | PC & Laptop",
    description:
      "Computer repairs for Dora Creek, Eraring and Myuna Bay, about 8 km from our Mannering Park workshop. Free diagnostic, no fix no fee. 0493 145 179.",
    intro: [
      "Dora Creek is the riverside village between Morisset and Cooranbong, with Eraring and Myuna Bay along the lake shore to the east. It's an easy run from our Mannering Park workshop.",
      "We repair desktops, laptops and Macs for households here, set up new computers and move everything across from the old one, and fix the everyday problems — pop-ups, slow start-ups, email that stopped working — that are frustrating rather than catastrophic.",
    ],
    sections: [
      {
        heading: "Old photos and tapes",
        body: [
          "Plenty of families have boxes of photos, slides and VHS tapes. We convert them to digital, restore damaged photos, and can put them together into a slideshow for a birthday, anniversary or memorial.",
        ],
      },
    ],
  },
  "Doyalson": {
    title: "Computer Repairs Doyalson | PC, Mac & Laptop",
    description:
      "PC, Mac and laptop repairs for Doyalson and Doyalson North, about 6 km from our Mannering Park workshop. Free diagnostic, no fix no fee.",
    intro: [
      "Doyalson and Doyalson North sit where the highway meets the link road to the motorway, about 6 km south of our Mannering Park workshop.",
      "We repair desktops and laptops for households here and help the rural-residential properties further back from the highway, where good Wi-Fi coverage and reliable internet take a bit more planning.",
    ],
    sections: [
      {
        heading: "NBN and Wi-Fi set-up",
        body: [
          "Changing NBN provider, upgrading your plan or just fed up with dropouts? We set up modems and mesh Wi-Fi, run cabling where wireless won't do, and make sure the TV, printer and phones are all connected before we leave.",
        ],
      },
    ],
  },
  "Gorokan": {
    title: "Computer Repairs Gorokan | PC & Laptop Repair",
    description:
      "Computer and laptop repairs for Gorokan on Tuggerah Lake, about 12 km from our Mannering Park workshop. Free diagnostic, no fix no fee.",
    intro: [
      "Gorokan stretches along the northern shore of Tuggerah Lake, about 12 km from our Mannering Park workshop.",
      "We repair desktops and laptops, replace broken screens, batteries and keyboards, and fix software problems for Gorokan households — and we come to you for the jobs that can't be carried in, like home Wi-Fi, printers and smart TVs.",
    ],
    sections: [
      {
        heading: "Smart TVs and streaming",
        body: [
          "New smart TV, but can't find the apps or sign in to Netflix, Stan, Prime Video or YouTube? We'll set it all up, connect it to your Wi-Fi and show you how to use it.",
        ],
      },
    ],
  },
  "Gwandalan": {
    title: "Computer Repairs Gwandalan | Near Mannering Park",
    description:
      "Computer and laptop repairs for Gwandalan and Nords Wharf, about 5 km from our Mannering Park workshop. Free diagnostic, no fix no fee.",
    intro: [
      "Gwandalan is one of our closest neighbours — around the southern shore of the lake from Mannering Park, with Nords Wharf further along the water.",
      "Because we're so close, it's easy to drop a laptop in on your way through and pick it up a few days later. We repair, clean up and upgrade computers of every brand, and we'll always quote before doing any work.",
    ],
    sections: [
      {
        heading: "Phones, tablets and new devices",
        body: [
          "Bought a new phone, tablet or laptop? We'll set it up, move your photos, contacts and messages across — including Android to iPhone and back — and make sure your email and apps are working before you leave.",
        ],
      },
    ],
  },
  "Hamlyn Terrace": {
    title: "Computer Repairs Hamlyn Terrace | PC & Laptop",
    description:
      "Computer and laptop repairs for Hamlyn Terrace, about 13 km from our Mannering Park workshop. Gaming PCs, home Wi-Fi. Free diagnostic, no fix no fee.",
    intro: [
      "Hamlyn Terrace is one of the fast-growing suburbs of the Warnervale corridor, about 13 km from our Mannering Park workshop, and full of newer family homes.",
      "New houses bring new technology problems: Wi-Fi that doesn't reach the back rooms, an NBN connection that needs setting up, smart home devices that won't talk to each other, and gaming PCs that need more than the family laptop.",
    ],
    sections: [
      {
        heading: "Smart home set-ups",
        body: [
          "Whether you use Apple HomeKit, Google Home or Amazon Alexa, we set up and connect your lights, cameras, speakers and doorbells so they work together and stay connected.",
        ],
      },
    ],
  },
  "Kanwal": {
    title: "Computer Repairs Kanwal & Wyongah",
    description:
      "Computer and laptop repairs for Kanwal and Wyongah, about 14 km from our Mannering Park workshop. Free diagnostic, no fix no fee, no call-out fee.",
    intro: [
      "Kanwal sits along the highway north of Wyong, with Wyongah down on the shore of Tuggerah Lake. Both are about 14 km from our Mannering Park workshop.",
      "We repair desktops and laptops, recover data from failed drives, remove viruses and set up new machines for households in Kanwal and Wyongah — with a free diagnostic and a fixed quote before any work starts.",
    ],
    sections: [
      {
        heading: "Backups that actually run",
        body: [
          "Most data loss we see is from a computer that 'was being backed up' but wasn't. We set up automatic backups to an external drive or the cloud, and check they're working, so a failed drive is a nuisance rather than a disaster.",
        ],
      },
    ],
  },
  "Lake Haven": {
    title: "Computer Repairs Lake Haven | Laptops & Macs",
    description:
      "Computer, laptop and Mac repairs for Lake Haven, about 10 km from our Mannering Park workshop. Free diagnostic, fixed quote, no fix no fee.",
    intro: [
      "Lake Haven, home to the area's big shopping centre, is about 10 km south of our Mannering Park workshop.",
      "Plenty of people buy a new computer at the shops and then find that setting it up is the hard part. We move your files, photos, email and passwords across, remove the trial software and make sure everything works the way the old one did.",
    ],
    sections: [
      {
        heading: "Purchasing advice",
        body: [
          "Before you buy, ask us. We'll give you free, honest advice on which laptop, desktop or TV suits what you actually do — and if your current one can be fixed for much less, we'll tell you that too.",
        ],
      },
    ],
  },
  "Lake Munmorah": {
    title: "Computer Repairs Lake Munmorah | Local PC Repair",
    description:
      "Computer and laptop repairs for Lake Munmorah and Budgewoi Peninsula, about 6 km from our Mannering Park workshop. Free diagnostic.",
    intro: [
      "Lake Munmorah sits between its lake and the state conservation area, a short drive south of our Mannering Park workshop along the highway.",
      "It's a growing suburb with a lot of young families, and that shapes what they need: laptops for school and work, gaming PCs and consoles, and home networks that need to keep up with a houseful of devices.",
    ],
    sections: [
      {
        heading: "School and work laptops",
        body: [
          "When a school or work laptop breaks, the deadline doesn't move. We prioritise diagnosis, recover files first where we can, and give you a fixed quote straight away so you can decide quickly whether to repair or replace.",
        ],
      },
    ],
  },
  "Mannering Park": {
    title: "Computer Repairs Mannering Park | Local Workshop",
    description:
      "Our workshop is in Mannering Park — walk in at Shop 1/64 Vales Road for PC, Mac and laptop repairs. Free diagnostic, no fix no fee. Call 0493 145 179.",
    intro: [
      "Mannering Park is home. Our workshop and store is at Shop 1/64 Vales Road, so if you live here you can walk your laptop in, talk to the technician who will actually fix it, and usually collect it again within the week.",
      "Because there is no travel involved, Mannering Park is where we can be most flexible: drop a machine in on the way past, have us look at it while you wait if it's a quick job, or book a home visit if your desktop, printer or Wi-Fi isn't the kind of thing you can carry down the road.",
    ],
    sections: [
      {
        heading: "Walk-in repairs on Vales Road",
        body: [
          "We're open 10am to 5pm, Monday to Friday. Every machine gets a free diagnostic and a fixed quote before we touch it, and if we can't fix it you don't pay for the labour.",
          "Pensioners get 10% off, and locals often use us for the small things too: a new phone set up, photos moved off an old computer, or a printer that has stopped talking to the laptop.",
        ],
      },
    ],
  },
  "Morisset": {
    title: "Computer Repairs Morisset | Laptop & Mac Repair",
    description:
      "PC, Mac and laptop repairs for Morisset and Mandalong, about 7 km from our workshop. Free diagnostic, fixed quote, no fix no fee. Call 0493 145 179.",
    intro: [
      "Morisset is the hub of the south-western side of Lake Macquarie — the station, the shops and the motorway interchange — and it's only a short drive from our Mannering Park workshop.",
      "We look after households, commuters and small businesses around Morisset and out towards Mandalong. Common jobs include laptops that won't charge or boot, cracked screens, slow computers that need a clean-up or an SSD, and getting a home office reliably online.",
    ],
    sections: [
      {
        heading: "Small business support around Morisset",
        body: [
          "If you run a shop, practice or trade business here, we can set up and look after the computers, printers, email and backups, and come to you when something stops working. See our business IT support page for what we cover.",
        ],
      },
    ],
  },
  "Norah Head": {
    title: "Computer Repairs Norah Head & Noraville",
    description:
      "Computer and laptop repairs for Norah Head, Noraville and Magenta, about 15 km from our Mannering Park workshop. Free diagnostic, no fix no fee.",
    intro: [
      "Norah Head, with its lighthouse on the headland, and neighbouring Noraville sit on the coast south of Toukley. This page also covers Magenta, between Tuggerah Lake and the beaches.",
      "We repair laptops, desktops and Macs here and set up holiday homes and rentals so the Wi-Fi, streaming and smart TV are ready for guests — with a simple guide so they don't need to call you.",
    ],
    sections: [
      {
        heading: "Working from home by the coast",
        body: [
          "If you work from home, a reliable connection matters more than anything. We set up NBN and mesh Wi-Fi, business email, backups and a proper home office so a dropout doesn't cost you a meeting.",
        ],
      },
    ],
  },
  "Rathmines": {
    title: "Computer Repairs Rathmines | Western Lake Shore",
    description:
      "PC, Mac and laptop repairs for Rathmines, Fishing Point, Carey Bay, Coal Point and nearby. Free diagnostic and fixed quotes. Call 0493 145 179.",
    intro: [
      "Rathmines, the old flying-boat base on the western shore of the lake, is the centre of a run of quiet bays: Fishing Point, Balmoral, Buttaba, Carey Bay and Coal Point. This page covers all of them.",
      "Households along this stretch of the lake call us for the full range of jobs — repairs, upgrades, new computer set-ups, printers and home networks — and many prefer a home visit to a trip into town, which we're happy to do.",
    ],
    sections: [
      {
        heading: "Keeping older relatives connected",
        body: [
          "If you're arranging help for a parent or relative, we can set up a new iPad with video calls, clean off a scam pop-up or recover an email account. We take the time to explain what we've done, and pensioners get 10% off.",
        ],
      },
    ],
  },
  "San Remo": {
    title: "Computer Repairs San Remo NSW | Laptops & PCs",
    description:
      "Computer and laptop repairs for San Remo and Colongra, about 7 km from our Mannering Park workshop. Free diagnostic, no fix no fee, no call-out fee.",
    intro: [
      "San Remo sits along the highway near Budgewoi Lake, with Colongra on the other side of the lake's northern arm. It's an easy run from our Mannering Park workshop.",
      "Most of what we do in San Remo is everyday household repairs: laptops that won't charge, computers that have slowed to a crawl, failing hard drives and the occasional spilled drink. Every job starts with a free diagnostic.",
    ],
    sections: [
      {
        heading: "Speeding up an older computer",
        body: [
          "An older computer that takes five minutes to start often doesn't need replacing. Swapping the hard drive for an SSD, adding memory and cleaning up start-up programs can make it feel new for a fraction of the cost.",
        ],
      },
    ],
  },
  "Summerland Point": {
    title: "Computer Repairs Summerland Point | Local Tech",
    description:
      "Local computer and laptop repairs for Summerland Point, a few minutes from our Mannering Park workshop. Free diagnostic, no fix no fee.",
    intro: [
      "Summerland Point is a few minutes from our workshop, on its own point at the southern end of Lake Macquarie. It's a quiet, mostly retired community, and the kind of place where it helps to have a technician nearby.",
      "We help with whatever the computer is doing wrong — slow, full of pop-ups, not printing, not connecting — and we explain what happened in plain English. Pensioners get 10% off every job.",
    ],
    sections: [
      {
        heading: "Scam and virus clean-ups",
        body: [
          "If a pop-up told you your computer was infected and to call a number, or you let someone remote into your computer, call us before using it for banking. We remove what was installed, check for anything left behind and help you secure your accounts.",
        ],
      },
    ],
  },
  "Swansea": {
    title: "Computer Repairs Swansea NSW | PC & Laptop",
    description:
      "PC, Mac and laptop repairs for Swansea, Swansea Heads, Pelican, Blacksmiths and Little Pelican. Free diagnostic and fixed quote. 0493 145 179.",
    intro: [
      "Swansea sits on the channel where Lake Macquarie meets the ocean, with Swansea Heads, Pelican, Little Pelican and Blacksmiths around it. This page covers all five.",
      "We repair laptops, desktops and Macs for Swansea households and look after the small businesses along the highway — the computers, the printers, the email and the backups that nobody thinks about until they stop.",
    ],
    sections: [
      {
        heading: "Laptop screen replacements",
        body: [
          "A cracked laptop screen is one of the most common repairs we do. We source the right panel for your model, quote you before ordering, and fit it so the laptop is back to normal — usually far cheaper than replacing the whole machine.",
        ],
      },
    ],
  },
  "Toronto": {
    title: "Computer Repairs Toronto NSW | Lake Macquarie",
    description:
      "Computer and laptop repairs for Toronto, Blackalls Park, Fassifern, Bolton Point and the north-western lake. Free diagnostic, no fix no fee.",
    intro: [
      "Toronto is the main centre at the north-western end of Lake Macquarie, and this page covers the suburbs around it: Blackalls Park, Fennell Bay, Fassifern, Bolton Point, Kilaben Bay, Woodrising, Eleebana, Awaba, Ryhope and Freemans Waterhole.",
      "It's the far edge of our home patch at around 16 km from the workshop, so for Toronto we usually suggest our free pickup and delivery or a home visit rather than a drive down to Mannering Park.",
    ],
    sections: [
      {
        heading: "Data recovery",
        body: [
          "A dead hard drive, a laptop that was dropped or a phone that won't turn on can take years of photos with it. We recover data from failed drives, laptops and memory cards, and we'll tell you up front if a drive needs specialist lab recovery instead.",
        ],
      },
    ],
  },
  "Toukley": {
    title: "Computer Repairs Toukley | PC, Mac & Laptop",
    description:
      "PC, Mac and laptop repairs for Toukley and Canton Beach, about 12 km from our Mannering Park workshop. Free diagnostic, no fix no fee.",
    intro: [
      "Toukley sits on the strip of land between Tuggerah Lake and Budgewoi Lake, with Canton Beach on the Tuggerah side. It's the main shopping town for this part of the coast and about 12 km from our workshop.",
      "Toukley has a large retired community, and a lot of what we do here is helping people get comfortable with their technology: setting up a new iPad, getting video calls working with the grandkids, cleaning off scam software and making sure banking is safe.",
    ],
    sections: [
      {
        heading: "Pension discount",
        body: [
          "Every job for a pensioner gets 10% off, on top of a free diagnostic and our no fix, no fee guarantee. There are no call-out fees for home visits.",
        ],
      },
    ],
  },
  "Wadalba": {
    title: "Computer Repairs Wadalba | Tuggerawong & Tacoma",
    description:
      "Computer and laptop repairs for Wadalba, Tuggerawong, Tacoma, Tacoma South and Rocky Point. Free diagnostic, no fix no fee. 0493 145 179.",
    intro: [
      "Wadalba is one of the newer suburbs north of Wyong, and this page also covers the older lakeside streets of Tuggerawong, Tacoma, Tacoma South and Rocky Point along Tuggerah Lake.",
      "It's a mix we enjoy: gaming rigs and family laptops in the new estates, and long-serving desktops by the lake that need a careful rebuild without losing years of files and emails.",
    ],
    sections: [
      {
        heading: "Moving to a new computer",
        body: [
          "When an old computer finally has to go, we move everything across — documents, photos, email, bookmarks and passwords — and set up the new one so it feels familiar from day one.",
        ],
      },
    ],
  },
  "Wangi Wangi": {
    title: "Computer Repairs Wangi Wangi | PC & Mac Repair",
    description:
      "Computer, Mac and laptop repairs for Wangi Wangi and Arcadia Vale, about 11 km from our workshop. Free diagnostic, no fix no fee. 0493 145 179.",
    intro: [
      "Wangi Wangi sits out on its own point on the western side of Lake Macquarie, with Arcadia Vale just up the road. It's lake-and-boat country, and a good number of the homes here are holiday places or retirement homes.",
      "We fix the computers and laptops of permanent residents, and set up holiday homes so the Wi-Fi, smart TV and streaming all work when the family arrives — rather than spending the first day of the break on the phone to the internet provider.",
    ],
    sections: [
      {
        heading: "Mac and MacBook repairs",
        body: [
          "We repair Apple computers as well as Windows PCs: MacBook screens, batteries and keyboards, slow iMacs, and macOS problems. If an older Mac can no longer be updated, we'll tell you honestly whether it's worth repairing.",
        ],
      },
    ],
  },
  "Warnervale": {
    title: "Computer Repairs Warnervale | Rural & Home IT",
    description:
      "Computer repairs and internet set-up for Warnervale, Jilliby, Dooralong, Durren Durren and Halloran. NBN and Wi-Fi set-up. Free diagnostic.",
    intro: [
      "Warnervale, with its station and airfield, sits at the edge of the Wyong valleys. This page also covers the rural properties out through Jilliby, Little Jilliby, Dooralong, Durren Durren and Halloran.",
      "Out in the valleys, the internet is often the problem before the computer is. We set up NBN fixed wireless, extend Wi-Fi to sheds and outbuildings, and repair the computers, laptops and printers that run the farm or home business.",
    ],
    sections: [
      {
        heading: "On-site visits to acreage",
        body: [
          "We come out to rural properties for set-ups and repairs that need to be done on site, with no call-out fee. Machines that need workshop time can be collected and returned.",
        ],
      },
    ],
  },
  "Woongarrah": {
    title: "Computer Repairs Woongarrah | Kiar & Wallarah",
    description:
      "Computer and laptop repairs for Woongarrah, Kiar and Wallarah, about 11 km from our Mannering Park workshop. Free diagnostic, no fix no fee.",
    intro: [
      "Woongarrah is one of the newer suburbs in the growth area north of Wyong, about 11 km from our workshop, with the semi-rural properties of Kiar and Wallarah to the north.",
      "We repair laptops, desktops and gaming PCs for Woongarrah families, and help the bigger blocks around Kiar and Wallarah get Wi-Fi to every corner of the property.",
    ],
    sections: [
      {
        heading: "Console and gaming PC help",
        body: [
          "Overheating consoles, gaming PCs that crash under load, controllers and headsets that won't pair — we diagnose and fix them, and can build or upgrade a gaming PC to suit your budget.",
        ],
      },
    ],
  },
  "Wyee": {
    title: "Computer Repairs Wyee | PC, Mac & Laptop",
    description:
      "Computer and laptop repairs for Wyee and Bushells Ridge, about 6 km from our Mannering Park workshop. Free diagnostic, no fix no fee. 0493 145 179.",
    intro: [
      "Wyee sits just inland from the lake, a few minutes from our Mannering Park workshop, with its railway station, older family homes and a growing number of new estates around Bushells Ridge.",
      "That mix means two kinds of job: family laptops and school devices in the newer streets, and older desktops on the bigger blocks that have been running the same software for years and finally need a rebuild or a data rescue.",
    ],
    sections: [
      {
        heading: "Home Wi-Fi on larger blocks",
        body: [
          "Some Wyee properties are big enough that a single modem can't reach the shed, the granny flat or the far bedroom. We set up mesh Wi-Fi and NBN equipment so the signal covers the whole property, and explain how it works so you're not calling us every time it restarts.",
        ],
      },
    ],
  },
  "Wyong": {
    title: "Computer Repairs Wyong | PC, Mac & Laptop",
    description:
      "Computer, Mac and laptop repairs for Wyong, Watanobbi, Alison and Mardi. Free pickup and delivery, free diagnostic, no fix no fee. 0493 145 179.",
    intro: [
      "Wyong is the historic town at the centre of the northern Central Coast — the station, the river and the racecourse — and this page covers Watanobbi, Alison and Mardi around it.",
      "At around 18 km from our Mannering Park workshop, Wyong is at the southern edge of our home patch. For Wyong we usually suggest our free pickup and delivery, or a home or office visit; there's no call-out fee either way.",
    ],
    sections: [
      {
        heading: "Business IT support in Wyong",
        body: [
          "Wyong has plenty of offices, trades and shops. We set up and look after business computers, email, printers and backups, and come on site when something stops working, so you're not stuck waiting for a call centre.",
        ],
      },
    ],
  },
};
