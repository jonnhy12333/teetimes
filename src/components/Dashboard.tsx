import { DatePicker, parseDate } from '@ark-ui/solid/date-picker'
import { Slider } from '@ark-ui/solid/slider'
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { JSX } from 'solid-js'

interface Course { id: string; name: string; city: string; state: string; bookingUrl: string; websiteUrl?: string; status?: 'active' | 'unsupported'; latitude?: number; longitude?: number; logoUrl?: string }
interface TeeTime { id: string; courseId: string; time: string; date: string; holes: number | string; options?: Array<{ holes: 9 | 18; price?: number }>; price?: number; availableSpots?: number; bookingUrl: string }
type PlayerFilter = 'any' | 2 | 3 | 4
type HoleFilter = 'any' | 9 | 18
type TimeRange = [number, number]
type SortMode = 'relevance' | 'availability' | 'walk-on' | 'distance'
type EntryIntent = 'now' | 'tonight' | 'date'
type Coordinates = { latitude: number; longitude: number }

const apiBaseUrl = import.meta.env.VITE_API_URL || ''
const locationKey = 'tee-times-location'
const dateValue = (date: Date) => date.toISOString().slice(0, 10)
const playerFilters: PlayerFilter[] = ['any', 2, 3, 4]
const holeFilters: HoleFilter[] = ['any', 9, 18]
const sortModes: SortMode[] = ['relevance', 'availability', 'walk-on', 'distance']
const timeMinimum = 7 * 60
const timeMaximum = 19 * 60
const fullDayRange: TimeRange = [timeMinimum, timeMaximum]

function clampTime(value: number) {
  return Math.min(timeMaximum, Math.max(timeMinimum, Math.round(value / 15) * 15))
}

function parseTimeRange(params: URLSearchParams): TimeRange {
  const from = Number(params.get('from'))
  const to = Number(params.get('to'))
  if (Number.isFinite(from) && Number.isFinite(to) && from < to) {
    const range: TimeRange = [clampTime(from), clampTime(to)]
    if (range[0] < range[1]) return range
  }
  const legacy = params.get('time')
  if (legacy === 'morning') return [timeMinimum, 12 * 60]
  if (legacy === 'afternoon') return [12 * 60, 17 * 60]
  if (legacy === 'after-work') return [16 * 60, timeMaximum]
  if (legacy === 'evening') return [17 * 60, timeMaximum]
  if (legacy === 'next-3-hours') {
    const now = new Date()
    const start = Math.min(Math.max(timeMinimum, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15), timeMaximum - 15)
    return [start, Math.min(start + 180, timeMaximum)]
  }
  return [...fullDayRange]
}

function validDateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return dateValue(new Date())
  const parsed = new Date(`${value}T12:00:00`)
  return Number.isNaN(parsed.getTime()) || value < dateValue(new Date()) ? dateValue(new Date()) : value
}

function initialSearchState() {
  const params = new URLSearchParams(window.location.search)
  const shouldSearch = ['date', 'time', 'from', 'to', 'players', 'holes', 'sort', 'course'].some((key) => params.has(key))
  const playerParam = params.get('players') === 'any' ? 'any' : Number(params.get('players'))
  const holeParam = params.get('holes') === 'any' ? 'any' : Number(params.get('holes'))
  return {
    day: validDateParam(params.get('date')),
    players: playerFilters.includes(playerParam as PlayerFilter) ? playerParam as PlayerFilter : 'any' as PlayerFilter,
    holes: holeFilters.includes(holeParam as HoleFilter) ? holeParam as HoleFilter : 'any' as HoleFilter,
    timeRange: parseTimeRange(params),
    sort: sortModes.includes(params.get('sort') as SortMode) ? params.get('sort') as SortMode : 'relevance' as SortMode,
    course: params.get('course') || '',
    shouldSearch,
  }
}

