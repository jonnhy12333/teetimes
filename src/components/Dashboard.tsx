import { DatePicker, parseDate } from '@ark-ui/solid/date-picker'
import { createEffect, createMemo, createSignal, For, onMount, Show } from 'solid-js'

interface Course { id: string; name: string; city: string; state: string; bookingUrl: string; status?: 'active' | 'unsupported'; latitude?: number; longitude?: number; logoUrl?: string }
interface TeeTime { id: string; courseId: string; time: string; date: string; holes: number | string; price?: number; availableSpots?: number; bookingUrl: string }
type PlayerFilter = 'any' | 2 | 3 | 4
type TimeFilter = 'any' | 'next-3-hours' | 'morning' | 'afternoon' | 'after-work' | 'evening'
type SortMode = 'relevance' | 'availability' | 'walk-on' | 'distance'
type Coordinates = { latitude: number; longitude: number }

const apiBaseUrl = import.meta.env.VITE_API_URL || ''
const coursePreferencesKey = 'tee-times-course-preferences'
const locationKey = 'tee-times-location'
const dateValue = (date: Date) => date.toISOString().slice(0, 10)

function timeValue(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return Number.MAX_SAFE_INTEGER
  return ((Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(match[2])
}

function matchesTimeFilter(time: string, filter: TimeFilter) {
  const value = timeValue(time)
  if (filter === 'next-3-hours') { const now = new Date(); const currentMinutes = now.getHours() * 60 + now.getMinutes(); return value >= currentMinutes && value <= currentMinutes + 180 }
  if (filter === 'morning') return value < 12 * 60
  if (filter === 'afternoon') return value >= 12 * 60 && value < 17 * 60
  if (filter === 'after-work') return value >= 16 * 60
  if (filter === 'evening') return value >= 17 * 60
  return true
}

function distanceInMiles(from: Coordinates, course: Course) {
  if (course.latitude === undefined || course.longitude === undefined) return undefined
  const radians = (value: number) => value * Math.PI / 180
  const latitudeDelta = radians(course.latitude - from.latitude)
  const longitudeDelta = radians(course.longitude - from.longitude)
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(course.latitude)) * Math.sin(longitudeDelta / 2) ** 2
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function CalendarPicker(props: { value: string; label: string; onChange: (value: string) => void }) {
  return <DatePicker.Root value={[parseDate(props.value)]} min={parseDate(dateValue(new Date()))} fixedWeeks startOfWeek={0} positioning={{ placement: 'bottom-start', gutter: 8 }} onValueChange={(details) => { const value = details.value[0]?.toString(); if (value && value !== props.value) props.onChange(value) }}>
    <DatePicker.Trigger class="date-display" aria-label={`${props.label}. Open calendar`}>{props.label}</DatePicker.Trigger>
    <DatePicker.Positioner><DatePicker.Content class="calendar-popover"><DatePicker.View view="day"><DatePicker.ViewControl class="calendar-header"><DatePicker.PrevTrigger class="calendar-nav" aria-label="Previous month">‹</DatePicker.PrevTrigger><DatePicker.ViewTrigger class="calendar-month"><DatePicker.RangeText /></DatePicker.ViewTrigger><DatePicker.NextTrigger class="calendar-nav" aria-label="Next month">›</DatePicker.NextTrigger></DatePicker.ViewControl><DatePicker.Context>{(calendar) => <DatePicker.Table class="calendar-table"><DatePicker.TableHead><DatePicker.TableRow><For each={calendar().weekDays}>{(weekDay) => <DatePicker.TableHeader>{weekDay.short}</DatePicker.TableHeader>}</For></DatePicker.TableRow></DatePicker.TableHead><DatePicker.TableBody><For each={calendar().weeks}>{(week) => <DatePicker.TableRow><For each={week}>{(date) => <DatePicker.TableCell value={date}><DatePicker.TableCellTrigger>{date.day}</DatePicker.TableCellTrigger></DatePicker.TableCell>}</For></DatePicker.TableRow>}</For></DatePicker.TableBody></DatePicker.Table>}</DatePicker.Context></DatePicker.View></DatePicker.Content></DatePicker.Positioner>
  </DatePicker.Root>
}

export default function Dashboard() {
  const storedTheme = localStorage.getItem('theme')
  const [theme, setTheme] = createSignal<'light' | 'dark'>(storedTheme === 'dark' ? 'dark' : 'light')
  const [day, setDay] = createSignal(dateValue(new Date()))
  const [courses, setCourses] = createSignal<Course[]>([])
  const [teeTimes, setTeeTimes] = createSignal<TeeTime[]>([])
  const [favoriteIds, setFavoriteIds] = createSignal<string[]>([])
  const [preferencesLoaded, setPreferencesLoaded] = createSignal(false)
  const [players, setPlayers] = createSignal<PlayerFilter>('any')
  const [timeFilter, setTimeFilter] = createSignal<TimeFilter>('any')
  const [sortMode, setSortMode] = createSignal<SortMode>('relevance')
  const [query, setQuery] = createSignal('')
  const [location, setLocation] = createSignal<Coordinates | null>(null)
  const [locationError, setLocationError] = createSignal<string | null>(null)
  const [loadingCourseIds, setLoadingCourseIds] = createSignal<string[]>([])
  const [failedCourseIds, setFailedCourseIds] = createSignal<string[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  let loadRequest = 0

  createEffect(() => { document.documentElement.dataset.theme = theme(); localStorage.setItem('theme', theme()) })
  createEffect(() => { if (preferencesLoaded()) localStorage.setItem(coursePreferencesKey, JSON.stringify({ version: 2, courseIds: favoriteIds() })) })

  const dayLabel = () => {
    const selected = new Date(`${day()}T12:00:00`)
    const today = new Date()
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
    const prefix = day() === dateValue(today) ? 'Today' : day() === dateValue(tomorrow) ? 'Tomorrow' : selected.toLocaleDateString('en-US', { weekday: 'short' })
    return `${prefix}, ${selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  }
  const currentTimes = createMemo(() => teeTimes().filter((tee) => {
    const now = new Date()
    if (tee.date === dateValue(now) && timeValue(tee.time) < now.getHours() * 60 + now.getMinutes()) return false
    return true
  }))
  const filteredTimes = createMemo(() => currentTimes().filter((tee) => {
    if (!matchesTimeFilter(tee.time, timeFilter())) return false
    return players() === 'any' || (tee.availableSpots !== undefined && tee.availableSpots >= players())
  }))
  const timesFor = (courseId: string) => filteredTimes().filter((tee) => tee.courseId === courseId)
  const distanceFor = (course: Course) => location() ? distanceInMiles(location()!, course) : undefined
  const availabilityScore = (course: Course) => { const times = timesFor(course.id); return times.length + times.filter((tee) => (tee.availableSpots || 0) >= 4).length * 2 }
  const resultCourses = createMemo(() => {
    const normalizedQuery = query().trim().toLowerCase()
    return courses().filter((course) => !normalizedQuery || `${course.name} ${course.city} ${course.state}`.toLowerCase().includes(normalizedQuery)).filter((course) => loadingCourseIds().includes(course.id) || failedCourseIds().includes(course.id) || timesFor(course.id).length > 0).sort((a, b) => {
      if (sortMode() === 'availability') return availabilityScore(b) - availabilityScore(a) || a.name.localeCompare(b.name)
      if (sortMode() === 'walk-on') return availabilityScore(b) - availabilityScore(a) || (distanceFor(a) ?? Number.MAX_SAFE_INTEGER) - (distanceFor(b) ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name)
      if (sortMode() === 'distance' && location()) return (distanceFor(a) ?? Number.MAX_SAFE_INTEGER) - (distanceFor(b) ?? Number.MAX_SAFE_INTEGER)
      return Number(favoriteIds().includes(b.id)) - Number(favoriteIds().includes(a.id)) || timesFor(b.id).length - timesFor(a.id).length || a.name.localeCompare(b.name)
    })
  })
  const unavailableCourses = createMemo(() => {
    const normalizedQuery = query().trim().toLowerCase()
    return courses().filter((course) => !normalizedQuery || `${course.name} ${course.city} ${course.state}`.toLowerCase().includes(normalizedQuery)).filter((course) => !loadingCourseIds().includes(course.id) && !failedCourseIds().includes(course.id) && timesFor(course.id).length === 0).sort((a, b) => Number(favoriteIds().includes(b.id)) - Number(favoriteIds().includes(a.id)) || a.name.localeCompare(b.name))
  })
  function unavailableReason(courseId: string) {
    const courseTimes = currentTimes().filter((tee) => tee.courseId === courseId)
    if (!courseTimes.length) return 'No availability for this day'
    const timesInRange = courseTimes.filter((tee) => matchesTimeFilter(tee.time, timeFilter()))
    if (!timesInRange.length) return 'No times in the selected time range'
    if (players() !== 'any') return `No times for ${players()} players`
    return 'No times match the selected filters'
  }

  function readPreferences(list: Course[]) {
    try { const saved = JSON.parse(localStorage.getItem(coursePreferencesKey) || '') as { courseIds?: string[] }; if (Array.isArray(saved.courseIds)) setFavoriteIds(saved.courseIds.filter((id) => list.some((course) => course.id === id))) } catch { /* Ignore invalid preferences. */ }
    setPreferencesLoaded(true)
    try { const saved = JSON.parse(localStorage.getItem(locationKey) || '') as Coordinates; if (Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude)) setLocation(saved) } catch { /* No saved location. */ }
  }
  async function loadSearch(date: string) {
    const request = ++loadRequest
    setLoading(true); setError(null); setTeeTimes([]); setFailedCourseIds([])
    try {
      let list = courses()
      if (!list.length) {
        const response = await fetch(`${apiBaseUrl}/api/courses`); if (!response.ok) throw new Error()
        list = (await response.json() as Course[]).filter((course) => course.status !== 'unsupported')
        setCourses(list); readPreferences(list)
      }
      if (request !== loadRequest) return
      setLoadingCourseIds(list.map((course) => course.id))
      await Promise.all(list.map(async (course) => {
        try { const response = await fetch(`${apiBaseUrl}/api/courses/${course.id}/tee-times?date=${date}`); if (!response.ok) throw new Error(); const times = await response.json() as TeeTime[]; if (request === loadRequest) setTeeTimes((current) => [...current, ...times].sort((a, b) => timeValue(a.time) - timeValue(b.time))) }
        catch { if (request === loadRequest) setFailedCourseIds((ids) => [...ids, course.id]) }
        finally { if (request === loadRequest) setLoadingCourseIds((ids) => ids.filter((id) => id !== course.id)) }
      }))
    } catch { if (request === loadRequest) setError('Could not load tee times. Check that the backend is running.') }
    finally { if (request === loadRequest) setLoading(false) }
  }
  function changeDay(value: string) { setDay(value); void loadSearch(value) }
  function stepDay(amount: number) { const next = new Date(`${day()}T12:00:00`); next.setDate(next.getDate() + amount); changeDay(dateValue(next)) }
  function nextWeekday(weekday: 0 | 6) { const date = new Date(); date.setDate(date.getDate() + (weekday - date.getDay() + 7) % 7); return dateValue(date) }
  function showTonightAvailability() { setPlayers('any'); setTimeFilter('after-work'); setSortMode('availability'); changeDay(dateValue(new Date())) }
  function showPlayNow() { setPlayers('any'); setTimeFilter('next-3-hours'); setSortMode('walk-on'); changeDay(dateValue(new Date())); findNearMe('walk-on') }
  function findNearMe(sortAfter: SortMode = 'distance') {
    setLocationError(null)
    if (!navigator.geolocation) { setLocationError('Location is not supported by this browser.'); return }
    navigator.geolocation.getCurrentPosition(({ coords }) => { const next = { latitude: coords.latitude, longitude: coords.longitude }; setLocation(next); setSortMode(sortAfter); localStorage.setItem(locationKey, JSON.stringify(next)) }, () => setLocationError('Location permission was not available. Results are still ranked by availability.'))
  }
  function toggleFavorite(courseId: string) { setFavoriteIds((ids) => ids.includes(courseId) ? ids.filter((id) => id !== courseId) : [...ids, courseId]) }
  onMount(() => void loadSearch(day()))

  return <div class="container"><main class="dashboard search-dashboard">
    <section class="search-hero">
      <div class="search-title-row"><div><p class="eyebrow">TEE TIMES NEAR YOU</p><h1>When do you want to play?</h1><p class="search-intro">Search every course at once, then book directly with the course.</p></div><label class="theme-switch"><input type="checkbox" checked={theme() === 'dark'} onChange={() => setTheme(theme() === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode" /><span class="theme-switch-track"><span class="theme-switch-thumb" /></span><span class="theme-switch-text">{theme() === 'dark' ? 'Dark' : 'Light'}</span></label></div>
      <div class="quick-searches" aria-label="Quick searches"><button type="button" onClick={showPlayNow}><strong>Play right now</strong><span>Nearby courses with lots of openings</span></button><button type="button" onClick={showTonightAvailability}><strong>Tonight’s availability</strong><span>After 4 PM, most open times first</span></button><button type="button" onClick={() => changeDay(nextWeekday(6))}><strong>This Saturday</strong><span>Keep my time and players filters</span></button><button type="button" onClick={() => changeDay(nextWeekday(0))}><strong>This Sunday</strong><span>Keep my time and players filters</span></button></div>
      <div class="search-controls">
        <div class="search-control date-control"><label>Date</label><div class="board-date-nav"><button type="button" class="date-arrow" disabled={day() === dateValue(new Date())} onClick={() => stepDay(-1)} aria-label="Previous day">‹</button><CalendarPicker value={day()} label={dayLabel()} onChange={changeDay} /><button type="button" class="date-arrow" onClick={() => stepDay(1)} aria-label="Next day">›</button></div></div>
        <label class="search-control"><span>Time</span><select value={timeFilter()} onChange={(event) => setTimeFilter(event.currentTarget.value as TimeFilter)}><option value="any">Any time</option><option value="next-3-hours">Next 3 hours</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="after-work">After 4 PM</option><option value="evening">After 5 PM</option></select></label>
        <fieldset class="search-control search-players"><legend>Players</legend><div>{(['any', 2, 3, 4] as const).map((value) => <button type="button" classList={{ active: players() === value }} aria-pressed={players() === value} onClick={() => setPlayers(value)}>{value === 'any' ? 'Any' : value}</button>)}</div></fieldset>
        <div class="search-control location-control"><label>Location</label><button type="button" classList={{ active: Boolean(location()) }} onClick={() => findNearMe()}>{location() ? '✓ Near me' : '⌖ Use my location'}</button></div>
      </div>
      <Show when={locationError()}>{(message) => <p class="location-error">{message()}</p>}</Show>
    </section>
    <section class="search-results" aria-busy={loading()}>
      <div class="results-toolbar"><div><p class="eyebrow">AVAILABLE TEE TIMES</p><h2>{loading() ? 'Searching courses…' : `${resultCourses().filter((course) => timesFor(course.id).length).length} courses match`}</h2></div><div class="results-tools"><label class="course-query"><span class="sr-only">Search courses</span><input type="search" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="Course or town" /></label><label class="sort-control"><span>Sort</span><select value={sortMode()} onChange={(event) => setSortMode(event.currentTarget.value as SortMode)}><option value="relevance">Best match</option><option value="availability">Most availability</option><option value="walk-on">Walk-on potential</option><option value="distance" disabled={!location()}>Nearest</option></select></label><button type="button" class="refresh-btn" disabled={loading()} onClick={() => void loadSearch(day())} aria-label="Refresh tee times" title="Refresh tee times"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.4-2.5L20 9M4 15l2.5 2.5A7 7 0 0 0 17.9 15" /></svg></button></div></div>
      <Show when={error()}>{(message) => <div class="empty-state standalone">{message()}</div>}</Show>
      <div class="course-grid"><For each={resultCourses()}>{(course) => { const distance = () => distanceFor(course); const courseTimes = () => timesFor(course.id); return <article class="course-card search-course-row"><header class="course-card-header"><div class="course-avatar"><Show when={course.logoUrl} fallback={course.name.charAt(0)}>{(logo) => <img src={logo()} alt="" />}</Show></div><div class="course-card-title"><span class="course-name">{course.name}</span><p>{course.city}, {course.state}<Show when={distance() !== undefined}> · {distance()!.toFixed(1)} mi</Show></p><Show when={!loadingCourseIds().includes(course.id) && courseTimes().length > 0}><span class="match-summary">{courseTimes().length} matching {courseTimes().length === 1 ? 'time' : 'times'}<Show when={sortMode() === 'availability'}> · {courseTimes().filter((tee) => (tee.availableSpots || 0) >= 4).length} open foursomes</Show></span></Show></div><button type="button" class="favorite-btn" classList={{ active: favoriteIds().includes(course.id) }} aria-pressed={favoriteIds().includes(course.id)} aria-label={`${favoriteIds().includes(course.id) ? 'Remove' : 'Add'} ${course.name} ${favoriteIds().includes(course.id) ? 'from' : 'to'} favorites`} onClick={() => toggleFavorite(course.id)}>★</button></header><div class="tee-time-chips"><Show when={!loadingCourseIds().includes(course.id)} fallback={<div class="course-loading"><span class="loading-spinner" />Checking availability…</div>}><Show when={!failedCourseIds().includes(course.id)} fallback={<div class="course-empty">Couldn’t load this course.</div>}><For each={courseTimes()}>{(tee) => <a class="tee-time-chip" href={tee.bookingUrl} target="_blank" rel="noreferrer"><strong>{tee.time}</strong><span>{tee.price !== undefined ? `$${tee.price}` : `${tee.holes} holes`}{tee.availableSpots ? ` · ${tee.availableSpots} ${tee.availableSpots === 1 ? 'spot' : 'spots'}` : ''}</span></a>}</For></Show></Show></div></article> }}</For></div>
      <Show when={!loading() && unavailableCourses().length > 0}><section class="unavailable-results"><div class="unavailable-heading"><h3>No matching tee times</h3><span>{unavailableCourses().length} {unavailableCourses().length === 1 ? 'course' : 'courses'} checked</span></div><div class="unavailable-list"><For each={unavailableCourses()}>{(course) => <div class="unavailable-course"><div class="unavailable-course-identity"><div class="course-avatar compact"><Show when={course.logoUrl} fallback={course.name.charAt(0)}>{(logo) => <img src={logo()} alt="" />}</Show></div><div><strong>{course.name}</strong><span>{course.city}, {course.state}</span></div></div><p>{unavailableReason(course.id)}</p><a href={course.bookingUrl} target="_blank" rel="noreferrer">Booking site →</a></div>}</For></div></section></Show>
      <Show when={!loading() && !error() && resultCourses().length === 0 && unavailableCourses().length === 0}><div class="no-results"><h3>No courses match that search.</h3><p>Try another course name or town.</p><button type="button" onClick={() => { setPlayers('any'); setTimeFilter('any'); setQuery(''); setSortMode('relevance') }}>Clear filters</button></div></Show>
    </section>
  </main></div>
}
