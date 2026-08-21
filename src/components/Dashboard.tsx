import { DatePicker, parseDate } from '@ark-ui/solid/date-picker'
import { closestCenter, createSortable, DragDropProvider, DragDropSensors, SortableProvider } from '@thisbeyond/solid-dnd'
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'

interface Course { id: string; name: string; city: string; state: string; bookingUrl: string; status?: 'active' | 'unsupported'; latitude?: number; longitude?: number; logoUrl?: string }
interface TeeTime { id: string; courseId: string; time: string; date: string; holes: number | string; price?: number; availableSpots?: number; bookingUrl: string }
interface WeatherHour { time: string; temperature?: number; weatherCode?: number }

const apiBaseUrl = import.meta.env.VITE_API_URL || ''
const coursePreferencesKey = 'tee-times-course-preferences'
const dateValue = (date: Date) => date.toISOString().slice(0, 10)

function getDays() {
  const today = new Date()
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(today); date.setDate(today.getDate() + offset)
    const prefix = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'short' })
    return { value: dateValue(date), label: `${prefix}, ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` }
  })
}

function timeValue(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return Number.MAX_SAFE_INTEGER
  return ((Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(match[2])
}

function CalendarPicker(props: { value: string; label: string; onChange: (value: string) => void }) {
  return <DatePicker.Root
    value={[parseDate(props.value)]}
    min={parseDate(dateValue(new Date()))}
    fixedWeeks
    startOfWeek={0}
    positioning={{ placement: 'bottom-start', gutter: 8 }}
    onValueChange={(details) => { const value = details.value[0]?.toString(); if (value && value !== props.value) props.onChange(value) }}
  >
    <DatePicker.Trigger class="date-display" aria-label={`${props.label}. Open calendar`}>{props.label}</DatePicker.Trigger>
    <DatePicker.Positioner>
      <DatePicker.Content class="calendar-popover">
        <DatePicker.View view="day">
          <DatePicker.ViewControl class="calendar-header">
            <DatePicker.PrevTrigger class="calendar-nav" aria-label="Previous month">‹</DatePicker.PrevTrigger>
            <DatePicker.ViewTrigger class="calendar-month"><DatePicker.RangeText /></DatePicker.ViewTrigger>
            <DatePicker.NextTrigger class="calendar-nav" aria-label="Next month">›</DatePicker.NextTrigger>
          </DatePicker.ViewControl>
          <DatePicker.Context>{(calendar) => <DatePicker.Table class="calendar-table">
            <DatePicker.TableHead><DatePicker.TableRow><For each={calendar().weekDays}>{(weekDay) => <DatePicker.TableHeader>{weekDay.short}</DatePicker.TableHeader>}</For></DatePicker.TableRow></DatePicker.TableHead>
            <DatePicker.TableBody><For each={calendar().weeks}>{(week) => <DatePicker.TableRow><For each={week}>{(date) => <DatePicker.TableCell value={date}><DatePicker.TableCellTrigger>{date.day}</DatePicker.TableCellTrigger></DatePicker.TableCell>}</For></DatePicker.TableRow>}</For></DatePicker.TableBody>
          </DatePicker.Table>}</DatePicker.Context>
        </DatePicker.View>
      </DatePicker.Content>
    </DatePicker.Positioner>
  </DatePicker.Root>
}

export default function Dashboard() {
  const days = getDays()
  const storedTheme = localStorage.getItem('theme')
  const [theme, setTheme] = createSignal<'light' | 'dark'>(storedTheme === 'dark' ? 'dark' : 'light')
  const [day, setDay] = createSignal(days[0].value)
  const [loadedDay, setLoadedDay] = createSignal(days[0].value)
  const [courses, setCourses] = createSignal<Course[]>([])
  const [selectedCourseIds, setSelectedCourseIds] = createSignal<string[]>([])
  const [preferencesLoaded, setPreferencesLoaded] = createSignal(false)
  const [teeTimes, setTeeTimes] = createSignal<TeeTime[]>([])
  const [weather, setWeather] = createSignal<Record<string, WeatherHour[]>>({})
  const [failed, setFailed] = createSignal<string[]>([])
  const [loadingCourseIds, setLoadingCourseIds] = createSignal<string[]>([])
  const [openMenu, setOpenMenu] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  let loadRequest = 0

  createEffect(() => { document.documentElement.dataset.theme = theme(); localStorage.setItem('theme', theme()) })
  createEffect(() => {
    if (preferencesLoaded()) localStorage.setItem(coursePreferencesKey, JSON.stringify({ version: 1, courseIds: selectedCourseIds() }))
  })
  const displayedCourses = createMemo(() => selectedCourseIds().map((id) => courses().find((course) => course.id === id)).filter((course): course is Course => Boolean(course)))
  const availableCourses = createMemo(() => courses().filter((course) => !selectedCourseIds().includes(course.id)).sort((a, b) => a.name.localeCompare(b.name)))
  const visibleTimes = createMemo(() => teeTimes().filter((tee) => {
    const now = new Date()
    if (tee.date === dateValue(now) && timeValue(tee.time) < now.getHours() * 60 + now.getMinutes()) return false
    return true
  }))
  const timesFor = (id: string) => visibleTimes().filter((tee) => tee.courseId === id)
  const weatherForCourse = (courseId: string) => {
    const hours = weather()[courseId] || []
    const temperatures = hours.map((hour) => hour.temperature).filter((temperature): temperature is number => temperature !== undefined)
    if (!temperatures.length) return null
    const low = Math.round(Math.min(...temperatures)); const high = Math.round(Math.max(...temperatures))
    const daytime = hours.filter((hour) => { const value = new Date(hour.time).getHours(); return value >= 7 && value <= 19 })
    const codes = daytime.map((hour) => hour.weatherCode).filter((code): code is number => code !== undefined)
    const code = codes.sort((a, b) => codes.filter((value) => value === b).length - codes.filter((value) => value === a).length)[0]
    const icon = code === 0 ? '☀️' : code !== undefined && code <= 2 ? '🌤️' : code === 3 ? '☁️' : code !== undefined && [45, 48].includes(code) ? '🌫️' : code !== undefined && code >= 95 ? '⛈️' : code !== undefined && code >= 71 && code <= 86 ? '❄️' : code !== undefined && code >= 51 ? '🌧️' : '🌡️'
    return { icon, temperature: low === high ? `${low}°` : `${low}–${high}°` }
  }

  const getSavedCourseIds = (list: Course[]) => {
    try {
      const saved = JSON.parse(localStorage.getItem(coursePreferencesKey) || '') as { courseIds?: string[] }
      if (Array.isArray(saved.courseIds)) return saved.courseIds.filter((id) => list.some((course) => course.id === id))
    } catch { /* Use the first-visit default. */ }
    return []
  }

  async function loadBoard(date: string, requestedCourses?: Course[]) {
    const request = ++loadRequest
    setLoading(true); setError(null); setTeeTimes([]); setFailed([]); setWeather({}); setLoadedDay(date)
    try {
      let list = courses()
      if (!list.length) {
        const response = await fetch(`${apiBaseUrl}/api/courses`); if (!response.ok) throw new Error()
        const allCourses = await response.json() as Course[]
        const savedIds = getSavedCourseIds(allCourses)
        setCourses(allCourses); setSelectedCourseIds(savedIds); setPreferencesLoaded(true)
        list = allCourses.filter((course) => savedIds.includes(course.id)).sort((a, b) => savedIds.indexOf(a.id) - savedIds.indexOf(b.id))
      } else {
        list = requestedCourses || displayedCourses()
      }
      if (request !== loadRequest) return
      setLoadingCourseIds(list.map((course) => course.id))
      await Promise.all(list.map(async (course) => {
        try {
          const response = await fetch(`${apiBaseUrl}/api/courses/${course.id}/tee-times?date=${date}`)
          if (!response.ok) throw new Error()
          const times = await response.json() as TeeTime[]
          if (request === loadRequest) setTeeTimes((current) => [...current, ...times].sort((a, b) => timeValue(a.time) - timeValue(b.time)))
        } catch {
          if (request === loadRequest) setFailed((ids) => [...ids, course.id])
        } finally {
          if (request === loadRequest) setLoadingCourseIds((ids) => ids.filter((id) => id !== course.id))
        }
      }))
      const forecasts = await Promise.all(list.filter((course) => course.latitude && course.longitude).map(async (course) => {
        try { const response = await fetch(`${apiBaseUrl}/api/courses/${course.id}/weather?date=${date}`); const data = response.ok ? await response.json() : {}; return [course.id, data.hourly || []] as const }
        catch { return [course.id, []] as const }
      }))
      if (request === loadRequest) setWeather(Object.fromEntries(forecasts))
    } catch { setError('Could not load courses. Check that the backend is running.') }
    finally { if (request === loadRequest) setLoading(false) }
  }

  onMount(() => {
    void loadBoard(day())
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!(event.target as Element).closest('[data-menu-root]')) setOpenMenu(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenMenu(null) }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    onCleanup(() => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    })
  })
  const dayLabel = () => {
    const selected = new Date(`${loadedDay()}T12:00:00`)
    const today = new Date()
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
    const selectedValue = dateValue(selected)
    const prefix = selectedValue === dateValue(today) ? 'Today' : selectedValue === dateValue(tomorrow) ? 'Tomorrow' : selected.toLocaleDateString('en-US', { weekday: 'short' })
    return `${prefix}, ${selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  }
  const stepDay = (amount: number) => {
    const nextDate = new Date(`${day()}T12:00:00`)
    nextDate.setDate(nextDate.getDate() + amount)
    const nextValue = dateValue(nextDate)
    setDay(nextValue)
    void loadBoard(nextValue)
  }
  const isToday = () => day() === dateValue(new Date())
  const moveCourse = (courseId: string, offset: number) => setSelectedCourseIds((ids) => {
    const index = ids.indexOf(courseId); const nextIndex = index + offset
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return ids
    const next = [...ids]; [next[index], next[nextIndex]] = [next[nextIndex], next[index]]
    return next
  })
  const moveCourseToEdge = (courseId: string, edge: 'top' | 'bottom') => setSelectedCourseIds((ids) => {
    const remaining = ids.filter((id) => id !== courseId)
    return edge === 'top' ? [courseId, ...remaining] : [...remaining, courseId]
  })
  const moveCourseById = (courseId: string, targetId: string) => setSelectedCourseIds((ids) => {
    const fromIndex = ids.indexOf(courseId); const toIndex = ids.indexOf(targetId)
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return ids
    const next = [...ids]; const [moved] = next.splice(fromIndex, 1); next.splice(toIndex, 0, moved)
    return next
  })
  const removeCourse = (courseId: string) => setSelectedCourseIds((ids) => ids.filter((id) => id !== courseId))
  const loadAddedCourse = async (course: Course, date: string) => {
    const request = loadRequest
    const isCurrent = () => request === loadRequest && day() === date && selectedCourseIds().includes(course.id)
    setLoadingCourseIds((ids) => ids.includes(course.id) ? ids : [...ids, course.id])
    setFailed((ids) => ids.filter((id) => id !== course.id))
    try {
      const [teeTimeResponse, weatherResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/api/courses/${course.id}/tee-times?date=${date}`),
        course.latitude && course.longitude ? fetch(`${apiBaseUrl}/api/courses/${course.id}/weather?date=${date}`) : Promise.resolve(null),
      ])
      if (!teeTimeResponse.ok) throw new Error()
      const times = await teeTimeResponse.json() as TeeTime[]
      if (!isCurrent()) return
      setTeeTimes((current) => [...current.filter((tee) => tee.courseId !== course.id), ...times].sort((a, b) => timeValue(a.time) - timeValue(b.time)))
      if (weatherResponse?.ok) {
        const forecast = await weatherResponse.json() as { hourly?: WeatherHour[] }
        if (isCurrent()) setWeather((current) => ({ ...current, [course.id]: forecast.hourly || [] }))
      }
    } catch {
      if (isCurrent()) setFailed((ids) => [...ids.filter((id) => id !== course.id), course.id])
    } finally {
      if (request === loadRequest) setLoadingCourseIds((ids) => ids.filter((id) => id !== course.id))
    }
  }
  const addCourse = (course: Course) => {
    setSelectedCourseIds((ids) => [...ids, course.id])
    void loadAddedCourse(course, day())
  }

  return <div class="container"><div class="dashboard">
    <Show when={error()}>{(message) => <div class="empty-state standalone">{message()}</div>}</Show>
    <Show when={courses().length} fallback={<div class="loading standalone">Loading courses and tee times...</div>}>
      <section class="course-board" aria-busy={loading()}>
        <div class="board-heading"><div><p>Available tee times</p><div class="board-date-nav"><button type="button" class="date-arrow" disabled={isToday()} onClick={() => stepDay(-1)} aria-label="Previous day">‹</button><CalendarPicker value={day()} label={dayLabel()} onChange={(value) => { setDay(value); void loadBoard(value) }} /><button type="button" class="date-arrow" onClick={() => stepDay(1)} aria-label="Next day">›</button></div></div><div class="board-actions"><button type="button" class="refresh-btn" disabled={loading()} onClick={() => void loadBoard(day())} aria-label="Refresh tee times" title="Refresh tee times"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.4-2.5L20 9M4 15l2.5 2.5A7 7 0 0 0 17.9 15" /></svg></button><label class="theme-switch"><input type="checkbox" checked={theme() === 'dark'} onChange={() => setTheme(theme() === 'dark' ? 'light' : 'dark')} aria-label="Toggle dark mode" /><span class="theme-switch-track"><span class="theme-switch-thumb" /></span><span class="theme-switch-text">{theme() === 'dark' ? 'Dark' : 'Light'}</span></label></div></div>
        <DragDropProvider collisionDetector={closestCenter} onDragEnd={({ draggable, droppable }) => { if (droppable && draggable.id !== droppable.id) moveCourseById(String(draggable.id), String(droppable.id)) }}><DragDropSensors /><SortableProvider ids={selectedCourseIds()}><div class="course-grid"><For each={displayedCourses()}>{(course, index) => {
          const sortable = createSortable(course.id)
          return <article ref={sortable.ref} class="course-card" classList={{ dragging: sortable.isActiveDraggable }} style={{ transform: `translate3d(${sortable.transform.x}px, ${sortable.transform.y}px, 0)` }}>
          <header class="course-card-header"><Show when={displayedCourses().length > 1}><button type="button" class="drag-handle" aria-label={`Drag to reorder ${course.name}`} title="Drag to reorder" {...sortable.dragActivators}><svg viewBox="0 0 16 24" aria-hidden="true"><circle cx="5" cy="5" r="1.5" /><circle cx="11" cy="5" r="1.5" /><circle cx="5" cy="12" r="1.5" /><circle cx="11" cy="12" r="1.5" /><circle cx="5" cy="19" r="1.5" /><circle cx="11" cy="19" r="1.5" /></svg></button></Show><div class="course-avatar"><Show when={course.logoUrl} fallback={course.name.charAt(0)}>{(logo) => <img src={logo()} alt="" />}</Show></div><div class="course-card-title"><span class="course-name">{course.name}</span><p>{course.city}, {course.state}</p></div><Show when={weatherForCourse(course.id)}>{(forecast) => <span class="course-weather"><span aria-hidden="true">{forecast().icon}</span>{forecast().temperature}</span>}</Show><div class="course-options" data-menu-root><button type="button" class="course-options-trigger" aria-label={`Manage ${course.name}`} aria-expanded={openMenu() === course.id} onClick={() => setOpenMenu(openMenu() === course.id ? null : course.id)}>•••</button><Show when={openMenu() === course.id}><div class="course-menu-popover"><button type="button" disabled={index() === 0} onClick={() => { moveCourseToEdge(course.id, 'top'); setOpenMenu(null) }}>Move to top</button><button type="button" disabled={index() === 0} onClick={() => { moveCourse(course.id, -1); setOpenMenu(null) }}>Move up</button><button type="button" disabled={index() === displayedCourses().length - 1} onClick={() => { moveCourse(course.id, 1); setOpenMenu(null) }}>Move down</button><button type="button" disabled={index() === displayedCourses().length - 1} onClick={() => { moveCourseToEdge(course.id, 'bottom'); setOpenMenu(null) }}>Move to bottom</button><button type="button" class="remove-course" onClick={() => { removeCourse(course.id); setOpenMenu(null) }}>Remove course</button></div></Show></div></header>
          <div class="tee-time-chips"><Show when={!loadingCourseIds().includes(course.id)} fallback={<div class="course-loading"><span class="loading-spinner" />Loading tee times...</div>}><Show when={course.status !== 'unsupported'} fallback={<div class="course-empty">Online tee times aren’t available yet.</div>}><Show when={!failed().includes(course.id)} fallback={<div class="course-empty">Couldn’t load this course. Try another day.</div>}><For each={timesFor(course.id)} fallback={<div class="course-empty">No tee times available for this day.</div>}>{(tee) => <a class="tee-time-chip" href={tee.bookingUrl} target="_blank" rel="noreferrer"><strong>{tee.time}</strong><span>{tee.price !== undefined ? `$${tee.price}` : `${tee.holes} holes`}{tee.availableSpots ? ` · ${tee.availableSpots} ${tee.availableSpots === 1 ? 'spot' : 'spots'}` : ''}</span></a>}</For></Show></Show></Show></div>
          <div class="course-card-actions">
            <a class="course-card-link" href={course.bookingUrl} target="_blank" rel="noreferrer">Booking site →</a>
          </div>
        </article>}}</For><Show when={availableCourses().length > 0 && displayedCourses().length === 0}><div class="add-course-card" data-menu-root><button type="button" class="add-course-card-trigger" aria-expanded={openMenu() === 'add'} onClick={() => setOpenMenu(openMenu() === 'add' ? null : 'add')}><strong>＋ Add course</strong><span>Choose a course to show on your board</span></button><Show when={openMenu() === 'add'}><div class="course-menu-popover add-course-popover"><For each={availableCourses()}>{(course) => <button type="button" onClick={() => { addCourse(course); setOpenMenu(null) }}>{course.name}</button>}</For></div></Show></div></Show></div></SortableProvider></DragDropProvider>
        <Show when={availableCourses().length > 0 && displayedCourses().length > 0}><div class="add-course-compact" data-menu-root><button type="button" aria-expanded={openMenu() === 'add'} onClick={() => setOpenMenu(openMenu() === 'add' ? null : 'add')}>＋ Add course</button><Show when={openMenu() === 'add'}><div class="course-menu-popover"><For each={availableCourses()}>{(course) => <button type="button" onClick={() => { addCourse(course); setOpenMenu(null) }}>{course.name}</button>}</For></div></Show></div></Show>
      </section>
    </Show>
  </div></div>
}
