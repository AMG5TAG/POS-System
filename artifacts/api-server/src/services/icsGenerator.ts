function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  parts.push(line.slice(0, 75));
  let pos = 75;
  while (pos < line.length) {
    parts.push(" " + line.slice(pos, pos + 74));
    pos += 74;
  }
  return parts.join("\r\n");
}

function fmtDt(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function generateIcs({
  uid,
  summary,
  description,
  location,
  startAt,
  endAt,
  method = "REQUEST",
}: {
  uid: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  startAt: Date;
  endAt: Date;
  /** iTIP method for email invites ("REQUEST"). Pass null for CalDAV objects,
   *  which must be stored without a METHOD (a METHOD marks an iTIP message). */
  method?: string | null;
}): Buffer {
  const now = new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KoaPOS//Appointments//EN",
    ...(method ? [`METHOD:${method}`] : []),
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${fmtDt(now)}`,
    `DTSTART:${fmtDt(startAt)}`,
    `DTEND:${fmtDt(endAt)}`,
    foldIcsLine(`SUMMARY:${escapeIcsText(summary)}`),
    ...(description ? [foldIcsLine(`DESCRIPTION:${escapeIcsText(description)}`)] : []),
    ...(location ? [foldIcsLine(`LOCATION:${escapeIcsText(location)}`)] : []),
    "BEGIN:VALARM",
    "TRIGGER:-PT24H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Appointment reminder",
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Appointment reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return Buffer.from(lines.join("\r\n"), "utf-8");
}
