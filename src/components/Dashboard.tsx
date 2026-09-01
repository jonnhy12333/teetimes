import { DatePicker, parseDate } from '@ark-ui/solid/date-picker'
import { Slider } from '@ark-ui/solid/slider'
import { createEffect, createMemo, createSignal, For, lazy, onCleanup, onMount, Show, Suspense } from 'solid-js'
import type { JSX } from 'solid-js'
import { appReleases, latestReleaseId } from '../releases'

const CourseMap = lazy(() => import('./CourseMap'))

interface CourseTee { name: string; yardage?: number; rating?: number; slope?: number }
interface CourseDetails { type?: string; holes?: number; par?: number; yardageMin?: number; yardageMax?: number; address?: string; phone?: string; description?: string; walkingPolicy?: string; amenities?: string[]; tees?: CourseTee[] }
export interface Course { id: string; name: string; city: string; state: string; bookingUrl: string; websiteUrl?: string; status?: 'active' | 'unsupported'; latitude?: number; longitude?: number; logoUrl?: string; headerImageUrl?: string; details?: CourseDetails }
export interface TeeTime { id: string; courseId: string; time: string; date: string; holes: number | string; options?: Array<{ holes: 9 | 18; price?: number }>; price?: number; availableSpots?: number; bookingUrl: string }
interface SelectedTeeTime { course: Course; tee: TeeTime; price?: number; holes: number | string }
interface WeatherHour { time: string; temperature?: number; apparentTemperature?: number; weatherCode?: number; windSpeed?: number; windGust?: number; precipitationProbability?: number }
interface OpenMeteoWeather {
  hourly?: {
    time?: string[]
    temperature_2m?: number[]
    apparent_temperature?: number[]
    weather_code?: number[]
    wind_speed_10m?: number[]
    wind_gusts_10m?: number[]
    precipitation_probability?: number[]
  }
}
type PlayerFilter = 'any' | 2 | 3 | 4
type HoleFilter = 'any' | 9 | 18
type TimeRange = [number, number]
type EntryIntent = 'now' | 'tonight' | 'tomorrow' | 'date'
type Coordinates = { latitude: number; longitude: number }
type CourseSort = 'name' | 'nearest' | 'availability'
type ResultsView = 'timeline' | 'map'

const apiBaseUrl = import.meta.env.VITE_API_URL || ''
const courseRailKey = 'tee-times-course-rail-collapsed'
const courseFilterKey = 'tee-times-course-filters-v3'
const lastSeenReleaseKey = 'tee-times-last-seen-release'
const dateValue = (date: Date) => date.toISOString().slice(0, 10)
const playerFilters: PlayerFilter[] = ['any', 2, 3, 4]
const holeFilters: HoleFilter[] = ['any', 9, 18]
const timeMinimum = 7 * 60
const timeMaximum = 19 * 60
const fullDayRange: TimeRange = [timeMinimum, timeMaximum]

function validDateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return dateValue(new Date())
  const parsed = new Date(`${value}T12:00:00`)
  return Number.isNaN(parsed.getTime()) || value < dateValue(new Date()) ? dateValue(new Date()) : value
}

function automaticTimeRange(day: string): TimeRange {
  if (day !== dateValue(new Date())) return [...fullDayRange]
  const now = new Date()
  const minutes = Math.floor((now.getHours() * 60 + now.getMinutes()) / 15) * 15
  return [Math.min(Math.max(timeMinimum, minutes), timeMaximum - 15), timeMaximum]
}

function playNowTimeRange(): TimeRange {
  const now = new Date()
  const minutes = Math.floor((now.getHours() * 60 + now.getMinutes()) / 15) * 15
  const start = Math.min(Math.max(timeMinimum, minutes), timeMaximum - 15)
  return [start, Math.min(start + 3 * 60, timeMaximum)]
}

function timeRangeFromParams(params: URLSearchParams, day: string): TimeRange {
  const parse = (value: string | null) => {
    const match = value?.match(/^(\d{1,2}):(\d{2})$/)
    if (!match) return undefined
    const minutes = Number(match[1]) * 60 + Number(match[2])
    return Number(match[2]) < 60 && minutes >= timeMinimum && minutes <= timeMaximum ? minutes : undefined
  }
  const start = parse(params.get('start'))
  const end = parse(params.get('end'))
  return start !== undefined && end !== undefined && end > start ? [start, end] : automaticTimeRange(day)
}