function timeValue(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return Number.MAX_SAFE_INTEGER
  return ((Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(match[2])
}

function matchesTimeRange(time: string, range: TimeRange) {
  const value = timeValue(time)
  return value >= range[0] && value <= range[1]
}

function formatMinutes(value: number) {
  const hour = Math.floor(value / 60)
  const minutes = value % 60
  return `${hour % 12 || 12}:${String(minutes).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
}

function distanceInMiles(from: Coordinates, course: Course) {
  if (course.latitude === undefined || course.longitude === undefined) return undefined
  const radians = (value: number) => value * Math.PI / 180
  const latitudeDelta = radians(course.latitude - from.latitude)
  const longitudeDelta = radians(course.longitude - from.longitude)
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(course.latitude)) * Math.sin(longitudeDelta / 2) ** 2
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function googleMapsUrl(course: Course) {
  const query = `${course.name}, ${course.city}, ${course.state}`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

function CalendarPicker(props: { value: string; label: string; onChange: (value: string) => void }) {
  return <DatePicker.Root value={[parseDate(props.value)]} min={parseDate(dateValue(new Date()))} fixedWeeks startOfWeek={0} positioning={{ placement: 'bottom', gutter: 8 }} onValueChange={(details) => { const value = details.value[0]?.toString(); if (value && value !== props.value) props.onChange(value) }}>
    <DatePicker.Trigger class="date-display" aria-label={`${props.label}. Open calendar`}>{props.label}</DatePicker.Trigger>
    <DatePicker.Positioner class="calendar-positioner"><DatePicker.Content class="calendar-popover"><DatePicker.View view="day"><DatePicker.ViewControl class="calendar-header"><DatePicker.PrevTrigger class="calendar-nav" aria-label="Previous month">‹</DatePicker.PrevTrigger><DatePicker.ViewTrigger class="calendar-month"><DatePicker.RangeText /></DatePicker.ViewTrigger><DatePicker.NextTrigger class="calendar-nav" aria-label="Next month">›</DatePicker.NextTrigger></DatePicker.ViewControl><DatePicker.Context>{(calendar) => <DatePicker.Table class="calendar-table"><DatePicker.TableHead><DatePicker.TableRow><For each={calendar().weekDays}>{(weekDay) => <DatePicker.TableHeader>{weekDay.short}</DatePicker.TableHeader>}</For></DatePicker.TableRow></DatePicker.TableHead><DatePicker.TableBody><For each={calendar().weeks}>{(week) => <DatePicker.TableRow><For each={week}>{(date) => <DatePicker.TableCell value={date}><DatePicker.TableCellTrigger>{date.day}</DatePicker.TableCellTrigger></DatePicker.TableCell>}</For></DatePicker.TableRow>}</For></DatePicker.TableBody></DatePicker.Table>}</DatePicker.Context></DatePicker.View></DatePicker.Content></DatePicker.Positioner>
  </DatePicker.Root>
}

function TimeRangePicker(props: { value: TimeRange; onChange: (value: TimeRange) => void; compact?: boolean }) {
  return <Slider.Root class="time-range-picker" min={timeMinimum} max={timeMaximum} step={15} minStepsBetweenThumbs={1} value={props.value} onValueChange={(details) => props.onChange(details.value as TimeRange)}>
    <div class="time-range-heading"><Slider.Label>Time</Slider.Label><strong>{formatMinutes(props.value[0])} to {formatMinutes(props.value[1])}</strong></div>
    <Slider.Control class="time-range-control">
      <Slider.Track class="time-range-track"><Slider.Range class="time-range-fill" /></Slider.Track>
      <Slider.Thumb class="time-range-thumb" index={0} aria-label="Earliest tee time"><Slider.HiddenInput /></Slider.Thumb>
      <Slider.Thumb class="time-range-thumb" index={1} aria-label="Latest tee time"><Slider.HiddenInput /></Slider.Thumb>
    </Slider.Control>
    <div class="time-range-scale" aria-hidden="true"><span>7 AM</span><span>1 PM</span><span>7 PM</span></div>
  </Slider.Root>
}

function TeeTimeScroller(props: { children: JSX.Element; courseName: string }) {
  let scroller!: HTMLDivElement
  const [canScrollLeft, setCanScrollLeft] = createSignal(false)
  const [canScrollRight, setCanScrollRight] = createSignal(false)
  const updateEdges = () => {
    setCanScrollLeft(scroller.scrollLeft > 2)
    setCanScrollRight(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 2)
  }
  const scroll = (direction: -1 | 1) => scroller.scrollBy({ left: direction * Math.max(240, scroller.clientWidth * .78), behavior: 'smooth' })
  onMount(() => {
    const resizeObserver = new ResizeObserver(updateEdges)
    const mutationObserver = new MutationObserver(updateEdges)
    resizeObserver.observe(scroller)
    mutationObserver.observe(scroller, { childList: true, subtree: true })
    requestAnimationFrame(updateEdges)
    onCleanup(() => { resizeObserver.disconnect(); mutationObserver.disconnect() })
  })
  return <div class="tee-time-scroller">
    <button type="button" class="tee-scroll-arrow tee-scroll-left" classList={{ visible: canScrollLeft() }} onClick={() => scroll(-1)} aria-label={`Show earlier tee times for ${props.courseName}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6" /></svg></button>
    <div class="tee-time-chips" ref={scroller} onScroll={updateEdges}>{props.children}</div>
    <button type="button" class="tee-scroll-arrow tee-scroll-right" classList={{ visible: canScrollRight() }} onClick={() => scroll(1)} aria-label={`Show later tee times for ${props.courseName}`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6" /></svg></button>
  </div>
}

export default function Dashboard() {
  const initialSearch = initialSearchState()
  const entryClock = new Date()
  const combineImmediateChoices = Math.ceil((entryClock.getHours() * 60 + entryClock.getMinutes()) / 15) * 15 >= 16 * 60
  const storedTheme = localStorage.getItem('theme')
  const [theme, setTheme] = createSignal<'light' | 'dark'>(storedTheme === 'dark' ? 'dark' : 'light')
  const [day, setDay] = createSignal(initialSearch.day)
  const [courses, setCourses] = createSignal<Course[]>([])
  const [searchedCourseIds, setSearchedCourseIds] = createSignal<string[]>([])
  const [selectedEntryCourse, setSelectedEntryCourse] = createSignal(initialSearch.course)
  const [teeTimes, setTeeTimes] = createSignal<TeeTime[]>([])
  const [players, setPlayers] = createSignal<PlayerFilter>(initialSearch.players)
  const [holes, setHoles] = createSignal<HoleFilter>(initialSearch.holes)
  const [timeRange, setTimeRange] = createSignal<TimeRange>(initialSearch.timeRange)
  const [sortMode, setSortMode] = createSignal<SortMode>(initialSearch.sort)
  const [location, setLocation] = createSignal<Coordinates | null>(null)
  const [locationError, setLocationError] = createSignal<string | null>(null)
  const [loadingCourseIds, setLoadingCourseIds] = createSignal<string[]>([])
  const [failedCourseIds, setFailedCourseIds] = createSignal<string[]>([])
  const [searchActivated, setSearchActivated] = createSignal(initialSearch.shouldSearch)
  const [loading, setLoading] = createSignal(initialSearch.shouldSearch)
  const [error, setError] = createSignal<string | null>(null)
  const [openMenu, setOpenMenu] = createSignal<string | null>(null)
  const [coursePickerOpen, setCoursePickerOpen] = createSignal(false)
  const [choosingDate, setChoosingDate] = createSignal(false)
  const [entryIntent, setEntryIntent] = createSignal<EntryIntent>('now')
  let loadRequest = 0

  createEffect(() => { document.documentElement.dataset.theme = theme(); localStorage.setItem('theme', theme()) })
  createEffect(() => {
    if (!searchActivated()) return
    const params = new URLSearchParams()
    params.set('date', day())
    if (timeRange()[0] !== timeMinimum) params.set('from', String(timeRange()[0]))
    if (timeRange()[1] !== timeMaximum) params.set('to', String(timeRange()[1]))
    if (players() !== 'any') params.set('players', String(players()))
    if (holes() !== 'any') params.set('holes', String(holes()))
    if (sortMode() !== 'relevance') params.set('sort', sortMode())
    if (selectedEntryCourse()) params.set('course', selectedEntryCourse())
    const nextUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`
    window.history.replaceState(null, '', nextUrl)
  })

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
    const requestedPlayers = players()
    if (!matchesTimeRange(tee.time, timeRange())) return false
    if (holes() !== 'any' && !tee.options?.some((option) => option.holes === holes()) && tee.holes !== holes() && tee.holes !== '9/18') return false
    return requestedPlayers === 'any' || (tee.availableSpots !== undefined && tee.availableSpots >= requestedPlayers)
  }))
  const displayOption = (tee: TeeTime) => holes() === 'any' ? undefined : tee.options?.find((option) => option.holes === holes())
  const timesFor = (courseId: string) => filteredTimes().filter((tee) => tee.courseId === courseId)
  const distanceFor = (course: Course) => location() ? distanceInMiles(location()!, course) : undefined
  const availabilityScore = (course: Course) => { const times = timesFor(course.id); return times.length + times.filter((tee) => (tee.availableSpots || 0) >= 4).length * 2 }
  const selectedCourse = createMemo(() => courses().find((course) => course.id === selectedEntryCourse()))
  const resultCourses = createMemo(() => {
    return courses().filter((course) => searchedCourseIds().includes(course.id)).filter((course) => loadingCourseIds().includes(course.id) || failedCourseIds().includes(course.id) || timesFor(course.id).length > 0).sort((a, b) => {
      if (sortMode() === 'availability') return availabilityScore(b) - availabilityScore(a) || a.name.localeCompare(b.name)
      if (sortMode() === 'walk-on') return availabilityScore(b) - availabilityScore(a) || (distanceFor(a) ?? Number.MAX_SAFE_INTEGER) - (distanceFor(b) ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name)
      if (sortMode() === 'distance' && location()) return (distanceFor(a) ?? Number.MAX_SAFE_INTEGER) - (distanceFor(b) ?? Number.MAX_SAFE_INTEGER)
      return timesFor(b.id).length - timesFor(a.id).length || a.name.localeCompare(b.name)
    })
  })
  const unavailableCourses = createMemo(() => {
    return courses().filter((course) => searchedCourseIds().includes(course.id)).filter((course) => !loadingCourseIds().includes(course.id) && !failedCourseIds().includes(course.id) && timesFor(course.id).length === 0).sort((a, b) => a.name.localeCompare(b.name))
  })
  function unavailableReason(courseId: string) {
    const courseTimes = currentTimes().filter((tee) => tee.courseId === courseId)
    if (!courseTimes.length) return 'No availability for this day'
    const timesInRange = courseTimes.filter((tee) => matchesTimeRange(tee.time, timeRange()))
    if (!timesInRange.length) return 'No times in the selected time range'
    const timesWithHoles = holes() === 'any' ? timesInRange : timesInRange.filter((tee) => tee.options?.some((option) => option.holes === holes()) || tee.holes === holes() || tee.holes === '9/18')
    if (!timesWithHoles.length) return `No ${holes()}-hole times match`
    if (players() !== 'any') return `No ${holes() === 'any' ? '' : `${holes()}-hole `}times for ${players()} players`
    return 'No times match the selected filters'
  }

  function readSavedLocation() {
    try { const saved = JSON.parse(localStorage.getItem(locationKey) || '') as Coordinates; if (Number.isFinite(saved.latitude) && Number.isFinite(saved.longitude)) setLocation(saved) } catch { /* No saved location. */ }
  }
  async function loadCourseCatalog() {
    if (courses().length) return courses()
    const response = await fetch(`${apiBaseUrl}/api/courses`)
    if (!response.ok) throw new Error()
    const list = (await response.json() as Course[]).filter((course) => course.status !== 'unsupported')
    setCourses(list)
    readSavedLocation()
    if (selectedEntryCourse() && !list.some((course) => course.id === selectedEntryCourse())) setSelectedEntryCourse('')
    return list
  }
  async function loadSearch(date: string) {
    const request = ++loadRequest
    setLoading(true); setError(null); setTeeTimes([]); setFailedCourseIds([])
    try {
      const allCourses = await loadCourseCatalog()
      const list = selectedEntryCourse() ? allCourses.filter((course) => course.id === selectedEntryCourse()) : allCourses
      if (request !== loadRequest) return
      setSearchedCourseIds(list.map((course) => course.id))
      setLoadingCourseIds(list.map((course) => course.id))
      await Promise.all(list.map(async (course) => {
        try { const response = await fetch(`${apiBaseUrl}/api/courses/${course.id}/tee-times?date=${date}`); if (!response.ok) throw new Error(); const times = await response.json() as TeeTime[]; if (request === loadRequest) setTeeTimes((current) => [...current, ...times].sort((a, b) => timeValue(a.time) - timeValue(b.time))) }
        catch { if (request === loadRequest) setFailedCourseIds((ids) => [...ids, course.id]) }
        finally { if (request === loadRequest) setLoadingCourseIds((ids) => ids.filter((id) => id !== course.id)) }
      }))
    } catch { if (request === loadRequest) setError('Could not load tee times. Check that the backend is running.') }
    finally { if (request === loadRequest) setLoading(false) }
  }
  function changeDay(value: string) { setDay(value); if (searchActivated()) void loadSearch(value) }
  function stepDay(amount: number) { const next = new Date(`${day()}T12:00:00`); next.setDate(next.getDate() + amount); changeDay(dateValue(next)) }
  function activateSearch() {
    if (!searchActivated()) window.history.pushState(null, '', window.location.pathname)
    setSearchActivated(true)
  }
  function runSearch() { activateSearch(); void loadSearch(day()) }
  function startNewSearch() {
    window.history.pushState(null, '', window.location.pathname)
    setSearchActivated(false)
    setChoosingDate(false)
    setTeeTimes([])
    setSearchedCourseIds([])
    setLoading(false)
    setError(null)
    setLocationError(null)
  }
  function playNowRange(): TimeRange { const now = new Date(); const start = Math.min(Math.max(timeMinimum, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15), timeMaximum - 15); return [start, Math.min(start + 180, timeMaximum)] }
  function searchPlayNow() { const today = dateValue(new Date()); activateSearch(); setPlayers('any'); setHoles('any'); setTimeRange(playNowRange()); setSortMode('walk-on'); setDay(today); void loadSearch(today); findNearMe('walk-on') }
  function searchTonight() { const today = dateValue(new Date()); activateSearch(); setPlayers('any'); setHoles('any'); setTimeRange([16 * 60, timeMaximum]); setSortMode('availability'); setDay(today); void loadSearch(today) }
  function submitEntrySearch() {
    if (entryIntent() === 'now') searchPlayNow()
    else if (entryIntent() === 'tonight' && !combineImmediateChoices) searchTonight()
    else if (entryIntent() === 'tonight') searchPlayNow()
    else { setTimeRange([...fullDayRange]); runSearch() }
  }
  function chooseSortMode(next: SortMode) {
    if (next === 'distance' && !location()) { findNearMe('distance'); return }
    setSortMode(next)
  }
  function findNearMe(sortAfter: SortMode = 'distance') {
    setLocationError(null)
    if (!navigator.geolocation) { if (sortAfter === 'distance') setSortMode('relevance'); setLocationError('Location is not supported by this browser.'); return }
    navigator.geolocation.getCurrentPosition(({ coords }) => { const next = { latitude: coords.latitude, longitude: coords.longitude }; setLocation(next); setSortMode(sortAfter); localStorage.setItem(locationKey, JSON.stringify(next)) }, () => { if (sortAfter === 'distance') setSortMode('relevance'); setLocationError('Location permission was not available. Using Best match instead.') })
  }
  onMount(() => {
    if (searchActivated()) void loadSearch(day())
    else void loadCourseCatalog().catch(() => setError('Could not load the course list.'))
    const closeOnOutsideClick = (event: PointerEvent) => { const target = event.target as Element; if (!target.closest('[data-menu-root]')) setOpenMenu(null); if (!target.closest('[data-course-picker]')) setCoursePickerOpen(false) }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpenMenu(null); setCoursePickerOpen(false) } }
    const restoreFromUrl = () => {
      const restored = initialSearchState()
      const wasActive = searchActivated()
      setSearchActivated(restored.shouldSearch)
      const dateChanged = restored.day !== day()
      setDay(restored.day)
      setPlayers(restored.players)
      setHoles(restored.holes)
      setTimeRange(restored.timeRange)
      setSortMode(restored.sort)
      setSelectedEntryCourse(restored.course)
      if (restored.shouldSearch && (dateChanged || !wasActive)) void loadSearch(restored.day)
      if (!restored.shouldSearch) { setTeeTimes([]); setLoading(false); setError(null) }
      if (restored.shouldSearch && restored.sort === 'distance' && !location()) findNearMe('distance')
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('popstate', restoreFromUrl)
    if (initialSearch.sort === 'distance') findNearMe('distance')
    onCleanup(() => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('popstate', restoreFromUrl)
    })
  })

  const ThemeSwitch = () => <label class="theme-switch"><input type="checkbox" checked={theme() === 'dark'} onChange={() => setTheme(theme() === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode" /><span class="theme-switch-track"><span class="theme-switch-thumb" /></span><span class="theme-switch-text">{theme() === 'dark' ? 'Dark' : 'Light'}</span></label>

  return <div class="container"><main class="dashboard search-dashboard">
    <Show when={searchActivated()} fallback={<>
      <header class="entry-topbar"><ThemeSwitch /></header>
      <section class="entry-screen">
        <div class="entry-copy"><p class="eyebrow">TEE TIMES NEAR YOU</p><h1>What kind of round are you looking for?</h1><p>Choose your search, optionally narrow it to one course, then find tee times.</p></div>
        <div class="entry-choices" role="radiogroup" aria-label="When do you want to play?">
          <button type="button" role="radio" aria-checked={entryIntent() === 'now'} classList={{ active: entryIntent() === 'now' }} onClick={() => { setEntryIntent('now'); setChoosingDate(false) }}><strong>Play now</strong><span>Today · next 3 hours</span></button>
          <Show when={!combineImmediateChoices}><button type="button" role="radio" aria-checked={entryIntent() === 'tonight'} classList={{ active: entryIntent() === 'tonight' }} onClick={() => { setEntryIntent('tonight'); setChoosingDate(false) }}><strong>Play tonight</strong><span>Today · after 4 PM</span></button></Show>
          <button type="button" role="radio" aria-checked={entryIntent() === 'date'} classList={{ active: entryIntent() === 'date' }} onClick={() => { setEntryIntent('date'); setChoosingDate(true) }}><strong>Choose a date</strong><span>Open the calendar</span></button>
        </div>
        <Show when={choosingDate()}><div class="entry-date"><div class="search-control date-control"><label>Date</label><div class="board-date-nav"><button type="button" class="date-arrow" disabled={day() === dateValue(new Date())} onClick={() => stepDay(-1)} aria-label="Previous day">‹</button><CalendarPicker value={day()} label={dayLabel()} onChange={changeDay} /><button type="button" class="date-arrow" onClick={() => stepDay(1)} aria-label="Next day">›</button></div></div></div></Show>
        <div class="entry-course-choice" data-course-picker>
          <label>Have a course in mind?</label>
          <button type="button" class="course-picker-trigger" aria-haspopup="listbox" aria-expanded={coursePickerOpen()} onClick={() => setCoursePickerOpen(!coursePickerOpen())}><Show when={selectedCourse()} fallback={<div class="course-picker-all-icon">All</div>}>{(course) => <div class="course-avatar compact"><Show when={course().logoUrl} fallback={course().name.charAt(0)}>{(logo) => <img src={logo()} alt="" />}</Show></div>}</Show><span><strong>{selectedCourse()?.name || 'Search all courses'}</strong><small>{selectedCourse() ? `${selectedCourse()!.city}, ${selectedCourse()!.state}` : 'Compare every available course'}</small></span><svg class="course-picker-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9.5 5 5 5-5" /></svg></button>
          <Show when={coursePickerOpen()}><div class="course-picker-menu" role="listbox" aria-label="Choose a course"><button type="button" role="option" aria-selected={!selectedEntryCourse()} onClick={() => { setSelectedEntryCourse(''); setCoursePickerOpen(false) }}><div class="course-picker-all-icon">All</div><span><strong>Search all courses</strong><small>Compare every available course</small></span></button><For each={courses()}>{(course) => <button type="button" role="option" aria-selected={selectedEntryCourse() === course.id} onClick={() => { setSelectedEntryCourse(course.id); setCoursePickerOpen(false) }}><div class="course-avatar compact"><Show when={course.logoUrl} fallback={course.name.charAt(0)}>{(logo) => <img src={logo()} alt="" />}</Show></div><span><strong>{course.name}</strong><small>{course.city}, {course.state}</small></span></button>}</For></div></Show>
          <span class="course-picker-help">{selectedEntryCourse() ? 'We’ll check only this course.' : 'Optional — the default searches every course.'}</span>
        </div>
        <button type="button" class="entry-submit" onClick={submitEntrySearch}>Find tee times</button>
        <Show when={error()}>{(message) => <p class="entry-error">{message()}</p>}</Show>
      </section>
    </>}>
    <header class="results-header"><button type="button" class="new-search-btn" onClick={startNewSearch} aria-label="Start a new search" title="New search"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg></button><div class="board-date-nav"><button type="button" class="date-arrow" disabled={day() === dateValue(new Date())} onClick={() => stepDay(-1)} aria-label="Previous day">‹</button><CalendarPicker value={day()} label={dayLabel()} onChange={changeDay} /><button type="button" class="date-arrow" onClick={() => stepDay(1)} aria-label="Next day">›</button></div><ThemeSwitch /></header>
    <section class="search-results" aria-busy={loading()}>
      <div class="results-toolbar"><div><p class="eyebrow">AVAILABLE TEE TIMES</p><h2>{loading() ? (selectedCourse() ? `Checking ${selectedCourse()!.name}…` : 'Searching courses…') : (selectedCourse()?.name || `${resultCourses().filter((course) => timesFor(course.id).length).length} courses match`)}</h2></div><div class="results-tools"><Show when={!selectedEntryCourse()}><label class="sort-control"><span>Order by</span><select value={sortMode()} onChange={(event) => chooseSortMode(event.currentTarget.value as SortMode)}><option value="relevance">Best match</option><option value="availability">Most availability</option><option value="walk-on">Walk-on potential</option><option value="distance">Nearest</option></select></label></Show><button type="button" class="refresh-btn" disabled={loading()} onClick={() => void loadSearch(day())} aria-label="Refresh tee times" title="Refresh tee times"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.4-2.5L20 9M4 15l2.5 2.5A7 7 0 0 0 17.9 15" /></svg></button></div></div>
      <div class="result-filters" aria-label="Refine results"><div class="result-time"><TimeRangePicker value={timeRange()} onChange={setTimeRange} /></div><fieldset class="search-control search-players"><legend>Players</legend><div>{(['any', 2, 3, 4] as const).map((value) => <button type="button" classList={{ active: players() === value }} aria-pressed={players() === value} onClick={() => setPlayers(value)}>{value === 'any' ? 'Any' : value}</button>)}</div></fieldset><fieldset class="search-control search-holes"><legend>Holes</legend><div>{(['any', 9, 18] as const).map((value) => <button type="button" classList={{ active: holes() === value }} aria-pressed={holes() === value} onClick={() => setHoles(value)}>{value === 'any' ? 'Any' : value}</button>)}</div></fieldset></div>
      <Show when={locationError()}>{(message) => <p class="location-error result-location-error">{message()}</p>}</Show>
      <Show when={error()}>{(message) => <div class="empty-state standalone">{message()}</div>}</Show>
      <div class="course-grid"><For each={resultCourses()}>{(course) => { const distance = () => distanceFor(course); const courseTimes = () => timesFor(course.id); return <article class="course-card search-course-row"><header class="course-card-header"><div class="course-avatar"><Show when={course.logoUrl} fallback={course.name.charAt(0)}>{(logo) => <img src={logo()} alt="" />}</Show></div><div class="course-card-title"><span class="course-name">{course.name}</span><p>{course.city}, {course.state}<Show when={distance() !== undefined}> · {distance()!.toFixed(1)} mi</Show></p><Show when={!loadingCourseIds().includes(course.id) && courseTimes().length > 0}><span class="match-summary">{courseTimes().length} matching {courseTimes().length === 1 ? 'time' : 'times'}<Show when={sortMode() === 'availability'}> · {courseTimes().filter((tee) => (tee.availableSpots || 0) >= 4).length} open foursomes</Show></span></Show></div><div class="course-options" data-menu-root><button type="button" class="course-options-trigger" aria-label={`More options for ${course.name}`} aria-expanded={openMenu() === course.id} aria-haspopup="menu" onClick={() => setOpenMenu(openMenu() === course.id ? null : course.id)}>•••</button><Show when={openMenu() === course.id}><div class="course-menu-popover course-links-menu" role="menu"><a role="menuitem" href={googleMapsUrl(course)} target="_blank" rel="noreferrer" onClick={() => setOpenMenu(null)}>View on Google Maps</a><Show when={course.websiteUrl}><a role="menuitem" href={course.websiteUrl} target="_blank" rel="noreferrer" onClick={() => setOpenMenu(null)}>Visit course website</a></Show><a role="menuitem" href={course.bookingUrl} target="_blank" rel="noreferrer" onClick={() => setOpenMenu(null)}>Open booking site</a></div></Show></div></header><TeeTimeScroller courseName={course.name}><Show when={!loadingCourseIds().includes(course.id)} fallback={<div class="course-loading"><span class="loading-spinner" />Checking availability…</div>}><Show when={!failedCourseIds().includes(course.id)} fallback={<div class="course-empty">Couldn’t load this course.</div>}><For each={courseTimes()}>{(tee) => { const option = () => displayOption(tee); const shownPrice = () => option()?.price ?? tee.price; const shownHoles = () => holes() === 'any' ? tee.holes : holes(); return <a class="tee-time-chip" classList={{ 'availability-best': (tee.availableSpots || 0) >= 4, 'availability-low': tee.availableSpots === 1 }} href={tee.bookingUrl} target="_blank" rel="noreferrer"><strong>{tee.time}</strong><span class="tee-time-holes">{shownHoles()}</span><span class="tee-time-meta">{shownPrice() !== undefined ? String.fromCharCode(36) + shownPrice() : ''}{shownPrice() !== undefined && tee.availableSpots ? ' · ' : ''}{tee.availableSpots ? `${tee.availableSpots} ${tee.availableSpots === 1 ? 'spot' : 'spots'}` : ''}</span></a> }}</For></Show></Show></TeeTimeScroller></article> }}</For></div>
      <Show when={!loading() && unavailableCourses().length > 0}><section class="unavailable-results"><div class="unavailable-heading"><h3>No matching tee times</h3><span>{unavailableCourses().length} {unavailableCourses().length === 1 ? 'course' : 'courses'} checked</span></div><div class="unavailable-list"><For each={unavailableCourses()}>{(course) => { const menuId = `unavailable-${course.id}`; return <article class="unavailable-course"><header class="unavailable-course-header"><div class="unavailable-course-identity"><div class="course-avatar"><Show when={course.logoUrl} fallback={course.name.charAt(0)}>{(logo) => <img src={logo()} alt="" />}</Show></div><div><strong>{course.name}</strong><span>{course.city}, {course.state}</span></div></div><div class="course-options unavailable-options" data-menu-root><button type="button" class="course-options-trigger" aria-label={`More options for ${course.name}`} aria-expanded={openMenu() === menuId} aria-haspopup="menu" onClick={() => setOpenMenu(openMenu() === menuId ? null : menuId)}>•••</button><Show when={openMenu() === menuId}><div class="course-menu-popover course-links-menu" role="menu"><a role="menuitem" href={googleMapsUrl(course)} target="_blank" rel="noreferrer" onClick={() => setOpenMenu(null)}>View on Google Maps</a><Show when={course.websiteUrl}><a role="menuitem" href={course.websiteUrl} target="_blank" rel="noreferrer" onClick={() => setOpenMenu(null)}>Visit course website</a></Show><a role="menuitem" href={course.bookingUrl} target="_blank" rel="noreferrer" onClick={() => setOpenMenu(null)}>Open booking site</a></div></Show></div></header><div class="unavailable-message">{unavailableReason(course.id)}</div></article> }}</For></div></section></Show>
      <Show when={!loading() && !error() && resultCourses().length === 0 && unavailableCourses().length === 0}><div class="no-results"><h3>No tee times match those filters.</h3><p>Try a wider time range or different player and hole options.</p><button type="button" onClick={() => { setPlayers('any'); setHoles('any'); setTimeRange([...fullDayRange]); setSortMode('relevance') }}>Clear filters</button></div></Show>
    </section>
    </Show>
  </main></div>
}
