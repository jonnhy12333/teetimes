import { Select, createListCollection } from '@ark-ui/solid/select'
import { SegmentGroup } from '@ark-ui/solid/segment-group'
import { createEffect, createMemo, createSignal, For, Show } from 'solid-js'

interface DashboardProps {
  user: { email: string; name: string }
}

interface Course {
  id: string
  name: string
  city: string
  state: string
  bookingSystem: string
  bookingUrl: string
  authType: 'none' | 'member-login' | 'oauth' | 'unknown'
  status?: 'active' | 'unsupported'
  latitude?: number
  longitude?: number
  notes?: string
}

interface TeeTime {
  id: string
  courseId: string
  courseName: string
  time: string
  date: string
  holes: number | string
  price?: number
  cartFee?: number
  availableSpots?: number
  bookingUrl: string
  authRequired: boolean
  authType: Course['authType']
}

interface WeatherHour {
  time: string
  temperature?: number
  weatherCode?: number
  windSpeed?: number
  precipitationProbability?: number
}

const apiBaseUrl = import.meta.env.VITE_API_URL || ''

const dayOptions = [
  { value: 'today', label: 'Today', offset: 0 },
  { value: 'tomorrow', label: 'Tomorrow', offset: 1 },
  { value: 'next-2', label: 'In 2 Days', offset: 2 },
  { value: 'next-3', label: 'In 3 Days', offset: 3 },
  { value: 'next-7', label: 'In 7 Days', offset: 7 },
]

const playerOptions = ['1', '2', '3', '4', 'any']
const timePeriodOptions = ['morning', 'afternoon', 'evening', 'any']

const timePeriodRanges: Record<string, { start: number; end: number } | null> = {
  morning: { start: 6, end: 12 },
  afternoon: { start: 12, end: 16 },
  evening: { start: 16, end: 24 },
  any: null,
}

const dayCollection = createListCollection({
  items: dayOptions,
  itemToString: (item) => item.label,
  itemToValue: (item) => item.value,
})

function getDateForDay(day: string) {
  const option = dayOptions.find((dayOption) => dayOption.value === day) || dayOptions[0]
  const date = new Date()
  date.setDate(date.getDate() + option.offset)
  return date.toISOString().slice(0, 10)
}

function getAuthLabel(authType: Course['authType']) {
  const labels: Record<Course['authType'], string> = {
    none: 'Public',
    'member-login': 'Member login',
    oauth: 'Connected account',
    unknown: 'Auth unknown',
  }

  return labels[authType]
}

function getTimeSortValue(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)

  if (!match) {
    return Number.MAX_SAFE_INTEGER
  }

  const [, hourText, minuteText, period] = match
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const normalizedHour = (hour % 12) + (period.toUpperCase() === 'PM' ? 12 : 0)

  return normalizedHour * 60 + minute
}

function isPastTeeTime(teeTime: TeeTime) {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  if (teeTime.date !== today) {
    return false
  }

  return getTimeSortValue(teeTime.time) < now.getHours() * 60 + now.getMinutes()
}

function getWeatherIcon(weatherCode?: number) {
  if (weatherCode === undefined) {
    return ''
  }

  if (weatherCode === 0) return '☀️ Sunny'
  if ([1, 2].includes(weatherCode)) return '🌤️ Partly cloudy'
  if (weatherCode === 3) return '☁️ Cloudy'
  if ([45, 48].includes(weatherCode)) return '🌫️ Fog'
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return '🌧️ Rain'
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return '❄️ Snow'
  if ([95, 96, 99].includes(weatherCode)) return '⛈️ Storms'

  return 'Weather'
}

function getTeeTimeDate(teeTime: TeeTime) {
  const match = teeTime.time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)

  if (!match) {
    return null
  }

  const [, hourText, minuteText, period] = match
  const hour = Number(hourText)
  const normalizedHour = (hour % 12) + (period.toUpperCase() === 'PM' ? 12 : 0)

  return new Date(`${teeTime.date}T${String(normalizedHour).padStart(2, '0')}:${minuteText}:00`)
}

function getWeatherForecastUrl(course: Course) {
  if (!course.latitude || !course.longitude) {
    return null
  }

  return `https://weather.com/weather/hourbyhour/l/${course.latitude},${course.longitude}`
}

