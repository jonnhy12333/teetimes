export interface AppRelease {
  id: string
  date: string
  title: string
  changes: string[]
}

// Add the newest user-facing release first before pushing an app update.
export const appReleases: AppRelease[] = [
  {
    id: '2026-09-01-nearby-weather',
    date: 'September 1, 2026',
    title: 'Nearby results, radar, and forecasts',
    changes: [
      'Added Current Radar to the map when viewing today.',
      'Added tee-off and during-the-round forecasts to tee-time details.',
      'Nearby searches now default to courses within 25 miles, ordered by availability.',
      'Added The Jack Golf Course in Woodstock, New Hampshire.',
      'Search links now remember filters and whether you were using Map or Timeline view.',
    ],
  },
]

export const latestReleaseId = appReleases[0]?.id || ''
