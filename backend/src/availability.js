import { eachDateBetween, getAvailableDates } from "./dateUtils.js";

export function summarizeEventParticipants(participants) {
  if (!participants.length) {
    return {
      perDate: [],
      bestDates: [],
      maxAvailability: 0,
      bestRanges: {
        3: { maxOverlap: 0, ranges: [] },
        5: { maxOverlap: 0, ranges: [] },
        10: { maxOverlap: 0, ranges: [] }
      }
    };
  }

  const minStart = participants
    .map((p) => p.startDate)
    .sort()[0];
  const maxEnd = participants
    .map((p) => p.endDate)
    .sort()
    .at(-1);

  const allDates = eachDateBetween(minStart, maxEnd);
  const dateToNames = new Map(allDates.map((d) => [d, []]));

  for (const p of participants) {
    const availableSet = new Set(
      getAvailableDates(p.startDate, p.endDate, p.excludedDates)
    );
    for (const d of allDates) {
      if (availableSet.has(d)) {
        dateToNames.get(d).push(p.name);
      }
    }
  }

  const perDate = allDates.map((d) => {
    const names = dateToNames.get(d).sort((a, b) => a.localeCompare(b));
    return {
      date: d,
      availableCount: names.length,
      names
    };
  });

  const maxAvailability = Math.max(...perDate.map((d) => d.availableCount));
  const bestDates = perDate.filter((d) => d.availableCount === maxAvailability);

  return {
    perDate,
    bestDates,
    maxAvailability,
    bestRanges: {
      3: computeBestRanges(perDate, 3),
      5: computeBestRanges(perDate, 5),
      10: computeBestRanges(perDate, 10)
    }
  };
}

function computeBestRanges(perDate, windowSize) {
  if (perDate.length < windowSize) {
    return { maxOverlap: 0, ranges: [] };
  }

  let maxOverlap = -1;
  const ranges = [];

  for (let i = 0; i <= perDate.length - windowSize; i += 1) {
    const slice = perDate.slice(i, i + windowSize);
    const overlap = Math.min(...slice.map((d) => d.availableCount));

    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      ranges.length = 0;
      ranges.push({
        startDate: slice[0].date,
        endDate: slice.at(-1).date,
        overlap
      });
    } else if (overlap === maxOverlap) {
      ranges.push({
        startDate: slice[0].date,
        endDate: slice.at(-1).date,
        overlap
      });
    }
  }

  return {
    maxOverlap: Math.max(maxOverlap, 0),
    ranges
  };
}
