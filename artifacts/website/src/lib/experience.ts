/**
 * Single source of truth for "years of experience" shown across the site.
 *
 * As of the 2026 anniversary the business reads "15 Years Experience".
 * The count ticks over by 1 on the 25th of March every year, so this is
 * computed from the current date rather than hard-coded — no manual edit
 * (or cron job) is needed each year, it just recalculates on page load.
 *
 * To adjust the milestone, change BASE_YEAR / BASE_VALUE below.
 */

// On 25 March BASE_YEAR the count equals BASE_VALUE.
const BASE_YEAR = 2026;
const BASE_VALUE = 15;

// Anniversary: 25th of March (month is 0-indexed, so March = 2).
const ANNIVERSARY_MONTH = 2;
const ANNIVERSARY_DAY = 25;

/**
 * Returns the current number of years of experience, incrementing by 1
 * on the 25th of March each year.
 */
export function getYearsExperience(now: Date = new Date()): number {
  const passedAnniversaryThisYear =
    now.getMonth() > ANNIVERSARY_MONTH ||
    (now.getMonth() === ANNIVERSARY_MONTH && now.getDate() >= ANNIVERSARY_DAY);

  const value =
    BASE_VALUE + (now.getFullYear() - BASE_YEAR) - (passedAnniversaryThisYear ? 0 : 1);

  // Never display less than the baseline milestone.
  return Math.max(BASE_VALUE, value);
}

/** e.g. "15" — the number on its own, for stat blocks / badges. */
export const yearsExperience = getYearsExperience();

/** e.g. "15 Years Experience" — the full standard phrase. */
export const yearsExperienceLabel = `${yearsExperience} Years Experience`;