function timeRangeParam(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

function initialSearchState() {
  const params = new URLSearchParams(window.location.search)
  const shouldSearch = ['date', 'players', 'holes', 'course'].some((key) => params.has(key))
  const playerParam = params.get('players') === 'any' ? 'any' : Number(params.get('players'))
  const holeParam = params.get('holes') === 'any' ? 'any' : Number(params.get('holes'))
  const day = validDateParam(params.get('date'))
  return {
    day,
    players: playerFilters.includes(playerParam as PlayerFilter) ? playerParam as PlayerFilter : 'any' as PlayerFilter,
    holes: holeFilters.includes(holeParam as HoleFilter) ? holeParam as HoleFilter : 'any' as HoleFilter,
    timeRange: timeRangeFromParams(params, day),
    course: params.get('course') || '',
    resultsView: params.get('view') === 'map' ? 'map' as ResultsView : 'timeline' as ResultsView,
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

function weatherCondition(code?: number) {
  if (code === 0) return { icon: '☀️', label: 'Clear' }
  if (code === 1) return { icon: '🌤️', label: 'Mostly clear' }
  if (code === 2) return { icon: '⛅', label: 'Partly cloudy' }
  if (code === 3) return { icon: '☁️', label: 'Cloudy' }
  if (code === 45 || code === 48) return { icon: '🌫️', label: 'Foggy' }
  if (code !== undefined && code >= 51 && code <= 67) return { icon: '🌧️', label: 'Rain' }
  if (code !== undefined && code >= 71 && code <= 77) return { icon: '🌨️', label: 'Snow' }
  if (code !== undefined && code >= 80 && code <= 82) return { icon: '🌦️', label: 'Showers' }
  if (code !== undefined && code >= 85 && code <= 86) return { icon: '🌨️', label: 'Snow showers' }
  if (code !== undefined && code >= 95) return { icon: '⛈️', label: 'Thunderstorms' }
  return { icon: '🌡️', label: 'Forecast' }
}

function weatherTimeValue(value: string) {
  const match = value.match(/T(\d{2}):(\d{2})/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER
}

const timelineDefaultScale = 5.5
const timelineMinScale = 0.3
const timelineMaxScale = 11.5
const timelineEdgePadding = 28
const refreshIntervalMs = 2 * 60_000

function positionTimelineTimes(times: TeeTime[], pixelsPerMinute: number, chipWidth: number) {
  const laneEnds: number[] = []
  const chipDuration = chipWidth / pixelsPerMinute
  const items = [...times].sort((a, b) => timeValue(a.time) - timeValue(b.time)).map((tee) => {
    const start = timeValue(tee.time)
    let lane = laneEnds.findIndex((end) => start >= end)
    if (lane < 0) lane = laneEnds.length
    laneEnds[lane] = start + chipDuration
    return { tee, start, lane }
  })
  return { items, lanes: Math.max(1, laneEnds.length) }
}

function dedupeTeeTimes(times: TeeTime[]) {
  const byTime = new Map<string, TeeTime>()
  for (const tee of times) {
    const existing = byTime.get(tee.time)
    if (!existing) { byTime.set(tee.time, { ...tee, options: tee.options ? [...tee.options] : undefined }); continue }
    const prices = [existing.price, tee.price].filter((price): price is number => typeof price === 'number')
    const optionPrices = new Map<9 | 18, number | undefined>()
    for (const option of [...(existing.options || []), ...(tee.options || [])]) {
      const current = optionPrices.get(option.holes)
      if (current === undefined || (option.price !== undefined && option.price < current)) optionPrices.set(option.holes, option.price)
    }
    const options = Array.from(optionPrices, ([holes, price]) => ({ holes, price }))
    const holeValues = new Set([existing.holes, tee.holes, ...options.map((option) => option.holes)])
    byTime.set(tee.time, {
      ...existing,
      holes: holeValues.has('9/18') || (holeValues.has(9) && holeValues.has(18)) ? '9/18' : existing.holes,
      options: options.length ? options : existing.options,
      price: prices.length ? Math.min(...prices) : undefined,
      availableSpots: Math.max(existing.availableSpots || 0, tee.availableSpots || 0) || undefined,
    })
  }
  return Array.from(byTime.values()).sort((a, b) => timeValue(a.time) - timeValue(b.time))
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

function CourseInfoModal(props: { course: Course; onClose: () => void }) {
  const details = () => props.course.details
  const yardage = () => {
    const minimum = details()?.yardageMin
    const maximum = details()?.yardageMax
    if (minimum && maximum && minimum !== maximum) return `${minimum.toLocaleString()}–${maximum.toLocaleString()} yards`
    if (maximum || minimum) return `${(maximum || minimum)!.toLocaleString()} yards`
    return undefined
  }
  const facts = () => [
    details()?.type,
    details()?.holes ? `${details()!.holes} holes` : undefined,
    details()?.par ? `Par ${details()!.par}` : undefined,
    yardage(),
  ].filter(Boolean)

  return <div class="course-info-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) props.onClose() }}>
    <section class="course-info-modal" role="dialog" aria-modal="true" aria-labelledby="course-info-title">
      <header class="course-info-header" classList={{ 'has-image': Boolean(props.course.headerImageUrl) }} style={props.course.headerImageUrl ? { 'background-image': `linear-gradient(180deg, rgb(8 18 12 / 16%) 0%, rgb(8 18 12 / 82%) 100%), url("${props.course.headerImageUrl}")` } : undefined}>
        <div class="course-avatar course-info-avatar"><Show when={props.course.logoUrl} fallback={props.course.name.charAt(0)}>{(logo) => <img src={logo()} alt="" />}</Show></div>
        <div><h2 id="course-info-title">{props.course.name}</h2><p>{props.course.city}, {props.course.state}</p></div>
        <button type="button" class="course-info-close" onClick={props.onClose} aria-label="Close course information"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
      </header>
      <div class="course-info-body">
        <Show when={facts().length}><div class="course-info-facts"><For each={facts()}>{(fact) => <span>{fact}</span>}</For></div></Show>
        <Show when={details()?.description}><p class="course-info-description">{details()!.description}</p></Show>
        <Show when={details()?.tees?.length}><section class="course-info-section"><h3>Tees and ratings</h3><div class="course-tee-table-wrap"><table class="course-tee-table"><thead><tr><th>Tee</th><th>Yards</th><th>Rating</th><th>Slope</th></tr></thead><tbody><For each={details()!.tees}>{(tee) => <tr><td>{tee.name}</td><td>{tee.yardage?.toLocaleString() || '—'}</td><td>{tee.rating ?? '—'}</td><td>{tee.slope ?? '—'}</td></tr>}</For></tbody></table></div></section></Show>
        <Show when={details()?.walkingPolicy}><section class="course-info-section"><h3>Walking and carts</h3><p>{details()!.walkingPolicy}</p></section></Show>
        <Show when={details()?.amenities?.length}><section class="course-info-section"><h3>Amenities</h3><div class="course-info-amenities"><For each={details()!.amenities}>{(amenity) => <span>{amenity}</span>}</For></div></section></Show>
        <section class="course-info-section course-info-contact"><h3>Course details</h3><Show when={details()?.address}><p>{details()!.address}</p></Show><Show when={details()?.phone}><a href={`tel:${details()!.phone}`}>{details()!.phone}</a></Show><Show when={!details()?.address && !details()?.phone}><p>{props.course.city}, {props.course.state}</p></Show></section>
      </div>
      <footer class="course-info-actions"><a href={googleMapsUrl(props.course)} target="_blank" rel="noreferrer">Directions</a><Show when={props.course.websiteUrl}><a href={props.course.websiteUrl} target="_blank" rel="noreferrer">Course website</a></Show><a class="primary" href={props.course.bookingUrl} target="_blank" rel="noreferrer">Booking site</a></footer>
    </section>
  </div>
}

function CalendarPicker(props: { value: string; label: string; onChange: (value: string) => void }) {
  return <DatePicker.Root value={[parseDate(props.value)]} min={parseDate(dateValue(new Date()))} fixedWeeks startOfWeek={0} positioning={{ placement: 'bottom', gutter: 8 }} onValueChange={(details) => { const value = details.value[0]?.toString(); if (value && value !== props.value) props.onChange(value) }}>
    <DatePicker.Trigger class="date-display" aria-label={`${props.label}. Open calendar`}>{props.label}</DatePicker.Trigger>
    <DatePicker.Positioner class="calendar-positioner"><DatePicker.Content class="calendar-popover"><DatePicker.View view="day"><DatePicker.ViewControl class="calendar-header"><DatePicker.PrevTrigger class="calendar-nav" aria-label="Previous month">‹</DatePicker.PrevTrigger><DatePicker.ViewTrigger class="calendar-month"><DatePicker.RangeText /></DatePicker.ViewTrigger><DatePicker.NextTrigger class="calendar-nav" aria-label="Next month">›</DatePicker.NextTrigger></DatePicker.ViewControl><DatePicker.Context>{(calendar) => <DatePicker.Table class="calendar-table"><DatePicker.TableHead><DatePicker.TableRow><For each={calendar().weekDays}>{(weekDay) => <DatePicker.TableHeader>{weekDay.short}</DatePicker.TableHeader>}</For></DatePicker.TableRow></DatePicker.TableHead><DatePicker.TableBody><For each={calendar().weeks}>{(week) => <DatePicker.TableRow><For each={week}>{(date) => <DatePicker.TableCell value={date}><DatePicker.TableCellTrigger>{date.day}</DatePicker.TableCellTrigger></DatePicker.TableCell>}</For></DatePicker.TableRow>}</For></DatePicker.TableBody></DatePicker.Table>}</DatePicker.Context></DatePicker.View></DatePicker.Content></DatePicker.Positioner>
  </DatePicker.Root>
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
  const storedCourseRail = localStorage.getItem(courseRailKey)
  const [theme, setTheme] = createSignal<'light' | 'dark'>(storedTheme === 'dark' ? 'dark' : 'light')
  const [day, setDay] = createSignal(initialSearch.day)
  const [courses, setCourses] = createSignal<Course[]>([])
  const [searchedCourseIds, setSearchedCourseIds] = createSignal<string[]>([])
  const [selectedEntryCourse, setSelectedEntryCourse] = createSignal(initialSearch.course)
  const [teeTimes, setTeeTimes] = createSignal<TeeTime[]>([])
  const [players, setPlayers] = createSignal<PlayerFilter>(initialSearch.players)
  const [holes, setHoles] = createSignal<HoleFilter>(initialSearch.holes)
  const [timeRange, setTimeRange] = createSignal<TimeRange>(initialSearch.timeRange)
  const [location, setLocation] = createSignal<Coordinates | null>(null)
  const [loadingCourseIds, setLoadingCourseIds] = createSignal<string[]>([])
  const [failedCourseIds, setFailedCourseIds] = createSignal<string[]>([])
  const [searchActivated, setSearchActivated] = createSignal(initialSearch.shouldSearch)
  const [loading, setLoading] = createSignal(initialSearch.shouldSearch)
  const [refreshing, setRefreshing] = createSignal(false)
  const [lastUpdated, setLastUpdated] = createSignal<number | null>(null)
  const [refreshFailed, setRefreshFailed] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [coursePickerOpen, setCoursePickerOpen] = createSignal(false)
  const savedCourseFilters = (() => {
    try { return JSON.parse(localStorage.getItem(courseFilterKey) || '{}') as { selected?: string[] | null; distance?: number | 'any'; sort?: CourseSort; showUnavailable?: boolean } } catch { return {} }
  })()
  const [courseFilterOpen, setCourseFilterOpen] = createSignal(false)
  const [courseFilterQuery, setCourseFilterQuery] = createSignal('')
  const [selectedCourseIds, setSelectedCourseIds] = createSignal<string[] | null>(savedCourseFilters.selected ?? null)
  const [courseDistance, setCourseDistance] = createSignal<number | 'any'>(savedCourseFilters.distance ?? 25)
  const [courseSort, setCourseSort] = createSignal<CourseSort>(savedCourseFilters.sort ?? 'availability')
  const [showUnavailable, setShowUnavailable] = createSignal(savedCourseFilters.showUnavailable ?? true)
  const [locationError, setLocationError] = createSignal('')
  const [infoCourse, setInfoCourse] = createSignal<Course | null>(null)
  const [choosingDate, setChoosingDate] = createSignal(false)
  const [entryIntent, setEntryIntent] = createSignal<EntryIntent>('now')
  const [currentMinutes, setCurrentMinutes] = createSignal(new Date().getHours() * 60 + new Date().getMinutes())
  const [timelineScale, setTimelineScale] = createSignal(timelineDefaultScale)
  const [timelineFullscreen, setTimelineFullscreen] = createSignal(false)
  const [courseRailCollapsed, setCourseRailCollapsed] = createSignal(storedCourseRail === null ? window.matchMedia('(max-width: 700px)').matches : storedCourseRail === 'true')
  const [selectedTeeTime, setSelectedTeeTime] = createSignal<SelectedTeeTime | null>(null)
  const [teeTimeWeather, setTeeTimeWeather] = createSignal<WeatherHour[]>([])
  const [teeTimeWeatherLoading, setTeeTimeWeatherLoading] = createSignal(false)
  const [teeTimeWeatherUnavailable, setTeeTimeWeatherUnavailable] = createSignal(false)
  const [resultsView, setResultsView] = createSignal<ResultsView>(initialSearch.resultsView)
  const [whatsNewOpen, setWhatsNewOpen] = createSignal(false)
  const [lastSeenRelease, setLastSeenRelease] = createSignal(localStorage.getItem(lastSeenReleaseKey) || '')
  let loadRequest = 0
  let timelineScroller!: HTMLDivElement
  let timelineDragStartX = 0
  let timelineDragStartY = 0
  let timelineDragStartScroll = 0
  let timelineDragStartScrollTop = 0
  let timelineDragPointer: number | undefined
  let suppressTimelineClick = false
  let locationRequested = false
  const timelinePointers = new Map<number, { x: number; y: number }>()
  let pinchStartDistance = 0
  let pinchStartScale = timelineDefaultScale

  const timelineZoomMode = createMemo(() => timelineScale() >= 8.5 ? 'detailed' : timelineScale() >= 6.5 ? 'standard' : timelineScale() >= 3.5 ? 'compact' : 'overview')
  const timelineChipWidth = createMemo(() => timelineZoomMode() === 'detailed' ? 76 : timelineZoomMode() === 'standard' ? 48 : timelineZoomMode() === 'compact' ? 43 : 4)
  const timelineChipHeight = createMemo(() => timelineZoomMode() === 'detailed' ? 44 : timelineZoomMode() === 'standard' ? 34 : timelineZoomMode() === 'compact' ? 24 : 10)
  const timelineLaneHeight = createMemo(() => timelineChipHeight() + (timelineZoomMode() === 'overview' ? 4 : 10))

  const applyTimelineZoom = (requestedScale: number, focalClientX?: number) => {
    const nextScale = Math.min(timelineMaxScale, Math.max(timelineMinScale, requestedScale))
    const oldScale = timelineScale()
    if (!timelineScroller || Math.abs(nextScale - oldScale) < .001) return
    const rect = timelineScroller.getBoundingClientRect()
    const courseWidth = timelineScroller.querySelector<HTMLElement>('.timeline-course-heading')?.offsetWidth || 0
    const focalX = (focalClientX ?? (rect.left + courseWidth + (timelineScroller.clientWidth - courseWidth) / 2)) - rect.left
    const timelineMinute = (timelineScroller.scrollLeft + focalX - courseWidth - timelineEdgePadding) / oldScale
    setTimelineScale(nextScale)
    requestAnimationFrame(() => {
      timelineScroller.scrollLeft = timelineEdgePadding + timelineMinute * nextScale - (focalX - courseWidth)
    })
  }

  const beginTimelineDrag: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    if ((event.pointerType === 'mouse' && event.button !== 0) || (event.target as HTMLElement).closest('button, input, select')) return
    timelinePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (timelinePointers.size === 2) {
      for (const pointerId of timelinePointers.keys()) {
        if (!event.currentTarget.hasPointerCapture(pointerId)) event.currentTarget.setPointerCapture(pointerId)
      }
      const [a, b] = [...timelinePointers.values()]
      pinchStartDistance = Math.hypot(b.x - a.x, b.y - a.y)
      pinchStartScale = timelineScale()
      suppressTimelineClick = true
      event.currentTarget.classList.add('is-zooming')
      return
    }
    timelineDragPointer = event.pointerId
    timelineDragStartX = event.clientX
    timelineDragStartY = event.clientY
    timelineDragStartScroll = event.currentTarget.scrollLeft
    timelineDragStartScrollTop = event.currentTarget.scrollTop
    suppressTimelineClick = false
  }
  const moveTimelineDrag: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    if (timelinePointers.has(event.pointerId)) timelinePointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (timelinePointers.size >= 2) {
      const [a, b] = [...timelinePointers.values()]
      const distance = Math.hypot(b.x - a.x, b.y - a.y)
      const midpointX = (a.x + b.x) / 2
      if (pinchStartDistance > 0) applyTimelineZoom(pinchStartScale * distance / pinchStartDistance, midpointX)
      event.preventDefault()
      return
    }
    if (timelineDragPointer !== event.pointerId) return
    const distance = event.clientX - timelineDragStartX
    const verticalDistance = event.clientY - timelineDragStartY
    if (Math.hypot(distance, verticalDistance) > 4) {
      suppressTimelineClick = true
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId)
      event.currentTarget.classList.add('is-dragging')
    }
    if (!suppressTimelineClick) return
    event.preventDefault()
    event.currentTarget.scrollLeft = timelineDragStartScroll - distance
    event.currentTarget.scrollTop = timelineDragStartScrollTop - verticalDistance
  }
  const endTimelineDrag: JSX.EventHandler<HTMLDivElement, PointerEvent> = (event) => {
    timelinePointers.delete(event.pointerId)
    if (timelineDragPointer === event.pointerId) timelineDragPointer = undefined
    event.currentTarget.classList.remove('is-dragging')
    if (timelinePointers.size < 2) {
      event.currentTarget.classList.remove('is-zooming')
      const remaining = [...timelinePointers.entries()][0]
      if (remaining) {
        timelineDragPointer = remaining[0]
        timelineDragStartX = remaining[1].x
        timelineDragStartY = remaining[1].y
        timelineDragStartScroll = event.currentTarget.scrollLeft
        timelineDragStartScrollTop = event.currentTarget.scrollTop
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (timelinePointers.size === 0) setTimeout(() => { suppressTimelineClick = false }, 0)
  }
  const handleTimelineWheel: JSX.EventHandler<HTMLDivElement, WheelEvent> = (event) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      applyTimelineZoom(timelineScale() * Math.exp(-event.deltaY * .008), event.clientX)
      return
    }
    if (event.shiftKey) {
      event.preventDefault()
      event.currentTarget.scrollLeft += event.deltaY || event.deltaX
      return
    }
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      event.preventDefault()
      event.currentTarget.scrollLeft += event.deltaX
      event.currentTarget.scrollTop += event.deltaY
      return
    }
    event.preventDefault()
    event.currentTarget.scrollTop += event.deltaY
  }
  const handleTimelineClick: JSX.EventHandler<HTMLDivElement, MouseEvent> = (event) => {
    if (!suppressTimelineClick) return
    event.preventDefault()
    event.stopPropagation()
  }
  const showTeeTimeDetails = (course: Course, tee: TeeTime, price: number | undefined, shownHoles: number | string) => {
    setSelectedTeeTime({ course, tee, price, holes: shownHoles })
  }
  const openTeeTimeDetails = (event: MouseEvent, course: Course, tee: TeeTime, price: number | undefined, shownHoles: number | string) => {
    event.preventDefault()
    showTeeTimeDetails(course, tee, price, shownHoles)
  }

  createEffect(() => {
    const selection = selectedTeeTime()
    setTeeTimeWeather([])
    setTeeTimeWeatherUnavailable(false)
    if (!selection || selection.course.latitude === undefined || selection.course.longitude === undefined) {
      setTeeTimeWeatherLoading(false)
      return
    }
    const controller = new AbortController()
    setTeeTimeWeatherLoading(true)
    const weatherQuery = new URLSearchParams({
      latitude: String(selection.course.latitude),
      longitude: String(selection.course.longitude),
      hourly: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,precipitation_probability',
      temperature_unit: 'fahrenheit',
      wind_speed_unit: 'mph',
      timezone: 'America/New_York',
      start_date: selection.tee.date,
      end_date: selection.tee.date,
    })
    void fetch(`https://api.open-meteo.com/v1/forecast?${weatherQuery}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Weather request failed with ${response.status}`)
        return response.json() as Promise<OpenMeteoWeather>
      })
      .then((data) => {
        if (controller.signal.aborted) return
        const hourly = (data.hourly?.time || []).map((time, index): WeatherHour => ({
          time,
          temperature: data.hourly?.temperature_2m?.[index],
          apparentTemperature: data.hourly?.apparent_temperature?.[index],
          weatherCode: data.hourly?.weather_code?.[index],
          windSpeed: data.hourly?.wind_speed_10m?.[index],
          windGust: data.hourly?.wind_gusts_10m?.[index],
          precipitationProbability: data.hourly?.precipitation_probability?.[index],
        }))
        setTeeTimeWeather(hourly)
        setTeeTimeWeatherUnavailable(hourly.length === 0)
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.warn('Could not load tee-time weather', error)
          setTeeTimeWeatherUnavailable(true)
        }
      })
      .finally(() => { if (!controller.signal.aborted) setTeeTimeWeatherLoading(false) })
    onCleanup(() => controller.abort())
  })

  const selectedForecast = createMemo(() => {
    const selection = selectedTeeTime()
    const hours = teeTimeWeather()
    if (!selection || !hours.length) return undefined
    const teeMinutes = timeValue(selection.tee.time)
    const teeOff = hours.reduce((closest, hour) => Math.abs(weatherTimeValue(hour.time) - teeMinutes) < Math.abs(weatherTimeValue(closest.time) - teeMinutes) ? hour : closest)
    const roundHours = hours.filter((hour) => {
      const minutes = weatherTimeValue(hour.time)
      return minutes >= weatherTimeValue(teeOff.time) && minutes <= teeMinutes + 4 * 60
    })
    const during = roundHours.length ? roundHours : [teeOff]
    const values = (key: keyof WeatherHour) => during.map((hour) => hour[key]).filter((value): value is number => typeof value === 'number')
    const temperatures = values('temperature')
    const rain = values('precipitationProbability')
    const wind = values('windSpeed')
    const gusts = values('windGust')
    return {
      teeOff,
      condition: weatherCondition(teeOff.weatherCode),
      low: temperatures.length ? Math.round(Math.min(...temperatures)) : undefined,
      high: temperatures.length ? Math.round(Math.max(...temperatures)) : undefined,
      rain: rain.length ? Math.round(Math.max(...rain)) : undefined,
      windLow: wind.length ? Math.round(Math.min(...wind)) : undefined,
      windHigh: wind.length ? Math.round(Math.max(...wind)) : undefined,
      gust: gusts.length ? Math.round(Math.max(...gusts)) : undefined,
    }
  })

  createEffect(() => { document.documentElement.dataset.theme = theme(); localStorage.setItem('theme', theme()) })
  createEffect(() => { localStorage.setItem(courseRailKey, String(courseRailCollapsed())) })
  createEffect(() => { localStorage.setItem(courseFilterKey, JSON.stringify({ selected: selectedCourseIds(), distance: courseDistance(), sort: courseSort(), showUnavailable: showUnavailable() })) })
  createEffect(() => {
    if (!infoCourse()) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    onCleanup(() => { document.body.style.overflow = previousOverflow })
  })
  createEffect(() => {
    if (!searchActivated()) return
    const params = new URLSearchParams()
    params.set('date', day())
    if (players() !== 'any') params.set('players', String(players()))
    if (holes() !== 'any') params.set('holes', String(holes()))
    if (selectedEntryCourse()) params.set('course', selectedEntryCourse())
    params.set('start', timeRangeParam(timeRange()[0]))
    params.set('end', timeRangeParam(timeRange()[1]))
    if (resultsView() === 'map') params.set('view', 'map')
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
    const today = dateValue(new Date())
    if (tee.date === today && timeValue(tee.time) < currentMinutes()) return false
    return true
  }))
  const filteredTimes = createMemo(() => currentTimes().filter((tee) => {
    const requestedPlayers = players()
    if (!matchesTimeRange(tee.time, timeRange())) return false
    if (holes() !== 'any' && !tee.options?.some((option) => option.holes === holes()) && tee.holes !== holes() && tee.holes !== '9/18') return false
    return requestedPlayers === 'any' || (tee.availableSpots !== undefined && tee.availableSpots >= requestedPlayers)
  }))
  const displayOption = (tee: TeeTime) => holes() === 'any' ? undefined : tee.options?.find((option) => option.holes === holes())
  const timesFor = (courseId: string) => dedupeTeeTimes(filteredTimes().filter((tee) => tee.courseId === courseId))
  const timelineWidth = createMemo(() => (timeRange()[1] - timeRange()[0]) * timelineScale() + timelineChipWidth() + timelineEdgePadding * 2)
  const showCurrentTime = createMemo(() => day() === dateValue(new Date()) && currentMinutes() >= timeRange()[0] && currentMinutes() <= timeRange()[1])
  const currentTimeLeft = createMemo(() => timelineEdgePadding + (currentMinutes() - timeRange()[0]) * timelineScale())
  const timelineTicks = createMemo(() => {
    const ticks: number[] = []
    const hourWidth = timelineScale() * 60
    const interval = hourWidth >= 72 ? 60 : hourWidth >= 40 ? 120 : hourWidth >= 24 ? 180 : 240
    const first = Math.ceil(timeRange()[0] / interval) * interval
    for (let value = first; value <= timeRange()[1]; value += interval) ticks.push(value)
    return ticks
  })
  const timelineFor = (courseId: string) => positionTimelineTimes(timesFor(courseId), timelineScale(), timelineChipWidth())
  const distanceFor = (course: Course) => location() ? distanceInMiles(location()!, course) : undefined
  const selectedCourse = createMemo(() => courses().find((course) => course.id === selectedEntryCourse()))
  const coursesByName = createMemo(() => [...courses()].sort((a, b) => a.name.localeCompare(b.name)))
  const filterableCourses = createMemo(() => {
    const query = courseFilterQuery().trim().toLowerCase()
    return coursesByName().filter((course) => !query || `${course.name} ${course.city} ${course.state}`.toLowerCase().includes(query))
  })
  const resultCourses = createMemo(() => {
    const selected = selectedCourseIds()
    const maximumDistance = courseDistance()
    const singleCourseSearch = Boolean(selectedEntryCourse())
    const filtered = courses().filter((course) => {
      if (!searchedCourseIds().includes(course.id)) return false
      if (!singleCourseSearch && selected !== null && !selected.includes(course.id)) return false
      if (!singleCourseSearch && maximumDistance !== 'any' && location()) {
        const distance = distanceFor(course)
        if (distance === undefined || distance > maximumDistance) return false
      }
      if (!singleCourseSearch && !showUnavailable() && !loadingCourseIds().includes(course.id) && timesFor(course.id).length === 0) return false
      return true
    })
    return filtered.sort((a, b) => {
      if (!singleCourseSearch && courseSort() === 'nearest') {
        return (distanceFor(a) ?? Number.MAX_SAFE_INTEGER) - (distanceFor(b) ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name)
      }
      if (!singleCourseSearch && courseSort() === 'availability') {
        return timesFor(b.id).length - timesFor(a.id).length
          || (distanceFor(a) ?? Number.MAX_SAFE_INTEGER) - (distanceFor(b) ?? Number.MAX_SAFE_INTEGER)
          || a.name.localeCompare(b.name)
      }
      return a.name.localeCompare(b.name)
    })
  })
  const visibleCourseCount = createMemo(() => resultCourses().length)
  const totalSearchedCourseCount = createMemo(() => courses().filter((course) => searchedCourseIds().includes(course.id)).length)
  const mapTimesByCourse = createMemo(() => Object.fromEntries(resultCourses().map((course) => [course.id, timesFor(course.id)])))

  createEffect(() => {
    const selectedDay = day()
    if (!searchActivated() || selectedDay !== dateValue(new Date())) return
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!timelineScroller) return
      const courseWidth = timelineScroller.querySelector<HTMLElement>('.timeline-course-heading')?.offsetWidth || 0
      const targetMinutes = Math.min(timeRange()[1], Math.max(timeRange()[0], currentMinutes()))
      const targetLeft = timelineEdgePadding + (targetMinutes - timeRange()[0]) * timelineScale() - (timelineScroller.clientWidth - courseWidth) / 2
      timelineScroller.scrollTo({ left: Math.max(0, targetLeft), behavior: 'smooth' })
    }))
  })

  function requestLocation() {
    if (location()) return Promise.resolve(location())
    if (locationRequested) return Promise.resolve(null)
    locationRequested = true
    if (!navigator.geolocation) { setLocationError('Location is not available in this browser.'); return Promise.resolve(null) }
    setLocationError('')
    return new Promise<Coordinates | null>((resolve) => navigator.geolocation.getCurrentPosition((position) => {
      const coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude }
      setLocation(coordinates)
      resolve(coordinates)
    }, () => { setLocationError('Allow location access to sort or filter by distance.'); resolve(null) }, { enableHighAccuracy: false, maximumAge: 15 * 60_000, timeout: 10_000 }))
  }
  async function chooseCourseDistance(value: number | 'any') {
    if (value !== 'any' && !await requestLocation()) return
    setCourseDistance(value)
  }
  async function chooseCourseSort(value: CourseSort) {
    if (value === 'nearest' && !await requestLocation()) return
    setCourseSort(value)
  }
  function toggleCourse(courseId: string) {
    const selected = selectedCourseIds()
    if (selected === null) setSelectedCourseIds(courses().map((course) => course.id).filter((id) => id !== courseId))
    else setSelectedCourseIds(selected.includes(courseId) ? selected.filter((id) => id !== courseId) : [...selected, courseId])
  }
  async function loadCourseCatalog() {
    if (courses().length) return courses()
    const response = await fetch(`${apiBaseUrl}/api/courses`)
    if (!response.ok) throw new Error()
    const list = (await response.json() as Course[]).filter((course) => course.status !== 'unsupported')
    setCourses(list)
    if (selectedEntryCourse() && !list.some((course) => course.id === selectedEntryCourse())) setSelectedEntryCourse('')
    return list
  }
  async function loadSearch(date: string, options: { background?: boolean; bypassCache?: boolean } = {}) {
    if (options.background && (loading() || refreshing())) return
    const request = ++loadRequest
    let successfulCourses = 0
    if (options.background) { setRefreshing(true); setRefreshFailed(false) }
    else { setLoading(true); setError(null); setTeeTimes([]); setFailedCourseIds([]); setLastUpdated(null) }
    if (!selectedEntryCourse() && courseDistance() !== 'any' && !location()) void requestLocation()
    try {
      const allCourses = await loadCourseCatalog()
      const list = selectedEntryCourse() ? allCourses.filter((course) => course.id === selectedEntryCourse()) : allCourses
      if (request !== loadRequest) return
      setSearchedCourseIds(list.map((course) => course.id))
      if (!options.background) setLoadingCourseIds(list.map((course) => course.id))
      await Promise.all(list.map(async (course) => {
        try {
          const query = new URLSearchParams({ date })
          if (options.bypassCache) query.set('refresh', '1')
          const response = await fetch(`${apiBaseUrl}/api/courses/${course.id}/tee-times?${query}`)
          if (!response.ok) throw new Error()
          const times = await response.json() as TeeTime[]
          if (request === loadRequest) {
            successfulCourses += 1
            setTeeTimes((current) => [...current.filter((tee) => tee.courseId !== course.id), ...times].sort((a, b) => timeValue(a.time) - timeValue(b.time)))
            setFailedCourseIds((ids) => ids.filter((id) => id !== course.id))
          }
        }
        catch { if (request === loadRequest && !options.background) setFailedCourseIds((ids) => [...ids, course.id]) }
        finally { if (request === loadRequest && !options.background) setLoadingCourseIds((ids) => ids.filter((id) => id !== course.id)) }
      }))
      if (request === loadRequest && successfulCourses > 0) setLastUpdated(Date.now())
      if (request === loadRequest && options.background && successfulCourses === 0) setRefreshFailed(true)
    } catch {
      if (request === loadRequest && options.background) setRefreshFailed(true)
      else if (request === loadRequest) setError('Could not load tee times. Check that the backend is running.')
    }
    finally { if (request === loadRequest) { setLoading(false); setRefreshing(false) } }
  }
  function changeDay(value: string) { setDay(value); setTimeRange(automaticTimeRange(value)); if (searchActivated()) void loadSearch(value) }
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
    setRefreshing(false)
    setLastUpdated(null)
    setRefreshFailed(false)
    setError(null)
  }
  function searchPlayNow() { const today = dateValue(new Date()); activateSearch(); setPlayers('any'); setHoles('any'); setTimeRange(playNowTimeRange()); setDay(today); void loadSearch(today) }
  function searchTonight() { const today = dateValue(new Date()); activateSearch(); setPlayers('any'); setHoles('any'); setTimeRange([15 * 60, timeMaximum]); setDay(today); void loadSearch(today) }
  function searchTomorrow() { const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); const value = dateValue(tomorrow); activateSearch(); setPlayers('any'); setHoles('any'); setTimeRange([...fullDayRange]); setDay(value); void loadSearch(value) }
  function submitEntrySearch() {
    if (entryIntent() === 'now') searchPlayNow()
    else if (entryIntent() === 'tonight') searchTonight()
    else if (entryIntent() === 'tomorrow') searchTomorrow()
    else { setTimeRange(automaticTimeRange(day())); runSearch() }
  }
  onMount(() => {
    if (searchActivated()) void loadSearch(day())
    else void loadCourseCatalog().catch(() => setError('Could not load the course list.'))
    const closeOnOutsideClick = (event: PointerEvent) => { const target = event.target as Element; if (!target.closest('[data-course-picker]')) setCoursePickerOpen(false); if (!target.closest('[data-course-filter]')) setCourseFilterOpen(false) }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setCoursePickerOpen(false); setCourseFilterOpen(false); setInfoCourse(null); setSelectedTeeTime(null); setWhatsNewOpen(false); setTimelineFullscreen(false) } }
    const restoreFromUrl = () => {
      const restored = initialSearchState()
      const wasActive = searchActivated()
      setSearchActivated(restored.shouldSearch)
      const dateChanged = restored.day !== day()
      setDay(restored.day)
      setPlayers(restored.players)
      setHoles(restored.holes)
      setTimeRange(restored.timeRange)
      setSelectedEntryCourse(restored.course)
      setResultsView(restored.resultsView)
      if (restored.shouldSearch && (dateChanged || !wasActive)) void loadSearch(restored.day)
      if (!restored.shouldSearch) { setTeeTimes([]); setLoading(false); setError(null) }
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('popstate', restoreFromUrl)
    const clockTimer = window.setInterval(() => { const now = new Date(); setCurrentMinutes(now.getHours() * 60 + now.getMinutes()) }, 60_000)
    const refreshIfStale = () => {
      if (document.visibilityState !== 'visible' || !searchActivated()) return
      const updated = lastUpdated()
      if (updated !== null && Date.now() - updated >= refreshIntervalMs) void loadSearch(day(), { background: true })
    }
    const refreshTimer = window.setInterval(refreshIfStale, refreshIntervalMs)
    document.addEventListener('visibilitychange', refreshIfStale)
    onCleanup(() => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('popstate', restoreFromUrl)
      window.clearInterval(clockTimer)
      window.clearInterval(refreshTimer)
      document.removeEventListener('visibilitychange', refreshIfStale)
    })
  })

  const ThemeSwitch = () => <label class="theme-switch"><input type="checkbox" checked={theme() === 'dark'} onChange={() => setTheme(theme() === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode" /><span class="theme-switch-track"><span class="theme-switch-thumb" /></span><span class="theme-switch-text">{theme() === 'dark' ? 'Dark' : 'Light'}</span></label>
  const openWhatsNew = () => {
    setWhatsNewOpen(true)
    setLastSeenRelease(latestReleaseId)
    localStorage.setItem(lastSeenReleaseKey, latestReleaseId)
  }
  const HeaderActions = () => <div class="header-actions"><button type="button" class="whats-new-button" onClick={openWhatsNew} aria-label="What's new" title="What's new"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /><circle cx="12" cy="12" r="3" /></svg><span>What’s new</span><Show when={lastSeenRelease() !== latestReleaseId}><i aria-label="New updates available" /></Show></button><ThemeSwitch /></div>
  const updateLabel = () => {
    currentMinutes()
    if (refreshing()) return 'Updating…'
    if (refreshFailed()) return 'Refresh failed'
    const updated = lastUpdated()
    if (updated === null) return ''
    const minutes = Math.floor((Date.now() - updated) / 60_000)
    return minutes < 1 ? 'Updated just now' : `Updated ${minutes} min ago`
  }
  const TimelineZoomControls = () => <div class="timeline-zoom-controls" aria-label="Timeline zoom controls"><button type="button" onClick={() => applyTimelineZoom(timelineScale() / 1.25)} aria-label="Zoom out" title="Zoom out">−</button><input class="timeline-zoom-slider" type="range" min={timelineMinScale} max={timelineMaxScale} step="0.1" value={timelineScale()} onInput={(event) => applyTimelineZoom(Number(event.currentTarget.value))} aria-label="Timeline zoom level" /><button type="button" onClick={() => applyTimelineZoom(timelineScale() * 1.25)} aria-label="Zoom in" title="Zoom in">+</button><button type="button" class="timeline-reset-button" onClick={() => applyTimelineZoom(timelineDefaultScale)} title="Reset zoom">Reset</button></div>
  const MapTimeRange = () => <Slider.Root class="time-range-picker map-time-filter" min={timeMinimum} max={timeMaximum} step={15} minStepsBetweenThumbs={1} value={timeRange()} onValueChange={(details) => setTimeRange([details.value[0], details.value[1]])}>
    <div class="time-range-heading"><Slider.Label>Time</Slider.Label><strong>{formatMinutes(timeRange()[0])} – {formatMinutes(timeRange()[1])}</strong></div>
    <Slider.Control class="time-range-control"><Slider.Track class="time-range-track"><Slider.Range class="time-range-fill" /></Slider.Track><Slider.Thumb class="time-range-thumb" index={0}><Slider.HiddenInput /></Slider.Thumb><Slider.Thumb class="time-range-thumb" index={1}><Slider.HiddenInput /></Slider.Thumb></Slider.Control>
  </Slider.Root>

  return <div class="container"><main class="dashboard search-dashboard">
    <Show when={whatsNewOpen()}><div class="whats-new-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setWhatsNewOpen(false) }}><section class="whats-new-panel" role="dialog" aria-modal="true" aria-labelledby="whats-new-title"><header><div><span>TEE TIMES</span><h2 id="whats-new-title">What’s new</h2></div><button type="button" onClick={() => setWhatsNewOpen(false)} aria-label="Close what’s new">×</button></header><div class="whats-new-list"><For each={appReleases}>{(release, index) => <article><div><time>{release.date}</time><Show when={index() === 0}><span>Latest</span></Show></div><h3>{release.title}</h3><ul><For each={release.changes}>{(change) => <li>{change}</li>}</For></ul></article>}</For></div></section></div></Show>
    <Show when={searchActivated()} fallback={<>
      <header class="entry-topbar"><HeaderActions /></header>
      <section class="entry-screen">
        <div class="entry-copy"><p class="eyebrow">TEE TIMES NEAR YOU</p><h1>What kind of round are you looking for?</h1><p>Choose your search, optionally narrow it to one course, then find tee times.</p></div>
        <div class="entry-choices" role="radiogroup" aria-label="When do you want to play?">
          <button type="button" role="radio" aria-checked={entryIntent() === 'now'} classList={{ active: entryIntent() === 'now' }} onClick={() => { setEntryIntent('now'); setChoosingDate(false) }}><strong>Play now</strong><span>Today · next 3 hours</span></button>
          <Show when={!combineImmediateChoices} fallback={<button type="button" role="radio" aria-checked={entryIntent() === 'tomorrow'} classList={{ active: entryIntent() === 'tomorrow' }} onClick={() => { setEntryIntent('tomorrow'); setChoosingDate(false) }}><strong>Play tomorrow</strong><span>Tomorrow · all day</span></button>}><button type="button" role="radio" aria-checked={entryIntent() === 'tonight'} classList={{ active: entryIntent() === 'tonight' }} onClick={() => { setEntryIntent('tonight'); setChoosingDate(false) }}><strong>Play tonight</strong><span>Today · 3–7 PM</span></button></Show>
          <button type="button" role="radio" aria-checked={entryIntent() === 'date'} classList={{ active: entryIntent() === 'date' }} onClick={() => { setEntryIntent('date'); setChoosingDate(true) }}><strong>Choose a date</strong><span>Open the calendar</span></button>
        </div>
        <Show when={choosingDate()}><div class="entry-date"><div class="search-control date-control"><label>Date</label><div class="board-date-nav"><button type="button" class="date-arrow" disabled={day() === dateValue(new Date())} onClick={() => stepDay(-1)} aria-label="Previous day">‹</button><CalendarPicker value={day()} label={dayLabel()} onChange={changeDay} /><button type="button" class="date-arrow" onClick={() => stepDay(1)} aria-label="Next day">›</button></div></div></div></Show>
        <div class="entry-course-choice" data-course-picker>
          <label>Have a course in mind?</label>
          <button type="button" class="course-picker-trigger" aria-haspopup="listbox" aria-expanded={coursePickerOpen()} onClick={() => setCoursePickerOpen(!coursePickerOpen())}><Show when={selectedCourse()} fallback={<div class="course-picker-all-icon">All</div>}>{(course) => <div class="course-avatar compact"><Show when={course().logoUrl} fallback={course().name.charAt(0)}>{(logo) => <img src={logo()} alt="" />}</Show></div>}</Show><span><strong>{selectedCourse()?.name || 'Search all courses'}</strong><small>{selectedCourse() ? `${selectedCourse()!.city}, ${selectedCourse()!.state}` : 'Compare every available course'}</small></span><svg class="course-picker-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9.5 5 5 5-5" /></svg></button>
          <Show when={coursePickerOpen()}><div class="course-picker-menu" role="listbox" aria-label="Choose a course"><button type="button" role="option" aria-selected={!selectedEntryCourse()} onClick={() => { setSelectedEntryCourse(''); setCoursePickerOpen(false) }}><div class="course-picker-all-icon">All</div><span><strong>Search all courses</strong><small>Compare every available course</small></span></button><For each={coursesByName()}>{(course) => <button type="button" role="option" aria-selected={selectedEntryCourse() === course.id} onClick={() => { setSelectedEntryCourse(course.id); setCoursePickerOpen(false) }}><div class="course-avatar compact"><Show when={course.logoUrl} fallback={course.name.charAt(0)}>{(logo) => <img src={logo()} alt="" />}</Show></div><span><strong>{course.name}</strong><small>{course.city}, {course.state}</small></span></button>}</For></div></Show>
          <span class="course-picker-help">{selectedEntryCourse() ? 'We’ll check only this course.' : 'Optional — the default searches every course.'}</span>
        </div>
        <button type="button" class="entry-submit" onClick={submitEntrySearch}>Find tee times</button>
        <Show when={error()}>{(message) => <p class="entry-error">{message()}</p>}</Show>
      </section>
    </>}>
    <header class="results-header"><button type="button" class="new-search-btn" onClick={startNewSearch} aria-label="Start a new search" title="New search"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg></button><div class="board-date-nav"><button type="button" class="date-arrow" disabled={day() === dateValue(new Date())} onClick={() => stepDay(-1)} aria-label="Previous day">‹</button><CalendarPicker value={day()} label={dayLabel()} onChange={changeDay} /><button type="button" class="date-arrow" onClick={() => stepDay(1)} aria-label="Next day">›</button></div><HeaderActions /></header>
    <section class="search-results" aria-busy={loading()}>
      <div class="timeline-toolbar" classList={{ 'map-view': resultsView() === 'map' }} aria-label="Results controls">
        <MapTimeRange />
        <div class="timeline-refiners"><fieldset class="compact-filter"><legend>Players</legend><div>{(['any', 2, 3, 4] as const).map((value) => <button type="button" classList={{ active: players() === value }} aria-pressed={players() === value} onClick={() => setPlayers(value)}>{value === 'any' ? 'Any' : value}</button>)}</div></fieldset><fieldset class="compact-filter"><legend>Holes</legend><div>{(['any', 9, 18] as const).map((value) => <button type="button" classList={{ active: holes() === value }} aria-pressed={holes() === value} onClick={() => setHoles(value)}>{value === 'any' ? 'Any' : value}</button>)}</div></fieldset><Show when={!selectedEntryCourse()}><div class="course-filter-wrap" data-course-filter><span class="course-filter-label">Courses</span><button type="button" class="course-filter-trigger" classList={{ active: courseDistance() !== 25 || courseSort() !== 'availability' || selectedCourseIds() !== null || !showUnavailable() }} aria-expanded={courseFilterOpen()} onClick={() => setCourseFilterOpen(!courseFilterOpen())}>{visibleCourseCount()} of {totalSearchedCourseCount()}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9.5 5 5 5-5" /></svg></button><Show when={courseFilterOpen()}><section class="course-filter-panel" aria-label="Filter courses"><header><strong>Courses</strong><button type="button" onClick={() => setCourseFilterOpen(false)} aria-label="Close course filters">×</button></header><div class="course-filter-options"><label>Sort by<select value={courseSort()} onChange={(event) => void chooseCourseSort(event.currentTarget.value as CourseSort)}><option value="name">Course name</option><option value="availability">Most tee times</option><option value="nearest">Nearest</option></select></label><label>Distance<select value={courseDistance()} onChange={(event) => void chooseCourseDistance(event.currentTarget.value === 'any' ? 'any' : Number(event.currentTarget.value))}><option value="any">Any distance</option><option value="5">Within 5 miles</option><option value="10">Within 10 miles</option><option value="15">Within 15 miles</option><option value="25">Within 25 miles</option></select></label></div><Show when={locationError()}><p class="course-filter-error">{locationError()}</p></Show><input class="course-filter-search" type="search" value={courseFilterQuery()} onInput={(event) => setCourseFilterQuery(event.currentTarget.value)} placeholder="Find a course or town" aria-label="Find a course or town" /><div class="course-filter-actions"><button type="button" onClick={() => setSelectedCourseIds(null)}>Select all</button><button type="button" onClick={() => setSelectedCourseIds([])}>Clear all</button><button type="button" onClick={() => setShowUnavailable(!showUnavailable())}>{showUnavailable() ? 'Hide unavailable' : 'Show unavailable'}</button><button type="button" onClick={() => { setSelectedCourseIds(null); setCourseDistance(25); setCourseSort('availability'); setShowUnavailable(true); setLocationError('') }}>Reset</button></div><div class="course-filter-list"><For each={filterableCourses()}>{(course) => <label><input type="checkbox" checked={selectedCourseIds() === null || selectedCourseIds()!.includes(course.id)} onChange={() => toggleCourse(course.id)} /><span class="course-avatar compact"><Show when={course.logoUrl} fallback={course.name.charAt(0)}>{(logo) => <img src={logo()} alt="" />}</Show></span><span><strong>{course.name}</strong><small>{course.city}, {course.state}<Show when={distanceFor(course) !== undefined}> · {distanceFor(course)!.toFixed(1)} mi</Show></small></span></label>}</For></div></section></Show></div></Show></div>
        <div class="results-tools"><span class="refresh-status" classList={{ failed: refreshFailed() }}>{updateLabel()}</span><div class="results-view-switch" role="group" aria-label="Results view"><button type="button" classList={{ active: resultsView() === 'timeline' }} aria-pressed={resultsView() === 'timeline'} onClick={() => setResultsView('timeline')}>Timeline</button><button type="button" classList={{ active: resultsView() === 'map' }} aria-pressed={resultsView() === 'map'} onClick={() => setResultsView('map')}>Map</button></div></div>
      </div>
      <Show when={error()}>{(message) => <div class="empty-state standalone">{message()}</div>}</Show>
      <Show when={resultsView() === 'timeline'} fallback={<Suspense fallback={<div class="course-map-loading"><span class="loading-spinner" />Loading map…</div>}><CourseMap selectedDate={day()} courses={resultCourses()} timesByCourse={mapTimesByCourse()} selectedHoles={holes()} loadingCourseIds={loadingCourseIds()} failedCourseIds={failedCourseIds()} userLocation={location()} theme={theme} onSelectCourse={setInfoCourse} onSelectTeeTime={showTeeTimeDetails} /></Suspense>}><div class="timeline-board" classList={{ 'timeline-fullscreen': timelineFullscreen() }}>
        <div class="timeline-floating-controls"><TimelineZoomControls /><button type="button" class="timeline-board-fullscreen" onClick={() => setTimelineFullscreen(!timelineFullscreen())} aria-label={timelineFullscreen() ? 'Exit fullscreen timeline' : 'Open fullscreen timeline'} title={timelineFullscreen() ? 'Exit fullscreen' : 'Fullscreen timeline'}><svg viewBox="0 0 24 24" aria-hidden="true"><Show when={timelineFullscreen()} fallback={<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />}><path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5" /></Show></svg></button></div>
        <div class="timeline-scroll" classList={{ 'course-rail-collapsed': courseRailCollapsed(), 'zoom-overview': timelineZoomMode() === 'overview', 'zoom-compact': timelineZoomMode() === 'compact', 'zoom-standard': timelineZoomMode() === 'standard', 'zoom-detailed': timelineZoomMode() === 'detailed' }} ref={timelineScroller} onPointerDown={beginTimelineDrag} onPointerMove={moveTimelineDrag} onPointerUp={endTimelineDrag} onPointerCancel={endTimelineDrag} onWheel={handleTimelineWheel} onClickCapture={handleTimelineClick}>
          <div class="timeline-canvas">
            <div class="timeline-ruler">
              <div class="timeline-course-heading"><span>Course</span><button type="button" onClick={() => setCourseRailCollapsed(!courseRailCollapsed())} aria-label={courseRailCollapsed() ? 'Expand course information' : 'Collapse course information'} title={courseRailCollapsed() ? 'Show course names' : 'Show avatars only'}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={courseRailCollapsed() ? 'm9 6 6 6-6 6' : 'm15 6-6 6 6 6'} /></svg></button></div>
              <div class="timeline-ruler-track" style={{ width: `${timelineWidth()}px` }}>
                <For each={timelineTicks()}>{(tick) => <span style={{ left: `${timelineEdgePadding + (tick - timeRange()[0]) * timelineScale()}px` }}>{formatMinutes(tick).replace(':00', '')}</span>}</For>
                <Show when={showCurrentTime()}><i class="timeline-now timeline-now-ruler" style={{ left: `${currentTimeLeft()}px` }}><span>Now</span></i></Show>
              </div>
            </div>
            <For each={resultCourses()}>{(course) => {
              const distance = () => distanceFor(course)
              const timeline = () => timelineFor(course.id)
              const timelineHeight = () => Math.max(54, timeline().lanes * timelineLaneHeight() + 12)
              const laneBlockHeight = () => timelineChipHeight() + Math.max(0, timeline().lanes - 1) * timelineLaneHeight()
              const laneBlockTop = () => (timelineHeight() - laneBlockHeight()) / 2
              return <article class="timeline-course-row" classList={{ 'no-matches': !loadingCourseIds().includes(course.id) && !failedCourseIds().includes(course.id) && timeline().items.length === 0 }}>
                <header class="course-card-header timeline-course-header">
                  <button type="button" class="course-avatar course-avatar-button" aria-label={`View information about ${course.name}`} title={course.name} onClick={() => setInfoCourse(course)}><Show when={course.logoUrl} fallback={course.name.charAt(0)}>{(logo) => <img src={logo()} alt="" />}</Show></button>
                  <div class="course-card-title"><button type="button" class="course-name course-name-button" onClick={() => setInfoCourse(course)}>{course.name}</button><p>{course.city}, {course.state}<Show when={distance() !== undefined}> · {distance()!.toFixed(1)} mi</Show></p></div>
                </header>
                <div class="timeline-track" style={{ width: `${timelineWidth()}px`, height: `${timelineHeight()}px` }}>
                  <For each={timelineTicks()}>{(tick) => <i class="timeline-gridline" style={{ left: `${timelineEdgePadding + (tick - timeRange()[0]) * timelineScale()}px` }} />}</For>
                  <Show when={showCurrentTime()}><i class="timeline-now" style={{ left: `${currentTimeLeft()}px` }} /></Show>
                  <Show when={!loadingCourseIds().includes(course.id)} fallback={<div class="course-loading timeline-status timeline-empty-status"><span><span class="loading-spinner" />Checking availability…</span></div>}>
                    <Show when={!failedCourseIds().includes(course.id)} fallback={<div class="course-empty timeline-status">Couldn’t load this course.</div>}>
                      <For each={timeline().items}>{(item) => {
                        const option = () => displayOption(item.tee)
                        const shownPrice = () => option()?.price ?? item.tee.price
                        const shownHoles = () => holes() === 'any' ? item.tee.holes : holes()
                        const details = () => [(timelineZoomMode() === 'overview' || timelineZoomMode() === 'compact') && shownPrice() !== undefined ? `${String.fromCharCode(36)}${shownPrice()}` : undefined, timelineZoomMode() !== 'detailed' ? `${shownHoles()} holes` : undefined, timelineZoomMode() !== 'detailed' && item.tee.availableSpots ? `${item.tee.availableSpots} ${item.tee.availableSpots === 1 ? 'spot' : 'spots'}` : undefined].filter(Boolean).join(' · ') || 'Open booking site'
                        return <a class="tee-time-chip timeline-tee-time" classList={{ 'availability-best': (item.tee.availableSpots || 0) >= 4, 'availability-low': item.tee.availableSpots === 1 }} style={{ left: `${timelineEdgePadding + (item.start - timeRange()[0]) * timelineScale()}px`, top: `${laneBlockTop() + item.lane * timelineLaneHeight()}px` }} data-tooltip={details()} aria-label={`${item.tee.time}. ${details()}`} href={item.tee.bookingUrl} target="_blank" rel="noreferrer" onClick={(event) => openTeeTimeDetails(event, course, item.tee, shownPrice(), shownHoles())}><strong>{item.tee.time.replace(/\s[AP]M$/i, '')}</strong><Show when={(timelineZoomMode() === 'standard' || timelineZoomMode() === 'detailed') && shownPrice() !== undefined}><span class="timeline-chip-price">{`${String.fromCharCode(36)}${shownPrice()}`}</span></Show><Show when={timelineZoomMode() === 'detailed'}><span class="timeline-chip-meta">{item.tee.availableSpots ? `${item.tee.availableSpots} ${item.tee.availableSpots === 1 ? 'spot' : 'spots'}` : 'Spots vary'} · {shownHoles()}h</span></Show></a>
                      }}</For>
                    </Show>
                  </Show>
                </div>
              </article>
            }}</For>
          </div>
        </div>
      </div></Show>
      <Show when={!loading() && !error() && resultCourses().length === 0}><div class="no-results"><h3>No nearby courses have matching tee times.</h3><Show when={!selectedEntryCourse()}><button type="button" onClick={() => { setCourseDistance('any'); setShowUnavailable(true) }}>Show every searched course</button></Show></div></Show>
    </section>
    </Show>
  </main><Show when={infoCourse()}>{(course) => <CourseInfoModal course={course()} onClose={() => setInfoCourse(null)} />}</Show><Show when={selectedTeeTime()}>{(selection) => { const value = selection(); return <div class="tee-time-detail-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setSelectedTeeTime(null) }}><section class="tee-time-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="tee-time-detail-title"><header classList={{ 'has-image': Boolean(value.course.headerImageUrl) }} style={value.course.headerImageUrl ? { 'background-image': `linear-gradient(180deg, rgb(8 18 12 / 12%) 0%, rgb(8 18 12 / 84%) 100%), url("${value.course.headerImageUrl}")` } : undefined}><div class="course-avatar"><Show when={value.course.logoUrl} fallback={value.course.name.charAt(0)}>{(logo) => <img src={logo()} alt="" />}</Show></div><div><h2 id="tee-time-detail-title">{value.course.name}</h2><p>{value.course.city}, {value.course.state}</p></div><button type="button" onClick={() => setSelectedTeeTime(null)} aria-label="Close tee-time details">×</button></header><div class="tee-time-detail-content"><strong class="tee-time-detail-time">{value.tee.time}</strong><span>{new Date(`${value.tee.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span><div class="tee-time-detail-facts"><Show when={value.price !== undefined}><span><b>{String.fromCharCode(36)}{value.price}</b>Price</span></Show><span><b>{value.holes}</b>Holes</span><span><b>{value.tee.availableSpots ?? '—'}</b>{value.tee.availableSpots === 1 ? 'Spot' : 'Spots'}</span></div><div class="tee-time-weather" aria-live="polite"><Show when={!teeTimeWeatherLoading()} fallback={<div class="tee-time-weather-loading"><span class="loading-spinner" />Checking the forecast…</div>}><Show when={selectedForecast()} fallback={<Show when={teeTimeWeatherUnavailable()}><p class="tee-time-weather-unavailable">Forecast unavailable for this tee time.</p></Show>}>{(forecast) => <><div class="tee-time-weather-main"><span class="tee-time-weather-icon" aria-hidden="true">{forecast().condition.icon}</span><div><strong>{forecast().condition.label} · {forecast().teeOff.temperature !== undefined ? `${Math.round(forecast().teeOff.temperature!)}°F` : 'Temperature unavailable'}</strong><span>At tee-off<Show when={forecast().teeOff.apparentTemperature !== undefined}> · feels like {Math.round(forecast().teeOff.apparentTemperature!)}°</Show></span></div></div><p><b>During your round:</b> <Show when={forecast().low !== undefined && forecast().high !== undefined}>{forecast().low === forecast().high ? `${forecast().low}°F` : `${forecast().low}–${forecast().high}°F`} · </Show><Show when={forecast().rain !== undefined}>{forecast().rain}% rain · </Show><Show when={forecast().windLow !== undefined && forecast().windHigh !== undefined}>wind {forecast().windLow === forecast().windHigh ? forecast().windLow : `${forecast().windLow}–${forecast().windHigh}`} mph</Show><Show when={forecast().gust !== undefined}> · gusts {forecast().gust} mph</Show></p></>}</Show></Show></div></div><footer><a href={value.tee.bookingUrl} target="_blank" rel="noreferrer">Continue to booking</a></footer></section></div> }}</Show></div>
}
