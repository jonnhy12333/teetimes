export interface AppRelease {
  id: string
  date: string
  title: string
  changes: string[]
}

// Add the newest user-facing release first before pushing an app update.
export const appReleases: AppRelease[] = [
  {
    id: '2026-09-04-map-bottom-sheet',
    date: 'September 4, 2026',
    title: 'More room for map results',
    changes: [
      'The mobile map course sheet can now be collapsed, viewed at half height, or expanded to fill the map.',
      'Drag the sheet handle or use its accessible expand and collapse controls without losing your place in the tee-time list.',
    ],
  },
  {
    id: '2026-09-03-availability-trends',
    date: 'September 3, 2026',
    title: 'See when a course is unusually open',
    changes: [
      'Added course-level availability indicators that compare tee-time inventory with similar historical searches.',
      'New courses show Building history until enough same-weekday and booking-lead-time observations are available.',
    ],
  },
  {
    id: '2026-09-01-course-hours',
    date: 'September 1, 2026',
    title: 'Nearby results, radar, and forecasts',
    changes: [
      'Added Current Radar to the map when viewing today.',
      'Added tee-off and during-the-round forecasts to tee-time details.',
      'Nearby searches now default to courses within 25 miles, ordered by availability.',
      'Added The Jack Golf Course in Woodstock, New Hampshire.',
      'Search links now remember filters and whether you were using Map or Timeline view.',
      'Added an in-app What’s new panel for discovering recent improvements.',
      'Map view now includes every active course while opening at a useful nearby area instead of zooming out for distant courses.',
      'Courses sharing one location now get separate map markers instead of overlapping badges.',
      'Added live open or closed status and daily hours to course and tee-time details.',
      'Improved selected map markers so their flag and shadow render cleanly.',
    ],
  },
  {
    id: '2026-08-27-map-view',
    date: 'August 27, 2026',
    title: 'Explore tee times on a map',
    changes: [
      'Added a Google Maps view with availability counts at every course.',
      'Course markers open a focused list of matching tee times without moving the map.',
      'Added your-location and selected-course markers.',
      'Added a fullscreen map experience with consistent mobile controls.',
    ],
  },
  {
    id: '2026-08-26-timeline-controls',
    date: 'August 26, 2026',
    title: 'A more powerful tee-time timeline',
    changes: [
      'Placed every course on one shared time axis for easier comparison.',
      'Added drag-to-pan, mouse-wheel navigation, zooming, and fullscreen mode.',
      'Made the course rail collapsible, including an avatar-only mobile view.',
      'Added course filtering and sorting by name, distance, or availability.',
    ],
  },
  {
    id: '2026-08-25-course-details',
    date: 'August 25, 2026',
    title: 'Course details and a larger catalog',
    changes: [
      'Added course information with scorecard details, amenities, contact information, and directions.',
      'Added course photography and richer detail headers.',
      'Expanded support for additional regional courses and booking providers.',
    ],
  },
  {
    id: '2026-08-24-search-redesign',
    date: 'August 24, 2026',
    title: 'Find the kind of round you want',
    changes: [
      'Redesigned the welcome screen around Play now, Play tonight, and custom-date searches.',
      'Added player, hole, and flexible time filtering.',
      'Added availability colors so open foursomes and nearly-full tee times stand out.',
      'Improved mobile filtering and horizontal tee-time browsing.',
    ],
  },
  {
    id: '2026-08-21-account-free',
    date: 'August 21, 2026',
    title: 'Faster, account-free browsing',
    changes: [
      'Removed the login requirement so searches work immediately.',
      'Added course logos, mobile-friendly results, and light and dark themes.',
      'Added personalized course cards, refreshing, and drag-to-reorder controls.',
    ],
  },
]

export const latestReleaseId = appReleases[0]?.id || ''