export default function Dashboard(props: DashboardProps) {
  const [selectedDay, setSelectedDay] = createSignal('today')
  const [selectedCourseId, setSelectedCourseId] = createSignal('all')
  const [selectedPlayers, setSelectedPlayers] = createSignal('any')
  const [selectedTimePeriod, setSelectedTimePeriod] = createSignal('any')
  const [courses, setCourses] = createSignal<Course[]>([])
  const [teeTimes, setTeeTimes] = createSignal<TeeTime[]>([])
  const [weatherByCourse, setWeatherByCourse] = createSignal<Record<string, WeatherHour[]>>({})
  const [isLoading, setIsLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)

  const sortedCourses = createMemo(() => {
    return [...courses()].sort((first, second) => first.name.localeCompare(second.name))
  })

  const courseCollection = createMemo(() => {
    return createListCollection({
      items: [
        { id: 'all', name: 'All Courses', status: 'active' as const },
        ...sortedCourses(),
      ],
      itemToString: (item) => item.name,
      itemToValue: (item) => item.id,
    })
  })

  const teeTimeMatchesActiveFilters = (teeTime: TeeTime) => {
    const timeHour = Math.floor(getTimeSortValue(teeTime.time) / 60)
    const playerCount = selectedPlayers() === 'any' ? null : Number(selectedPlayers())
    const timePeriodRange = timePeriodRanges[selectedTimePeriod()]
    const matchesPlayers = playerCount === null || !teeTime.availableSpots || teeTime.availableSpots >= playerCount
    const matchesTime = !timePeriodRange || (timeHour >= timePeriodRange.start && timeHour < timePeriodRange.end)

    return !isPastTeeTime(teeTime) && matchesPlayers && matchesTime
  }

  const teeTimeCountsByCourse = createMemo(() => {
    return teeTimes().filter(teeTimeMatchesActiveFilters).reduce<Record<string, number>>((counts, teeTime) => {
      counts[teeTime.courseId] = (counts[teeTime.courseId] || 0) + 1
      return counts
    }, {})
  })

  const allCoursesCount = createMemo(() => {
    return teeTimes().filter(teeTimeMatchesActiveFilters).length
  })

  const getCourseOptionLabel = (course: Course | { id: string; name: string; status: 'active' }) => {
    if (course.id === 'all') {
      return `${course.name} (${allCoursesCount()})`
    }

    if (course.status === 'unsupported') {
      return `${course.name} (Not available yet)`
    }

    return `${course.name} (${teeTimeCountsByCourse()[course.id] || 0})`
  }

  const selectedCourseLabel = createMemo(() => {
    const selectedCourse = courseCollection().items.find((course) => course.id === selectedCourseId())

    return selectedCourse ? getCourseOptionLabel(selectedCourse) : 'Select course'
  })

  const filteredTeeTimes = createMemo(() => {
    return teeTimes().filter((teeTime) => {
      const matchesCourse = selectedCourseId() === 'all' || teeTime.courseId === selectedCourseId()

      return matchesCourse && teeTimeMatchesActiveFilters(teeTime)
    })
  })

  const getWeatherForTeeTime = (teeTime: TeeTime) => {
    const teeTimeDate = getTeeTimeDate(teeTime)
    const weatherHours = weatherByCourse()[teeTime.courseId] || []

    if (!teeTimeDate || !weatherHours.length) {
      return null
    }

    return weatherHours.reduce<WeatherHour | null>((closestWeather, weatherHour) => {
      const weatherDate = new Date(weatherHour.time)
      const currentDifference = Math.abs(weatherDate.getTime() - teeTimeDate.getTime())
      const closestDifference = closestWeather ? Math.abs(new Date(closestWeather.time).getTime() - teeTimeDate.getTime()) : Number.POSITIVE_INFINITY

      return currentDifference < closestDifference ? weatherHour : closestWeather
    }, null)
  }

  const getCourseForTeeTime = (teeTime: TeeTime) => {
    return courses().find((course) => course.id === teeTime.courseId)
  }

  const loadTeeTimes = async () => {
    const date = getDateForDay(selectedDay())
    setIsLoading(true)
    setError(null)
    setWeatherByCourse({})

    try {
      const coursesResponse = await fetch(`${apiBaseUrl}/api/courses`, {
        credentials: 'include',
      })

      if (!coursesResponse.ok) {
        throw new Error('Unable to load course configs')
      }

      const nextCourses: Course[] = await coursesResponse.json()
      const teeTimeLists = await Promise.all(
        nextCourses.map(async (course) => {
          const response = await fetch(`${apiBaseUrl}/api/courses/${course.id}/tee-times?date=${date}`, {
            credentials: 'include',
          })

          if (!response.ok) {
            return []
          }

          return response.json() as Promise<TeeTime[]>
        }),
      )
      const weatherEntries = await Promise.all(
        nextCourses
          .filter((course) => course.latitude && course.longitude)
          .map(async (course) => {
            const response = await fetch(`${apiBaseUrl}/api/courses/${course.id}/weather?date=${date}`, {
              credentials: 'include',
            })

            if (!response.ok) {
              return [course.id, []] as const
            }

            const weather = await response.json() as { hourly?: WeatherHour[] }
            return [course.id, weather.hourly || []] as const
          }),
      )

      setCourses(nextCourses)
      setWeatherByCourse(Object.fromEntries(weatherEntries))
      setTeeTimes(teeTimeLists.flat().sort((first, second) => getTimeSortValue(first.time) - getTimeSortValue(second.time)))
    } catch (error) {
      console.error('Failed to load tee times', error)
      setError('Could not load tee times. Check that the backend is running and you are signed in.')
    } finally {
      setIsLoading(false)
    }
  }

  createEffect(() => {
    void selectedDay()
    void loadTeeTimes()
  })

  const handleLogout = () => {
    window.location.href = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/auth/logout`
  }

  const getDayLabel = () => {
    return dayOptions.find((dayOption) => dayOption.value === selectedDay())?.label || 'Today'
  }

  return (
    <div class="container">
      <div class="dashboard">
        {/* Header */}
        <div class="header">
          <h1>⛳ Tee Times</h1>
          <div class="user-info">
            <span>{props.user.name}</span>
            <button class="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>

        <div class="filters-panel">
          <div class="filter-field">
            <Select.Root
              collection={dayCollection}
              value={[selectedDay()]}
              onValueChange={(details) => setSelectedDay(details.value[0] || 'today')}
            >
              <Select.Label>Day</Select.Label>
              <Select.Control>
                <Select.Trigger class="ark-select-trigger">
                  <Select.ValueText placeholder="Select day" />
                  <Select.Indicator class="ark-select-indicator" />
                </Select.Trigger>
              </Select.Control>
              <Select.Positioner>
                <Select.Content class="ark-select-content">
                  <Select.List>
                    <For each={dayCollection.items}>
                      {(dayOption) => (
                        <Select.Item item={dayOption} class="ark-select-item">
                          <Select.ItemText>{dayOption.label}</Select.ItemText>
                        </Select.Item>
                      )}
                    </For>
                  </Select.List>
                </Select.Content>
              </Select.Positioner>
              <Select.HiddenSelect />
            </Select.Root>
          </div>
          <div class="filter-field wide">
            <Select.Root
              collection={courseCollection()}
              value={[selectedCourseId()]}
              onValueChange={(details) => setSelectedCourseId(details.value[0] || 'all')}
            >
              <Select.Label>Course</Select.Label>
              <Select.Control>
                <Select.Trigger class="ark-select-trigger">
                  <span>{selectedCourseLabel()}</span>
                  <Select.Indicator class="ark-select-indicator" />
                </Select.Trigger>
              </Select.Control>
              <Select.Positioner>
                <Select.Content class="ark-select-content">
                  <Select.List>
                    <For each={courseCollection().items}>
                      {(course) => (
                        <Select.Item item={course} class="ark-select-item">
                          <Select.ItemText>{getCourseOptionLabel(course)}</Select.ItemText>
                        </Select.Item>
                      )}
                    </For>
                  </Select.List>
                </Select.Content>
              </Select.Positioner>
              <Select.HiddenSelect />
            </Select.Root>
          </div>
          <div class="filter-field players-filter">
            <SegmentGroup.Root
              class="segmented-control"
              value={selectedPlayers()}
              onValueChange={(details) => setSelectedPlayers(details.value || 'any')}
            >
              <SegmentGroup.Label>Players</SegmentGroup.Label>
              <For each={playerOptions}>
                {(playerOption) => (
                  <SegmentGroup.Item value={playerOption} class="segmented-control-item">
                    <SegmentGroup.ItemHiddenInput />
                    <SegmentGroup.ItemText>
                      {playerOption === 'any' ? 'Any' : playerOption}
                    </SegmentGroup.ItemText>
                  </SegmentGroup.Item>
                )}
              </For>
            </SegmentGroup.Root>
          </div>
          <div class="filter-field time-filter wide">
            <SegmentGroup.Root
              class="time-period-control"
              value={selectedTimePeriod()}
              onValueChange={(details) => setSelectedTimePeriod(details.value || 'any')}
            >
              <SegmentGroup.Label>Time of Day</SegmentGroup.Label>
              <For each={timePeriodOptions}>
                {(timePeriodOption) => (
                  <SegmentGroup.Item value={timePeriodOption} class="time-period-item">
                    <SegmentGroup.ItemHiddenInput />
                    <SegmentGroup.ItemText>
                      {timePeriodOption.charAt(0).toUpperCase() + timePeriodOption.slice(1)}
                    </SegmentGroup.ItemText>
                  </SegmentGroup.Item>
                )}
              </For>
            </SegmentGroup.Root>
          </div>
        </div>

        {/* Tee Times List */}
        <div class="tee-times">
          <div class="tee-times-header">
            <span>Available Tee Times ({getDayLabel()}) • {filteredTeeTimes().length}</span>
            <button type="button" class="refresh-btn" onClick={loadTeeTimes} disabled={isLoading()}>
              {isLoading() ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          <Show when={!isLoading()} fallback={<div class="loading">Loading tee times...</div>}>
            <Show when={!error()} fallback={<div class="empty-state">{error()}</div>}>
              <For
                each={filteredTeeTimes()}
                fallback={
                  <div class="empty-state">
                    No tee times available for this course and day
                  </div>
                }
              >
                {(teeTime) => (
                  <div class="tee-time-item">
                    <div class="tee-time-main">
                      <a class="course-avatar" href={teeTime.bookingUrl} target="_blank" rel="noreferrer" aria-label={`Open ${teeTime.courseName}`}>
                        {teeTime.courseName.charAt(0)}
                      </a>
                      <div>
                        <a class="course-name" href={teeTime.bookingUrl} target="_blank" rel="noreferrer">
                          {teeTime.courseName}
                        </a>
                        <div class="tee-time-details">
                          {teeTime.time} • {teeTime.holes} holes
                          {teeTime.availableSpots && <span> • {teeTime.availableSpots} {teeTime.availableSpots === 1 ? 'spot' : 'spots'}</span>}
                          {teeTime.price && <span> • ${teeTime.price}</span>}
                          {teeTime.cartFee && <span> • cart ${teeTime.cartFee}</span>}
                          {teeTime.authRequired && <span> • {getAuthLabel(teeTime.authType)}</span>}
                          <Show when={getWeatherForTeeTime(teeTime)}>
                            {(weather) => (
                              <Show
                                when={getCourseForTeeTime(teeTime)}
                                fallback={
                                  <>
                                    <span> • </span>
                                    <span class="weather-chip">
                                      {getWeatherIcon(weather().weatherCode)}
                                      {weather().temperature !== undefined && <span> {Math.round(weather().temperature!)}°F</span>}
                                      {weather().windSpeed !== undefined && <span> • wind {Math.round(weather().windSpeed!)} mph</span>}
                                    </span>
                                  </>
                                }
                              >
                                {(course) => (
                                  <>
                                    <span> • </span>
                                    <a
                                      class="weather-chip"
                                      href={getWeatherForecastUrl(course()) || undefined}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {getWeatherIcon(weather().weatherCode)}
                                      {weather().temperature !== undefined && <span> {Math.round(weather().temperature!)}°F</span>}
                                      {weather().windSpeed !== undefined && <span> • wind {Math.round(weather().windSpeed!)} mph</span>}
                                    </a>
                                  </>
                                )}
                              </Show>
                            )}
                          </Show>
                        </div>
                      </div>
                    </div>
                    <a class="book-btn" href={teeTime.bookingUrl} target="_blank" rel="noreferrer">
                      Book
                    </a>
                  </div>
                )}
              </For>
            </Show>
          </Show>
        </div>
      </div>
    </div>
  )
}
