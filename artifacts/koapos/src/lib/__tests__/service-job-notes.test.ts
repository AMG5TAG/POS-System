import { describe, it, expect } from "vitest";
import { appendNote, callTimes, messageTimes, CALL_NOTE_TEXT, MESSAGE_NOTE_TEXT } from "../service-job-notes";

describe("service job contact log", () => {
  it("counts calls and messages separately, oldest first", () => {
    const notes = [
      "[01/10/2026 09:00] Called customer",
      "[01/10/2026 10:30] Messaged customer",
      "[02/10/2026 11:15] Called customer",
      "[02/10/2026 12:00] Customer said they'd call back about the messaged quote",
    ].join("\n\n---\n\n");
    expect(callTimes(notes)).toEqual(["01/10/2026 09:00", "02/10/2026 11:15"]);
    expect(messageTimes(notes)).toEqual(["01/10/2026 10:30"]);
  });

  it("recognises what appendNote writes", () => {
    let notes = appendNote(null, MESSAGE_NOTE_TEXT);
    notes = appendNote(notes, CALL_NOTE_TEXT);
    expect(messageTimes(notes)).toHaveLength(1);
    expect(callTimes(notes)).toHaveLength(1);
  });
});
