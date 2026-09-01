import { createEffect, createSignal, onCleanup, Show } from 'solid-js'
import { loadPlacesLibrary } from '../googleMaps'
import type { Course } from './Dashboard'

interface CourseHoursData { businessStatus?: string; currentHours: google.maps.places.OpeningHours; regularHours?: google.maps.places.OpeningHours | null; utcOffsetMinutes: number }
interface CourseHoursResult { openNow?: boolean; status: string; hours: string; label: string }

const cache = new Map<string, { expires: number; value: CourseHoursData | null }>()
const cacheDuration = 4 * 60 * 60 * 1000

function formatTime(hour: number, minute: number) {
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
}

function isCurrentlyOpen(hours: google.maps.places.OpeningHours, utcOffsetMinutes: number) {
  const local = new Date(Date.now() + utcOffsetMinutes * 60_000)
  const now = local.getUTCDay() * 1440 + local.getUTCHours() * 60 + local.getUTCMinutes()
  const week = 7 * 1440
  return hours.periods.some((period) => {
    const start = period.open.day * 1440 + period.open.hour * 60 + period.open.minute
    let end = period.close ? period.close.day * 1440 + period.close.hour * 60 + period.close.minute : start + week
    if (end <= start) end += week
    return (now >= start && now < end) || (now + week >= start && now + week < end)
  })
}

function nextBoundary(hours: google.maps.places.OpeningHours, utcOffsetMinutes: number, openNow: boolean) {
  const local = new Date(Date.now() + utcOffsetMinutes * 60_000)
  const now = local.getUTCDay() * 1440 + local.getUTCHours() * 60 + local.getUTCMinutes()
  const week = 7 * 1440
  const next = hours.periods.flatMap((period) => {
    const point = openNow ? period.close : period.open
    if (!point) return []
    const minute = point.day * 1440 + point.hour * 60 + point.minute
    return [{ point, delta: (minute - now + week) % week }]
  }).filter(({ delta }) => delta > 0).sort((a, b) => a.delta - b.delta)[0]
  if (!next || next.delta > 2 * 1440) return undefined
  const qualifier = next.delta < 1440 && Math.floor((now + next.delta) / 1440) === Math.floor(now / 1440)
    ? '' : next.delta < 2 * 1440 ? ' tomorrow' : ''
  return `${openNow ? 'Closes' : 'Opens'}${qualifier} at ${formatTime(next.point.hour, next.point.minute)}`
}

async function fetchCourseHours(course: Course): Promise<CourseHoursData | null> {
  const cached = cache.get(course.id)
  if (cached && cached.expires > Date.now()) return cached.value
  const { Place } = await loadPlacesLibrary()
  const { places } = await Place.searchByText({
    textQuery: `${course.name}, ${course.details?.address || `${course.city}, ${course.state}`}`,
    fields: ['displayName', 'location', 'businessStatus', 'currentOpeningHours', 'regularOpeningHours', 'utcOffsetMinutes'],
    locationBias: course.latitude !== undefined && course.longitude !== undefined ? { lat: course.latitude, lng: course.longitude } : undefined,
    language: 'en-US', region: 'us', maxResultCount: 1,
  })
  const place = places[0]
  const hours = place?.currentOpeningHours
  if (!place || !hours || place.utcOffsetMinutes === undefined) {
    cache.set(course.id, { expires: Date.now() + cacheDuration, value: null })
    return null
  }
  const value = {
    businessStatus: String(place.businessStatus), currentHours: hours,
    regularHours: place.regularOpeningHours, utcOffsetMinutes: place.utcOffsetMinutes,
  }
  cache.set(course.id, { expires: Date.now() + cacheDuration, value })
  return value
}

function describeHours(data: CourseHoursData, date?: string): CourseHoursResult {
  const local = new Date(Date.now() + data.utcOffsetMinutes * 60_000)
  const localDate = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`
  const targetDate = date || localDate
  const target = new Date(`${targetDate}T12:00:00Z`)
  const today = new Date(`${localDate}T12:00:00Z`)
  const dayDifference = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  const applicable = dayDifference >= 0 && dayDifference <= 6 ? data.currentHours : data.regularHours || data.currentHours
  const weekday = target.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  const hours = applicable.weekdayDescriptions.find((description) => description.toLowerCase().startsWith(weekday.toLowerCase()))?.replace(/^\w+:\s*/, '') || 'Closed'
  if (targetDate !== localDate) return { status: 'Course hours that day', hours, label: weekday }
  const openNow = isCurrentlyOpen(data.currentHours, data.utcOffsetMinutes)
  const boundary = nextBoundary(data.currentHours, data.utcOffsetMinutes, openNow)
  const operational = data.businessStatus === 'OPERATIONAL'
  return { openNow: operational ? openNow : false, status: operational ? `${openNow ? 'Open' : 'Closed'}${boundary ? ` · ${boundary}` : ''}` : data.businessStatus === 'CLOSED_TEMPORARILY' ? 'Temporarily closed' : 'Closed', hours, label: 'Today' }
}

export default function CourseHours(props: { course: Course; compact?: boolean; date?: string; inline?: boolean }) {
  const [hours, setHours] = createSignal<CourseHoursResult | null>()
  const [loading, setLoading] = createSignal(true)
  createEffect(() => {
    const course = props.course
    let current = true
    setLoading(true)
    setHours(undefined)
    const date = props.date
    void fetchCourseHours(course).then((value) => { if (current) setHours(value ? describeHours(value, date) : null) }).catch(() => { if (current) setHours(null) }).finally(() => { if (current) setLoading(false) })
    onCleanup(() => { current = false })
  })
  return <Show when={props.inline} fallback={<div class="course-hours" classList={{ compact: props.compact }} aria-live="polite"><Show when={!loading()} fallback={<span class="course-hours-loading">Checking course hours…</span>}><Show when={hours()} fallback={<span class="course-hours-unavailable">Course hours unavailable</span>}>{(value) => <><strong classList={{ open: value().openNow, closed: value().openNow === false }}>{value().status}</strong><span>{value().label}: {value().hours}</span></>}</Show></Show></div>}>
    <Show when={!loading()}><Show when={hours()}>{(value) => <span class="course-hours-inline" classList={{ open: value().openNow, closed: value().openNow === false }}>{value().status === 'Course hours that day' ? `${value().label.slice(0, 3)} hours: ${value().hours}` : value().status}</span>}</Show></Show>
  </Show>
}
