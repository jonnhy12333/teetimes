import { date, index, integer, pgTable, real, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const teeTimeSnapshots = pgTable('tee_time_snapshots', {
  id: serial('id').primaryKey(),
  courseId: text('course_id').notNull(),
  courseName: text('course_name').notNull(),
  provider: text('provider').notNull(),
  playDate: date('play_date').notNull(),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  observationBucket: timestamp('observation_bucket', { withTimezone: true }).notNull(),
  source: text('source').notNull(),
  status: text('status').notNull(),
  leadDays: integer('lead_days').notNull(),
  teeTimeCount: integer('tee_time_count'),
  totalAvailableSpots: integer('total_available_spots'),
  spotsKnownCount: integer('spots_known_count'),
  morningCount: integer('morning_count'),
  middayCount: integer('midday_count'),
  afternoonCount: integer('afternoon_count'),
  earliestMinute: integer('earliest_minute'),
  latestMinute: integer('latest_minute'),
  minimumPrice: real('minimum_price'),
  maximumPrice: real('maximum_price'),
  errorMessage: text('error_message'),
}, (table) => ({
  oneObservationPerBucket: uniqueIndex('tee_time_snapshots_course_date_bucket_unique')
    .on(table.courseId, table.playDate, table.observationBucket),
  comparisonLookup: index('tee_time_snapshots_comparison_idx')
    .on(table.courseId, table.playDate, table.leadDays, table.observedAt),
}))
